# Claude Agent SDK - Project Guide

## Quick Start

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8001

# Terminal 2: Frontend
cd frontend
npm run dev

# Open browser: http://localhost:3000
```

## Required Environment Variables (.env)

```
ANTHROPIC_API_KEY=sk-ant-...
E2B_API_KEY=e2b_...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=claude-agent-snapshots
```

---

# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     Frontend (localhost:3000)                         │  │
│   │                                                                       │  │
│   │  • Vite + React + TypeScript app (npm run dev)                       │  │
│   │  • WebSocket connection to backend                                    │  │
│   │  • Displays chat history from database (no sandbox needed)           │  │
│   └───────────────────────────────┬──────────────────────────────────────┘  │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │
                                    │ WebSocket (ws://localhost:8001/ws/chat)
                                    │
┌───────────────────────────────────┼──────────────────────────────────────────┐
│                              YOUR SERVER                                      │
│                                                                              │
│   ┌───────────────────────────────▼──────────────────────────────────────┐  │
│   │                  FastAPI Backend (localhost:8001)                     │  │
│   │                                                                       │  │
│   │  • Manages WebSocket connections                                      │  │
│   │  • Creates/destroys E2B sandboxes                                    │  │
│   │  • Logs chat messages to SQLite                                      │  │
│   │  • Triggers hydration/dehydration to R2                              │  │
│   └──────┬─────────────────────┬─────────────────────────┬───────────────┘  │
│          │                     │                         │                   │
│          ▼                     ▼                         ▼                   │
│   ┌─────────────┐      ┌─────────────┐          ┌─────────────┐             │
│   │   SQLite    │      │   E2B SDK   │          │  Boto3 SDK  │             │
│   │ sessions.db │      │             │          │             │             │
│   └─────────────┘      └──────┬──────┘          └──────┬──────┘             │
│                               │                        │                     │
└───────────────────────────────┼────────────────────────┼─────────────────────┘
                                │                        │
                    E2B API     │                        │  S3-Compatible API
                                │                        │
┌───────────────────────────────▼────────┐    ┌─────────▼─────────────────────┐
│              E2B CLOUD                  │    │      CLOUDFLARE R2            │
│                                         │    │                               │
│  ┌─────────────────────────────────┐   │    │  ┌─────────────────────────┐  │
│  │         Sandbox VM              │   │    │  │   Session Snapshots     │  │
│  │                                 │   │    │  │                         │  │
│  │  • Ubuntu container            │   │    │  │  snapshots/              │  │
│  │  • Claude Code CLI installed   │   │    │  │    {session_id}.tar.gz  │  │
│  │  • /home/user/workspace/       │   │    │  │                         │  │
│  │  • ~/.claude/ (session state)  │   │    │  │  Contains:              │  │
│  │                                 │   │    │  │  • workspace/ files     │  │
│  │  Calls Anthropic API ─────────────────────► │  • .claude/ state       │  │
│  └─────────────────────────────────┘   │    │  └─────────────────────────┘  │
│                                         │    │                               │
│  • ~5s to create + install CLI         │    │  • Zero egress fees          │
│  • ~2s to hydrate from R2              │    │  • Unlimited retention       │
│  • Destroyed after each session        │    │  • ~9KB per session          │
└─────────────────────────────────────────┘    └───────────────────────────────┘
```

## Data Flow: What Happens When

### 1. User Opens App (No Sandbox Yet)

```
Browser                     Backend                    Database
   │                           │                          │
   │── GET /api/sessions ─────►│                          │
   │                           │── SELECT sessions ──────►│
   │◄── List of past chats ────│◄─────────────────────────│
   │                           │                          │
   │   (User sees chat history without any sandbox)       │
```

### 2. User Clicks "Connect" (New Session)

```
Browser                     Backend                    E2B Cloud              R2
   │                           │                          │                    │
   │── WebSocket Connect ─────►│                          │                    │
   │                           │── Create Sandbox ───────►│                    │
   │                           │◄── Sandbox ready ────────│                    │
   │                           │                          │                    │
   │                           │── Install Claude CLI ───►│                    │
   │                           │◄── CLI ready ────────────│                    │
   │                           │                          │                    │
   │◄── session_info ──────────│                          │                    │
   │   {session_id, sandbox_id}│                          │                    │
```

### 3. User Sends Message

```
Browser                     Backend                    E2B Sandbox           Anthropic
   │                           │                          │                      │
   │── "Hello Claude" ────────►│                          │                      │
   │                           │── Log to chat_logs ─────►│                      │
   │                           │                          │                      │
   │                           │── echo "Hello" | claude ─►│                      │
   │                           │                          │── API Request ──────►│
   │                           │                          │◄── Response ─────────│
   │                           │◄── JSON response ────────│                      │
   │                           │                          │                      │
   │◄── {type: "chunk"} ───────│                          │                      │
   │◄── {type: "chunk"} ───────│                          │                      │
   │◄── {type: "done"} ────────│                          │                      │
   │                           │                          │                      │
   │                           │── Log assistant msg ────►│                      │
   │                           │── Save claude_session_id─►│                      │
```

### 4. User Disconnects (Dehydration)

```
Browser                     Backend                    E2B Sandbox              R2
   │                           │                          │                      │
   │── WebSocket Close ───────►│                          │                      │
   │                           │                          │                      │
   │                           │── tar workspace + .claude►│                      │
   │                           │                          │── Upload .tar.gz ───►│
   │                           │◄── Upload complete ──────│                      │
   │                           │                          │                      │
   │                           │── Kill Sandbox ─────────►│                      │
   │                           │                          │                      │
   │                           │── Update DB: has_snapshot=true                  │
```

### 5. User Reconnects (Hydration)

```
Browser                     Backend                    E2B Cloud                R2
   │                           │                          │                      │
   │── WebSocket + session_id ►│                          │                      │
   │                           │                          │                      │
   │                           │── Create new Sandbox ───►│                      │
   │                           │                          │                      │
   │                           │── Get presigned URL ─────────────────────────────►│
   │                           │◄── Download URL ──────────────────────────────────│
   │                           │                          │                      │
   │                           │── curl + extract ───────►│◄── Download .tar.gz ─│
   │                           │                          │                      │
   │                           │── Restore claude_session_id from DB             │
   │                           │                          │                      │
   │◄── session_info ──────────│   (Claude now has full context from before)     │
```

## Where Data Lives

| Data | Location | Purpose |
|------|----------|---------|
| **Session metadata** | SQLite `sessions` table | Track session IDs, titles, timestamps |
| **Chat messages** | SQLite `chat_logs` table | Display history without sandbox |
| **Claude session ID** | SQLite `sessions.claude_session_id` | Resume Claude conversations |
| **Workspace files** | R2 snapshots | Files created/uploaded during session |
| **Claude memory** | R2 snapshots (`.claude/`) | Claude's conversation state |

## Key Design Decisions

### Why E2B Sandboxes?
- **Isolation**: Each user gets their own VM - no cross-contamination
- **Security**: Claude Code runs with full permissions safely contained
- **Simplicity**: No Docker/Kubernetes to manage ourselves

### Why Cloudflare R2?
- **Zero egress fees**: We download snapshots frequently (every reconnect)
- **S3-compatible**: Works with standard boto3 SDK
- **Cheap storage**: ~$0.015/GB/month

### Why Kill Sandboxes Instead of Pausing?
- **Cost**: Paused sandboxes still cost money
- **Reliability**: E2B pause has 30-day limit; R2 is unlimited
- **Control**: We own the data, not dependent on E2B retention

### Why Store Chat in Database AND Sandbox?
- **Database**: Fast UI display without spinning up sandbox
- **Sandbox**: Claude's actual memory for context continuity

## File Structure

```
basic_agent_sdk/
├── backend/
│   ├── main.py              # FastAPI server, WebSocket handler
│   ├── e2b_sandbox.py       # Sandbox lifecycle (create, hydrate, dehydrate, kill)
│   ├── e2b_claude_runner.py # Execute Claude CLI, parse responses
│   ├── r2_storage.py        # R2 upload/download with presigned URLs
│   ├── database.py          # SQLite operations
│   ├── config.py            # Environment variables
│   ├── requirements.txt     # Python dependencies
│   └── sessions.db          # SQLite database (auto-created)
├── frontend/
│   ├── src/                 # React components and app logic
│   ├── index.html           # Entry point
│   ├── package.json         # Dependencies (React, Vite, shadcn/ui)
│   └── vite.config.ts       # Vite configuration
├── .env                     # API keys (not in git)
└── CLAUDE.md               # This file
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/sessions` | GET | List user's sessions |
| `/api/sessions/{id}` | GET | Get session details |
| `/api/sessions/{id}` | DELETE | Delete session + snapshot |
| `/api/sessions/{id}/messages` | GET | Get chat history |
| `/api/snapshots` | GET | List R2 snapshots (admin) |
| `/ws/chat` | WebSocket | Real-time chat |

## Costs (Estimated)

| Service | Cost | Notes |
|---------|------|-------|
| **E2B** | ~$0.10/hour sandbox | Only while user is connected |
| **Cloudflare R2** | ~$0.015/GB/month | Snapshots ~9KB each |
| **Anthropic API** | Per token | Passed through to user's key |

For 100 users, 1 hour/day each: ~$300/month E2B + ~$0.15/month R2

## Testing

```bash
# Run integration test
cd backend
source venv/bin/activate
python test_hydration.py
```

Test verifies:
1. Sandbox creation
2. Message sending
3. Dehydration to R2
4. Hydration from R2
5. Context preservation (Claude remembers previous conversation)
