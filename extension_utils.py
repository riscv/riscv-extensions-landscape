"""Shared helpers for extension normalization and data loading."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping

_EXTENSION_PATTERN = re.compile(r"^(rv(?:32|64|128)?)[_](.+)$")


def repo_root() -> Path:
    """Return the repository root path.

    Args:
        None.

    Returns:
        Absolute repository root path.
    """
    return Path(__file__).resolve().parent


def load_json_file(path: Path) -> dict[str, Any]:
    """Load a JSON object from disk.

    Args:
        path: JSON file path.

    Returns:
        Parsed JSON object.
    """
    return json.loads(path.read_text(encoding="utf-8"))


def load_instr_dict(instr_dict_path: Path | None = None) -> dict[str, Any]:
    """Load the instruction dictionary.

    Args:
        instr_dict_path: Optional override path.

    Returns:
        Parsed `instr_dict.json` object.
    """
    path = instr_dict_path or (repo_root() / "src" / "instr_dict.json")
    return load_json_file(path)


def load_extension_name_map(map_path: Path | None = None) -> dict[str, str]:
    """Load the extension normalization map.

    Args:
        map_path: Optional override path.

    Returns:
        Mapping of `rv_*` tags to canonical names.
    """
    path = map_path or (repo_root() / "extension_name_map.json")
    raw = load_json_file(path)
    return {str(key): str(value) for key, value in raw.items()}


def collect_extension_tags(instr_dict: Mapping[str, Any]) -> set[str]:
    """Collect unique extension tags from instruction records.

    Args:
        instr_dict: Instruction dictionary object.

    Returns:
        Unique extension tags.
    """
    tags: set[str] = set()
    for record in instr_dict.values():
        if not isinstance(record, Mapping):
            continue
        extensions = record.get("extension", [])
        if not isinstance(extensions, list):
            continue
        for ext in extensions:
            if isinstance(ext, str) and ext.strip():
                tags.add(ext.strip())
    return tags


def _canonicalize_component(component: str) -> str:
    """Convert one extension token into canonical case.

    Args:
        component: One underscore-delimited token.

    Returns:
        Canonical token case.
    """
    if len(component) == 1:
        return component.upper()
    return component[0].upper() + component[1:]


def _regex_normalize_extension_name(key: str) -> str:
    """Normalize extension tag names using rule-based fallback.

    Args:
        key: Raw extension tag like `rv_zba`.

    Returns:
        Canonical extension name.
    """
    match = _EXTENSION_PATTERN.match(key)
    if not match:
        return key
    prefix, suffix = match.groups()
    body = "".join(_canonicalize_component(token) for token in suffix.split("_") if token)
    if prefix == "rv":
        return body
    return f"{prefix.upper()}{body}"


def normalize_extension_name(key: str, name_map: Mapping[str, str] | None = None) -> str:
    """Normalize a raw extension tag to canonical naming.

    Args:
        key: Raw extension tag like `rv_zba`.
        name_map: Optional pre-loaded map.

    Returns:
        Canonical extension name.
    """
    mapping = name_map or load_extension_name_map()
    if key in mapping:
        return mapping[key]
    return _regex_normalize_extension_name(key)

