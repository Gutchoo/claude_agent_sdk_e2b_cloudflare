"""
E2B Claude Runner - Executes Claude CLI commands in E2B sandbox.
Handles streaming output parsing and WebSocket event conversion.
"""

import asyncio
import json
from typing import AsyncIterator, Optional
from e2b import Sandbox


# Map frontend model picker values to Claude CLI model aliases
MODEL_MAP = {
    "opus-4.5": "opus",
    "sonnet-4": "sonnet",
}


class E2BClaudeRunner:
    """Runs Claude CLI commands in an E2B sandbox with streaming output."""

    def __init__(self, sandbox: Sandbox):
        self.sandbox = sandbox
        self.working_dir = "/home/user/workspace"
        self._claude_session_id = None  # Track Claude's internal session ID

    async def run_prompt(
        self,
        prompt: str,
        resume_session: Optional[str] = None,
        model: str = "opus-4.5"
    ) -> AsyncIterator[dict]:
        """
        Run a prompt through Claude CLI and yield parsed events as they stream.

        Uses --output-format stream-json for real-time streaming of tool calls,
        text chunks, and results.

        Args:
            prompt: The user's message to send to Claude
            resume_session: Optional session ID to resume
            model: Model to use (opus-4.5 or sonnet-4)

        Yields:
            Event dictionaries compatible with WebSocket protocol
        """
        # Escape single quotes in the prompt for shell
        escaped_prompt = prompt.replace("'", "'\\''")

        # Map model picker value to CLI model name
        cli_model = MODEL_MAP.get(model, model)

        # Build Claude CLI command
        # -p: Print output (no interactive mode)
        # --output-format stream-json: Get streaming JSONL output for real-time events
        # --verbose: Required for stream-json format
        # --model: Specify which model to use
        # --dangerously-skip-permissions: Skip permission prompts (for sandbox use)
        cmd = f"cd {self.working_dir} && echo '{escaped_prompt}' | claude -p --output-format stream-json --verbose --model {cli_model} --dangerously-skip-permissions"

        # Only add --resume if we have an existing Claude session ID
        if self._claude_session_id:
            cmd += f" --resume {self._claude_session_id}"

        yield {"type": "status", "status": "processing"}

        print(f"Running command: {cmd[:150]}...")

        # Create an asyncio queue to bridge the callback-based streaming to async generator
        event_queue: asyncio.Queue = asyncio.Queue()
        line_buffer = {"buffer": ""}  # Use dict to allow mutation in nested function
        loop = asyncio.get_event_loop()
        process_done = {"done": False}

        def on_stdout(data: str):
            """Callback for stdout data from E2B sandbox."""
            line_buffer["buffer"] += data

            # Process complete lines (JSONL format - each event is one line)
            while "\n" in line_buffer["buffer"]:
                line, line_buffer["buffer"] = line_buffer["buffer"].split("\n", 1)
                line = line.strip()
                if line:
                    event = self._parse_line(line)
                    if event:
                        # Use call_soon_threadsafe to put event in queue from callback thread
                        loop.call_soon_threadsafe(event_queue.put_nowait, event)

        def on_stderr(data: str):
            """Callback for stderr data from E2B sandbox."""
            print(f"[stderr] {data.strip()}")

        # Track if we should retry without --resume
        retry_without_resume = {"should_retry": False, "cmd_to_retry": None}

        # Build command without --resume for potential retry
        base_cmd = f"cd {self.working_dir} && echo '{escaped_prompt}' | claude -p --output-format stream-json --verbose --model {cli_model} --dangerously-skip-permissions"

        # Run the command in a separate thread to allow streaming
        async def run_command(command: str, is_retry: bool = False):
            """Run command in thread pool to avoid blocking asyncio."""
            try:
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.sandbox.commands.run(
                        command,
                        timeout=300,
                        on_stdout=on_stdout,
                        on_stderr=on_stderr,
                    )
                )
                process_done["done"] = True
                print(f"Command exit code: {result.exit_code}")

                # Process any remaining buffered content
                if line_buffer["buffer"].strip():
                    event = self._parse_line(line_buffer["buffer"].strip())
                    if event:
                        await event_queue.put(event)

                # Signal end of stream
                await event_queue.put(None)

            except Exception as e:
                error_msg = str(e)
                print(f"Command failed with exception: {error_msg}")

                # If command with --resume failed and we haven't retried yet, retry without --resume
                if not is_retry and self._claude_session_id and "exited with code 1" in error_msg:
                    print(f"Command with --resume failed, retrying without --resume...")
                    self._claude_session_id = None  # Clear invalid session ID
                    line_buffer["buffer"] = ""  # Clear buffer for retry
                    retry_without_resume["should_retry"] = True
                    retry_without_resume["cmd_to_retry"] = base_cmd
                    await event_queue.put(None)  # Signal to check retry
                else:
                    await event_queue.put({"type": "error", "message": error_msg})
                    await event_queue.put(None)

        # Start the command in background
        command_task = asyncio.create_task(run_command(cmd, is_retry=False))

        # Yield events from the queue as they arrive
        try:
            while True:
                try:
                    # Wait for events with a timeout to check if process is done
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    # No event ready, check if command task is done
                    if command_task.done():
                        # Check if we need to retry without --resume
                        if retry_without_resume["should_retry"]:
                            print("Retrying command without --resume flag...")
                            retry_without_resume["should_retry"] = False
                            command_task = asyncio.create_task(
                                run_command(retry_without_resume["cmd_to_retry"], is_retry=True)
                            )
                            continue

                        # Drain any remaining events
                        while not event_queue.empty():
                            event = await event_queue.get()
                            if event is None:
                                break
                            if event.get("type") == "done" and event.get("session_id"):
                                self._claude_session_id = event["session_id"]
                                print(f"Captured Claude session_id: {self._claude_session_id}")
                            yield event
                        break
                    continue

                if event is None:
                    # Check if we need to retry
                    if retry_without_resume["should_retry"]:
                        continue  # Let the timeout handler pick up the retry
                    break

                # Capture session_id from result events
                if event.get("type") == "done" and event.get("session_id"):
                    self._claude_session_id = event["session_id"]
                    print(f"Captured Claude session_id: {self._claude_session_id}")

                yield event

        except Exception as e:
            print(f"Error processing events: {e}")
            yield {"type": "error", "message": str(e)}
        finally:
            # Ensure command task completes
            if not command_task.done():
                await command_task

        # Always send a done event at the end (if we didn't get one from the stream)
        # This ensures the frontend knows the response is complete
        yield {"type": "done", "session_id": self._claude_session_id}

    def _parse_line(self, line: str) -> Optional[dict]:
        """
        Parse a single line of Claude CLI JSONL output.

        Args:
            line: A line of JSONL output from Claude CLI

        Returns:
            Parsed event dict or None if line couldn't be parsed
        """
        try:
            data = json.loads(line)
            return self._convert_event(data)
        except json.JSONDecodeError:
            # Not JSON, might be plain text output
            if line and not line.startswith('{'):
                return {"type": "chunk", "content": line + "\n"}
            return None

    def _convert_event(self, data: dict) -> Optional[dict]:
        """
        Convert Claude CLI stream-json event to WebSocket protocol event.

        Claude CLI stream-json format:
        - type: "assistant" with content blocks (text or tool_use)
        - type: "user" with content blocks (tool_result)
        - type: "result" with session info

        Args:
            data: Parsed JSON event from Claude CLI

        Returns:
            Converted event dict for WebSocket
        """
        event_type = data.get("type")

        if event_type == "assistant":
            # Assistant message with content blocks
            message = data.get("message", {})
            content_blocks = message.get("content", [])

            # Process content blocks and return first meaningful one
            for block in content_blocks:
                block_type = block.get("type")

                if block_type == "text":
                    text = block.get("text", "")
                    if text:
                        return {"type": "chunk", "content": text}

                elif block_type == "tool_use":
                    return {
                        "type": "tool_use",
                        "tool_id": block.get("id"),
                        "tool_name": block.get("name"),
                        "input": block.get("input", {})
                    }

        elif event_type == "user":
            # User message containing tool results
            message = data.get("message", {})
            content_blocks = message.get("content", [])

            for block in content_blocks:
                block_type = block.get("type")

                if block_type == "tool_result":
                    content = block.get("content", "")
                    # Handle content that might be a list of content blocks
                    if isinstance(content, list):
                        text_parts = []
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                text_parts.append(item.get("text", ""))
                            elif isinstance(item, str):
                                text_parts.append(item)
                        content = "\n".join(text_parts)

                    return {
                        "type": "tool_result",
                        "tool_id": block.get("tool_use_id"),
                        "tool_name": "unknown",  # Not provided in this format
                        "content": str(content)[:2000],
                        "is_error": block.get("is_error", False),
                        "duration": 0  # Not provided in this format
                    }

        elif event_type == "content_block_delta":
            # Streaming delta for text or tool input
            delta = data.get("delta", {})
            delta_type = delta.get("type")

            if delta_type == "text_delta":
                text = delta.get("text", "")
                if text:
                    return {"type": "chunk", "content": text}

            elif delta_type == "input_json_delta":
                # Tool input streaming - we'll skip these as tool_use sends complete input
                # In stream-json mode, input comes incrementally but we wait for complete input
                return None

        elif event_type == "content_block_start":
            # Start of a content block - tool_use may have empty input initially
            content_block = data.get("content_block", {})
            block_type = content_block.get("type")

            if block_type == "tool_use":
                # In stream-json, input may be empty here and come via input_json_delta
                # We send the tool_use event now (frontend shows loading state)
                return {
                    "type": "tool_use",
                    "tool_id": content_block.get("id"),
                    "tool_name": content_block.get("name"),
                    "input": content_block.get("input") or {}
                }

            elif block_type == "text":
                # Text block starting - actual text comes via content_block_delta
                return None

        elif event_type == "content_block_stop":
            # End of a content block - can be used to finalize tool input
            # For now, we rely on tool_result to show completion
            return None

        elif event_type == "tool_use":
            # Complete tool_use event (may appear in some output formats)
            return {
                "type": "tool_use",
                "tool_id": data.get("id"),
                "tool_name": data.get("name"),
                "input": data.get("input", {})
            }

        elif event_type == "tool_result":
            # Tool execution result
            content = data.get("content", "")
            # Handle content that might be a list of content blocks
            if isinstance(content, list):
                # Extract text from content blocks
                text_parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        text_parts.append(block)
                content = "\n".join(text_parts)

            return {
                "type": "tool_result",
                "tool_id": data.get("tool_use_id"),
                "tool_name": data.get("tool_name", "unknown"),
                "content": str(content)[:2000],  # Increased limit for better visibility
                "is_error": data.get("is_error", False),
                "duration": data.get("duration", 0)
            }

        elif event_type == "result":
            # Final result with session info
            return {
                "type": "done",
                "session_id": data.get("session_id"),
                "cost": data.get("cost"),
                "duration": data.get("duration")
            }

        elif event_type == "error":
            # Error event
            error = data.get("error", {})
            if isinstance(error, dict):
                message = error.get("message", str(data))
            else:
                message = str(error)
            return {
                "type": "error",
                "message": message
            }

        elif event_type == "system":
            # System messages (usually can be ignored)
            return None

        elif event_type == "message_start":
            # Message starting - indicates Claude is responding
            return None

        elif event_type == "message_delta":
            # Message-level updates (stop_reason, etc)
            return None

        elif event_type == "message_stop":
            # Message complete
            return None

        return None

    async def check_claude_version(self) -> str:
        """Check the installed Claude CLI version."""
        result = self.sandbox.commands.run("claude --version", timeout=30)
        return result.stdout.strip() if result.exit_code == 0 else f"Error: {result.stderr}"
