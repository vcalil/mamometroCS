"""Helpers de nó do Firebase pro roster-sync (roster/, estado/players,
pipeline/status). O init lazy do Admin SDK (antes duplicado byte-a-byte com o
demo-parser) e o normalizador de nó são compartilhados via mm_common.firebase.
"""

from __future__ import annotations

import sys
from typing import Any

from mm_common.firebase import ensure_db  # re-init lazy compartilhado


def read_roster() -> dict[str, dict[str, Any]]:
    """Read `roster/{steamId}` and return as `{steamId: {name, authCode, ...}}`.

    Returns an empty dict if the node is missing. Raises if Firebase is
    not configured.
    """
    root = ensure_db()
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
    root = ensure_db()
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
    root = ensure_db()
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
    root = ensure_db()
    if root is None:
        return False
    root.child("pipeline/status").child(str(steam_id)).update(status)
    return True
