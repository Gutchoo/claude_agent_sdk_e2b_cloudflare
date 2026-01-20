"""
E2B Claude Runner - Executes Claude CLI commands in E2B sandbox.
Handles streaming output parsing and WebSocket event conversion.
"""

import json
from typing import AsyncIterator, Optional
from e2b import Sandbox


class E2BClaudeRunner:
    """Runs Claude CLI commands in an E2B sandbox with streaming output."""

    def __init__(self, sandbox: Sandbox):
        self.sandbox = sandbox
        self.working_dir = "/home/user/workspace"
        self._claude_session_id = None  # Track Claude's internal session ID

    async def run_prompt(
        self,
        prompt: str,
        resume_session: Optional[str] = None
    ) -> AsyncIterator[dict]:
        """
        Run a prompt through Claude CLI and yield parsed events.

        Args:
            prompt: The user's message to send to Claude
            resume_session: Optional session ID to resume

        Yields:
            Event dictionaries compatible with WebSocket protocol
        """
        # Escape single quotes in the prompt for shell
        escaped_prompt = prompt.replace("'", "'\\''")

        # Build Claude CLI command
        # -p: Print output (no interactive mode)
        # --output-format json: Get structured JSON output with session_id
        # --dangerously-skip-permissions: Skip permission prompts (for sandbox use)
        cmd = f"cd {self.working_dir} && echo '{escaped_prompt}' | claude -p --output-format json --dangerously-skip-permissions"

        # Only add --resume if we have an existing Claude session ID
        if self._claude_session_id:
            cmd += f" --resume {self._claude_session_id}"

        yield {"type": "status", "status": "processing"}

        print(f"Running command: {cmd[:150]}...")

        # Run the command
        # timeout=300 for 5 minutes max
        try:
            result = self.sandbox.commands.run(cmd, timeout=300)
            print(f"Command exit code: {result.exit_code}")
            if result.stderr:
                print(f"stderr: {result.stderr[:500]}")
        except Exception as e:
            print(f"Command failed with exception: {e}")
            yield {"type": "error", "message": str(e)}
            return

        # Parse JSON output to get response and session_id
        response_text = ""
        if result.stdout:
            try:
                data = json.loads(result.stdout)
                # Extract text content from the result
                if isinstance(data, dict):
                    # Capture session_id for future --resume calls
                    if data.get("session_id"):
                        self._claude_session_id = data["session_id"]
                        print(f"Captured Claude session_id: {self._claude_session_id}")

                    # Extract response text from result
                    result_content = data.get("result", "")
                    if result_content:
                        response_text = result_content
                    else:
                        # Try to get content from message blocks
                        for block in data.get("content", []):
                            if block.get("type") == "text":
                                response_text += block.get("text", "")
            except json.JSONDecodeError:
                # Not JSON, use raw output
                response_text = result.stdout

        if response_text:
            yield {"type": "chunk", "content": response_text}

        # Always send a done event at the end
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
        Convert Claude CLI event to WebSocket protocol event.

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

        elif event_type == "content_block_delta":
            # Streaming delta for text
            delta = data.get("delta", {})
            if delta.get("type") == "text_delta":
                text = delta.get("text", "")
                if text:
                    return {"type": "chunk", "content": text}

        elif event_type == "content_block_start":
            # Start of a content block
            content_block = data.get("content_block", {})
            if content_block.get("type") == "tool_use":
                return {
                    "type": "tool_use",
                    "tool_id": content_block.get("id"),
                    "tool_name": content_block.get("name"),
                    "input": content_block.get("input", {})
                }

        elif event_type == "tool_result":
            # Tool execution result
            return {
                "type": "tool_result",
                "tool_id": data.get("tool_use_id"),
                "tool_name": data.get("tool_name", "unknown"),
                "content": str(data.get("content", ""))[:500],
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
            return {
                "type": "error",
                "message": data.get("error", {}).get("message", str(data))
            }

        elif event_type == "system":
            # System messages (usually can be ignored)
            return None

        return None

    async def check_claude_version(self) -> str:
        """Check the installed Claude CLI version."""
        result = self.sandbox.commands.run("claude --version", timeout=30)
        return result.stdout.strip() if result.exit_code == 0 else f"Error: {result.stderr}"
