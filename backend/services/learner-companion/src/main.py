import os
import json
import uuid
from typing import AsyncIterator

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
import redis.asyncio as aioredis
import httpx
from openai import AzureOpenAI

app = FastAPI(title="LMS Learner AI Companion")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))

ai_client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
)

DEPLOYMENT   = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-chat")
COURSE_SVC   = os.getenv("COURSE_SERVICE_URL", "http://localhost:3002")
USER_SVC     = os.getenv("USER_SERVICE_URL",   "http://localhost:3001")
PORT         = int(os.getenv("LEARNER_COMPANION_PORT", 3011))

# In-memory session store (Redis for persistence)
sessions: dict[str, dict] = {}

SYSTEM_PROMPT = """You are a friendly and knowledgeable AI learning tutor in an online LMS platform.

Your role:
- Help learners understand course content and concepts
- Answer questions about topics they're studying
- Quiz learners to reinforce their learning
- Provide encouragement and guidance
- Suggest what to focus on next based on their progress

Communication style:
- Be warm, encouraging, and patient
- Use clear explanations with examples
- Break down complex topics into digestible pieces
- Use bullet points and structure for clarity
- Celebrate learner achievements

You have access to the learner's course context (provided in the conversation).
Always personalize responses based on the learner's progress and enrolled courses."""


class ChatRequest(BaseModel):
    message: str
    user_id: str = "learner"
    org_id: str = "dev"
    session_id: str | None = None


@app.get("/health")
async def health():
    return {"status": "ok", "service": "learner-companion"}


@app.post("/companion/chat")
async def start_chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    key = f"companion:context:{session_id}"

    # Load history from Redis
    history = await redis_client.lrange(key, 0, -1)
    messages = [json.loads(m) for m in history]

    # Fetch learner context for first message (or every 5 messages to keep fresh)
    context_note = ""
    if len(messages) == 0:
        context_note = await _build_learner_context(req.user_id, req.org_id)

    # Add user message
    content = req.message
    if context_note and len(messages) == 0:
        content = f"{context_note}\n\n---\nLearner message: {req.message}"

    messages.append({"role": "user", "content": content})
    await redis_client.rpush(key, json.dumps({"role": "user", "content": content}))
    await redis_client.expire(key, 86400)

    sessions[session_id] = {
        "user_id": req.user_id,
        "org_id":  req.org_id,
        "messages": messages,
    }

    return {"session_id": session_id}


@app.get("/companion/chat/{session_id}/stream")
async def stream_chat(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]

    async def event_generator() -> AsyncIterator[dict]:
        try:
            system = {"role": "system", "content": SYSTEM_PROMPT}
            chat_messages = [system] + [
                {"role": m["role"], "content": m["content"]}
                for m in session["messages"][-20:]
            ]

            response = ai_client.chat.completions.create(
                model=DEPLOYMENT,
                messages=chat_messages,
                temperature=0.7,
                stream=True,
            )

            full_content = ""
            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    full_content += delta.content
                    yield {"event": "token", "data": delta.content}

            # Save assistant reply to Redis
            key = f"companion:context:{session_id}"
            await redis_client.rpush(key, json.dumps({"role": "assistant", "content": full_content}))

        except Exception as e:
            yield {"event": "error", "data": str(e)}
        finally:
            yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())


async def _build_learner_context(user_id: str, org_id: str) -> str:
    """Fetch learner's enrolled courses and progress for context injection."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            enroll_res = await client.get(f"{USER_SVC}/enrollments?userId={user_id}")
            enrollments = enroll_res.json().get("data", [])

            if not enrollments:
                return "[Learner context: No enrolled courses yet]"

            lines = ["[Learner context — enrolled courses:]"]
            for e in enrollments[:5]:
                try:
                    course_res = await client.get(f"{COURSE_SVC}/courses/{e['course_id']}")
                    course = course_res.json().get("data", {})
                    title = course.get("title", "Unknown course")
                    progress = e.get("progress_pct", 0)
                    status = e.get("status", "active")
                    lines.append(f"- {title} ({status}, {progress}% complete)")
                except Exception:
                    pass

            return "\n".join(lines)
    except Exception:
        return ""


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=PORT, reload=True)
