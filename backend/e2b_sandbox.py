"""
E2B Sandbox lifecycle management with R2 hydration/dehydration.
Handles creation, snapshot restore, and cleanup of E2B sandboxes.
"""

import asyncio
from typing import Optional
from e2b import Sandbox

from config import E2B_TEMPLATE, E2B_SANDBOX_TIMEOUT, ANTHROPIC_API_KEY, SANDBOX_GRACE_PERIOD
from r2_storage import R2Storage
from database import get_session_files


class E2BSandboxManager:
    """Manages E2B sandbox lifecycle with R2 persistence."""

    def __init__(self):
        self.template = E2B_TEMPLATE
        self._active: dict[str, Sandbox] = {}
        self._pending_kill: dict[str, asyncio.Task] = {}  # session_id -> kill task
        self.r2 = R2Storage()

    async def create_sandbox(self, session_id: str) -> Sandbox:
        """
        Create a new E2B sandbox for a session.
        If an active sandbox exists and is healthy, reuse it. Otherwise, if a snapshot exists in R2, hydrate from it.
        """
        # Check if we already have an active sandbox for this session
        if session_id in self._active:
            # Cancel any pending kill
            self.cancel_pending_kill(session_id)

            # Verify the sandbox is still alive with a health check
            existing_sandbox = self._active[session_id]
            try:
                existing_sandbox.commands.run("echo health", timeout=5)
                print(f"Reusing existing sandbox for session {session_id}")
                return existing_sandbox
            except Exception as e:
                # Sandbox is dead, remove from active and create new one
                print(f"Existing sandbox for {session_id} is dead ({e}), creating new one...")
                self._active.pop(session_id, None)

        # Create sandbox with Anthropic API key in environment
        sbx = Sandbox.create(
            template=self.template,
            envs={"ANTHROPIC_API_KEY": ANTHROPIC_API_KEY},
            timeout=E2B_SANDBOX_TIMEOUT,
        )

        print(f"Created sandbox {sbx.sandbox_id} for session {session_id}")

        # Check if we have a snapshot to restore
        if self.r2.snapshot_exists(session_id):
            print(f"Found snapshot for session {session_id}, hydrating...")
            await self._hydrate_sandbox(sbx, session_id)
        else:
            print(f"No snapshot found, setting up fresh sandbox...")
            await self._setup_fresh_sandbox(sbx, session_id)

        # Track active sandbox
        self._active[session_id] = sbx
        return sbx

    async def _setup_fresh_sandbox(self, sbx: Sandbox, session_id: str):
        """Set up a fresh sandbox with Claude Code CLI."""
        # Install Claude Code CLI
        print(f"Installing Claude Code CLI...")
        result = sbx.commands.run(
            "npm install -g @anthropic-ai/claude-code",
            timeout=120
        )
        if result.exit_code != 0:
            print(f"Warning: Claude Code installation may have failed: {result.stderr}")
        else:
            print("Claude Code CLI installed successfully")

        # Create workspace directory
        sbx.commands.run("mkdir -p /home/user/workspace")

    async def _hydrate_sandbox(self, sbx: Sandbox, session_id: str):
        """
        Hydrate a sandbox from an R2 snapshot.
        Downloads and extracts the project archive, then restores session files.
        """
        # Get presigned download URL
        download_url = self.r2.get_download_url(session_id)

        # Download and extract snapshot in sandbox
        # The snapshot contains both /home/user/workspace and /home/user/.claude
        hydrate_script = f'''
            set -e
            cd /home/user

            # Download snapshot
            echo "Downloading snapshot..."
            curl -sSL -o /tmp/snapshot.tar.gz "{download_url}"

            # Extract snapshot (overwrites existing files)
            echo "Extracting snapshot..."
            tar -xzf /tmp/snapshot.tar.gz -C /home/user

            # Cleanup
            rm /tmp/snapshot.tar.gz

            # Ensure Claude CLI is installed
            if ! command -v claude &> /dev/null; then
                echo "Installing Claude Code CLI..."
                npm install -g @anthropic-ai/claude-code
            fi

            echo "Hydration complete!"
        '''

        result = sbx.commands.run(f"bash -c '{hydrate_script}'", timeout=120)
        if result.exit_code != 0:
            print(f"Hydration failed: {result.stderr}")
            # Fall back to fresh setup
            await self._setup_fresh_sandbox(sbx, session_id)
        else:
            print(f"Hydration successful for session {session_id}")

        # Hydrate session files from R2
        await self._hydrate_session_files(sbx, session_id)

    async def _hydrate_session_files(self, sbx: Sandbox, session_id: str):
        """
        Download all session files from R2 to the sandbox uploads directory.
        """
        files = get_session_files(session_id, include_deleted=False)
        if not files:
            print(f"No session files to hydrate for {session_id}")
            return

        print(f"Hydrating {len(files)} session files for {session_id}")

        # Create uploads directory
        sbx.commands.run("mkdir -p /home/user/workspace/uploads")

        for file_record in files:
            try:
                download_url = self.r2.get_file_download_url(
                    session_id=session_id,
                    file_id=file_record["id"],
                    filename=file_record["filename"],
                )
                dest_path = f"/home/user/workspace/uploads/{file_record['filename']}"

                # Download file to sandbox
                result = sbx.commands.run(
                    f'curl -sSL -o "{dest_path}" "{download_url}"',
                    timeout=60
                )
                if result.exit_code == 0:
                    print(f"Hydrated file: {file_record['filename']}")
                else:
                    print(f"Failed to hydrate file {file_record['filename']}: {result.stderr}")
            except Exception as e:
                print(f"Error hydrating file {file_record['filename']}: {e}")

    async def dehydrate_sandbox(self, session_id: str) -> bool:
        """
        Dehydrate a sandbox to R2 before killing it.
        Creates a snapshot of workspace and .claude directories.
        EXCLUDES uploads/ directory since files are stored separately in R2.
        """
        sbx = self._active.get(session_id)
        if not sbx:
            print(f"No active sandbox for session {session_id}")
            return False

        # Get presigned upload URL
        upload_url = self.r2.get_upload_url(session_id)

        # Create and upload snapshot (excluding uploads directory)
        dehydrate_script = f'''
            set -e
            cd /home/user

            # Create snapshot of workspace and .claude directories
            # EXCLUDE uploads/ since those files are stored separately in R2
            echo "Creating snapshot..."
            tar -czf /tmp/snapshot.tar.gz --exclude='workspace/uploads' workspace .claude 2>/dev/null || tar -czf /tmp/snapshot.tar.gz --exclude='workspace/uploads' workspace

            # Upload to R2
            echo "Uploading snapshot..."
            curl -sSL -X PUT -H "Content-Type: application/gzip" --data-binary @/tmp/snapshot.tar.gz "{upload_url}"

            # Cleanup
            rm /tmp/snapshot.tar.gz

            echo "Dehydration complete!"
        '''

        print(f"Dehydrating sandbox for session {session_id}...")
        result = sbx.commands.run(f"bash -c '{dehydrate_script}'", timeout=120)

        if result.exit_code != 0:
            print(f"Dehydration failed: {result.stderr}")
            return False

        print(f"Dehydration successful for session {session_id}")
        return True

    async def kill_sandbox(self, session_id: str, save_snapshot: bool = True) -> bool:
        """
        Kill a sandbox, optionally saving a snapshot first.
        """
        sbx = self._active.get(session_id)
        if not sbx:
            return False

        # Save snapshot before killing
        if save_snapshot:
            await self.dehydrate_sandbox(session_id)

        # Kill the sandbox
        sandbox_id = sbx.sandbox_id
        print(f"Killing sandbox {sandbox_id} for session {session_id}...")
        sbx.kill()
        self._active.pop(session_id, None)
        print(f"Sandbox {sandbox_id} killed")
        return True

    async def pause_sandbox(self, session_id: str) -> Optional[str]:
        """
        Pause a sandbox for short-term persistence (< 24 hours).
        For longer persistence, use kill_sandbox with save_snapshot=True.
        """
        sbx = self._active.pop(session_id, None)
        if sbx:
            sandbox_id = sbx.sandbox_id
            print(f"Pausing sandbox {sandbox_id} for session {session_id}...")
            sbx.pause()
            print(f"Sandbox {sandbox_id} paused successfully")
            return sandbox_id
        return None

    async def resume_sandbox(self, sandbox_id: str, session_id: str) -> Sandbox:
        """Resume a paused sandbox."""
        print(f"Resuming sandbox {sandbox_id} for session {session_id}...")
        sbx = Sandbox.connect(sandbox_id)
        self._active[session_id] = sbx
        print(f"Resumed sandbox {sandbox_id}")
        return sbx

    def get_sandbox(self, session_id: str) -> Optional[Sandbox]:
        """Get an active sandbox by session ID."""
        return self._active.get(session_id)

    def is_sandbox_active(self, session_id: str) -> bool:
        """Check if a sandbox is currently active for a session."""
        return session_id in self._active

    def has_snapshot(self, session_id: str) -> bool:
        """Check if a session has a saved snapshot in R2."""
        return self.r2.snapshot_exists(session_id)

    async def inject_file(self, session_id: str, file_record: dict) -> bool:
        """
        Hot inject a file into a running sandbox.
        Downloads the file from R2 to /home/user/workspace/uploads/.
        """
        sbx = self._active.get(session_id)
        if not sbx:
            print(f"No active sandbox for session {session_id}")
            return False

        try:
            download_url = self.r2.get_file_download_url(
                session_id=session_id,
                file_id=file_record["id"],
                filename=file_record["filename"],
            )
            dest_path = f"/home/user/workspace/uploads/{file_record['filename']}"

            # Ensure uploads directory exists and download file
            result = sbx.commands.run(f'''
                mkdir -p /home/user/workspace/uploads
                curl -sSL -o "{dest_path}" "{download_url}"
            ''', timeout=60)

            if result.exit_code == 0:
                print(f"Injected file into sandbox: {file_record['filename']}")
                return True
            else:
                print(f"Failed to inject file {file_record['filename']}: {result.stderr}")
                return False
        except Exception as e:
            print(f"Error injecting file {file_record['filename']}: {e}")
            return False

    async def schedule_delayed_kill(self, session_id: str, delay_seconds: int = SANDBOX_GRACE_PERIOD):
        """
        Schedule a sandbox to be killed after a delay.
        If the session reconnects before the delay, cancel the kill.
        """
        # Cancel any existing pending kill for this session
        self.cancel_pending_kill(session_id)

        async def delayed_kill():
            try:
                await asyncio.sleep(delay_seconds)
                print(f"Grace period expired for session {session_id}, killing sandbox...")
                await self.kill_sandbox(session_id, save_snapshot=True)
            except asyncio.CancelledError:
                # Task was cancelled, sandbox will be reused
                pass
            finally:
                self._pending_kill.pop(session_id, None)

        # Schedule the delayed kill
        task = asyncio.create_task(delayed_kill())
        self._pending_kill[session_id] = task
        print(f"Scheduled sandbox kill for session {session_id} in {delay_seconds}s")

    def cancel_pending_kill(self, session_id: str) -> bool:
        """
        Cancel a pending kill if the session reconnects.
        Returns True if a pending kill was cancelled.
        """
        if session_id in self._pending_kill:
            self._pending_kill[session_id].cancel()
            self._pending_kill.pop(session_id)
            print(f"Cancelled pending kill for session {session_id}")
            return True
        return False

    async def remove_file_from_sandbox(self, session_id: str, filename: str) -> bool:
        """Remove a file from an active sandbox."""
        sbx = self._active.get(session_id)
        if not sbx:
            return False  # No active sandbox, nothing to do

        try:
            file_path = f"/home/user/workspace/uploads/{filename}"
            result = sbx.commands.run(f'rm -f "{file_path}"', timeout=10)
            if result.exit_code == 0:
                print(f"Removed file from sandbox: {filename}")
                return True
            else:
                print(f"Failed to remove file from sandbox: {result.stderr}")
                return False
        except Exception as e:
            print(f"Error removing file from sandbox: {e}")
            return False

    async def cleanup_all(self, save_snapshots: bool = True):
        """Kill all active sandboxes, optionally saving snapshots."""
        # Cancel all pending kills first
        for task in self._pending_kill.values():
            task.cancel()
        self._pending_kill.clear()

        # Kill all active sandboxes
        for session_id in list(self._active.keys()):
            await self.kill_sandbox(session_id, save_snapshot=save_snapshots)
