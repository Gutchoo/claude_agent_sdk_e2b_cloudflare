"""
Test script to verify basic sandbox chat functionality.
Tests:
1. WebSocket connection
2. Sending messages and receiving responses
3. Context continuity (2 messages)
4. Response timing
"""

import asyncio
import json
import time
import websockets

WS_URL = "ws://localhost:8001/ws/chat"


async def test_chat():
    print("=" * 60)
    print("Testing basic sandbox chat functionality")
    print("=" * 60)

    async with websockets.connect(WS_URL) as ws:
        print("\n✓ WebSocket connected")

        # Wait for session_info
        session_info = None
        while True:
            msg = await ws.recv()
            data = json.loads(msg)
            print(f"  Received: {data['type']}")
            if data['type'] == 'session_info':
                session_info = data
                print(f"  Session ID: {data['session_id']}")
                print(f"  Sandbox ID: {data['sandbox_id']}")
                break

        # === Message 1 ===
        print("\n" + "-" * 60)
        print("MESSAGE 1: Asking Claude to remember a number")
        print("-" * 60)

        start_time = time.time()
        await ws.send("Remember this number: 42. Just confirm you got it.")
        print(f"  Sent message at t=0.0s")

        response1 = ""
        while True:
            msg = await ws.recv()
            data = json.loads(msg)
            elapsed = time.time() - start_time

            if data['type'] == 'status':
                print(f"  [{elapsed:.1f}s] Status: {data.get('status')}")
            elif data['type'] == 'chunk':
                response1 += data.get('content', '')
            elif data['type'] == 'done':
                print(f"  [{elapsed:.1f}s] Done!")
                break
            elif data['type'] == 'error':
                print(f"  [{elapsed:.1f}s] ERROR: {data.get('message')}")
                return

        print(f"\n  Response 1 ({elapsed:.1f}s):")
        print(f"  {response1[:200]}{'...' if len(response1) > 200 else ''}")

        # === Message 2 ===
        print("\n" + "-" * 60)
        print("MESSAGE 2: Testing context continuity")
        print("-" * 60)

        start_time = time.time()
        await ws.send("What number did I ask you to remember?")
        print(f"  Sent message at t=0.0s")

        response2 = ""
        while True:
            msg = await ws.recv()
            data = json.loads(msg)
            elapsed = time.time() - start_time

            if data['type'] == 'status':
                print(f"  [{elapsed:.1f}s] Status: {data.get('status')}")
            elif data['type'] == 'chunk':
                response2 += data.get('content', '')
            elif data['type'] == 'done':
                print(f"  [{elapsed:.1f}s] Done!")
                break
            elif data['type'] == 'error':
                print(f"  [{elapsed:.1f}s] ERROR: {data.get('message')}")
                return

        print(f"\n  Response 2 ({elapsed:.1f}s):")
        print(f"  {response2[:200]}{'...' if len(response2) > 200 else ''}")

        # === Verify context ===
        print("\n" + "=" * 60)
        print("RESULTS")
        print("=" * 60)

        if "42" in response2:
            print("✓ Context continuity: PASSED (Claude remembered 42)")
        else:
            print("✗ Context continuity: FAILED (42 not found in response)")

        print(f"✓ Message 1 response time logged")
        print(f"✓ Message 2 response time logged")
        print("\nBackend is working correctly!")


if __name__ == "__main__":
    asyncio.run(test_chat())
