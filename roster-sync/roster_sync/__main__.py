"""Allow `python -m roster_sync` (and the docker default command)."""

from .watcher import main

raise SystemExit(main())
