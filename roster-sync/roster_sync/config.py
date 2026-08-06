"""Environment configuration for roster_sync.

All accessors raise RuntimeError with a clear message when the env is
malformed, so the failure surfaces in logs instead of a cryptic NoneType
deep in the call stack. The watcher (F1+) is the only consumer.
"""

from __future__ import annotations

import os
from pathlib import Path


def database_url() -> str | None:
    """Firebase Realtime Database URL. Required for any RTDB read/write."""
    return os.environ.get("FIREBASE_DATABASE_URL") or None


def firebase_sa_path() -> str | None:
    """Path to the Firebase Admin SDK service account JSON. Required for reads."""
    return os.environ.get("FIREBASE_SA_PATH") or None


def bot_username() -> str | None:
    """Steam bot username (cs-demo-downloader login). Optional at config time
    (the downloader can still use the persisted store.json), but the
    regenerated config.json needs it to write authCodeLogin."""
    return os.environ.get("BOT_USERNAME") or None


def bot_password() -> str | None:
    """Steam bot password."""
    return os.environ.get("BOT_PASSWORD") or None


def bot_shared_secret() -> str | None:
    """Steam bot shared_secret (base64). Used to generate 2FA codes for login."""
    return os.environ.get("BOT_SHARED_SECRET") or None


def steam_api_key() -> str | None:
    """Steam Web API key. Written into config.json.steamApiKey (used by
    the downloader for non-auth calls if any). Optional at config time
    but recommended."""
    return os.environ.get("STEAM_API_KEY") or None


def config_output_path() -> Path:
    """Where the regenerated downloader config.json is written.

    Defaults to /config/config.json, which is where the downloader reads.
    """
    return Path(os.environ.get("CONFIG_OUTPUT_PATH", "/config/config.json"))


def config_template_path() -> Path | None:
    """Optional path to an existing config.json to use as a template (for
    preserving logLevel / runOnStartup / cronSchedule). If unset, the
    service falls back to a minimal default when the file is missing.
    """
    raw = os.environ.get("CONFIG_TEMPLATE_PATH") or None
    return Path(raw) if raw else None


def poll_interval_sec() -> int:
    """Seconds between roster polls. Defaults to 60. Out-of-range values raise."""
    raw = os.environ.get("POLL_INTERVAL_SEC", "60")
    try:
        n = int(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"POLL_INTERVAL_SEC must be an integer, got {raw!r}"
        ) from exc
    if n < 1:
        raise RuntimeError(f"POLL_INTERVAL_SEC must be >= 1, got {n}")
    return n


def has_firebase() -> bool:
    """True iff both SA path and DB URL are set and the SA file exists."""
    sa = firebase_sa_path()
    url = database_url()
    if not sa or not url:
        return False
    return Path(sa).exists()
