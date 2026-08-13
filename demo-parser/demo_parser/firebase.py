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

        # 4) Dedup por fingerprint + append em estado/matches.
        # PATCH (corrida): o padrão anterior (ler array todo -> append -> set do
        # nó inteiro) era um read-modify-write não-atômico. Dois writers
        # concorrentes (duas execuções do parser em catch-up, ou parser + SPA do
        # admin) liam o array antigo e o último set() apagava a partida do outro
        # (lost update — foi o que fez partidas sumirem do site). A transação
        # serializa o read-modify-write no servidor, mantendo o formato array
        # que o SPA já lê (sem migração de formato).
        # IMPORTANTE: NUNCA retornar None do update function — no SDK isso grava
        # null no nó (apaga tudo). Dedup retorna a lista inalterada (no-op).
        ref = root.child("estado/matches")
        new_entry = {
            "id": fingerprint_id,
            "date": match.get("date"),
            "map": match.get("map"),
            "meta": meta,
            "stats": stats_arr,
            "entries": entries,
        }
        added: list[bool] = [False]

        def _append(current: Any) -> Any:
            # None (nó não existe) ou lista/dict legado. Dedup por id — se já
            # existe, retorna a lista inalterada (no-op, nunca None).
            if current is None:
                added[0] = True
                return [new_entry]
            if isinstance(current, dict):
                # estado/matches como objeto {id: {...}} (de uma versão anterior)
                vals = list(current.values())
            else:
                vals = list(current)
            if any(isinstance(x, dict) and x.get("id") == fingerprint_id for x in vals):
                return current  # já existe — no-op
            vals.append(new_entry)
            added[0] = True
            return vals

        ref.transaction(_append)
        if not added[0]:
            return False
        # Partida nova: propaga o rank (CS Rating Premier) dos jogadores pros
        # cards em estado/players, pra o selo de rank aparecer no ranking.
        atualizar_ranks(match)
        return True
    except Exception as exc:  # noqa: BLE001 — RTDB errors are heterogeneous
        print(
            f"[demo_parser] WARN: publish_to_ranking falhou: {exc}",
            file=sys.stderr,
        )
        return False


def _aplicar_ranks(rank_por_sid: dict[str, tuple[str, int, int]]) -> int:
    """Grava csRating/rankType/rankDate nos cards de estado/players a partir de
    {steamId: (data, csRating, rankType)}. Só sobrescreve se a `data` for >= à
    rankDate já no card (mantém sempre o rank da partida MAIS RECENTE). Preserva
    o resto do card e a forma list|dict. Read-modify-write. Retorna quantos mudaram."""
    root = ensure_db()
    if root is None or not rank_por_sid:
        return 0
    ref = root.child("estado/players")
    players = ref.get()
    if not players:
        return 0
    mudou = 0

    def _upd(card: Any) -> Any:
        nonlocal mudou
        if not isinstance(card, dict):
            return card
        sid = str(card.get("steamId") or "")
        novo = rank_por_sid.get(sid)  # (data, cr, rt)
        if novo and novo[0] >= str(card.get("rankDate") or ""):
            if (
                card.get("csRating") != novo[1]
                or card.get("rankType") != novo[2]
                or str(card.get("rankDate") or "") != novo[0]
            ):
                card = dict(card)
                card["rankDate"], card["csRating"], card["rankType"] = novo
                mudou += 1
        return card

    if isinstance(players, list):
        players = [_upd(c) for c in players]
    elif isinstance(players, dict):
        players = {k: _upd(v) for k, v in players.items()}
    else:
        return 0
    if mudou:
        ref.set(players)
    return mudou


def _ranks_premier(match: dict[str, Any]) -> dict[str, tuple[str, int, int]]:
    """{steamId: (data, csRating, rankType)} dos jogadores Premier (rankType 11,
    csRating > 0) de uma partida."""
    data = str(match.get("date") or "")
    out: dict[str, tuple[str, int, int]] = {}
    for pl in match.get("players", []) or []:
        sid = str(pl.get("steamId") or "")
        rt = int(pl.get("rankType") or 0)
        cr = int(pl.get("csRating") or 0)
        if sid and rt == 11 and cr > 0:
            out[sid] = (data, cr, rt)
    return out


def atualizar_ranks(match: dict[str, Any]) -> int:
    """Propaga o CS Rating (Premier) desta partida pros cards em estado/players.
    Cada card fica com o rank da SUA partida mais recente (guarda por data em
    rankDate). Best-effort: loga e retorna 0 em erro."""
    try:
        return _aplicar_ranks(_ranks_premier(match))
    except Exception as exc:  # noqa: BLE001 — RTDB errors are heterogeneous
        print(f"[demo_parser] WARN: atualizar_ranks falhou: {exc}", file=sys.stderr)
        return 0


def backfill_ranks() -> int:
    """Backfill: varre TODAS as partidas em matches/ e preenche o rank dos cards
    a partir do histórico já capturado, sem esperar partida nova. Cada card fica
    com o rank Premier da sua partida mais recente. Rodar uma vez:
    `python -m demo_parser backfill-ranks`. Retorna quantos cards mudaram."""
    root = ensure_db()
    if root is None:
        raise RuntimeError(
            "Firebase não configurado. Set FIREBASE_SA_PATH e FIREBASE_DATABASE_URL."
        )
    matches = root.child("matches").get() or {}
    items = list(matches.values()) if isinstance(matches, dict) else matches
    ult: dict[str, tuple[str, int, int]] = {}
    for m in items:
        if not isinstance(m, dict):
            continue
        for sid, v in _ranks_premier(m).items():
            if sid not in ult or v[0] >= ult[sid][0]:
                ult[sid] = v
    return _aplicar_ranks(ult)


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
