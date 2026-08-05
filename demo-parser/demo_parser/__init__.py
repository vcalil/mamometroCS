"""F0 scaffold: parse CS2 .dem files and write per-player stats to Firebase RTDB.

Modules:
    config     env-driven configuration
    stats      demoparser2 wrapper, mirrors the frontend's porTotais()
    dedup      stable match fingerprint (idempotent writes)
    filter     group-match gate (>= GROUP_MIN_MEMBERS roster players in the demo)
    roster     load roster from local JSON or Firebase
    firebase   lazy Admin SDK init + save_match / update_status
    cli        `python -m demo_parser` entrypoint
"""

__version__ = "0.1.0-f0"
