"""Lazy Firebase Admin SDK wrapper.

Only initializes when both FIREBASE_SA_PATH and FIREBASE_DATABASE_URL are set
and the service account file exists. This keeps the dry-run path
(`python -m demo_parser --demo`) usable without any cloud credentials.
"""

from __future__ import annotations

import os
import sys
from typing import Any

import firebase_admin
from firebase_admin import credentials, db

_app: firebase_admin.App | None = None
_root = None  # type: ignore[var-annotated]


def _init() -> Any:
    """One-time Admin SDK init. Returns the root reference or None."""
    global _app, _root

    if _root is not None:
        return _root

    sa = os.environ.get("FIREBASE_SA_PATH")
    url = os.environ.get("FIREBASE_DATABASE_URL")
    if not sa or not url:
        return None
    if not os.path.exists(sa):
        raise RuntimeError(f"FIREBASE_SA_PATH does not exist: {sa}")

    cred = credentials.Certificate(sa)
    _app = firebase_admin.initialize_app(cred, {"databaseURL": url})
    _root = db.reference("/")
    return _root


def ensure_db() -> Any:
    """Return the Admin SDK root reference, or None if Firebase isn't configured."""
    return _init()


def save_match(fingerprint_id: str, match: dict[str, Any]) -> bool:
    """Write `matches/{fingerprint_id}`. Skip if the node already exists.

    Returns:
        True  if a new record was written
        False if a record with the same id was already there (idempotent skip)
    """
    root = _init()
    if root is None:
        raise RuntimeError(
            "Firebase not configured. Set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL."
        )
    ref = root.child("matches").child(fingerprint_id)
    if ref.get() is not None:
        return False
    ref.set(match)
    return True


def update_status(partial: dict[str, Any]) -> bool:
    """Merge `partial` into `pipeline/status`. Best-effort: silent if no Firebase."""
    root = _init()
    if root is None:
        return False
    root.child("pipeline/status").update(partial)
    return True


def increment_discarded_filter(steam_id: str, n: int = 1) -> bool:
    """Atomically increment `pipeline/status/{steam_id}.discardedByFilter` by n.

    Called once per roster member present in a demo that was DISCARDed by
    the group-match filter (plano v5 §6). Best-effort: logs and returns
    False if no Firebase is configured or the transaction fails.
    """
    root = _init()
    if root is None:
        return False
    try:
        ref = root.child("pipeline/status").child(str(steam_id)).child("discardedByFilter")
        ref.transaction(lambda current: (current or 0) + n)
        return True
    except Exception as exc:  # noqa: BLE001 — RTDB errors are heterogeneous
        print(
            f"[demo_parser] WARN: failed to increment discardedByFilter for "
            f"{steam_id}: {exc}",
            file=sys.stderr,
        )
        return False
