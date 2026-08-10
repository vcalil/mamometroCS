"""Accessors de ambiente compartilhados.

Antes duplicados em demo-parser/config.py e roster-sync/config.py: database_url,
firebase_sa_path, has_firebase (idênticos) e o padrão "int de env com validação"
(repetido ~6 vezes). Agora numa fonte só.
"""

from __future__ import annotations

import os
from pathlib import Path


def env_int(name: str, default: int, minimum: int | None = None) -> int:
    """Lê uma env var como int, com mensagem clara em erro.

    Erra RuntimeError se o valor não for inteiro ou for menor que `minimum`,
    pra a falha aparecer no log em vez de um NoneType críptico lá na frente.
    """
    raw = os.environ.get(name, str(default))
    try:
        n = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw!r}") from exc
    if minimum is not None and n < minimum:
        raise RuntimeError(f"{name} must be >= {minimum}, got {n}")
    return n


def database_url() -> str | None:
    """URL do Firebase Realtime Database. Necessária pra qualquer read/write."""
    return os.environ.get("FIREBASE_DATABASE_URL") or None


def firebase_sa_path() -> str | None:
    """Caminho do service-account JSON do Firebase Admin SDK."""
    return os.environ.get("FIREBASE_SA_PATH") or None


def has_firebase() -> bool:
    """True se SA path e DB URL estão setados e o arquivo do SA existe."""
    sa = firebase_sa_path()
    url = database_url()
    if not sa or not url:
        return False
    return Path(sa).exists()
