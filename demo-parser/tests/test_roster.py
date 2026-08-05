"""Tests for demo_parser.roster._normalize.

The parser accepts three roster shapes (local seed, RTDB keyed map, bare
list). F1 added the local-seed shape {"players": [{"steamId": ...}, ...]}
that the demo-parser reads from ROSTER_PATH. These tests lock the contract
so future shape changes are caught.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from demo_parser import roster


def test_bare_list_of_strings():
    assert roster._normalize(["111", "222", "333"]) == ["111", "222", "333"]


def test_bare_list_filters_none():
    # The loader tolerates a None in the list — it's a degenerate case but
    # the old behavior was to skip. Keep the contract.
    assert roster._normalize(["111", None, "333"]) == ["111", "333"]


def test_rtdb_keyed_map_extracts_keys():
    snap = {
        "76561198000000001": {"name": "alice", "authCode": "AAA"},
        "76561198000000002": True,  # RTDB sometimes exports bare true
    }
    assert roster._normalize(snap) == ["76561198000000001", "76561198000000002"]


def test_f1_local_seed_single_player():
    seed = {
        "_comment": "ignored",
        "players": [
            {"steamId": "76561198067039713", "name": "guuilp", "addedAt": "2026-08-05T00:00:00Z"},
        ],
    }
    assert roster._normalize(seed) == ["76561198067039713"]


def test_f1_local_seed_multiple_players():
    seed = {
        "players": [
            {"steamId": "1", "name": "alice"},
            {"steamId": "2", "name": "bob"},
            {"steamId": "3", "name": "carol"},
        ],
    }
    assert roster._normalize(seed) == ["1", "2", "3"]


def test_f1_local_seed_skips_entries_without_steamid():
    # Defensive: if an entry is malformed, don't crash; just skip it.
    seed = {
        "players": [
            {"name": "no-id-here"},
            {"steamId": "999", "name": "valid"},
        ],
    }
    assert roster._normalize(seed) == ["999"]


def test_f1_local_seed_empty():
    assert roster._normalize({"players": []}) == []


def test_invalid_type_raises():
    import pytest

    with pytest.raises(RuntimeError):
        roster._normalize("not a list or dict")
    with pytest.raises(RuntimeError):
        roster._normalize(42)


def test_load_from_file_accepts_f1_seed(tmp_path):
    # End-to-end: write a F1 seed file and load it via load_roster.
    seed = {
        "_comment": "test seed",
        "players": [
            {"steamId": "76561198067039713", "name": "guuilp"},
        ],
    }
    p = tmp_path / "roster.json"
    p.write_text(json.dumps(seed))
    sids = roster._load_from_file(p)
    assert sids == ["76561198067039713"]


def test_load_from_file_missing_raises(tmp_path):
    import pytest

    p = tmp_path / "does-not-exist.json"
    with pytest.raises(RuntimeError):
        roster._load_from_file(p)
