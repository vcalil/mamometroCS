"""Environment configuration for demo_parser.

Accessors específicos do serviço. Os compartilhados (database_url,
firebase_sa_path, has_firebase, env_int) vêm de mm_common.config — re-exportados
aqui pra os callers existentes (config.has_firebase(), etc.) continuarem iguais.
"""

from __future__ import annotations

import os
from pathlib import Path

from mm_common.config import (  # noqa: F401  (re-export p/ compat dos callers)
    database_url,
    env_int,
    firebase_sa_path,
    has_firebase,
)


def roster_path() -> str | None:
    """Caminho de um roster JSON local. Opcional; se ausente, cai no nó roster/."""
    return os.environ.get("ROSTER_PATH") or None


def group_min_members() -> int:
    """Mínimo de membros do grupo numa demo pra ela ser salva (default 4)."""
    return env_int("GROUP_MIN_MEMBERS", 4, minimum=1)


def demos_dir() -> Path:
    """Diretório que o watcher varre."""
    return Path(os.environ.get("DEMOS_DIR", "/demos"))


def poll_interval_sec() -> int:
    """Segundos entre varreduras do DEMOS_DIR (default 30)."""
    return env_int("POLL_INTERVAL_SEC", 30, minimum=1)


def delete_after_process() -> bool:
    """Se apaga o .dem após processar (default True)."""
    raw = os.environ.get("DELETE_AFTER_PROCESS", "true").strip().lower()
    return raw in ("1", "true", "yes", "on")


def temp_cleanup_sec() -> int:
    """Idade máx (s) de .dem abandonado em DEMOS_DIR/temp antes de apagar.

    Lenient de propósito (valor inválido → default 3600, não raise), diferente
    dos outros int accessors — por isso não usa env_int direto.
    """
    raw = os.environ.get("TEMP_CLEANUP_SEC", "3600")
    try:
        n = int(raw)
    except ValueError:
        n = 3600
    return n if n >= 0 else 3600


def file_stability_sec() -> int:
    """Idade mín (s) de um .dem antes de parsear — evita ler enquanto baixa (default 5)."""
    return env_int("FILE_STABILITY_SEC", 5, minimum=0)
