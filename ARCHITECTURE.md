# E2B Sandbox Architecture

## Overview

```
┌──────────────┐     WebSocket      ┌──────────────────┐      E2B API       ┌─────────────────┐
│   Browser    │◄──────────────────►│  FastAPI Backend │◄──────────────────►│  E2B Cloud      │
│  (frontend)  │    localhost:8001  │  (your machine)  │                    │  (their cloud)  │
└──────────────┘                    └──────────────────┘                    └─────────────────┘
                                            │                                       │
                                            ▼                                       ▼
                                    ┌──────────────┐                        ┌──────────────┐
                                    │ SQLite DB    │                        │ Sandbox VM   │
                                    │ sessions.db  │                        │ Claude CLI   │
                                    └──────────────┘                        └──────────────┘
```

## Connection Flow

1. **User clicks Connect** → Browser opens WebSocket to `ws://localhost:8001/ws/chat`
2. **Backend creates sandbox** → Calls E2B API, spins up a VM in their cloud (~5s)
3. **Claude CLI installed** → `npm install -g @anthropic-ai/claude-code` runs in sandbox
4. **User sends message** → Backend pipes it to Claude CLI in sandbox
5. **Response streams back** → Sandbox → Backend → Browser

## Where Things Are Stored

| What | Where | Purpose |
|------|-------|---------|
| Session metadata | `backend/sessions.db` (SQLite) | Tracks session IDs, sandbox IDs, timestamps |
| Chat history | Inside E2B sandbox (`~/.claude/`) | Claude CLI stores its own transcripts |
| Sandbox state | E2B Cloud | Full VM state (filesystem, memory) when paused |

## Key IDs

| ID | What it is | Who creates it |
|----|------------|----------------|
| `session_id` | Our backend's session identifier | Backend (UUID) |
| `sandbox_id` | E2B's VM identifier | E2B Cloud |
| `claude_session_id` | Claude CLI's conversation ID | Claude CLI |

## Sandbox Lifecycle

```
User connects (new)     → Create sandbox → Install Claude CLI → Ready
User connects (resume)  → Resume paused sandbox → Ready
User disconnects        → Pause sandbox (state saved for 30 days)
User deletes session    → Kill sandbox (permanently destroyed)
```

## File Responsibilities

| File | Role |
|------|------|
| `main.py` | WebSocket server, routes messages, manages session lifecycle |
| `e2b_sandbox.py` | Create/pause/resume/kill sandboxes via E2B SDK |
| `e2b_claude_runner.py` | Execute Claude CLI commands, parse JSON output |
| `database.py` | SQLite operations for session tracking |
| `config.py` | Load API keys from environment |

## Message Flow (Single Message)

```
1. Browser sends: "Hello"
         │
         ▼
2. Backend receives via WebSocket
         │
         ▼
3. Backend runs in sandbox:
   echo 'Hello' | claude -p --output-format json --dangerously-skip-permissions
         │
         ▼
4. Claude CLI calls Anthropic API (using ANTHROPIC_API_KEY in sandbox env)
         │
         ▼
5. Claude responds, CLI outputs JSON with response + session_id
         │
         ▼
6. Backend parses JSON, sends chunk to browser via WebSocket
         │
         ▼
7. Browser displays response
```

## Context Preservation

Claude remembers previous messages because:

1. First message → Claude CLI creates a session, returns `session_id`
2. Backend saves this `session_id` in `E2BClaudeRunner._claude_session_id`
3. Next message → Backend adds `--resume {session_id}` to command
4. Claude CLI loads previous conversation from its internal storage

## Environment Variables

```
ANTHROPIC_API_KEY  → Passed into sandbox, used by Claude CLI
E2B_API_KEY        → Used by backend to authenticate with E2B
```

## Ports

| Port | Service |
|------|---------|
| 8001 | FastAPI backend (WebSocket + REST API) |
| 3000 | Frontend (optional, for `python -m http.server`) |
