"""Lazy Firebase Admin SDK wrapper.

Only initializes when both FIREBASE_SA_PATH and FIREBASE_DATABASE_URL are
set and the service account file exists. This keeps the local dry-run
path (`python -m roster_sync --snapshot`) usable without cloud credentials.
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


def read_roster() -> dict[str, dict[str, Any]]:
    """Read `roster/{steamId}` and return as `{steamId: {name, authCode, ...}}`.

    Returns an empty dict if the node is missing. Raises if Firebase is
    not configured.
    """
    root = _init()
    if root is None:
        raise RuntimeError(
            "Firebase not configured. Set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL."
        )
    snap = root.child("roster").get()
    if snap is None:
        return {}
    if not isinstance(snap, dict):
        print(
            f"[roster_sync] WARN: roster/ is a {type(snap).__name__}, expected object",
            file=sys.stderr,
        )
        return {}
    out: dict[str, dict[str, Any]] = {}
    for steam_id, entry in snap.items():
        if not isinstance(entry, dict):
            continue
        out[str(steam_id)] = dict(entry)
    return out


def read_group() -> dict[str, dict[str, Any]]:
    """Read `estado/players` (the FULL group, onboarded or not).

    `estado/players` e' o que o ranking usa (10 jogadores registrados). Pode
    vir em 3 formatos:
      - list of dicts:  [{steamId, name, ...}, ...]
      - keyed dict:     {<id>: {steamId, name, ...}, ...} ou {<steamId>: {...}}
      - list of str:    ["7656...", ...]

    Normaliza tudo pra `{steamId: {...}}`. Retorna {} se o node nao existe.
    """
    root = _init()
    if root is None:
        raise RuntimeError(
            "Firebase not configured. Set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL."
        )
    snap = root.child("estado/players").get()
    if snap is None:
        return {}
    out: dict[str, dict[str, Any]] = {}
    if isinstance(snap, list):
        # [{steamId, name, ...}] ou ["7656..."]
        for entry in snap:
            if isinstance(entry, dict):
                sid = entry.get("steamId")
                if sid:
                    out[str(sid)] = dict(entry)
            elif isinstance(entry, str) and entry:
                out[entry] = {}
    elif isinstance(snap, dict):
        for k, v in snap.items():
            if isinstance(v, dict):
                sid = v.get("steamId") or k
                out[str(sid)] = dict(v)
            else:
                out[str(k)] = {}
    return out


def read_pipeline_status() -> dict[str, dict[str, Any]]:
    """Read `pipeline/status/{steamId}` as `{steamId: {...}}`. Empty if missing."""
    root = _init()
    if root is None:
        raise RuntimeError(
            "Firebase not configured. Set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL."
        )
    snap = root.child("pipeline/status").get()
    if snap is None:
        return {}
    if not isinstance(snap, dict):
        return {}
    return {str(sid): dict(v) if isinstance(v, dict) else {} for sid, v in snap.items()}


def write_pipeline_status(steam_id: str, status: dict[str, Any]) -> bool:
    """Update `pipeline/status/{steamId}` with a partial dict.

    Best-effort: returns False if Firebase isn't configured.
    """
    root = _init()
    if root is None:
        return False
    root.child("pipeline/status").child(str(steam_id)).update(status)
    return True
