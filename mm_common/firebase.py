"""Wrapper do Firebase Admin SDK — init lazy compartilhado.

Antes o bloco de init (credential + initialize_app + singleton lazy, ~44 linhas)
estava byte-a-byte idêntico em demo-parser/firebase.py e roster-sync/firebase.py.
Só inicializa quando FIREBASE_SA_PATH e FIREBASE_DATABASE_URL estão setados e o
arquivo do SA existe — assim os dry-runs sem credencial não quebram.

Os helpers de nó específicos de cada serviço (save_match, read_roster, etc.)
continuam em cada serviço; aqui fica só o init e o normalizador de nó comum.
"""

from __future__ import annotations

import os
from typing import Any

import firebase_admin
from firebase_admin import credentials, db

_app: firebase_admin.App | None = None
_root = None  # type: ignore[var-annotated]


def _init() -> Any:
    """Init único do Admin SDK. Retorna a referência raiz, ou None se não configurado."""
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
    """Retorna a referência raiz do Admin SDK, ou None se o Firebase não está configurado."""
    return _init()


def normalize_players(node: Any) -> dict[str, dict[str, Any]]:
    """Normaliza um nó de jogadores para {steamId: {...}}.

    Aceita os 3 formatos que aparecem no RTDB (antes tratados em duplicidade no
    demo-parser e no roster-sync):
      - list de dicts:   [{"steamId": "...", ...}, ...]
      - list de str:     ["7656...", ...]
      - dict chaveado:   {"<id ou steamId>": {"steamId": "...", ...}, ...}
    """
    out: dict[str, dict[str, Any]] = {}
    if isinstance(node, list):
        for entry in node:
            if isinstance(entry, dict):
                sid = entry.get("steamId")
                if sid:
                    out[str(sid)] = dict(entry)
            elif isinstance(entry, str) and entry:
                out[entry] = {}
    elif isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, dict):
                sid = v.get("steamId") or k
                out[str(sid)] = dict(v)
            else:
                out[str(k)] = {}
    return out
