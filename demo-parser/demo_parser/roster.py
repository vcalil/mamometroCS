"""Roster loader.

The roster is the list of SteamID64s the group considers "us". A demo is only
worth saving if enough of its players are in the roster (see filter.py).

Source of truth priority:
    1. Local JSON file at ROSTER_PATH (faster, no Admin SDK needed for dry-runs)
    2. Firebase RTDB `roster/` node (live source of truth in production)

Both shapes are accepted:
    ["7656...", "7656...", ...]            # list of strings
    {"7656...": true, "7656...": true, ...}  # keyed map (RTDB export style)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import config


def _normalize(data: Any) -> list[str]:
    """Coerce various roster shapes into a list of string steamids.

    Accepted shapes:
        ["7656...", "7656...", ...]                  # bare list of strings
        {"7656...": true, ...}                       # RTDB keyed map (live RTDB)
        {"players": [{"steamId": "7656..."}, ...]}  # F1 local seed format
    """
    if isinstance(data, list):
        return [str(x) for x in data if x is not None]
    if isinstance(data, dict):
        # F1 seed shape: {"_comment": ..., "players": [{"steamId": "..."}]}
        if "players" in data and isinstance(data["players"], list):
            sids: list[str] = []
            for entry in data["players"]:
                if isinstance(entry, dict):
                    sid = entry.get("steamId")
                    if sid is not None:
                        sids.append(str(sid))
                elif isinstance(entry, str):
                    sids.append(entry)
            return sids
        # RTDB keyed map: {"7656...": {name, ...}, ...}
        return [str(k) for k in data.keys()]
    raise RuntimeError(
        f"Roster must be a JSON list or object, got {type(data).__name__}"
    )


def _load_from_file(path: Path) -> list[str]:
    if not path.exists():
        raise RuntimeError(f"ROSTER_PATH does not exist: {path}")
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return _normalize(data)


def _load_from_firebase() -> list[str]:
    # Local import so a missing firebase_admin in a dry-run env doesn't blow up.
    # The static checker can't see `.firebase` as an attribute of the package,
    # but it's importable at runtime — the sibling module firebase.py lives
    # next to this one.
    from . import firebase  # type: ignore[attr-defined]

    db = firebase.ensure_db()
    if db is None:
        raise RuntimeError(
            "Roster not configured. Set ROSTER_PATH to a JSON file with steamid64 "
            "strings, or configure FIREBASE_SA_PATH + FIREBASE_DATABASE_URL and "
            "provide a `roster/` node in the Realtime Database."
        )
    snap = db.reference("roster").get()
    if snap is None:
        return []
    return _normalize(snap)


def load_roster() -> list[str]:
    """Return the roster as a list of steamid64 strings.

    Raises RuntimeError if neither ROSTER_PATH nor Firebase is available.
    """
    path = config.roster_path()
    if path:
        return _load_from_file(Path(path))
    return _load_from_firebase()
