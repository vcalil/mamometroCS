"""F1: parse CS2 .dem files and write per-player stats to Firebase RTDB.

Modules:
    config     env-driven configuration
    stats      demoparser2 wrapper, mirrors the frontend's porTotais()
    dedup      stable match fingerprint (idempotent writes)
    filter     group-match gate (>= GROUP_MIN_MEMBERS roster players in the demo)
    roster     load roster from local JSON or Firebase
    firebase   lazy Admin SDK init + save_match / update_status /
               increment_discarded_filter
    cli        `python -m demo_parser` entrypoint (demo + watch subcommands)

F1 adds the real `watch` subcommand: poll DEMOS_DIR, parse, filter, save
KEEP matches to RTDB, count DISCARD by roster member, delete .dem after
processing (retention).
"""

__version__ = "0.2.0-f1"
