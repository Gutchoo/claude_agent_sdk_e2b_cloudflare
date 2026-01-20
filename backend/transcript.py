"""
Transcript reader for Claude session JSONL files.
Reads chat history directly from Claude's transcript files.
"""

import json
import os
from pathlib import Path
from typing import Optional


# Default transcript directory - can be overridden for sandbox/volume mounting
TRANSCRIPT_DIR = Path(os.environ.get(
    "CLAUDE_TRANSCRIPT_DIR",
    os.path.expanduser("~/.claude/projects")
))


def get_project_dir(cwd: str) -> str:
    """
    Convert a working directory path to Claude's project directory format.
    e.g., /Users/foo/my-project -> -Users-foo-my-project
    Note: The leading dash is kept as Claude uses this format.
    """
    return cwd.replace("/", "-")


def find_transcript_path(session_id: str, project_path: Optional[str] = None) -> Optional[Path]:
    """
    Find the transcript file for a session.

    If project_path is provided, looks in that project's directory.
    Otherwise, searches all project directories.
    """
    if project_path:
        project_dir = get_project_dir(project_path)
        transcript_path = TRANSCRIPT_DIR / project_dir / f"{session_id}.jsonl"
        if transcript_path.exists():
            return transcript_path
        return None

    # Search all project directories
    for project_dir in TRANSCRIPT_DIR.iterdir():
        if project_dir.is_dir():
            transcript_path = project_dir / f"{session_id}.jsonl"
            if transcript_path.exists():
                return transcript_path

    return None


def read_sessions_index(project_path: str) -> list[dict]:
    """
    Read the sessions-index.json for a project.
    Returns list of session metadata.
    """
    project_dir = get_project_dir(project_path)
    index_path = TRANSCRIPT_DIR / project_dir / "sessions-index.json"

    if not index_path.exists():
        return []

    try:
        with open(index_path) as f:
            data = json.load(f)
            return data.get("entries", [])
    except (json.JSONDecodeError, IOError):
        return []


def parse_transcript(session_id: str, project_path: Optional[str] = None) -> list[dict]:
    """
    Parse a transcript file and extract user/assistant messages.

    Returns a list of messages in format:
    [
        {"role": "user", "content": "...", "timestamp": "..."},
        {"role": "assistant", "content": "...", "timestamp": "..."},
        ...
    ]
    """
    transcript_path = find_transcript_path(session_id, project_path)
    if not transcript_path:
        return []

    messages = []

    try:
        with open(transcript_path) as f:
            for line in f:
                try:
                    obj = json.loads(line.strip())
                    msg_type = obj.get("type")

                    if msg_type == "user" and not obj.get("isMeta"):
                        # Extract user message content
                        content = extract_text_content(obj.get("message", {}).get("content"))
                        if content and not content.startswith("<"):  # Skip command messages
                            messages.append({
                                "role": "user",
                                "content": content,
                                "timestamp": obj.get("timestamp"),
                                "uuid": obj.get("uuid")
                            })

                    elif msg_type == "assistant":
                        # Extract assistant message content
                        content = extract_text_content(obj.get("message", {}).get("content"))
                        if content:
                            messages.append({
                                "role": "assistant",
                                "content": content,
                                "timestamp": obj.get("timestamp"),
                                "uuid": obj.get("uuid")
                            })

                except json.JSONDecodeError:
                    continue

    except IOError:
        return []

    return messages


def extract_text_content(content) -> str:
    """
    Extract text content from message content field.
    Content can be a string or a list of content blocks.
    """
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        return "\n".join(texts).strip()

    return ""


def get_session_info(session_id: str, project_path: str) -> Optional[dict]:
    """
    Get session info from the sessions-index.json.
    """
    entries = read_sessions_index(project_path)
    for entry in entries:
        if entry.get("sessionId") == session_id:
            return entry
    return None


def list_sessions_from_index(project_path: str) -> list[dict]:
    """
    List all sessions for a project from sessions-index.json.
    Returns simplified session info for API response.
    """
    entries = read_sessions_index(project_path)

    sessions = []
    for entry in entries:
        sessions.append({
            "id": entry.get("sessionId"),
            "title": entry.get("firstPrompt", "Untitled")[:50] + "..." if len(entry.get("firstPrompt", "")) > 50 else entry.get("firstPrompt", "Untitled"),
            "created_at": entry.get("created"),
            "updated_at": entry.get("modified"),
            "message_count": entry.get("messageCount", 0)
        })

    # Sort by modified date, most recent first
    sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

    return sessions
