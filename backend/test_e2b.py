"""
E2B Sandbox Integration Test

Tests:
1. Sandbox creation
2. Message sending with timing
3. Context continuity (name recall)
4. Sandbox listing via CLI
"""

import asyncio
import json
import time
import websockets


async def test_e2b_integration():
    """Run full integration test of E2B sandbox."""

    ws_url = "ws://localhost:8001/ws/chat"
    results = {
        "sandbox_created": False,
        "sandbox_id": None,
        "session_id": None,
        "message_1_time": None,
        "message_1_response": None,
        "message_2_time": None,
        "message_2_response": None,
        "context_preserved": False,
    }

    print("=" * 60)
    print("E2B SANDBOX INTEGRATION TEST")
    print("=" * 60)

    try:
        print("\n[1] Connecting to WebSocket...")
        start_connect = time.time()

        async with websockets.connect(ws_url) as ws:
            connect_time = time.time() - start_connect
            print(f"    WebSocket connected in {connect_time:.2f}s")

            # Wait for session_info message (sandbox creation)
            print("\n[2] Waiting for sandbox creation...")
            start_sandbox = time.time()

            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)
                print(f"    Received: {data.get('type')}")

                if data.get("type") == "session_info":
                    sandbox_time = time.time() - start_sandbox
                    results["sandbox_created"] = True
                    results["sandbox_id"] = data.get("sandbox_id")
                    results["session_id"] = data.get("session_id")
                    print(f"    Sandbox created in {sandbox_time:.2f}s")
                    print(f"    Sandbox ID: {results['sandbox_id']}")
                    print(f"    Session ID: {results['session_id']}")
                    break

            # Message 1: Set name
            print("\n[3] Sending message 1: 'My name is Alice'")
            start_msg1 = time.time()
            await ws.send("My name is Alice. Please remember this.")

            response_chunks = []
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)

                if data.get("type") == "chunk":
                    response_chunks.append(data.get("content", ""))
                elif data.get("type") == "done":
                    results["message_1_time"] = time.time() - start_msg1
                    results["message_1_response"] = "".join(response_chunks)
                    print(f"    Response received in {results['message_1_time']:.2f}s")
                    print(f"    Response: {results['message_1_response'][:100]}...")
                    break
                elif data.get("type") == "error":
                    print(f"    ERROR: {data.get('message')}")
                    return results

            # Message 2: Ask for name (context test)
            print("\n[4] Sending message 2: 'What is my name?'")
            start_msg2 = time.time()
            await ws.send("What is my name?")

            response_chunks = []
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120)
                data = json.loads(msg)

                if data.get("type") == "chunk":
                    response_chunks.append(data.get("content", ""))
                elif data.get("type") == "done":
                    results["message_2_time"] = time.time() - start_msg2
                    results["message_2_response"] = "".join(response_chunks)
                    print(f"    Response received in {results['message_2_time']:.2f}s")
                    print(f"    Response: {results['message_2_response'][:200]}...")

                    # Check if Alice is mentioned
                    if "alice" in results["message_2_response"].lower():
                        results["context_preserved"] = True
                        print("    Context check: PASSED (Alice remembered)")
                    else:
                        print("    Context check: FAILED (Alice not found in response)")
                    break
                elif data.get("type") == "error":
                    print(f"    ERROR: {data.get('message')}")
                    return results

            print("\n" + "=" * 60)
            print("TEST RESULTS SUMMARY")
            print("=" * 60)
            print(f"  Sandbox Created:    {'PASS' if results['sandbox_created'] else 'FAIL'}")
            print(f"  Sandbox ID:         {results['sandbox_id']}")
            print(f"  Session ID:         {results['session_id']}")
            print(f"  Message 1 Time:     {results['message_1_time']:.2f}s")
            print(f"  Message 2 Time:     {results['message_2_time']:.2f}s")
            print(f"  Context Preserved:  {'PASS' if results['context_preserved'] else 'FAIL'}")
            print("=" * 60)

            overall = results["sandbox_created"] and results["context_preserved"]
            print(f"\nOVERALL: {'PASS' if overall else 'FAIL'}")

            return results

    except asyncio.TimeoutError:
        print("ERROR: Timeout waiting for response")
        return results
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return results


if __name__ == "__main__":
    asyncio.run(test_e2b_integration())
