"""Helpers de nó do Firebase pro demo-parser (matches/, estado/matches,
pipeline/status). O init lazy do Admin SDK (antes duplicado byte-a-byte com o
roster-sync) e o normalizador de nó são compartilhados via mm_common.firebase.
"""

from __future__ import annotations

import sys
from typing import Any

from mm_common.firebase import ensure_db  # re-init lazy compartilhado


def save_match(fingerprint_id: str, match: dict[str, Any]) -> bool:
    """Write `matches/{fingerprint_id}`. Skip if the node already exists.

    Returns:
        True  if a new record was written
        False if a record with the same id was already there (idempotent skip)
    """
    root = ensure_db()
    if root is None:
        raise RuntimeError(
            "Firebase not configured. Set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL."
        )
    ref = root.child("matches").child(fingerprint_id)
    if ref.get() is not None:
        return False
    ref.set(match)
    return True


def publish_to_ranking(fingerprint_id: str, match: dict[str, Any]) -> bool:
    """Bridge `matches/{fp}` (demo bruto) -> `estado/matches` (formato do SPA).

    O SPA lê `estado/matches` como array de:
        {id, date, meta, stats: [{id, kills, damage}], entries: [{from, to}]}
    onde `entries` = relacoes de mamada: cada LOSER (nao bateu a meta)
    mamou cada WINNER (bateu meta: kills >= meta.kills E damage >= meta.damage).
    `id` do SPA vem do `estado/players` (mapeia steamId -> id).

    Idempotente: se `estado/matches` ja tem um entry com esse fingerprint_id,
    nao duplica. Best-effort: loga e retorna False se Firebase nao configurado.
    """
    root = ensure_db()
    if root is None:
        return False
    try:
        # 1) Mapeia steamId -> id do SPA (estado/players)
        id_map: dict[str, str] = {}
        players_node = root.child("estado/players").get() or []
        if isinstance(players_node, list):
            for p in players_node:
                if isinstance(p, dict) and p.get("steamId") and p.get("id"):
                    id_map[str(p["steamId"])] = str(p["id"])
        elif isinstance(players_node, dict):
            for _k, p in players_node.items():
                if isinstance(p, dict) and p.get("steamId") and p.get("id"):
                    id_map[str(p["steamId"])] = str(p["id"])

        # 2) Meta (goal kills/damage) — default igual ao SPA
        meta = root.child("estado/meta").get() or {"kills": 15, "damage": 1500}

        # 3) Stats + winners/losers
        stats_arr: list[dict[str, Any]] = []
        winners: list[str] = []
        losers: list[str] = []
        for pl in match.get("players", []):
            pid = id_map.get(str(pl.get("steamId")))
            if not pid:
                continue  # player nao esta no ranking/grupo — ignora
            kills = int(pl.get("kills") or 0)
            damage = int(pl.get("damage") or 0)
            stats_arr.append({"id": pid, "kills": kills, "damage": damage})
            if kills >= int(meta.get("kills") or 0) and damage >= int(meta.get("damage") or 0):
                winners.append(pid)
            else:
                losers.append(pid)
        entries = [{"from": l, "to": w} for l in losers for w in winners]

        # 4) Dedup por fingerprint + append no array estado/matches
        ref = root.child("estado/matches")
        existing = ref.get() or []
        if any(isinstance(x, dict) and x.get("id") == fingerprint_id for x in existing):
            return False
        new_entry = {
            "id": fingerprint_id,
            "date": match.get("date"),
            "map": match.get("map"),
            "meta": meta,
            "stats": stats_arr,
            "entries": entries,
        }
        existing.append(new_entry)
        ref.set(existing)
        return True
    except Exception as exc:  # noqa: BLE001 — RTDB errors are heterogeneous
        print(
            f"[demo_parser] WARN: publish_to_ranking falhou: {exc}",
            file=sys.stderr,
        )
        return False


def update_status(partial: dict[str, Any]) -> bool:
    """Merge `partial` into `pipeline/status`. Best-effort: silent if no Firebase."""
    root = ensure_db()
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
    root = ensure_db()
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
