"""F1: regenerate the demo-downloader config.json from the live RTDB roster.

Modules:
    config         env-driven configuration
    firebase       lazy Admin SDK init + read_roster / read_pipeline_status /
                   write_pipeline_status
    config_writer  builds the downloader config.json from a roster snapshot,
                   preserving operator-tunable fields (logLevel, runOnStartup,
                   cronSchedule) from the existing file
    watcher        main loop: poll RTDB, detect change, regenerate

The downloader (cs-demo-downloader) reads /config/config.json. F1 reads the
canonical roster from the Firebase `roster/` node and rewrites that file
when the roster changes. The downloader is NOT restarted automatically — the
operator runs `docker compose restart demo-downloader` after seeing the
"config regenerated" log line.
"""

__version__ = "0.1.0-f1"
