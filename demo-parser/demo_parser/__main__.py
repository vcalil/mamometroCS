"""Allow `python -m demo_parser ...` (and the docker default command)."""

from .cli import main

raise SystemExit(main())
