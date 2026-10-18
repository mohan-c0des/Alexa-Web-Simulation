import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel

from agent import (
    BASE_PROMPT,
    MCP_URL,
    MODEL,
    as_text,
    build_agent,
    fetch_server_instructions,
    short,
)

WORKSPACE = Path(os.environ.get("MCP_WORKSPACE", Path.home() / "AlexaWorkspace")).resolve()

agent = None
mcp_client = None
chat_history = []
loaded_tools = []


def parse_tool_json(content):
    """Extract structured dict from MCP tool output if it is valid JSON."""
    raw = as_text(content).strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent, mcp_client, loaded_tools
    print(f"Connecting to MCP Server at {MCP_URL}...")
    try:
        rules = await fetch_server_instructions()
        mcp_client = MultiServerMCPClient(
            {"laptop": {"url": MCP_URL, "transport": "streamable_http"}}
        )
        tools = await mcp_client.get_tools()
        loaded_tools = [t.name for t in tools]

        print(f"Connected! Tools: {loaded_tools}")
        llm = ChatGoogleGenerativeAI(model=MODEL, temperature=0)
        agent = build_agent(llm, tools, f"{BASE_PROMPT}\n\nSERVER INSTRUCTIONS:\n{rules}")
    except Exception as e:
        print(f"⚠️ Could not connect to MCP server on startup: {e}")
    yield


app = FastAPI(title="Alexa+ Simulation Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


@app.get("/status")
async def get_status():
    return {
        "connected": agent is not None,
        "mcp_url": MCP_URL,
        "tools": loaded_tools,
        "workspace": str(WORKSPACE),
    }


@app.post("/reset")
async def reset_history():
    global chat_history
    chat_history = []
    return {"status": "cleared"}


@app.get("/pdf")
async def serve_pdf(path: str = Query(..., description="Absolute path to PDF inside AlexaWorkspace")):
    """Safely serves generated PDFs from AlexaWorkspace so React can open them in a tab."""
    file_path = Path(path).resolve()
    if not file_path.is_relative_to(WORKSPACE) or not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found inside AlexaWorkspace")
    return FileResponse(file_path, media_type="application/pdf", filename=file_path.name)


@app.post("/chat")
async def chat(request: ChatRequest):
    global chat_history
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not connected. Is server.py running?")

    chat_history.append(("user", request.message))
    final_answer = ""
    tool_steps = []
    artifacts = []

    async for update in agent.astream({"messages": chat_history}, stream_mode="updates"):
        for data in update.values():
            for m in (data or {}).get("messages", []):
                # 1. Tool Call initiated
                for call in getattr(m, "tool_calls", None) or []:
                    tool_steps.append({
                        "type": "call",
                        "tool": call["name"],
                        "args": call.get("args", {}),
                        "summary": short(call.get("args", {})),
                    })
                    print(f"  -> {call['name']}({short(call.get('args', {}))})")

                # 2. Tool Result returned
                if m.type == "tool":
                    parsed = parse_tool_json(m.content)
                    tool_steps.append({
                        "type": "result",
                        "tool": m.name,
                        "summary": short(as_text(m.content)),
                    })
                    if parsed:
                        artifacts.append({"tool": m.name, "data": parsed})
                    else:
                        artifacts.append({"tool": m.name, "data": {"text": as_text(m.content)}})
                    print(f"  <- {m.name}: {short(as_text(m.content))}")

                # 3. Final AI Spoken Response
                elif m.type == "ai" and m.content and not getattr(m, "tool_calls", None):
                    final_answer = as_text(m.content)

    chat_history.append(("assistant", final_answer))
    return {
        "response": final_answer,
        "steps": tool_steps,
        "artifacts": artifacts,
    }