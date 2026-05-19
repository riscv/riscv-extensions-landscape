"""Tests for extension normalization utilities."""

from __future__ import annotations

import json
from pathlib import Path

from extension_utils import collect_extension_tags, load_extension_name_map, load_instr_dict, load_json_file, repo_root
from extension_utils import normalize_extension_name


def test_normalize_extension_name_known_pairs() -> None:
    """Map known extension tags to canonical names."""
    sample_map = {
        "rv_zba": "Zba",
        "rv_zbb": "Zbb",
        "rv_zbc": "Zbc",
        "rv_zicsr": "Zicsr",
        "rv_zifencei": "Zifencei",
        "rv_i": "I",
        "rv_m": "M",
        "rv_a": "A",
        "rv_f": "F",
        "rv_d": "D",
        "rv_q": "Q",
        "rv_c": "C",
        "rv_v": "V",
        "rv_s": "S",
        "rv_u": "U",
        "rv64_i": "RV64I",
        "rv64_zba": "RV64Zba",
        "rv64_zbb": "RV64Zbb",
        "rv32_zk": "RV32Zk",
        "rv32_zkn": "RV32Zkn",
        "rv_zksed": "Zksed",
        "rv_zvksh": "Zvksh",
    }
    for key, expected in sample_map.items():
        assert normalize_extension_name(key, sample_map) == expected


def test_normalize_extension_name_regex_fallback() -> None:
    """Fallback regex should normalize unseen keys."""
    assert normalize_extension_name("rv64_custom_ext", {}) == "RV64CustomExt"
    assert normalize_extension_name("rv_custom_pair", {}) == "CustomPair"
    assert normalize_extension_name("rv_a", {"dummy": "X"}) == "A"
    assert normalize_extension_name("not_a_tag", {}) == "not_a_tag"


def test_data_loaders_and_tag_collection(tmp_path: Path) -> None:
    """Load helpers should parse JSON and collect valid tags."""
    instr_path = tmp_path / "instr_dict.json"
    map_path = tmp_path / "map.json"
    instr_path.write_text(
        json.dumps(
            {
                "add": {"extension": ["rv_i", "rv_m"]},
                "bad": {"extension": [None, " ", "rv_zba"]},
                "skip": {"extension": "rv_fake"},
                "nonmap": "oops",
            }
        ),
        encoding="utf-8",
    )
    map_path.write_text(json.dumps({"rv_i": "I"}), encoding="utf-8")

    raw = load_json_file(instr_path)
    assert "add" in raw
    loaded_instr = load_instr_dict(instr_path)
    loaded_map = load_extension_name_map(map_path)
    assert loaded_map["rv_i"] == "I"
    assert collect_extension_tags(loaded_instr) == {"rv_i", "rv_m", "rv_zba"}


def test_repo_root_is_existing_path() -> None:
    """Repository root helper should resolve to an existing directory."""
    assert repo_root().exists()
    assert repo_root().is_dir()
