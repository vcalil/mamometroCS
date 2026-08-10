"""Tests for roster_sync.config_writer.

Locks the contract for the downloader config.json that roster-sync
regenerates from the live Firebase roster. The downloader is a separate
service that reads this file, so any structural change requires a
matching bump in the downloader expectations — these tests are the
canary.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from roster_sync import config_writer


def _entry(steam_id, **fields):
    """Build a roster entry dict like Firebase returns it."""
    return {steam_id: fields}


def _write_existing_config(path: Path, **overrides) -> None:
    """Write a realistic config.json with bot creds + operator prefs."""
    base = {
        "authCodeLogin": {
            "username": "bot-user",
            "password": "bot-pw",
            "secret": "bot-secret-base64",
        },
        "authCodes": [
            {
                "authCode": "OLD-OLD-OLD",
                "steamId64": "76561198000000999",
                "oldestShareCode": "CSGO-OLD-OLD-OLD-OLD-OLD",
            }
        ],
        "steamApiKey": "existing-steam-key",
        "logLevel": "info",
        "runOnStartup": False,
        "cronSchedule": "0 0 1 1 *",
    }
    base.update(overrides)
    path.write_text(json.dumps(base, indent=2))


# ----- authCodes rebuild -----------------------------------------------------


def test_empty_roster_produces_empty_authcodes(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, warnings = config_writer.build_config(
        {},
        template_path=cfg_path,
    )
    assert config["authCodes"] == []
    assert warnings == []


def test_single_onboarded_player_lands_in_authcodes(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    roster = _entry(
        "76561198000000001",
        name="alice",
        authCode="AAAA-1111-BBBB",
        anchorCode="CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
    )
    config, warnings = config_writer.build_config(roster, template_path=cfg_path)
    assert len(config["authCodes"]) == 1
    e = config["authCodes"][0]
    assert e["authCode"] == "AAAA-1111-BBBB"
    assert e["steamId64"] == "76561198000000001"
    assert e["oldestShareCode"] == "CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
    assert warnings == []


def test_partial_player_skipped_with_warning(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    roster = _entry(
        "76561198000000002",
        name="bob",
        authCode="AAAA-1111-BBBB",
        # no anchorCode
    )
    config, warnings = config_writer.build_config(roster, template_path=cfg_path)
    assert config["authCodes"] == []
    assert len(warnings) == 1
    assert "76561198000000002" in warnings[0]
    assert "anchorCode" in warnings[0]


def test_missing_authcode_also_skipped(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    roster = _entry(
        "76561198000000003",
        name="carol",
        anchorCode="CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
    )
    config, warnings = config_writer.build_config(roster, template_path=cfg_path)
    assert config["authCodes"] == []
    assert len(warnings) == 1
    assert "authCode" in warnings[0]


def test_mixed_roster_keeps_only_onboarded(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    roster = {
        "76561198000000001": {
            "name": "alice",
            "authCode": "AAAA-1111-BBBB",
            "anchorCode": "CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
        },
        "76561198000000002": {
            "name": "bob",
            "authCode": "CCCC-2222-DDDD",  # partial — no anchorCode
        },
        "76561198000000003": {
            "name": "carol",
            "authCode": "EEEE-3333-FFFF",
            "anchorCode": "CSGO-YYYYY-YYYYY-YYYYY-YYYYY-YYYYY",
        },
    }
    config, warnings = config_writer.build_config(roster, template_path=cfg_path)
    sids = [e["steamId64"] for e in config["authCodes"]]
    assert sids == ["76561198000000001", "76561198000000003"]  # sorted
    assert len(warnings) == 1
    assert "76561198000000002" in warnings[0]


def test_authcodes_are_sorted_by_steamid_for_determinism(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    roster = {
        "76561198000000009": {"name": "z", "authCode": "X", "anchorCode": "Y"},
        "76561198000000001": {"name": "a", "authCode": "X", "anchorCode": "Y"},
        "76561198000000005": {"name": "m", "authCode": "X", "anchorCode": "Y"},
    }
    config, _ = config_writer.build_config(roster, template_path=cfg_path)
    sids = [e["steamId64"] for e in config["authCodes"]]
    assert sids == ["76561198000000001", "76561198000000005", "76561198000000009"]


# ----- preservation ----------------------------------------------------------


def test_auth_login_preserved_from_existing_config(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, _ = config_writer.build_config({}, template_path=cfg_path)
    assert config["authCodeLogin"] == {
        "username": "bot-user",
        "password": "bot-pw",
        "secret": "bot-secret-base64",
    }


def test_steam_api_key_preserved_from_existing_config(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, _ = config_writer.build_config({}, template_path=cfg_path)
    assert config["steamApiKey"] == "existing-steam-key"


def test_preserved_operator_keys_carry_through(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(
        cfg_path,
        logLevel="debug",
        runOnStartup=True,
        cronSchedule="*/15 * * * *",
    )
    config, _ = config_writer.build_config({}, template_path=cfg_path)
    assert config["logLevel"] == "debug"
    assert config["runOnStartup"] is True
    assert config["cronSchedule"] == "*/15 * * * *"


def test_env_var_overrides_existing_login_field(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, _ = config_writer.build_config(
        {},
        bot_username="new-from-env",
        template_path=cfg_path,
    )
    # Only the username is overridden; password/secret still preserved.
    assert config["authCodeLogin"]["username"] == "new-from-env"
    assert config["authCodeLogin"]["password"] == "bot-pw"
    assert config["authCodeLogin"]["secret"] == "bot-secret-base64"


def test_env_var_steam_api_key_overrides_existing(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, _ = config_writer.build_config(
        {},
        steam_api_key="new-steam-key",
        template_path=cfg_path,
    )
    assert config["steamApiKey"] == "new-steam-key"


def test_placeholder_env_var_does_not_clobber_existing(tmp_path):
    """`STEAM_API_KEY=REPLACE` (the .env.example value) must NOT be written
    into the regenerated config — that would break the downloader."""
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, _ = config_writer.build_config(
        {},
        bot_username="REPLACE",
        bot_password="REPLACE",
        bot_shared_secret="REPLACE_shared_secret_base64",
        steam_api_key="REPLACE",
        template_path=cfg_path,
    )
    assert config["authCodeLogin"]["username"] == "bot-user"
    assert config["authCodeLogin"]["password"] == "bot-pw"
    assert config["authCodeLogin"]["secret"] == "bot-secret-base64"
    assert config["steamApiKey"] == "existing-steam-key"


def test_empty_env_var_does_not_clobber_existing(tmp_path):
    cfg_path = tmp_path / "config.json"
    _write_existing_config(cfg_path)
    config, _ = config_writer.build_config(
        {},
        bot_username="",
        steam_api_key="",
        template_path=cfg_path,
    )
    assert config["authCodeLogin"]["username"] == "bot-user"
    assert config["steamApiKey"] == "existing-steam-key"


# ----- first-run (no existing config) ----------------------------------------


def test_defaults_when_no_existing_config():
    config, _ = config_writer.build_config({})
    # Conservative defaults.
    assert config["runOnStartup"] is False
    assert config["logLevel"] == "info"
    assert config["cronSchedule"] == "0 0 1 1 *"
    assert config["authCodeLogin"] == {"username": "", "password": "", "secret": ""}
    assert config["steamApiKey"] == ""


def test_first_run_with_real_env_values_uses_them():
    config, _ = config_writer.build_config(
        {},
        bot_username="real-bot",
        bot_password="real-pw",
        bot_shared_secret="real-secret",
        steam_api_key="real-sk",
    )
    assert config["authCodeLogin"] == {
        "username": "real-bot",
        "password": "real-pw",
        "secret": "real-secret",
    }
    assert config["steamApiKey"] == "real-sk"


# ----- atomic write ----------------------------------------------------------


def test_atomic_write_creates_file_with_expected_content(tmp_path):
    out = tmp_path / "config.json"
    payload = {"hello": "world", "n": 42}
    config_writer.atomic_write_json(out, payload)
    assert out.exists()
    assert json.loads(out.read_text()) == payload


def test_atomic_write_overwrites_existing(tmp_path):
    out = tmp_path / "config.json"
    out.write_text("OLD")
    config_writer.atomic_write_json(out, {"new": True})
    assert json.loads(out.read_text()) == {"new": True}


def test_atomic_write_no_partial_files_left_on_success(tmp_path):
    out = tmp_path / "config.json"
    config_writer.atomic_write_json(out, {"k": "v"})
    leftovers = [p for p in tmp_path.iterdir() if p.name != "config.json"]
    assert leftovers == [], f"unexpected tmp files: {leftovers}"


# ----- RosterEntry -----------------------------------------------------------


def test_roster_entry_with_string_steamid():
    entry = config_writer.RosterEntry("123", {"name": "x"})
    assert entry.steam_id == "123"
    assert not entry.is_onboarded()


def test_roster_entry_coerces_int_steamid_to_str():
    # RTDB returns keys as strings, but a manual JSON file might use ints.
    entry = config_writer.RosterEntry(123, {"name": "x"})
    assert entry.steam_id == "123"
