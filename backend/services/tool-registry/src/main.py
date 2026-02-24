"""
Tool Registry Service — port 3009
Manages the dynamic tool registry for the Agent Orchestrator.
Tools registered here are available for the AI agent to call.
"""
import os
import uuid
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import psycopg2
import psycopg2.extras
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="LMS Tool Registry")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lms_user:lms_dev_password_123@localhost:5432/lms_db")
PORT = int(os.getenv("TOOL_REGISTRY_SERVICE_PORT", 3009))


def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


@app.get("/health")
def health():
    return {"status": "ok", "service": "tool-registry"}


@app.get("/ready")
def ready():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ready"}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RegisterToolRequest(BaseModel):
    name: str
    display_name: str
    description: str
    endpoint: str
    version: str = "1.0.0"
    schema: Optional[dict] = None
    auth_type: str = "none"


class UpdateToolRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    endpoint: Optional[str] = None
    version: Optional[str] = None
    schema: Optional[dict] = None
    enabled: Optional[bool] = None


# ---------------------------------------------------------------------------
# GET /tools — list all enabled tools
# ---------------------------------------------------------------------------

@app.get("/tools")
def list_tools(enabled_only: bool = True):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if enabled_only:
                cur.execute("SELECT * FROM tool_registry WHERE enabled = true ORDER BY name")
            else:
                cur.execute("SELECT * FROM tool_registry ORDER BY name")
            rows = cur.fetchall()
        return {"data": [dict(r) for r in rows]}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /tools/:name — get a specific tool
# ---------------------------------------------------------------------------

@app.get("/tools/{name}")
def get_tool(name: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM tool_registry WHERE name = %s", (name,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Tool '{name}' not found")
        return {"data": dict(row)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /tools — register a new tool
# ---------------------------------------------------------------------------

@app.post("/tools", status_code=201)
def register_tool(req: RegisterToolRequest):
    conn = get_db()
    try:
        tool_id = str(uuid.uuid4())
        schema = req.schema or {}

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO tool_registry (id, name, display_name, description, version, schema, endpoint, auth_type)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (name) DO UPDATE
                   SET display_name = EXCLUDED.display_name,
                       description  = EXCLUDED.description,
                       endpoint     = EXCLUDED.endpoint,
                       version      = EXCLUDED.version,
                       schema       = EXCLUDED.schema
                   RETURNING *""",
                (tool_id, req.name, req.display_name, req.description, req.version,
                 psycopg2.extras.Json(schema), req.endpoint, req.auth_type),
            )
            row = cur.fetchone()
        return {"data": dict(row)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# PATCH /tools/:name — update a tool (enable/disable, update endpoint)
# ---------------------------------------------------------------------------

@app.patch("/tools/{name}")
def update_tool(name: str, req: UpdateToolRequest):
    conn = get_db()
    try:
        # Build dynamic UPDATE
        fields, values = [], []
        if req.display_name is not None:
            fields.append("display_name = %s"); values.append(req.display_name)
        if req.description is not None:
            fields.append("description = %s"); values.append(req.description)
        if req.endpoint is not None:
            fields.append("endpoint = %s"); values.append(req.endpoint)
        if req.version is not None:
            fields.append("version = %s"); values.append(req.version)
        if req.schema is not None:
            fields.append("schema = %s"); values.append(psycopg2.extras.Json(req.schema))
        if req.enabled is not None:
            fields.append("enabled = %s"); values.append(req.enabled)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        values.append(name)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"UPDATE tool_registry SET {', '.join(fields)} WHERE name = %s RETURNING *",
                values,
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Tool '{name}' not found")
        return {"data": dict(row)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# DELETE /tools/:name — remove a tool
# ---------------------------------------------------------------------------

@app.delete("/tools/{name}", status_code=204)
def delete_tool(name: str):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tool_registry WHERE name = %s", (name,))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=PORT, reload=True)
