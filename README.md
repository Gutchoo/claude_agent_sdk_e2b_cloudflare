# Claude Agent SDK Chat Interface

A proof-of-concept chat interface demonstrating the Claude Agent SDK with E2B sandboxes for isolated execution.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         YOUR INFRASTRUCTURE                          │
│                                                                      │
│  ┌──────────────┐                    ┌─────────────────────────────┐│
│  │   Frontend   │◄──── WebSocket ───►│      FastAPI Backend        ││
│  │  (browser)   │                    │                             ││
│  └──────────────┘                    │  E2BSandboxManager          ││
│                                      │  E2BClaudeRunner            ││
│                                      │  SandboxRegistry            ││
│                                      └──────────┬──────────────────┘│
└─────────────────────────────────────────────────┼────────────────────┘
                                                  │ E2B SDK
                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           E2B CLOUD                                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │  Sandbox 1  │  │  Sandbox 2  │  │  Sandbox 3  │  ...             │
│  │  Session A  │  │  Session B  │  │  Session C  │                  │
│  │ Claude Code │  │ Claude Code │  │ Claude Code │                  │
│  │ /workspace  │  │ /workspace  │  │ /workspace  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  - 150ms startup    - Pause/Resume with full state                  │
│  - 24h max runtime  - 30-day pause persistence                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **One Sandbox Per Session**: Each chat session gets its own isolated E2B sandbox
- **Pause/Resume**: Sandboxes pause on disconnect and resume on reconnect (30-day persistence)
- **Real-time Streaming**: Token-by-token streaming via WebSocket
- **Full Isolation**: Claude Code runs in isolated E2B cloud sandboxes

## Project Structure

```
basic_agent_sdk/
├── backend/
│   ├── main.py              # FastAPI WebSocket server
│   ├── config.py            # E2B configuration
│   ├── e2b_sandbox.py       # Sandbox lifecycle management
│   ├── e2b_claude_runner.py # Claude CLI execution
│   ├── database.py          # Session persistence
│   ├── transcript.py        # Transcript reading
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment template
├── frontend/
│   ├── index.html           # Chat interface
│   ├── style.css            # Styling
│   └── app.js               # WebSocket client
└── README.md
```

## Setup

### Prerequisites

- Python 3.10+
- E2B API key (from https://e2b.dev/dashboard)
- Anthropic API key

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Copy the environment template and add your API keys:
   ```bash
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY and E2B_API_KEY
   ```

5. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

   The server will start at `http://localhost:8000`

### Frontend Setup

Simply open `frontend/index.html` in your browser. No build step required.

For development with live reload, you can use any static file server:
```bash
cd frontend
python -m http.server 3000
# Then open http://localhost:3000
```

## Usage

1. Start the backend server (see above)
2. Open `frontend/index.html` in your browser
3. Click "Connect" to establish WebSocket connection
4. Start chatting with Claude

## Sandbox Lifecycle

| Event | Action |
|-------|--------|
| WebSocket connect (new session) | Create sandbox |
| WebSocket connect (existing session) | Resume paused sandbox |
| WebSocket disconnect | Pause sandbox |
| Session delete | Kill sandbox |
| 30 days idle | E2B auto-expires sandbox |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | Required |
| `E2B_API_KEY` | E2B API key | Required |
| `E2B_TEMPLATE` | E2B sandbox template | `base` |
| `E2B_SANDBOX_TIMEOUT` | Sandbox timeout (seconds) | `300` |

### WebSocket URL

If running the backend on a different host/port, update `wsUrl` in `frontend/app.js`:
```javascript
this.wsUrl = 'ws://your-host:port/ws/chat';
```

## API Endpoints

- `GET /health` - Health check (returns `{"status": "healthy", "sandbox_backend": "e2b"}`)
- `GET /api/sessions` - List all sessions for a user
- `GET /api/sessions/{session_id}` - Get session details
- `DELETE /api/sessions/{session_id}` - Delete session and kill sandbox
- `WebSocket /ws/chat` - Chat endpoint

## WebSocket Protocol

### Client → Server
```
Plain text message
```

### Server → Client
```json
{"type": "session_info", "session_id": "...", "sandbox_id": "...", "is_new": true}
{"type": "status", "status": "processing"}
{"type": "chunk", "content": "..."}
{"type": "tool_use", "tool_id": "...", "tool_name": "...", "input": {...}}
{"type": "tool_result", "tool_id": "...", "content": "...", "is_error": false}
{"type": "done", "session_id": "..."}
{"type": "error", "message": "error details"}
```

## Verification Steps

1. **E2B Setup**: Run `e2b login` and verify API key works
2. **Install Dependencies**: `pip install -r requirements.txt`
3. **Test Sandbox Creation**:
   ```python
   from e2b import Sandbox
   sbx = Sandbox("base", envs={"ANTHROPIC_API_KEY": "..."})
   print(sbx.commands.run("echo hello").stdout)
   sbx.kill()
   ```
4. **Start Backend**: `python -m uvicorn main:app --reload`
5. **Frontend Test**: Open `frontend/index.html`, send a message
6. **Persistence Test**:
   - Send "My name is Alice"
   - Disconnect (close browser tab)
   - Reconnect and ask "What's my name?" → Should answer "Alice"
7. **Health Check**: `curl http://localhost:8000/health`
