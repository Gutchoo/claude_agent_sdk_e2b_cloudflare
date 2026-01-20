"""
Configuration settings for E2B and Cloudflare R2.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# E2B Configuration
E2B_API_KEY = os.environ.get("E2B_API_KEY")
E2B_TEMPLATE = os.environ.get("E2B_TEMPLATE", "base")
E2B_SANDBOX_TIMEOUT = int(os.environ.get("E2B_SANDBOX_TIMEOUT", "300"))  # 5 minutes default

# Sandbox grace period - how long to keep sandbox alive after disconnect before killing
SANDBOX_GRACE_PERIOD = int(os.environ.get("SANDBOX_GRACE_PERIOD", "180"))  # 3 minutes default

# Anthropic API Key (passed to sandbox)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

# Cloudflare R2 Configuration
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "claude-agent-snapshots")

# Validate required keys
def validate_config():
    """Validate that required configuration is present."""
    missing = []
    if not E2B_API_KEY:
        missing.append("E2B_API_KEY")
    if not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if not R2_ACCOUNT_ID:
        missing.append("R2_ACCOUNT_ID")
    if not R2_ACCESS_KEY_ID:
        missing.append("R2_ACCESS_KEY_ID")
    if not R2_SECRET_ACCESS_KEY:
        missing.append("R2_SECRET_ACCESS_KEY")
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
