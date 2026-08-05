"""Environment configuration for demo_parser.

All accessors raise RuntimeError with a clear message when the env is malformed,
so the failure surfaces in logs instead of a cryptic NoneType deep in the call
stack. Most are optional: the dry-run path (`python -m demo_parser --demo`)
only needs DEMOS_DIR + GROUP_MIN_MEMBERS defaults.
"""

from __future__ import annotations

import os
from pathlib import Path


def database_url() -> str | None:
    """Firebase Realtime Database URL. Required for any Firebase write."""
    return os.environ.get("FIREBASE_DATABASE_URL") or None


def firebase_sa_path() -> str | None:
    """Path to the Firebase Admin SDK service account JSON. Required for writes."""
    return os.environ.get("FIREBASE_SA_PATH") or None


def roster_path() -> str | None:
    """Path to a local JSON roster (list of steamid64 strings). Optional.

    If unset, the parser falls back to the Firebase `roster/` node.
    """
    return os.environ.get("ROSTER_PATH") or None


def group_min_members() -> int:
    """Minimum number of roster members that must be in a demo to keep it.

    Defaults to 4. Out-of-range values raise so we never silently drop or
    accept everything.
    """
    raw = os.environ.get("GROUP_MIN_MEMBERS", "4")
    try:
        n = int(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"GROUP_MIN_MEMBERS must be an integer, got {raw!r}"
        ) from exc
    if n < 1:
        raise RuntimeError(f"GROUP_MIN_MEMBERS must be >= 1, got {n}")
    return n


def demos_dir() -> Path:
    """Directory the watcher (F1+) will scan. Used by `watch` and tests."""
    return Path(os.environ.get("DEMOS_DIR", "/demos"))


def has_firebase() -> bool:
    """True iff both SA path and DB URL are set and the SA file exists."""
    sa = firebase_sa_path()
    url = database_url()
    if not sa or not url:
        return False
    return Path(sa).exists()
