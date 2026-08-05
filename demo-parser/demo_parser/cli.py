"""CLI entrypoint.

Usage:
    python -m demo_parser demo path/to/match.dem
        Dry-run: parse the file, print stats, show filter verdict, do NOT
        touch Firebase. Useful for local development and CI smoke tests.

    python -m demo_parser watch
        Stub in F0. The real watcher (F1+) will poll DEMOS_DIR for new .dem
        files and run the parse -> filter -> dedup -> save flow.
"""

from __future__ import annotations

import argparse
import json
import sys
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
    except Exception as exc:
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


def _cmd_watch() -> int:
    print(
        "[demo_parser] watch not implemented in F0 — use --demo <file>",
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
        help="Poll DEMOS_DIR for new demos (stub in F0).",
    )

    args = parser.parse_args(argv)
    if args.command == "demo":
        return _cmd_demo(args.path)
    if args.command == "watch":
        return _cmd_watch()
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
