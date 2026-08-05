"""Build and write the cs-demo-downloader config.json from the live roster.

The downloader reads a JSON file with the structure:

    {
      "authCodeLogin":  {"username", "password", "secret"},
      "authCodes":      [{"authCode", "steamId64", "oldestShareCode"}, ...],
      "steamApiKey":    "...",
      "logLevel":       "info",
      "runOnStartup":   false,
      "cronSchedule":   "0 0 1 1 *"
    }

F1 reads the canonical roster from Firebase `roster/{steamId}` (written by
the F3 onboard function) and rebuilds the file.

Preservation strategy
---------------------
Everything *except* `authCodes` is preserved verbatim from the existing
config.json:

  - `authCodeLogin` — bot credentials; the F0 hand-off stores them only
    in the gitignored config.json (not in .env), so the service reads
    them from disk. Env vars (`BOT_USERNAME` / `BOT_PASSWORD` /
    `BOT_SHARED_SECRET`) are an opt-in override for setups that prefer
    env-based secrets.
  - `steamApiKey` — same reasoning: read from the existing file, env
    var `STEAM_API_KEY` is the override.
  - `logLevel`, `runOnStartup`, `cronSchedule` — operator preferences
    that should never be clobbered by a roster change.

`authCodes` is rebuilt from the roster snapshot (players with both
authCode and anchorCode set in Firebase).
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

# Sentinel: literal placeholder string from .env / .env.example. If an
# env var is empty, exactly "REPLACE", or starts with "REPLACE_" (the
# .env convention for "fill this in with the real value"), treat it as
# "not set" so we don't write placeholders into the regenerated config
# and break the downloader.
def _is_real_env(value: str | None) -> bool:
    """True iff the env var is a usable override (not empty / not placeholder)."""
    if not value:
        return False
    upper = value.strip().upper()
    if upper == "REPLACE":
        return False
    if upper.startswith("REPLACE_"):
        return False
    return True


# Fields preserved from the existing config.json unless the corresponding
# env-var override is set to a real value.
class RosterEntry:
    """A single roster entry, projected to what the downloader needs.

    Built from a Firebase `roster/{steamId}` dict. Missing fields are
    tolerated so a partially-onboarded player doesn't break the rebuild —
    the watcher just skips them with a warning.
    """

    __slots__ = ("steam_id", "name", "auth_code", "anchor_code", "status")

    def __init__(self, steam_id: str, entry: dict[str, Any]) -> None:
        self.steam_id = str(steam_id)
        self.name = str(entry.get("name", ""))
        self.auth_code = entry.get("authCode")
        self.anchor_code = entry.get("anchorCode")
        self.status = entry.get("status")

    def is_onboarded(self) -> bool:
        """A player can only be added to the downloader if both codes are set."""
        return bool(self.auth_code and self.anchor_code)

    def to_auth_code_entry(self) -> dict[str, str]:
        return {
            "authCode": str(self.auth_code),
            "steamId64": self.steam_id,
            "oldestShareCode": str(self.anchor_code),
        }


# Minimal safe defaults if no existing config.json / template is available.
# Conservative (runOnStartup=false, cron disabled) to match the F0 hand-off.
_DEFAULT_AUTH_LOGIN: dict[str, str] = {
    "username": "",
    "password": "",
    "secret": "",
}
_DEFAULT_PRESERVED: dict[str, Any] = {
    "logLevel": "info",
    "runOnStartup": False,
    "cronSchedule": "0 0 1 1 *",
}


def _read_json(path: Path) -> dict[str, Any] | None:
    """Read a JSON file; return None on any error. Used defensively."""
    try:
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"[roster_sync] WARN: could not read {path}: {exc}",
            file=sys.stderr,
        )
        return None


def build_config(
    roster: dict[str, dict[str, Any]],
    *,
    bot_username: str | None = None,
    bot_password: str | None = None,
    bot_shared_secret: str | None = None,
    steam_api_key: str | None = None,
    template_path: Path | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Build the downloader config.json from a roster snapshot.

    Returns:
        (config, warnings) where `warnings` is a list of human-readable
        strings describing roster entries that were skipped (no authCode
        or anchorCode yet, etc.).
    """
    # Load existing config (template > output) for the operator-tunable fields.
    candidates: list[Path] = []
    if template_path is not None:
        candidates.append(template_path)
    out_path = Path(os.environ.get("CONFIG_OUTPUT_PATH", "/config/config.json"))
    if out_path not in candidates:
        candidates.append(out_path)

    existing: dict[str, Any] = {}
    for path in candidates:
        loaded = _read_json(path)
        if loaded is not None:
            existing = loaded
            break

    # --- authCodeLogin: env override > existing > empty default --------------
    existing_login = existing.get("authCodeLogin")
    login: dict[str, str] = dict(_DEFAULT_AUTH_LOGIN)
    if isinstance(existing_login, dict):
        for k in login.keys():
            v = existing_login.get(k)
            if isinstance(v, str):
                login[k] = v
    if _is_real_env(bot_username):
        login["username"] = bot_username  # type: ignore[assignment]
    if _is_real_env(bot_password):
        login["password"] = bot_password  # type: ignore[assignment]
    if _is_real_env(bot_shared_secret):
        login["secret"] = bot_shared_secret  # type: ignore[assignment]

    # --- steamApiKey: env override > existing > empty default -----------------
    if _is_real_env(steam_api_key):
        effective_steam_key: str = steam_api_key  # type: ignore[assignment]
    else:
        v = existing.get("steamApiKey")
        effective_steam_key = v if isinstance(v, str) else ""

    # --- logLevel / runOnStartup / cronSchedule: existing > default ----------
    preserved: dict[str, Any] = dict(_DEFAULT_PRESERVED)
    for k in preserved.keys():
        v = existing.get(k)
        if v is not None:
            preserved[k] = v

    # --- authCodes: rebuilt from roster --------------------------------------
    auth_codes: list[dict[str, str]] = []
    warnings: list[str] = []
    for steam_id in sorted(roster.keys()):
        entry = RosterEntry(steam_id, roster[steam_id])
        if not entry.is_onboarded():
            warnings.append(
                f"skipping {steam_id} ({entry.name!r}): "
                f"missing authCode or anchorCode (not yet onboarded)"
            )
            continue
        auth_codes.append(entry.to_auth_code_entry())

    config: dict[str, Any] = {
        "authCodeLogin": login,
        "authCodes": auth_codes,
        "steamApiKey": effective_steam_key,
    }
    config.update(preserved)
    return config, warnings


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write `payload` to `path` atomically (tmp + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
