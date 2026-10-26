"""Tests for demo_parser.stats.share_code_from_filename.

The share code (match id) lives in the downloader's filename
(`match730_<shareCode>_<outcome>_<version>_<mode>.dem`) and is the only
reliable intra-day clock for ordering matches (it grows monotonically with
real time). Lock the extraction contract here.
"""

from demo_parser.stats import share_code_from_filename


def test_extracts_share_code_from_competitive_filename():
    assert (
        share_code_from_filename(
            "match730_003840723478089040211_0996345786_201_competitive.dem"
        )
        == "003840723478089040211"
    )


def test_extracts_share_code_from_premier_filename():
    assert (
        share_code_from_filename(
            "match730_003830527272972976435_1583817405_202_premier.dem"
        )
        == "003830527272972976435"
    )


def test_accepts_full_path():
    assert (
        share_code_from_filename(
            "/demos/temp/match730_003829771227732377884_2090857472_201_competitive.dem"
        )
        == "003829771227732377884"
    )


def test_returns_none_for_non_downloader_filenames():
    assert share_code_from_filename("arquivo_sem_padrao.dem") is None
    assert share_code_from_filename("demo.dem") is None


def test_returns_none_for_empty_path():
    assert share_code_from_filename("") is None
