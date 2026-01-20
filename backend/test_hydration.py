"""
Test hydration/dehydration cycle with R2 storage.

Tests:
1. Create new session, send messages, disconnect (triggers dehydration)
2. Verify snapshot exists in R2
3. Reconnect to same session (triggers hydration)
4. Verify context is preserved (Claude remembers previous conversation)
"""

import asyncio
import json
import time
import websockets
import requests

WS_URL = "ws://localhost:8001/ws/chat"
API_URL = "http://localhost:8001"


async def test_hydration_cycle():
    """Test full hydration/dehydration cycle."""

    print("=" * 70)
    print("HYDRATION/DEHYDRATION CYCLE TEST")
    print("=" * 70)

    session_id = None

    # PHASE 1: Create new session, send message, disconnect
    print("\n[PHASE 1] Create session and send initial message")
    print("-" * 50)

    try:
        async with websockets.connect(WS_URL) as ws:
            # Wait for session_info
            msg = await asyncio.wait_for(ws.recv(), timeout=120)
            data = json.loads(msg)
            assert data["type"] == "session_info", f"Expected session_info, got {data['type']}"
            session_id = data["session_id"]
            print(f"  Session ID: {session_id}")
            print(f"  Sandbox ID: {data['sandbox_id']}")
            print(f"  Has snapshot: {data.get('has_snapshot', False)}")

            # Send message 1: Set name
            print("\n  Sending: 'My name is Bob and I like pizza'")
            start = time.time()
            await ws.send("My name is Bob and I like pizza. Remember this.")

            response = ""
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)
                if data["type"] == "chunk":
                    response += data.get("content", "")
                elif data["type"] == "done":
                    break
                elif data["type"] == "error":
                    print(f"  ERROR: {data['message']}")
                    return

            print(f"  Response ({time.time()-start:.2f}s): {response[:100]}...")

        print("\n  Disconnected (should trigger dehydration)")

    except Exception as e:
        print(f"  Error in Phase 1: {e}")
        return

    # Wait for dehydration to complete
    print("\n  Waiting 5s for dehydration...")
    await asyncio.sleep(5)

    # PHASE 2: Verify snapshot exists
    print("\n[PHASE 2] Verify snapshot in R2")
    print("-" * 50)

    try:
        response = requests.get(f"{API_URL}/api/snapshots")
        snapshots = response.json().get("snapshots", [])
        print(f"  Total snapshots: {len(snapshots)}")

        our_snapshot = next((s for s in snapshots if s["session_id"] == session_id), None)
        if our_snapshot:
            print(f"  Found snapshot for session: {session_id}")
            print(f"  Size: {our_snapshot['size']} bytes")
            print(f"  Last modified: {our_snapshot['last_modified']}")
        else:
            print(f"  WARNING: No snapshot found for session {session_id}")
            print(f"  Available snapshots: {[s['session_id'] for s in snapshots]}")

    except Exception as e:
        print(f"  Error checking snapshots: {e}")

    # PHASE 3: Verify chat history in database
    print("\n[PHASE 3] Verify chat history in database")
    print("-" * 50)

    try:
        response = requests.get(f"{API_URL}/api/sessions/{session_id}/messages")
        messages = response.json().get("messages", [])
        print(f"  Messages in DB: {len(messages)}")
        for msg in messages:
            role = msg["role"]
            content = msg["content"][:60] + "..." if len(msg["content"]) > 60 else msg["content"]
            print(f"    {role}: {content}")

    except Exception as e:
        print(f"  Error checking chat history: {e}")

    # PHASE 4: Reconnect and verify context
    print("\n[PHASE 4] Reconnect and verify context preservation")
    print("-" * 50)

    try:
        ws_url_with_session = f"{WS_URL}?session_id={session_id}"
        async with websockets.connect(ws_url_with_session) as ws:
            # Wait for session_info
            msg = await asyncio.wait_for(ws.recv(), timeout=120)
            data = json.loads(msg)
            assert data["type"] == "session_info"
            print(f"  Reconnected to session: {data['session_id']}")
            print(f"  New sandbox ID: {data['sandbox_id']}")
            print(f"  Has snapshot: {data.get('has_snapshot', False)}")

            # Ask about name
            print("\n  Sending: 'What is my name and what food do I like?'")
            start = time.time()
            await ws.send("What is my name and what food do I like?")

            response = ""
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)
                if data["type"] == "chunk":
                    response += data.get("content", "")
                elif data["type"] == "done":
                    break
                elif data["type"] == "error":
                    print(f"  ERROR: {data['message']}")
                    return

            print(f"  Response ({time.time()-start:.2f}s): {response[:200]}...")

            # Check if context was preserved
            response_lower = response.lower()
            has_bob = "bob" in response_lower
            has_pizza = "pizza" in response_lower

            print(f"\n  Context check:")
            print(f"    Remembers 'Bob': {'PASS' if has_bob else 'FAIL'}")
            print(f"    Remembers 'pizza': {'PASS' if has_pizza else 'FAIL'}")

    except Exception as e:
        print(f"  Error in Phase 4: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_hydration_cycle())
