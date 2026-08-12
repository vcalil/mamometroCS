"""CLI entrypoint.

Usage:
    python -m demo_parser demo path/to/match.dem
        Dry-run: parse the file, print stats, show filter verdict, do NOT
        touch Firebase. Useful for local development and CI smoke tests.

    python -m demo_parser watch
        F1+ real watcher. Polls DEMOS_DIR for new .dem files and runs the
        parse -> filter -> dedup -> save (or discard-count) flow. See
        _cmd_watch below for behavior and env vars.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from pathlib import Path

from . import config, dedup, filter, roster, stats


def _cmd_demo(path: str) -> int:
    p = Path(path)
    if not p.exists():
        print(f"[demo_parser] demo file not found: {p}", file=sys.stderr)
        return 2
    if not p.is_file():
        print(f"[demo_parser] not a file: {p}", file=sys.stderr)
        return 2

    print(f"[demo_parser] parsing {p} ...", file=sys.stderr)
    try:
        parsed = stats.parse_demo(str(p))
    except BaseException as exc:
        # demoparser2 panics in Rust (e.g. malformed files) propagate as
        # pyo3_runtime.PanicException, which is BaseException — not caught
        # by `except Exception`. We catch here to give the user a clean
        # error message and exit code 1.
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            raise
        print(f"[demo_parser] parse error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({"stage": "parsed", "match": parsed}, indent=2, ensure_ascii=False))

    steamids = [pl["steamId"] for pl in parsed["players"]]
    if not steamids:
        print(
            "[demo_parser] no players extracted from demo — nothing to filter",
            file=sys.stderr,
        )
        return 0

    try:
        ros = roster.load_roster()
    except RuntimeError as exc:
        print(f"[demo_parser] WARN: cannot load roster ({exc}); assuming empty", file=sys.stderr)
        ros = []

    keep, count = filter.is_group_match(steamids, ros, config.group_min_members())
    verdict = "KEEP" if keep else "DISCARD"
    print(
        f"[demo_parser] groupCount={count} rosterSize={len(ros)} "
        f"min={config.group_min_members()} verdict={verdict}",
        file=sys.stderr,
    )

    if keep:
        fp = dedup.fingerprint(sorted(steamids), parsed["map"], parsed["date"])
        print(f"[demo_parser] fingerprint={fp}", file=sys.stderr)
        print(
            f"[demo_parser] would save to matches/{fp} (dry-run, not written)",
            file=sys.stderr,
        )

    print("[demo_parser] dry-run: Firebase was NOT touched.", file=sys.stderr)
    return 0


def _process_one(path: Path, delete_after: bool, min_members: int) -> None:
    """Parse one .dem, apply the group filter, save or count, and retain.

    Raises on Firebase errors (caller's outer loop will log and continue
    so a single bad demo doesn't kill the watcher).
    """
    # Lazy import keeps the dry-run `demo` subcommand working without
    # Firebase configured — mirrors the pattern in roster.py.
    from . import firebase  # type: ignore[attr-defined]

    parsed = stats.parse_demo(str(path))
    steamids = [pl["steamId"] for pl in parsed["players"]]
    if not steamids:
        print(
            f"[demo_parser] no players extracted from {path.name} — "
            f"{'deleting' if delete_after else 'skipping'}",
            file=sys.stderr,
        )
        if delete_after:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
        return

    try:
        ros = roster.load_roster()
    except RuntimeError as exc:
        print(
            f"[demo_parser] WARN: cannot load roster ({exc}); treating as empty",
            file=sys.stderr,
        )
        ros = []

    keep, count = filter.is_group_match(steamids, ros, min_members)
    verdict = "KEEP" if keep else "DISCARD"
    print(
        f"[demo_parser] {path.name}: groupCount={count} rosterSize={len(ros)} "
        f"min={min_members} verdict={verdict}",
        file=sys.stderr,
    )

    if keep:
        fp = dedup.fingerprint(sorted(steamids), parsed["map"], parsed["date"])
        # Enrich with group/source metadata (plano v5 §6). The original
        # parsed dict is preserved via dict-spread so the frontend schema
        # stays stable.
        match_doc = {
            **parsed,
            "source": "demo",
            "groupMatch": True,
            "groupCount": count,
        }
        wrote = firebase.save_match(fp, match_doc)
        print(
            f"[demo_parser] {'saved matches/' + fp + ' (new)' if wrote else 'matches/' + fp + ' já existia (skip save)'}",
            file=sys.stderr,
        )
        # SEMPRE tenta publicar no ranking (é idempotente — dedup por id em
        # estado/matches). Cobre o caso do save ter funcionado antes mas o
        # publish ter falhado: senão a partida ficaria em matches/ e FORA do
        # ranking pra sempre (nunca seria retentada).
        if firebase.publish_to_ranking(fp, match_doc):
            print(
                "[demo_parser] published to estado/matches (mamadas computadas)",
                file=sys.stderr,
            )
    else:
        # Increment discardedByFilter for each roster member present in
        # the demo. Roster members not in the demo are not touched — the
        # counter tracks "we considered you and you had < min friends".
        ros_set = {str(s) for s in ros}
        matched_roster = [sid for sid in steamids if sid in ros_set]
        for sid in matched_roster:
            firebase.increment_discarded_filter(sid, 1)
        if matched_roster:
            print(
                f"[demo_parser] discarded by filter; "
                f"discardedByFilter++ for {len(matched_roster)} roster member(s)",
                file=sys.stderr,
            )
        else:
            print(
                f"[demo_parser] discarded by filter; no roster members present",
                file=sys.stderr,
            )

    if delete_after:
        try:
            path.unlink()
            print(f"[demo_parser] deleted {path.name}", file=sys.stderr)
        except FileNotFoundError:
            pass


def _cmd_watch() -> int:
    """Real watcher (F1+).

    Polls DEMOS_DIR for new .dem files. For each new/stable file:
      1. parse_demo() -> stats
      2. load_roster() -> list of steamids
      3. is_group_match() -> (keep, count)
      4. If KEEP:    fingerprint, save_match (idempotent), delete .dem
      5. If DISCARD: log + increment discardedByFilter per roster member

    Env knobs (see config.py):
      DEMOS_DIR            (default /demos)
      POLL_INTERVAL_SEC    (default 30)
      DELETE_AFTER_PROCESS (default true)
      FILE_STABILITY_SEC   (default 5)   — min age before parse
      GROUP_MIN_MEMBERS    (default 4)
      ROSTER_PATH, FIREBASE_SA_PATH, FIREBASE_DATABASE_URL

    Robustness:
      - SIGTERM / SIGINT -> graceful shutdown between polls
      - One bad .dem doesn't kill the loop (try/except per file)
      - Files newer than FILE_STABILITY_SEC are skipped (avoids parsing
        a file the downloader is still writing)
    """
    demos_dir = config.demos_dir()
    poll_sec = config.poll_interval_sec()
    delete_after = config.delete_after_process()
    min_members = config.group_min_members()
    stability_sec = config.file_stability_sec()

    if not demos_dir.exists():
        print(
            f"[demo_parser] ERROR: DEMOS_DIR does not exist: {demos_dir}",
            file=sys.stderr,
        )
        return 2
    if not config.has_firebase():
        print(
            "[demo_parser] ERROR: Firebase not configured "
            "(set FIREBASE_SA_PATH and FIREBASE_DATABASE_URL)",
            file=sys.stderr,
        )
        return 2

    print(
        f"[demo_parser] watching {demos_dir} "
        f"(poll={poll_sec}s, delete_after={delete_after}, "
        f"min_members={min_members}, stability={stability_sec}s)",
        file=sys.stderr,
    )

    stop = False

    def _on_signal(signum: int, _frame: object) -> None:
        nonlocal stop
        print(
            f"[demo_parser] received signal {signum}, shutting down...",
            file=sys.stderr,
        )
        stop = True

    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    # In-memory dedup. Path is enough while the watcher is up; on restart
    # the worst case is re-parsing, which save_match absorbs idempotently.
    processed: set[str] = set()

    while not stop:
        try:
            for entry in sorted(demos_dir.glob("*.dem")):
                if stop:
                    break
                key = str(entry)
                if key in processed:
                    # Ja' processamos esse arquivo nesta run (mesmo filename =
                    # mesmo match re-baixado pelo downloader — ele nao tem dedup
                    # local). O resultado ja' esta' em matches/ (ou foi
                    # descartado). Delete pra nao acumular disco.
                    try:
                        entry.unlink()
                        print(
                            f"[demo_parser] deleted {entry.name} "
                            f"(re-download, ja processado)",
                            file=sys.stderr,
                        )
                    except OSError as exc:
                        print(
                            f"[demo_parser] WARN: nao consegui deletar "
                            f"{entry.name} (re-download): {exc}",
                            file=sys.stderr,
                        )
                    continue
                try:
                    age = time.time() - entry.stat().st_mtime
                except FileNotFoundError:
                    continue
                if stability_sec > 0 and age < stability_sec:
                    print(
                        f"[demo_parser] skipping {entry.name} "
                        f"(age={age:.1f}s < stability={stability_sec}s)",
                        file=sys.stderr,
                    )
                    continue
                print(f"[demo_parser] processing {entry.name} ...", file=sys.stderr)
                try:
                    _process_one(entry, delete_after, min_members)
                    processed.add(key)
                except BaseException as exc:
                    # BaseException so we also catch
                    # pyo3_runtime.PanicException (a Rust panic inside
                    # demoparser2 that escapes `except Exception`).
                    # KeyboardInterrupt / SystemExit are re-raised so
                    # SIGTERM shutdown is not swallowed.
                    if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                        raise
                    print(
                        f"[demo_parser] ERROR processing {entry.name}: {exc}",
                        file=sys.stderr,
                    )
                    # F1: arquivo que falhou (corrupto, formato invalido, panic
                    # do demoparser2) e' MOVIDO pra quarantine/ em vez de
                    # ficar no loop infinito. Garante que /demos nao acumula
                    # lixo. O operador pode inspecionar /demos/quarantine/
                    # se quiser investigar.
                    try:
                        quarantine = demos_dir / "quarantine"
                        quarantine.mkdir(exist_ok=True)
                        dest = quarantine / f"FAILED-{entry.name}"
                        i = 1
                        while dest.exists():
                            dest = quarantine / f"FAILED-{entry.name}.{i}"
                            i += 1
                        entry.rename(dest)
                        processed.add(key)  # nao retentar, ja' foi movido
                        print(
                            f"[demo_parser] moved {entry.name} -> {dest.name} "
                            f"(reason: {type(exc).__name__})",
                            file=sys.stderr,
                        )
                    except OSError as qexc:
                        # Se nao conseguir mover (perms, etc), loga mas nao
                        # adiciona ao processed — proxima iteracao tenta de novo.
                        print(
                            f"[demo_parser] WARN: could not quarantine "
                            f"{entry.name}: {qexc}",
                            file=sys.stderr,
                        )

            # Cleanup do staging do downloader: /demos/temp/ acumula downloads
            # incompletos/abandonados (o downloader move pro root ao terminar,
            # mas se morre no meio, o .dem fica preso em temp/). Arquivos parados
            # ha' TEMP_CLEANUP_SEC (default 1h) e nao sendo escritos -> delete.
            temp_dir = demos_dir / "temp"
            temp_cleanup_sec = config.temp_cleanup_sec()
            if temp_dir.is_dir() and temp_cleanup_sec > 0:
                now = time.time()
                for t in temp_dir.glob("*.dem"):
                    try:
                        if now - t.stat().st_mtime > temp_cleanup_sec:
                            t.unlink()
                            print(
                                f"[demo_parser] deleted temp/{t.name} "
                                f"(abandonado > {temp_cleanup_sec}s)",
                                file=sys.stderr,
                            )
                    except OSError as exc:
                        print(
                            f"[demo_parser] WARN: nao consegui deletar "
                            f"temp/{t.name}: {exc}",
                            file=sys.stderr,
                        )
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            print(f"[demo_parser] ERROR in poll loop: {exc}", file=sys.stderr)

        # Sleep in small slices so SIGTERM is responsive even on long polls.
        slept = 0.0
        while slept < poll_sec and not stop:
            time.sleep(0.5)
            slept += 0.5

    print("[demo_parser] stopped", file=sys.stderr)
    return 0


def _cmd_backfill_ranks() -> int:
    """Preenche o rank dos cards a partir das partidas já salvas em matches/."""
    if not config.has_firebase():
        print(
            "[demo_parser] ERROR: Firebase não configurado "
            "(set FIREBASE_SA_PATH e FIREBASE_DATABASE_URL)",
            file=sys.stderr,
        )
        return 2
    from . import firebase  # type: ignore[attr-defined]

    n = firebase.backfill_ranks()
    print(
        f"[demo_parser] backfill-ranks: {n} card(s) atualizado(s) com rank Premier.",
        file=sys.stderr,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="demo_parser",
        description="Parse CS2 demos and push per-player stats to Firebase RTDB.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_demo = sub.add_parser(
        "demo",
        help="Parse a single .dem file in dry-run mode (no Firebase writes).",
    )
    p_demo.add_argument(
        "path",
        help="Path to the .dem file to parse.",
    )

    sub.add_parser(
        "watch",
        help=(
            "Poll DEMOS_DIR for new demos and process them "
            "(parse -> filter -> save/discard -> retention)."
        ),
    )

    sub.add_parser(
        "backfill-ranks",
        help=(
            "One-shot: preenche o CS Rating (Premier) dos cards em estado/players "
            "a partir das partidas já em matches/ (rank da partida mais recente)."
        ),
    )

    args = parser.parse_args(argv)
    if args.command == "demo":
        return _cmd_demo(args.path)
    if args.command == "watch":
        return _cmd_watch()
    if args.command == "backfill-ranks":
        return _cmd_backfill_ranks()
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
