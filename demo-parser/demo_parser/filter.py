"""Group-match gate.

A demo is only kept if at least GROUP_MIN_MEMBERS of its 10 players are
in the roster. This is what keeps random public matches out of the DB
and limits storage to games the group actually played.
"""

from __future__ import annotations

from typing import Any, Iterable


def is_group_match(
    demo_steamids: Iterable[Any],
    roster_steamids: Iterable[Any],
    min_members: int,
) -> tuple[bool, int]:
    """Return (keep, group_count).

    keep        True iff group_count >= min_members
    group_count number of demo players whose steamid is in the roster

    Both inputs are stringified before comparison, so callers can pass
    ints (from raw JSON) or strings (from RTDB keys) interchangeably.
    """
    if min_members < 1:
        raise ValueError(f"min_members must be >= 1, got {min_members}")
    roster = {str(s) for s in roster_steamids}
    count = sum(1 for sid in demo_steamids if str(sid) in roster)
    return (count >= min_members, count)
