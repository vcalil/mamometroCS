"""Environment configuration for roster_sync.

Accessors específicos do serviço. Os compartilhados (database_url,
firebase_sa_path, has_firebase, env_int) vêm de mm_common.config.
"""

from __future__ import annotations

import os
from pathlib import Path

from mm_common.config import (  # noqa: F401  (re-export p/ compat dos callers)
    database_url,
    env_int,
    firebase_sa_path,
    has_firebase,
)


def bot_username() -> str | None:
    """Steam bot username (login do cs-demo-downloader)."""
    return os.environ.get("BOT_USERNAME") or None


def bot_password() -> str | None:
    """Steam bot password."""
    return os.environ.get("BOT_PASSWORD") or None


def bot_shared_secret() -> str | None:
    """Steam bot shared_secret (base64), pra gerar os códigos 2FA."""
    return os.environ.get("BOT_SHARED_SECRET") or None


def steam_api_key() -> str | None:
    """Steam Web API key, escrita no config.json.steamApiKey."""
    return os.environ.get("STEAM_API_KEY") or None


def config_output_path() -> Path:
    """Onde o config.json regenerado do downloader é escrito (default /config/config.json)."""
    return Path(os.environ.get("CONFIG_OUTPUT_PATH", "/config/config.json"))


def config_template_path() -> Path | None:
    """Template opcional de config.json (preserva logLevel/runOnStartup/cronSchedule)."""
    raw = os.environ.get("CONFIG_TEMPLATE_PATH") or None
    return Path(raw) if raw else None


def poll_interval_sec() -> int:
    """Segundos entre polls do roster (default 60)."""
    return env_int("POLL_INTERVAL_SEC", 60, minimum=1)
