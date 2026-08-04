"""Tests for demo_parser.filter.is_group_match.

The filter is what keeps random public matches out of the DB. Threshold
behavior is the contract: 4+ roster members -> keep, <4 -> discard, exact
boundary (== min) counts as keep.
"""

from demo_parser.filter import is_group_match


def _roster(n: int) -> list[str]:
    """Build a synthetic roster of n steamid64s (76561198000000000 + i)."""
    return [str(76561198000000000 + i) for i in range(n)]


def test_keeps_when_strictly_above_min():
    demo = _roster(5)[:5]  # 5 players, all in a roster of 10
    keep, count = is_group_match(demo, _roster(10), 4)
    assert keep is True
    assert count == 5


def test_keeps_when_exactly_at_min():
    demo = _roster(4)
    keep, count = is_group_match(demo, _roster(10), 4)
    assert keep is True
    assert count == 4


def test_discards_when_below_min():
    demo = _roster(3)
    keep, count = is_group_match(demo, _roster(10), 4)
    assert keep is False
    assert count == 3


def test_counts_only_intersection_with_roster():
    # 5 demo players, 4 of which are in the roster; the 5th is a stranger.
    demo = [
        str(76561198000000000 + 1),
        str(76561198000000000 + 2),
        str(76561198000000000 + 3),
        str(76561198000000000 + 4),
        "99999999999999999",  # not in roster
    ]
    keep, count = is_group_match(demo, _roster(10), 4)
    assert keep is True
    assert count == 4


def test_handles_roster_given_as_ints():
    # The roster is usually strings, but the loader might return ints if it
    # walked an untyped dict. The filter must coerce.
    roster_ints = [76561198000000000 + i for i in range(5)]
    demo = [str(76561198000000000 + i) for i in range(4)]
    keep, count = is_group_match(demo, roster_ints, 4)
    assert keep is True
    assert count == 4


def test_handles_demo_with_no_roster_overlap():
    demo = ["111", "222", "333"]
    keep, count = is_group_match(demo, _roster(10), 1)
    assert keep is False
    assert count == 0


def test_handles_empty_roster():
    demo = _roster(5)
    keep, count = is_group_match(demo, [], 4)
    assert keep is False
    assert count == 0


def test_min_members_must_be_positive():
    import pytest

    with pytest.raises(ValueError):
        is_group_match(_roster(5), _roster(10), 0)
