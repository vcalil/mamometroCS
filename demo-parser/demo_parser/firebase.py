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


def _id_map_and_meta(root: Any) -> tuple[dict[str, str], dict[str, Any]]:
    """Lê o mapa steamId -> id do SPA (estado/players) e a meta (estado/meta).
    Aceita players como list ou dict (coerção do RTDB)."""
    id_map: dict[str, str] = {}
    players_node = root.child("estado/players").get() or []
    if isinstance(players_node, dict):
        iter_players: Any = players_node.values()
    elif isinstance(players_node, list):
        iter_players = players_node
    else:
        iter_players = []
    for p in iter_players:
        if isinstance(p, dict) and p.get("steamId") and p.get("id"):
            id_map[str(p["steamId"])] = str(p["id"])
    meta = root.child("estado/meta").get() or {"kills": 15, "damage": 1500}
    return id_map, meta


def _bridge_entry(
    fingerprint_id: str,
    match: dict[str, Any],
    id_map: dict[str, str],
    meta: dict[str, Any],
) -> dict[str, Any]:
    """Converte um match bruto (matches/{fp}) no formato do SPA:
        {id, date, map, meta, stats:[{id,kills,damage}], entries:[{from,to}]}
    `entries` = mamadas: cada LOSER (não bateu a meta) mamou cada WINNER
    (bateu: kills >= meta.kills E damage >= meta.damage). `id` vem do id_map."""
    stats_arr: list[dict[str, Any]] = []
    winners: list[str] = []
    losers: list[str] = []
    for pl in match.get("players", []):
        pid = id_map.get(str(pl.get("steamId")))
        if not pid:
            continue  # player não está no ranking/grupo — ignora
        kills = int(pl.get("kills") or 0)
        damage = int(pl.get("damage") or 0)
        stats_arr.append({"id": pid, "kills": kills, "damage": damage})
        if kills >= int(meta.get("kills") or 0) and damage >= int(meta.get("damage") or 0):
            winners.append(pid)
        else:
            losers.append(pid)
    entries = [{"from": l, "to": w} for l in losers for w in winners]
    return {
        "id": fingerprint_id,
        "date": match.get("date"),
        "map": match.get("map"),
        "meta": meta,
        "stats": stats_arr,
        "entries": entries,
    }


def publish_to_ranking(fingerprint_id: str, match: dict[str, Any]) -> bool:
    """Bridge `matches/{fp}` (demo bruto) -> `estado/matches/{fp}` (formato SPA).

    ESCRITA POR-CHAVE: grava só `estado/matches/{fp}`, NUNCA o nó inteiro. Isso
    mata a corrida de "lost update" do padrão antigo (ler array todo -> append
    -> gravar array todo): quando dois writers concorriam (duas execuções do
    parser, ou parser + SPA), quem lia o array mais velho gravava por cima e
    APAGAVA partidas. Por chave, cada partida é um nó isolado — não colidem.

    Idempotente: se já existe entry com esse id em estado/matches (array legado
    OU objeto novo), não republica. Best-effort: retorna False sem Firebase.
    """
    root = ensure_db()
    if root is None:
        return False
    try:
        node = root.child("estado/matches")
        existing = node.get() or {}
        vals = existing.values() if isinstance(existing, dict) else existing
        if any(isinstance(x, dict) and x.get("id") == fingerprint_id for x in vals):
            return False
        # Partida nova: propaga o rank (CS Rating Premier) pros cards.
        atualizar_ranks(match)
        id_map, meta = _id_map_and_meta(root)
        node.child(fingerprint_id).set(_bridge_entry(fingerprint_id, match, id_map, meta))
        return True
    except Exception as exc:  # noqa: BLE001 — RTDB errors are heterogeneous
        print(
            f"[demo_parser] WARN: publish_to_ranking falhou: {exc}",
            file=sys.stderr,
        )
        return False


def rebuild_ranking() -> dict[str, int]:
    """Recupera + migra `estado/matches`. Varre TODAS as partidas em `matches/`
    (fonte da verdade, gravada por-chave = à prova de corrida) e reescreve
    `estado/matches` como OBJETO keyed por id `{id: entry}`. Preserva partidas
    entradas na mão pelo organizador (têm id, mas não estão em matches/).

    Roda UMA vez pra: (1) recuperar as partidas que a corrida do padrão antigo
    comeu, e (2) converter o array legado em objeto (a partir daí a escrita é
    toda por-chave e não há mais corrida). Retorna contadores."""
    root = ensure_db()
    if root is None:
        raise RuntimeError(
            "Firebase não configurado. Set FIREBASE_SA_PATH e FIREBASE_DATABASE_URL."
        )

    node = root.child("estado/matches")
    # 1) Estado atual (array legado OU objeto), indexado por id — preserva as
    #    partidas manuais (id de uid(), que não existem em matches/).
    atual = node.get() or {}
    atual_vals = atual.values() if isinstance(atual, dict) else atual
    keyed: dict[str, Any] = {}
    for e in atual_vals:
        if isinstance(e, dict) and e.get("id"):
            keyed[str(e["id"])] = e
    present_before = set(keyed.keys())

    # 2) Rebridge de TODAS as partidas do bot (matches/), a fonte da verdade.
    id_map, meta = _id_map_and_meta(root)
    matches = root.child("matches").get() or {}
    pairs = matches.items() if isinstance(matches, dict) else enumerate(matches)
    bot_ids: set[str] = set()
    for fp, m in pairs:
        if not isinstance(m, dict):
            continue
        fp = str(fp)
        keyed[fp] = _bridge_entry(fp, m, id_map, meta)
        bot_ids.add(fp)

    # 3) Grava o objeto keyed de uma vez (migração array -> objeto).
    node.set(keyed)

    recovered = len([fp for fp in bot_ids if fp not in present_before])
    return {
        "recovered": recovered,
        "bot_matches": len(bot_ids),
        "manual_kept": len(keyed) - len(bot_ids),
        "total": len(keyed),
    }


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
