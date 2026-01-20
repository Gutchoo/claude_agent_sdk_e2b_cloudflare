"""
SQLite database for session persistence.
Stores session IDs so users can resume conversations.
"""

import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional


# Database file location - configurable via environment variable for Docker deployment
DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "sessions.db")))


def get_connection() -> sqlite3.Connection:
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize the database schema."""
    conn = get_connection()
    try:
        # Sessions table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sandbox_id TEXT,
                sandbox_status TEXT DEFAULT 'none',
                has_snapshot BOOLEAN DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)
        """)

        # Chat logs table - stores conversation for UI display
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs(session_id)
        """)

        # Add columns if they don't exist (for existing databases)
        for column, default in [
            ("sandbox_id", "TEXT"),
            ("sandbox_status", "TEXT DEFAULT 'none'"),
            ("has_snapshot", "BOOLEAN DEFAULT 0"),
        ]:
            try:
                conn.execute(f"ALTER TABLE sessions ADD COLUMN {column} {default}")
            except sqlite3.OperationalError:
                pass  # Column already exists

        conn.commit()
    finally:
        conn.close()


def create_session(session_id: str, user_id: str, title: str) -> dict:
    """Create a new session record."""
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO sessions (id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, user_id, title, now, now)
        )
        conn.commit()
        return {
            "id": session_id,
            "user_id": user_id,
            "title": title,
            "created_at": now,
            "updated_at": now
        }
    finally:
        conn.close()


def get_session(session_id: str) -> Optional[dict]:
    """Get a session by ID."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def list_sessions(user_id: str) -> list[dict]:
    """List all sessions for a user, ordered by most recently updated."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT * FROM sessions
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def update_session_timestamp(session_id: str) -> bool:
    """Update the updated_at timestamp for a session."""
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        cursor = conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def update_session_title(session_id: str, title: str) -> bool:
    """Update the title of a session."""
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        cursor = conn.execute(
            "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
            (title, now, session_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_session(session_id: str) -> bool:
    """Delete a session by ID."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM sessions WHERE id = ?",
            (session_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def session_exists(session_id: str) -> bool:
    """Check if a session exists."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT 1 FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def update_sandbox_info(session_id: str, sandbox_id: str, status: str) -> bool:
    """
    Update sandbox information for a session.

    Args:
        session_id: The session ID
        sandbox_id: The E2B sandbox ID
        status: Sandbox status ('active', 'paused', 'none')

    Returns:
        True if updated successfully, False otherwise
    """
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        cursor = conn.execute(
            "UPDATE sessions SET sandbox_id = ?, sandbox_status = ?, updated_at = ? WHERE id = ?",
            (sandbox_id, status, now, session_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_sandbox_id(session_id: str) -> Optional[str]:
    """
    Get the sandbox ID for a session.

    Args:
        session_id: The session ID

    Returns:
        The sandbox ID if found, None otherwise
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT sandbox_id FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        if row:
            return row["sandbox_id"]
        return None
    finally:
        conn.close()


def get_sandbox_status(session_id: str) -> Optional[str]:
    """
    Get the sandbox status for a session.

    Args:
        session_id: The session ID

    Returns:
        The sandbox status if found, None otherwise
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT sandbox_status FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        if row:
            return row["sandbox_status"]
        return None
    finally:
        conn.close()


def update_has_snapshot(session_id: str, has_snapshot: bool) -> bool:
    """Update the has_snapshot flag for a session."""
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        cursor = conn.execute(
            "UPDATE sessions SET has_snapshot = ?, updated_at = ? WHERE id = ?",
            (1 if has_snapshot else 0, now, session_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_has_snapshot(session_id: str) -> bool:
    """Check if a session has a snapshot."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT has_snapshot FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        if row:
            return bool(row["has_snapshot"])
        return False
    finally:
        conn.close()


# Chat log functions

def add_chat_message(session_id: str, role: str, content: str) -> int:
    """
    Add a chat message to the log.

    Args:
        session_id: The session ID
        role: 'user' or 'assistant'
        content: The message content

    Returns:
        The ID of the inserted message
    """
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        cursor = conn.execute(
            """
            INSERT INTO chat_logs (session_id, role, content, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, role, content, now)
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_chat_history(session_id: str, limit: int = 100) -> list[dict]:
    """
    Get chat history for a session.

    Args:
        session_id: The session ID
        limit: Maximum number of messages to return

    Returns:
        List of messages in chronological order
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT role, content, timestamp
            FROM chat_logs
            WHERE session_id = ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (session_id, limit)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def delete_chat_history(session_id: str) -> bool:
    """Delete all chat history for a session."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM chat_logs WHERE session_id = ?",
            (session_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def update_claude_session_id(session_id: str, claude_session_id: str) -> bool:
    """Store Claude CLI's internal session ID for resumption."""
    conn = get_connection()
    try:
        # First ensure the column exists
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT")
        except sqlite3.OperationalError:
            pass

        now = datetime.utcnow().isoformat()
        cursor = conn.execute(
            "UPDATE sessions SET claude_session_id = ?, updated_at = ? WHERE id = ?",
            (claude_session_id, now, session_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_claude_session_id(session_id: str) -> Optional[str]:
    """Get Claude CLI's internal session ID."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT claude_session_id FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        if row:
            return row["claude_session_id"]
        return None
    except sqlite3.OperationalError:
        # Column doesn't exist yet
        return None
    finally:
        conn.close()


# Session files functions

def init_session_files_table():
    """Initialize the session_files table."""
    conn = get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS session_files (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                r2_key TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                content_type TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_files_session_id ON session_files(session_id)
        """)
        conn.commit()
    finally:
        conn.close()


def create_file_record(
    file_id: str,
    session_id: str,
    filename: str,
    r2_key: str,
    size_bytes: int,
    content_type: str
) -> dict:
    """Create a new file record."""
    conn = get_connection()
    try:
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO session_files (id, session_id, filename, r2_key, size_bytes, content_type, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (file_id, session_id, filename, r2_key, size_bytes, content_type, now)
        )
        conn.commit()
        return {
            "id": file_id,
            "session_id": session_id,
            "filename": filename,
            "r2_key": r2_key,
            "size_bytes": size_bytes,
            "content_type": content_type,
            "uploaded_at": now,
            "is_deleted": 0
        }
    finally:
        conn.close()


def get_session_files(session_id: str, include_deleted: bool = False) -> list[dict]:
    """Get all files for a session."""
    conn = get_connection()
    try:
        if include_deleted:
            rows = conn.execute(
                """
                SELECT * FROM session_files
                WHERE session_id = ?
                ORDER BY uploaded_at DESC
                """,
                (session_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM session_files
                WHERE session_id = ? AND is_deleted = 0
                ORDER BY uploaded_at DESC
                """,
                (session_id,)
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_file_by_id(file_id: str) -> Optional[dict]:
    """Get a file by ID."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM session_files WHERE id = ?",
            (file_id,)
        ).fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def soft_delete_file(file_id: str) -> bool:
    """Mark a file as deleted (soft delete)."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "UPDATE session_files SET is_deleted = 1 WHERE id = ?",
            (file_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def hard_delete_file(file_id: str) -> bool:
    """Permanently delete a file record."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM session_files WHERE id = ?",
            (file_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_session_file_records(session_id: str) -> int:
    """Delete all file records for a session. Returns count deleted."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM session_files WHERE session_id = ?",
            (session_id,)
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()
