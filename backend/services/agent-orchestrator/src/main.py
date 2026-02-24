import os
import json
import uuid
import asyncio
from dataclasses import dataclass, field
from typing import AsyncIterator
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
import redis.asyncio as aioredis
from openai import AzureOpenAI

from .orchestrator import run_agent
from .registry import register_all_tools

app = FastAPI(title="LMS Agent Orchestrator")


@app.on_event("startup")
async def startup():
    await register_all_tools()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis for conversation history
redis_client = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))

# Azure OpenAI client
ai_client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
)

DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-chat")


# ── Per-session event buffer ──────────────────────────────────────────────────
# CrewSession keeps ALL events from a crew run so SSE clients can:
#   1. Reconnect after a dropped connection and replay from the start
#   2. Still get the result even if the browser was closed during building
#
# Lifecycle:
#   POST /admin/chat  → creates CrewSession, starts _run_and_buffer() task
#   GET  /stream      → streams events from CrewSession.events (index-based replay)
#   Client disconnect → SSE generator gets CancelledError but crew task keeps going
#   Client reconnect  → new SSE generator replays events from idx=0, then continues live
#   Crew finishes     → CrewSession.done = True; events preserved for 24 h

@dataclass
class CrewSession:
    events: list = field(default_factory=list)  # all emitted events (append-only)
    done:   bool = False                          # True once crew thread exits


# Global stores (survive between SSE reconnections within the same server process)
_crew_sessions: dict[str, CrewSession] = {}
_session_ctx:   dict[str, dict]        = {}  # message history & pending message


class ChatRequest(BaseModel):
    message:    str
    user_id:    str = "admin"
    org_id:     str = "dev"
    session_id: str | None = None


# ── Background crew runner ────────────────────────────────────────────────────

async def _run_and_buffer(session_id: str, cs: CrewSession, ctx: dict) -> None:
    """
    Runs the agent crew and buffers ALL emitted events into cs.events.
    This task is independent of any SSE client connection — it keeps running
    even if the browser tab is closed, allowing full reconnection/replay later.
    """
    accumulated_tokens: list[str] = []
    try:
        async for event in run_agent(
            message    = ctx["pending_message"],
            messages   = ctx["messages"],
            org_id     = ctx["org_id"],
            user_id    = ctx["user_id"],
            ai_client  = ai_client,
            deployment = DEPLOYMENT,
        ):
            cs.events.append(event)
            if event["event"] == "token":
                accumulated_tokens.append(event["data"])

    except Exception as exc:
        cs.events.append({"event": "error", "data": str(exc)})

    finally:
        # Persist the full assistant response to Redis conversation history
        if accumulated_tokens:
            full_response = "".join(accumulated_tokens)
            key = f"agent:context:{session_id}"
            await redis_client.rpush(key, json.dumps({"role": "assistant", "content": full_response}))
            await redis_client.expire(key, 86400)  # 24 h
        cs.done = True
        print(f"[crew] session {session_id} complete — {len(cs.events)} events buffered")


# ── API routes ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent-orchestrator", "version": "v2-firstcontact"}


@app.get("/ready")
async def ready():
    await redis_client.ping()
    return {"status": "ready"}


@app.post("/admin/chat")
async def start_chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())

    # ── If a crew is already running for this session, just reconnect ─────────
    existing = _crew_sessions.get(session_id)
    if existing and not existing.done:
        print(f"[chat] session {session_id} crew still running — returning for reconnect")
        return {"session_id": session_id, "status": "running"}

    # ── Load conversation history from Redis ──────────────────────────────────
    key = f"agent:context:{session_id}"
    history  = await redis_client.lrange(key, 0, -1)
    messages = [json.loads(m) for m in history]

    # Add the new user message
    messages.append({"role": "user", "content": req.message})
    await redis_client.rpush(key, json.dumps({"role": "user", "content": req.message}))
    await redis_client.expire(key, 86400)

    # ── Start a new crew session ───────────────────────────────────────────────
    ctx = {
        "user_id":         req.user_id,
        "org_id":          req.org_id,
        "messages":        messages,
        "pending_message": req.message,
    }
    cs = CrewSession()
    _crew_sessions[session_id] = cs
    _session_ctx[session_id]   = ctx

    # Fire-and-forget: crew runs independently of SSE connections
    asyncio.create_task(_run_and_buffer(session_id, cs, ctx))

    return {"session_id": session_id, "status": "started"}


@app.get("/admin/chat/{session_id}/status")
async def session_status(session_id: str):
    """
    Returns session status so the frontend can decide whether to auto-reconnect.
    Used by useChat.ts on page load.
    """
    cs = _crew_sessions.get(session_id)
    if not cs:
        return {"session_id": session_id, "found": False, "running": False, "done": False, "event_count": 0}
    return {
        "session_id":  session_id,
        "found":       True,
        "running":     not cs.done,
        "done":        cs.done,
        "event_count": len(cs.events),
    }


@app.get("/admin/chat/{session_id}/stream")
async def stream_chat(session_id: str):
    """
    SSE stream endpoint. Supports reconnection:
    - If crew is still running: replays buffered events then streams live
    - If crew is finished:      replays all buffered events and sends done
    - If session not found:     404
    """
    cs = _crew_sessions.get(session_id)
    if not cs:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    async def event_generator() -> AsyncIterator[dict]:
        idx = 0  # which events from cs.events we've already sent to this client
        try:
            while True:
                # Send any buffered events not yet sent to this client
                snapshot_len = len(cs.events)
                while idx < snapshot_len:
                    yield cs.events[idx]
                    idx += 1

                # Crew finished and we've replayed everything — we're done
                if cs.done and idx >= len(cs.events):
                    break

                # Crew still running — wait briefly for more events
                await asyncio.sleep(0.05)

        except asyncio.CancelledError:
            # SSE client disconnected.
            # DO NOT propagate — the crew background task keeps running and
            # its events are still buffered. The client can reconnect later.
            print(f"[stream] client disconnected from session {session_id} "
                  f"(crew {'done' if cs.done else 'still running'})")

        finally:
            # Always close the SSE stream with a done event
            yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())
