"""
FastAPI WebSocket server for Claude Agent SDK chat interface.
Uses E2B sandboxes with R2 hydration/dehydration for persistence.
"""

import asyncio
import json
import os
import random
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

# Import configuration
from config import validate_config, SANDBOX_GRACE_PERIOD

# Import database functions
from database import (
    init_db,
    create_session,
    get_session,
    list_sessions,
    update_session_timestamp,
    update_session_title,
    delete_session,
    session_exists,
    update_sandbox_info,
    get_sandbox_id,
    get_sandbox_status,
    update_has_snapshot,
    add_chat_message,
    get_chat_history,
    delete_chat_history,
    update_claude_session_id,
    get_claude_session_id,
    init_session_files_table,
    create_file_record,
    get_session_files,
    get_file_by_id,
    soft_delete_file,
    hard_delete_file,
    delete_session_file_records,
)

# Import E2B components
from e2b_sandbox import E2BSandboxManager
from e2b_claude_runner import E2BClaudeRunner
from r2_storage import R2Storage


# Fun random titles for new sessions
FUN_TITLES = [
    "Cosmic Brainstorm",
    "Midnight Debugging",
    "Quantum Thoughts",
    "Electric Dreams",
    "Pixel Adventure",
    "Neural Spark",
    "Code Odyssey",
    "Digital Campfire",
    "Syntax Safari",
    "Logic Labyrinth",
    "Binary Sunset",
    "Algorithm Alley",
    "Debug Dimension",
    "Function Junction",
    "Variable Voyage",
    "Loop de Loop",
    "Stack Overflow",
    "Memory Lane",
    "Cache Quest",
    "Async Adventure",
    "Promise Land",
    "Callback Canyon",
    "Regex Rodeo",
    "Terminal Velocity",
    "Git Happens",
    "Merge Conflict",
    "Hot Reload",
    "Null Island",
    "Type Safety",
    "Edge Case",
]


def generate_fun_title() -> str:
    """Generate a fun random title for a new session."""
    return random.choice(FUN_TITLES)


# Global managers
sandbox_manager = E2BSandboxManager()
r2_storage = R2Storage()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("Starting Claude Agent SDK WebSocket server with E2B + R2...")

    # Validate configuration
    try:
        validate_config()
        print("Configuration validated")
    except ValueError as e:
        print(f"Configuration error: {e}")
        raise

    # Initialize database
    init_db()
    init_session_files_table()
    print("Database initialized")

    yield

    # Cleanup on shutdown - save snapshots before killing
    print("Shutting down - saving snapshots and cleaning up sandboxes...")
    await sandbox_manager.cleanup_all(save_snapshots=True)
    print("Shutdown complete")


app = FastAPI(title="Claude Agent SDK Chat (E2B + R2)", lifespan=lifespan)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "sandbox_backend": "e2b", "storage_backend": "r2"}


# Session REST API endpoints
@app.get("/api/sessions")
async def get_sessions(user_id: str = Query(default="default")):
    """List all sessions for a user."""
    sessions = list_sessions(user_id)
    return {"sessions": sessions}


@app.get("/api/sessions/{session_id}")
async def get_session_by_id(session_id: str):
    """Get a specific session by ID."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/api/sessions/{session_id}")
async def delete_session_by_id(session_id: str):
    """Delete a session, its sandbox, snapshot, files, and chat history."""
    # Kill sandbox if active (don't save snapshot since we're deleting)
    await sandbox_manager.kill_sandbox(session_id, save_snapshot=False)

    # Delete R2 snapshot
    r2_storage.delete_snapshot(session_id)

    # Delete R2 files
    r2_storage.delete_session_files(session_id)

    # Delete file records from DB
    delete_session_file_records(session_id)

    # Delete chat history
    delete_chat_history(session_id)

    # Delete session from DB
    if not delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "deleted", "id": session_id}


@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    """
    Get chat history for a session from the database.
    This allows viewing history without spinning up a sandbox.
    """
    messages = get_chat_history(session_id)
    return {"messages": messages, "session_id": session_id}


@app.get("/api/snapshots")
async def list_snapshots():
    """List all snapshots in R2 (admin endpoint)."""
    snapshots = r2_storage.list_snapshots()
    return {"snapshots": snapshots}


# File upload/download endpoints

class FileUploadRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: int


@app.post("/api/sessions/{session_id}/files/upload-url")
async def get_file_upload_url(session_id: str, request: FileUploadRequest):
    """
    Get a presigned URL for uploading a file.
    Creates a file record in the database and returns upload URL.
    """
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate file ID
    file_id = str(uuid.uuid4())

    # Create R2 key
    r2_key = r2_storage.get_file_key(session_id, file_id, request.filename)

    # Create database record (pending upload)
    file_record = create_file_record(
        file_id=file_id,
        session_id=session_id,
        filename=request.filename,
        r2_key=r2_key,
        size_bytes=request.size_bytes,
        content_type=request.content_type,
    )

    # Generate presigned upload URL
    upload_url = r2_storage.get_file_upload_url(
        session_id=session_id,
        file_id=file_id,
        filename=request.filename,
        content_type=request.content_type,
    )

    return {
        "file_id": file_id,
        "upload_url": upload_url,
        "file": file_record,
    }


@app.post("/api/sessions/{session_id}/files/{file_id}/confirm")
async def confirm_file_upload(session_id: str, file_id: str):
    """
    Confirm a file upload completed successfully.
    Verifies file exists in R2 and optionally injects into active sandbox.
    """
    file_record = get_file_by_id(file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if file_record["session_id"] != session_id:
        raise HTTPException(status_code=400, detail="File does not belong to this session")

    # Verify file exists in R2
    if not r2_storage.file_exists(session_id, file_id, file_record["filename"]):
        raise HTTPException(status_code=400, detail="File not found in R2 storage")

    # Hot inject into sandbox if active
    injected = False
    if sandbox_manager.is_sandbox_active(session_id):
        injected = await sandbox_manager.inject_file(session_id, file_record)

    return {
        "status": "confirmed",
        "file_id": file_id,
        "injected": injected,
    }


@app.get("/api/sessions/{session_id}/files")
async def list_session_files_endpoint(session_id: str):
    """List all files for a session."""
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    files = get_session_files(session_id, include_deleted=False)
    return {"files": files, "session_id": session_id}


@app.delete("/api/sessions/{session_id}/files/{file_id}")
async def delete_file_endpoint(session_id: str, file_id: str):
    """Delete a file from R2 storage, sandbox, and mark as deleted in database."""
    file_record = get_file_by_id(file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if file_record["session_id"] != session_id:
        raise HTTPException(status_code=400, detail="File does not belong to this session")

    filename = file_record["filename"]

    # Delete from R2 storage first
    r2_storage.delete_file(session_id, file_id, filename)

    # Soft delete in database (keeps record for audit)
    soft_delete_file(file_id)

    # Remove from active sandbox if running
    await sandbox_manager.remove_file_from_sandbox(session_id, filename)

    return {"status": "deleted", "file_id": file_id}


@app.get("/api/sessions/{session_id}/files/{file_id}/download-url")
async def get_file_download_url_endpoint(session_id: str, file_id: str):
    """Get a presigned URL for downloading a file."""
    file_record = get_file_by_id(file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if file_record["session_id"] != session_id:
        raise HTTPException(status_code=400, detail="File does not belong to this session")

    if file_record["is_deleted"]:
        raise HTTPException(status_code=404, detail="File has been deleted")

    # Generate presigned download URL
    download_url = r2_storage.get_file_download_url(
        session_id=session_id,
        file_id=file_id,
        filename=file_record["filename"],
    )

    return {
        "download_url": download_url,
        "file": file_record,
    }


@app.websocket("/ws/chat")
async def websocket_chat(
    websocket: WebSocket,
    session_id: Optional[str] = Query(default=None),
    user_id: str = Query(default="default")
):
    """
    WebSocket endpoint for chat with Claude via E2B sandbox.
    Supports session resumption with R2 hydration.
    """
    await websocket.accept()
    print(f"WebSocket connection established (session_id: {session_id}, user_id: {user_id})")

    sandbox = None
    current_session_id = session_id
    is_new_session = False
    runner = None

    try:
        # Get or create sandbox
        if session_id and session_exists(session_id):
            # Existing session - create sandbox and hydrate from R2 if available
            print(f"Resuming session {session_id}")
            sandbox = await sandbox_manager.create_sandbox(session_id)
            update_sandbox_info(session_id, sandbox.sandbox_id, "active")
        else:
            # New session
            is_new_session = True
            current_session_id = str(uuid.uuid4())
            print(f"Creating new session {current_session_id}")
            sandbox = await sandbox_manager.create_sandbox(current_session_id)
            # Create session in DB immediately so file uploads work
            create_session(current_session_id, user_id, generate_fun_title())
            update_sandbox_info(current_session_id, sandbox.sandbox_id, "active")

        # Create Claude runner for this sandbox
        runner = E2BClaudeRunner(sandbox)

        # Restore Claude's internal session ID if resuming
        if not is_new_session:
            stored_claude_session = get_claude_session_id(current_session_id)
            if stored_claude_session:
                runner._claude_session_id = stored_claude_session
                print(f"Restored Claude session ID: {stored_claude_session}")

        # Check Claude version (optional, for debugging)
        try:
            version = await runner.check_claude_version()
            print(f"Claude CLI version: {version}")
        except Exception as e:
            print(f"Could not check Claude version: {e}")

        # Send session info to client
        await websocket.send_json({
            "type": "session_info",
            "session_id": current_session_id,
            "sandbox_id": sandbox.sandbox_id,
            "is_new": is_new_session,
            "has_snapshot": sandbox_manager.has_snapshot(current_session_id),
        })

        # Message loop
        while True:
            try:
                raw_message = await websocket.receive_text()
                print(f"Received from WebSocket: {raw_message[:100]}...")

                # Parse message - can be plain text or JSON with file_ids
                user_message = raw_message
                file_ids: List[str] = []

                try:
                    parsed = json.loads(raw_message)
                    if isinstance(parsed, dict) and "message" in parsed:
                        user_message = parsed["message"]
                        file_ids = parsed.get("file_ids", [])
                        print(f"Parsed JSON message with {len(file_ids)} file mentions")
                except json.JSONDecodeError:
                    # Plain text message - use as-is
                    pass

                # Build file context if files are mentioned
                file_context = ""
                if file_ids and current_session_id:
                    mentioned_files = []
                    for file_id in file_ids:
                        file_record = get_file_by_id(file_id)
                        if file_record and file_record["session_id"] == current_session_id:
                            mentioned_files.append(file_record)

                    if mentioned_files:
                        file_context = "\n\n[Referenced files in the sandbox workspace:]\n"
                        for f in mentioned_files:
                            file_context += f"- /home/user/workspace/uploads/{f['filename']}\n"
                        print(f"Injecting file context for {len(mentioned_files)} files")

                # Combine message with file context
                prompt_to_send = user_message
                if file_context:
                    prompt_to_send = user_message + file_context

                start_time = time.time()

                # Log user message to database (original message, not with file context)
                add_chat_message(current_session_id, "user", user_message)

                # Collect assistant response
                assistant_response = ""

                # Run prompt through E2B sandbox
                async for event in runner.run_prompt(prompt_to_send):
                    await websocket.send_json(event)

                    # Collect text chunks for logging
                    if event.get("type") == "chunk":
                        assistant_response += event.get("content", "")

                total_time = time.time() - start_time
                print(f"Response complete. Total time: {total_time:.3f}s")

                # Log assistant response to database
                if assistant_response:
                    add_chat_message(current_session_id, "assistant", assistant_response)

                # Mark session as no longer new (keep the fun random title)
                if is_new_session:
                    is_new_session = False

                # Save Claude's internal session ID for future resumption
                if runner._claude_session_id:
                    update_claude_session_id(current_session_id, runner._claude_session_id)

                update_session_timestamp(current_session_id)

            except WebSocketDisconnect:
                print("WebSocket disconnected during message loop")
                raise

    except WebSocketDisconnect:
        print("WebSocket disconnected - scheduling delayed sandbox kill")
        # Schedule delayed kill instead of immediate kill
        if sandbox and current_session_id:
            await sandbox_manager.schedule_delayed_kill(
                current_session_id,
                delay_seconds=SANDBOX_GRACE_PERIOD
            )

    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass

        # Kill sandbox on error (still try to save snapshot)
        if sandbox and current_session_id:
            try:
                await sandbox_manager.kill_sandbox(current_session_id, save_snapshot=True)
                update_has_snapshot(current_session_id, True)
            except Exception as e2:
                print(f"Error killing sandbox: {e2}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
