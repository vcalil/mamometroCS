"""Tests for demo_parser.dedup.fingerprint.

The fingerprint is the dedup key for `matches/{id}`. If it ever changes
behavior, every existing record's id changes too — so we lock the contract:
identical inputs collapse to one id, any meaningful change produces a new one.
"""

from demo_parser.dedup import fingerprint


def test_fingerprint_is_stable_for_identical_input():
    sids = ["76561198000000001", "76561198000000002", "76561198000000003"]
    a = fingerprint(sids, "de_dust2", "2026-08-04")
    b = fingerprint(list(sids), "de_dust2", "2026-08-04")
    assert a == b


def test_fingerprint_is_order_independent_when_caller_sorts():
    # Spec: caller passes already-sorted steamids. Sort both sides here so
    # the test exercises the "sorted" contract, not internal sorting.
    sids_a = sorted(["76561198000000001", "76561198000000002"])
    sids_b = sorted(["76561198000000002", "76561198000000001"])
    a = fingerprint(sids_a, "de_dust2", "2026-08-04")
    b = fingerprint(sids_b, "de_dust2", "2026-08-04")
    assert a == b


def test_fingerprint_changes_with_map():
    sids = ["76561198000000001", "76561198000000002"]
    a = fingerprint(sids, "de_dust2", "2026-08-04")
    b = fingerprint(sids, "de_mirage", "2026-08-04")
    assert a != b


def test_fingerprint_changes_with_players():
    a = fingerprint(
        ["76561198000000001", "76561198000000002"],
        "de_dust2",
        "2026-08-04",
    )
    b = fingerprint(
        ["76561198000000001", "76561198000000003"],
        "de_dust2",
        "2026-08-04",
    )
    assert a != b


def test_fingerprint_changes_with_day():
    sids = ["76561198000000001", "76561198000000002"]
    a = fingerprint(sids, "de_dust2", "2026-08-04")
    b = fingerprint(sids, "de_dust2", "2026-08-05")
    assert a != b


def test_fingerprint_handles_empty_player_list():
    # The spec says steamids must come from the .dem — but if a demo ever
    # has zero players, the function still returns a valid hash, not a crash.
    a = fingerprint([], "de_dust2", "2026-08-04")
    assert len(a) == 40  # sha1 hex digest length


def test_fingerprint_length_is_sha1_hex():
    fp = fingerprint(["1"], "de_dust2", "2026-08-04")
    assert len(fp) == 40
    int(fp, 16)  # raises if not valid hex
