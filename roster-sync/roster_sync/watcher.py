"""Main loop for roster_sync.

Polls Firebase `roster/` on a fixed interval. When the roster changes
(content hash differs from the last seen), regenerates the demo-downloader
config.json. The downloader is NOT restarted automatically — the operator
runs `docker compose restart demo-downloader` after seeing the
"config regenerated" log line.

Why polling instead of Firebase streaming? RTDB streaming is event-driven
but the Admin SDK doesn't expose a clean "value changed" signal that's
painless to use from a sync-style Python service. A 60s poll is plenty
fast for onboarding (humans don't onboard in <1 min) and keeps the code
straightforward. If we ever need <1s reaction time, switch to streaming.
"""

from __future__ import annotations

import hashlib
import json
import signal
import sys
import time
from typing import Any

from . import config as cfg
from . import config_writer, firebase


def _roster_signature(
    roster: dict[str, dict[str, Any]],
    group: dict[str, dict[str, Any]] | None = None,
) -> str:
    """Stable hash do que importa pro downloader E pro filtro do parser.

    Inclui os authCode/anchorCode do roster (onboardados → config.json do
    downloader) E os steamIds do grupo (estado/players → roster.json do parser).
    Assim uma mudança NO GRUPO (alguém se registra no ranking) também regenera —
    senão o filtro de grupo do parser ficava defasado e podia descartar partida
    à toa. Ordenado por steamId pra o hash ser independente de ordem.
    """
    relevant = []
    for steam_id in sorted(roster.keys()):
        entry = roster[steam_id]
        relevant.append(
            (
                str(steam_id),
                str(entry.get("authCode") or ""),
                str(entry.get("anchorCode") or ""),
            )
        )
    grupo_sids = sorted(str(s) for s in (group or {}).keys())
    payload = json.dumps(
        {"roster": relevant, "group": grupo_sids}, sort_keys=True, ensure_ascii=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def main(argv: list[str] | None = None) -> int:
    poll_sec = cfg.poll_interval_sec()
    out_path = cfg.config_output_path()
    template_path = cfg.config_template_path()

    if not cfg.has_firebase():
        print(
            "[roster_sync] ERROR: Firebase not configured "
            "(set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL)",
            file=sys.stderr,
        )
        return 2

    print(
        f"[roster_sync] watching roster/ "
        f"(poll={poll_sec}s, output={out_path}, template={template_path})",
        file=sys.stderr,
    )

    stop = False

    def _on_signal(signum: int, _frame: object) -> None:
        nonlocal stop
        print(
            f"[roster_sync] received signal {signum}, shutting down...",
            file=sys.stderr,
        )
        stop = True

    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    last_sig: str | None = None

    # One initial pass so the file is correct on container start, even
    # if nothing changes for hours. If the template doesn't exist yet,
    # the rebuild will still produce a valid file from defaults.
    while not stop:
        try:
            roster = firebase.read_roster()
            group = firebase.read_group()  # estado/players (grupo completo)
            sig = _roster_signature(roster, group)

            if sig != last_sig:
                if last_sig is None:
                    print(
                        f"[roster_sync] initial pass: {len(roster)} roster "
                        f"entries, generating config.json",
                        file=sys.stderr,
                    )
                else:
                    print(
                        f"[roster_sync] roster changed: {len(roster)} entries, "
                        f"regenerating config.json",
                        file=sys.stderr,
                    )

                config, warnings = config_writer.build_config(
                    roster,
                    bot_username=cfg.bot_username(),
                    bot_password=cfg.bot_password(),
                    bot_shared_secret=cfg.bot_shared_secret(),
                    steam_api_key=cfg.steam_api_key(),
                    template_path=template_path,
                )
                for w in warnings:
                    print(f"[roster_sync] WARN: {w}", file=sys.stderr)

                config_writer.atomic_write_json(out_path, config)
                onboarded = len(config.get("authCodes", []))
                print(
                    f"[roster_sync] wrote {out_path} "
                    f"({onboarded} onboarded of {len(roster)} total) — "
                    f"restart demo-downloader to apply",
                    file=sys.stderr,
                )
                # F1 fix: o demo-parser precisa de roster.json em /config/ pra
                # saber quais players estao no grupo (filtro GROUP_MIN_MEMBERS).
                # Sem isso, parser ve rosterSize=0 e descarta todo match.
                #
                # MUDANCA (F1): o groupCount passa a contar TODOS do grupo
                # (estado/players — os registrados no ranking, onboarded ou
                # nao), nao so' os onboarded. O roster/ (onboarded) e' o
                # "veiculo" que permite puxar a demo; o estado/players e' o
                # grupo completo. Entao aqui escrevemos a UNIAO dos dois.
                # `group` (estado/players) já foi lido no topo do loop (entra na
                # assinatura). União roster/ (onboardados) ∪ estado/players.
                merged: dict[str, dict[str, Any]] = {}
                for sid, entry in roster.items():
                    merged[sid] = entry
                for sid, entry in group.items():
                    if sid not in merged:
                        merged[sid] = entry
                roster_for_parser = {
                    "players": [
                        {
                            "steamId": sid,
                            "name": (merged.get(sid) or {}).get("name", "")
                            or (merged.get(sid) or {}).get("name", ""),
                            "addedAt": (merged.get(sid) or {}).get("updatedAt", "")
                            or (merged.get(sid) or {}).get("addedAt", ""),
                        }
                        for sid in sorted(merged.keys())
                    ]
                }
                roster_path = out_path.parent / "roster.json"
                config_writer.atomic_write_json(roster_path, roster_for_parser)
                print(
                    f"[roster_sync] wrote {roster_path} "
                    f"({len(roster_for_parser['players'])} players; "
                    f"{len(roster)} onboarded + {len(group)} group)",
                    file=sys.stderr,
                )
                last_sig = sig
        except BaseException as exc:
            # BaseException to also catch pyo3_runtime.PanicException
            # etc.; SIGINT/SIGTERM propagate via isinstance check.
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            print(f"[roster_sync] ERROR in poll loop: {exc}", file=sys.stderr)

        # Sleep in small slices so SIGTERM is responsive.
        slept = 0.0
        while slept < poll_sec and not stop:
            time.sleep(0.5)
            slept += 0.5

    print("[roster_sync] stopped", file=sys.stderr)
    return 0
