"""
Backend Integration Test

A quick sanity check to verify the backend is working correctly.
Tests WebSocket connection, message sending, tool calls, and context continuity.

Usage:
    cd backend
    source venv/bin/activate
    uvicorn main:app --reload --port 8001  # In another terminal
    python test_backend.py
"""

import asyncio
import json
import time
import websockets

WS_URL = "ws://localhost:8001/ws/chat"


async def test_backend():
    """Run backend integration test."""

    print("=" * 60)
    print("BACKEND INTEGRATION TEST")
    print("=" * 60)

    results = {
        "connection": False,
        "sandbox_created": False,
        "message_response": False,
        "tool_use_received": False,
        "tool_result_received": False,
        "context_preserved": False,
    }

    try:
        print("\n[1] Connecting to WebSocket...")
        async with websockets.connect(WS_URL) as ws:
            results["connection"] = True
            print("    Connected")

            # Wait for session_info
            print("\n[2] Waiting for sandbox creation...")
            start = time.time()
            msg = await asyncio.wait_for(ws.recv(), timeout=120)
            data = json.loads(msg)

            if data.get("type") == "session_info":
                results["sandbox_created"] = True
                print(f"    Sandbox created in {time.time() - start:.1f}s")
                print(f"    Session ID: {data.get('session_id')}")
                print(f"    Sandbox ID: {data.get('sandbox_id')}")

            # Message 1: Ask something that triggers tool use
            print("\n[3] Testing tool calls (listing files)...")
            start = time.time()
            await ws.send("List the files in /tmp using ls")

            response_text = ""
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)
                event_type = data.get("type")

                if event_type == "tool_use":
                    results["tool_use_received"] = True
                    print(f"    [{time.time() - start:.1f}s] Tool use: {data.get('tool_name')}")
                elif event_type == "tool_result":
                    results["tool_result_received"] = True
                    status = "error" if data.get("is_error") else "success"
                    print(f"    [{time.time() - start:.1f}s] Tool result: {status}")
                elif event_type == "chunk":
                    response_text += data.get("content", "")
                elif event_type == "done":
                    if response_text:
                        results["message_response"] = True
                    print(f"    [{time.time() - start:.1f}s] Done")
                    break
                elif event_type == "error":
                    print(f"    ERROR: {data.get('message')}")
                    break

            # Message 2: Test context continuity
            print("\n[4] Testing context continuity...")
            await ws.send("My favorite number is 42. Remember this.")

            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)
                if data.get("type") == "done":
                    break
                elif data.get("type") == "error":
                    print(f"    ERROR: {data.get('message')}")
                    break

            # Ask about the number
            start = time.time()
            await ws.send("What is my favorite number?")

            response_text = ""
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)

                if data.get("type") == "chunk":
                    response_text += data.get("content", "")
                elif data.get("type") == "done":
                    if "42" in response_text:
                        results["context_preserved"] = True
                        print(f"    [{time.time() - start:.1f}s] Context preserved (remembered 42)")
                    else:
                        print(f"    [{time.time() - start:.1f}s] Context NOT preserved")
                    break
                elif data.get("type") == "error":
                    print(f"    ERROR: {data.get('message')}")
                    break

    except asyncio.TimeoutError:
        print("    ERROR: Timeout waiting for response")
    except ConnectionRefusedError:
        print("    ERROR: Could not connect. Is the server running?")
        print("           Run: uvicorn main:app --reload --port 8001")
    except Exception as e:
        print(f"    ERROR: {e}")

    # Print results
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    all_passed = True
    for test, passed in results.items():
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"  {test}: {status}")

    print("=" * 60)
    print(f"OVERALL: {'PASS' if all_passed else 'FAIL'}")
    print("=" * 60)

    return all_passed


if __name__ == "__main__":
    success = asyncio.run(test_backend())
    exit(0 if success else 1)
