"""demoparser2 wrapper.

The frontend already parses .dem in the browser via demoparser2 WASM (see
src/demo.js, `porTotais()`). It binds players by SteamID and reads the same
tick props we use here, so server-side parsing produces the same scoreboard
numbers the user sees in the client.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from demoparser2 import DemoParser

# Mirror of the frontend's porTotais() tick props (src/demo.js). Keep the two
# lists in sync when either side changes.
#
# CORE = placar básico (presente em toda demo). EXTRA = o que o frontend já lê:
# dano de granada, inimigos cegados e o CS Rating (Premier quando
# comp_rank_type == 11). Ficam separados porque, se uma versão do demoparser2
# não conhecer uma prop EXTRA, a gente cai no CORE em vez de quebrar o parse.
CORE_TICK_PROPS: list[str] = [
    "kills_total",
    "assists_total",
    "deaths_total",
    "damage_total",
    "headshot_kills_total",
    "mvps",
]

EXTRA_TICK_PROPS: list[str] = [
    "utility_damage_total",
    "enemies_flashed_total",
    "rank",  # CS Rating
    "comp_rank_type",  # 11 = Premier
]

TICK_PROPS: list[str] = CORE_TICK_PROPS + EXTRA_TICK_PROPS


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _flash_assists(parser: DemoParser) -> dict[str, int]:
    """Flash assists por steamid, a partir dos eventos player_death.

    Um flash assist = uma morte em que quem assistiu havia cegado a vítima
    (assistedflash == True). Espelha o flashAssistsPorSid() do src/demo.js.
    Retorna {steamId(str): quantidade}. Best-effort: se o evento/coluna não
    existir nesta demo, devolve vazio (o campo vira 0 pra todo mundo).
    """
    out: dict[str, int] = {}
    try:
        deaths = parser.parse_event("player_death")
    except Exception:
        return out
    if deaths is None or deaths.empty:
        return out
    cols = deaths.columns
    if "assistedflash" not in cols or "assister_steamid" not in cols:
        return out
    for _, row in deaths.iterrows():
        if not row.get("assistedflash"):
            continue
        sid = row.get("assister_steamid")
        if sid is None:
            continue
        try:
            key = str(int(sid))
        except (TypeError, ValueError):
            continue
        out[key] = out.get(key, 0) + 1
    return out


def parse_demo(demo_path: str) -> dict[str, Any]:
    """Parse a CS2 .dem and return the match payload.

    Returns:
        {
            "date":  "yyyy-mm-dd",          # from file mtime (header is unreliable)
            "map":   "de_dust2",
            "mode":  "competitive" | <header.game_mode>,
            "players": [
                {
                    "steamId":       "7656...",  # str
                    "name":          "...",
                    "kills":         int,
                    "deaths":        int,
                    "assists":       int,
                    "damage":        int,
                    "adr":           float,   # damage / rounds_played
                    "hs":            int,     # headshot kills total
                    "kast":          None,    # TODO(F0)
                    "mvps":          int,
                    "utilityDamage": int,     # dano de granada
                    "enemiesFlashed":int,     # inimigos cegados
                    "csRating":      int,     # CS Rating (Premier se rankType==11)
                    "rankType":      int,     # 11 = Premier
                    "flashAssists":  int,     # kills onde cegou a vítima
                },
                ...
            ],
        }
    """
    parser = DemoParser(demo_path)

    header = parser.parse_header() or {}
    info = parser.parse_player_info()
    try:
        ticks = parser.parse_ticks(TICK_PROPS)
    except Exception:
        # Alguma prop EXTRA não suportada nesta versão do demoparser2 — cai no
        # conjunto básico. As colunas ausentes viram None -> 0 lá embaixo.
        ticks = parser.parse_ticks(CORE_TICK_PROPS)

    # --- map / mode / date -------------------------------------------------
    map_name = header.get("map_name") or "unknown"
    mode = header.get("game_mode") or "competitive"

    mtime = os.path.getmtime(demo_path)
    iso_date = datetime.fromtimestamp(mtime).date().isoformat()

    # --- rounds played -----------------------------------------------------
    # round_end fires once per round. If the event isn't there (very old
    # demo, custom mod), fall back to the header's total_rounds.
    rounds = 0
    try:
        rounds = len(parser.parse_event("round_end"))
    except Exception:
        pass
    if rounds == 0:
        rounds = _safe_int(header.get("total_rounds"), 0)

    # --- last tick per player (the final scoreboard numbers) ---------------
    if not ticks.empty and "steamid" in ticks.columns and "tick" in ticks.columns:
        last_per_player = (
            ticks.sort_values("tick")
            .groupby("steamid", as_index=False)
            .tail(1)
        )
    else:
        last_per_player = ticks

    # --- steamid -> display name ------------------------------------------
    name_by_sid: dict[int, str] = {}
    if not info.empty and "steamid" in info.columns and "name" in info.columns:
        for _, row in info.iterrows():
            sid = row.get("steamid")
            name = row.get("name") or "Unknown"
            if sid is not None:
                name_by_sid[int(sid)] = name

    # --- assemble per-player stats ----------------------------------------
    players: list[dict[str, Any]] = []
    for _, row in last_per_player.iterrows():
        sid = row.get("steamid")
        if sid is None:
            continue
        sid_int = int(sid)
        damage = _safe_int(row.get("damage_total"))
        adr = round(damage / rounds, 2) if rounds > 0 else 0.0
        players.append(
            {
                "steamId": str(sid_int),
                "name": name_by_sid.get(sid_int, "Unknown"),
                "kills": _safe_int(row.get("kills_total")),
                "deaths": _safe_int(row.get("deaths_total")),
                "assists": _safe_int(row.get("assists_total")),
                "damage": damage,
                "adr": adr,
                "hs": _safe_int(row.get("headshot_kills_total")),
                "kast": None,  # TODO(F0): compute from round_end + player_hurt
                "mvps": _safe_int(row.get("mvps")),
                # Extras espelhando o src/demo.js (dano de granada, inimigos
                # cegados, CS Rating). Colunas ausentes -> 0.
                "utilityDamage": _safe_int(row.get("utility_damage_total")),
                "enemiesFlashed": _safe_int(row.get("enemies_flashed_total")),
                "csRating": _safe_int(row.get("rank")),
                "rankType": _safe_int(row.get("comp_rank_type")),
            }
        )

    # Flash assists ("assist com granada") vêm dos eventos, não dos totais.
    flash = _flash_assists(parser)
    for pl in players:
        pl["flashAssists"] = flash.get(pl["steamId"], 0)

    return {
        "date": iso_date,
        "map": map_name,
        "mode": mode,
        "players": players,
    }
