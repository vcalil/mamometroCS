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


def poll_interval_sec() -> int:
    """Seconds between polls of DEMOS_DIR. Used by the F1 watcher.

    Defaults to 30s. Out-of-range values raise so we never busy-loop.
    """
    raw = os.environ.get("POLL_INTERVAL_SEC", "30")
    try:
        n = int(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"POLL_INTERVAL_SEC must be an integer, got {raw!r}"
        ) from exc
    if n < 1:
        raise RuntimeError(f"POLL_INTERVAL_SEC must be >= 1, got {n}")
    return n


def delete_after_process() -> bool:
    """Whether to delete .dem files after processing (KEEP or DISCARD).

    Defaults to True (retention: don't accumulate demos on disk).
    Set DELETE_AFTER_PROCESS=false to keep the file for debugging.
    """
    raw = os.environ.get("DELETE_AFTER_PROCESS", "true").strip().lower()
    return raw in ("1", "true", "yes", "on")


def temp_cleanup_sec() -> int:
    """Max age (seconds) of abandoned .dem in DEMOS_DIR/temp before delete.

    The downloader stages downloads in /demos/temp and moves them to
    /demos when complete. If it dies mid-download, the file stays in
    temp forever. Any file in temp older than this threshold is removed.
    Defaults to 3600 (1h). 0 disables cleanup.
    """
    raw = os.environ.get("TEMP_CLEANUP_SEC", "3600")
    try:
        n = int(raw)
    except ValueError:
        n = 3600
    return n if n >= 0 else 3600


def file_stability_sec() -> int:
    """Minimum age (seconds) of a .dem before the watcher will parse it.

    Guards against the downloader still writing the file when we try to
    read it. Defaults to 5s.
    """
    raw = os.environ.get("FILE_STABILITY_SEC", "5")
    try:
        n = int(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"FILE_STABILITY_SEC must be an integer, got {raw!r}"
        ) from exc
    if n < 0:
        raise RuntimeError(f"FILE_STABILITY_SEC must be >= 0, got {n}")
    return n


def has_firebase() -> bool:
    """True iff both SA path and DB URL are set and the SA file exists."""
    sa = firebase_sa_path()
    url = database_url()
    if not sa or not url:
        return False
    return Path(sa).exists()
