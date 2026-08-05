"""Stable match fingerprint for idempotent writes.

The frontend already has its own match identity (date + map + player set).
We use the same ingredients so re-parsing the same .dem — or a re-upload of
the same share-code by the downloader — collapses to one `matches/{id}`.
"""

from __future__ import annotations

import hashlib
from typing import Iterable


def fingerprint(
    sorted_steamids: Iterable[str],
    map_name: str,
    date_window: str,
) -> str:
    """Return a sha1 hex digest of (sorted steamids | map | yyyy-mm-dd).

    The caller MUST pass steamids pre-sorted (as strings) so the digest is
    order-independent. `date_window` is the match date truncated to day
    (yyyy-mm-dd); the .dem header has no reliable timestamp, so we use the
    file mtime date (see stats.parse_demo).
    """
    payload = "|".join(
        [
            ",".join(str(s) for s in sorted_steamids),
            (map_name or "").strip(),
            (date_window or "").strip(),
        ]
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()
