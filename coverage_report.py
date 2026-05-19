#!/usr/bin/env python3
"""Generate extension instruction coverage gap reports."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping

from extension_utils import (
    load_extension_name_map,
    load_instr_dict,
    normalize_extension_name,
    repo_root,
)


@dataclass(frozen=True)
class ExtensionCoverage:
    """Coverage classification for one extension."""

    extension: str
    status: str
    instruction_count: int
    mapped_tag_count: int
    mapped_tags: list[str]
    notes: str


def load_catalog_extensions(catalog_path: Path) -> dict[str, int]:
    """Load extension IDs with currently embedded instruction counts.

    Args:
        catalog_path: Path to `riscv_extensions.json`.

    Returns:
        Map of extension ID to embedded instruction count.
    """
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    results: dict[str, int] = {}
    for entries in catalog.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, Mapping):
                continue
            ext_id = entry.get("id")
            if not isinstance(ext_id, str):
                continue
            instructions = entry.get("instructions")
            if isinstance(instructions, Mapping):
                results[ext_id] = len(instructions)
            else:
                results[ext_id] = 0
    return results


def build_tag_instruction_counts(instr_dict: Mapping[str, Any]) -> dict[str, int]:
    """Count how many instructions reference each raw extension tag.

    Args:
        instr_dict: Loaded instruction dictionary.

    Returns:
        Instruction counts per `rv_*` tag.
    """
    counts: dict[str, int] = {}
    for details in instr_dict.values():
        if not isinstance(details, Mapping):
            continue
        extensions = details.get("extension", [])
        if not isinstance(extensions, list):
            continue
        for tag in extensions:
            if not isinstance(tag, str):
                continue
            counts[tag] = counts.get(tag, 0) + 1
    return counts


def map_counts_to_canonical(
    tag_counts: Mapping[str, int], name_map: Mapping[str, str]
) -> dict[str, dict[str, int]]:
    """Aggregate raw tag counts by canonical extension names.

    Args:
        tag_counts: Instruction counts per raw tag.
        name_map: Extension name map.

    Returns:
        Canonical extension name -> raw tag -> count.
    """
    canonical: dict[str, dict[str, int]] = {}
    for tag, count in tag_counts.items():
        canonical_name = normalize_extension_name(tag, name_map)
        if canonical_name not in canonical:
            canonical[canonical_name] = {}
        canonical[canonical_name][tag] = canonical[canonical_name].get(tag, 0) + count
    return canonical


def _manual_aliases(extension_id: str) -> set[str]:
    """Build alias names used to detect key mismatches.

    Args:
        extension_id: Catalog extension ID.

    Returns:
        Possible canonical aliases.
    """
    aliases = {extension_id}
    if extension_id.startswith(("RV32", "RV64", "RV128")):
        tail = re.sub(r"^RV(?:32|64|128)", "", extension_id)
        if tail:
            aliases.add(tail)
    if not extension_id.startswith("RV"):
        aliases.add(f"RV32{extension_id}")
        aliases.add(f"RV64{extension_id}")
        aliases.add(f"RV128{extension_id}")
    return aliases


def classify_extensions(
    catalog_counts: Mapping[str, int],
    canonical_tag_counts: Mapping[str, Mapping[str, int]],
) -> list[ExtensionCoverage]:
    """Classify extension coverage status.

    Args:
        catalog_counts: Extension IDs to embedded instruction counts.
        canonical_tag_counts: Canonical names to mapped raw tags and counts.

    Returns:
        Sorted coverage rows.
    """
    rows: list[ExtensionCoverage] = []
    for extension_id in sorted(catalog_counts):
        embedded_count = int(catalog_counts[extension_id])
        aliases = _manual_aliases(extension_id)
        matched_tags: dict[str, int] = {}
        for alias in aliases:
            for tag, count in canonical_tag_counts.get(alias, {}).items():
                matched_tags[tag] = matched_tags.get(tag, 0) + int(count)
        mapped_tag_count = sum(matched_tags.values())

        if embedded_count > 0:
            status = "MAPPED"
            notes = "Instructions already embedded in catalog."
        elif mapped_tag_count > 0:
            status = "KEY_MISMATCH"
            notes = f"Raw tags exist in instr_dict.json: {', '.join(sorted(matched_tags))}"
        else:
            status = "ABSENT"
            notes = "No mapped raw extension tags in instr_dict.json."

        rows.append(
            ExtensionCoverage(
                extension=extension_id,
                status=status,
                instruction_count=embedded_count,
                mapped_tag_count=mapped_tag_count,
                mapped_tags=sorted(matched_tags),
                notes=notes,
            )
        )
    return rows


def _load_manual_text(manual_root: Path) -> str:
    """Load concatenated AsciiDoc text from a manual checkout.

    Args:
        manual_root: Root directory of a local `riscv-isa-manual`.

    Returns:
        Concatenated lower-cased text.
    """
    if not manual_root.exists():
        return ""
    chunks: list[str] = []
    for adoc in manual_root.rglob("*.adoc"):
        chunks.append(adoc.read_text(encoding="utf-8", errors="ignore").lower())
    return "\n".join(chunks)


def annotate_manual_mentions(rows: list[ExtensionCoverage], manual_text: str) -> list[ExtensionCoverage]:
    """Annotate ABSENT rows with best-effort manual mention information.

    Args:
        rows: Classified rows.
        manual_text: Concatenated manual text.

    Returns:
        Rows with updated notes for ABSENT status.
    """
    if not manual_text:
        return [
            ExtensionCoverage(
                extension=row.extension,
                status=row.status,
                instruction_count=row.instruction_count,
                mapped_tag_count=row.mapped_tag_count,
                mapped_tags=row.mapped_tags,
                notes=f"{row.notes} Manual mention: unknown (manual not found)."
                if row.status == "ABSENT"
                else row.notes,
            )
            for row in rows
        ]

    updated: list[ExtensionCoverage] = []
    for row in rows:
        if row.status != "ABSENT":
            updated.append(row)
            continue
        token = row.extension.lower()
        mentioned = re.search(rf"\b{re.escape(token)}\b", manual_text) is not None
        note_suffix = "mentioned in manual" if mentioned else "not found in manual"
        updated.append(
            ExtensionCoverage(
                extension=row.extension,
                status=row.status,
                instruction_count=row.instruction_count,
                mapped_tag_count=row.mapped_tag_count,
                mapped_tags=row.mapped_tags,
                notes=f"{row.notes} Manual mention: {note_suffix}.",
            )
        )
    return updated


def summarize(rows: list[ExtensionCoverage]) -> dict[str, int]:
    """Summarize coverage status counts.

    Args:
        rows: Coverage rows.

    Returns:
        Status counts and total.
    """
    summary = {"TOTAL": len(rows), "MAPPED": 0, "KEY_MISMATCH": 0, "ABSENT": 0}
    for row in rows:
        summary[row.status] = summary.get(row.status, 0) + 1
    return summary


def render_markdown(rows: list[ExtensionCoverage]) -> str:
    """Render a markdown report.

    Args:
        rows: Coverage rows.

    Returns:
        Markdown report.
    """
    summary = summarize(rows)
    lines = [
        "# Extension Coverage Report",
        "",
        f"- Total extensions: {summary['TOTAL']}",
        f"- MAPPED: {summary['MAPPED']}",
        f"- KEY_MISMATCH: {summary['KEY_MISMATCH']}",
        f"- ABSENT: {summary['ABSENT']}",
        "",
        "| Extension | Status | Instruction Count | Mapped Tag Count | Notes |",
        "|---|---|---:|---:|---|",
    ]
    for row in rows:
        lines.append(
            f"| {row.extension} | {row.status} | {row.instruction_count} | {row.mapped_tag_count} | {row.notes} |"
        )
    return "\n".join(lines) + "\n"


def render_json(rows: list[ExtensionCoverage]) -> str:
    """Render report as JSON.

    Args:
        rows: Coverage rows.

    Returns:
        JSON document.
    """
    payload = {"summary": summarize(rows), "rows": [asdict(row) for row in rows]}
    return json.dumps(payload, indent=2) + "\n"


def build_report(repo: Path, manual_path: Path | None = None) -> list[ExtensionCoverage]:
    """Build coverage rows from repository data.

    Args:
        repo: Repository root.
        manual_path: Optional manual root path.

    Returns:
        Classified coverage rows.
    """
    instr_dict = load_instr_dict(repo / "src" / "instr_dict.json")
    extension_map = load_extension_name_map(repo / "extension_name_map.json")
    catalog_counts = load_catalog_extensions(repo / "src" / "riscv_extensions.json")
    tag_counts = build_tag_instruction_counts(instr_dict)
    canonical_counts = map_counts_to_canonical(tag_counts, extension_map)
    rows = classify_extensions(catalog_counts, canonical_counts)
    manual_root = manual_path or (repo / "riscv-isa-manual")
    manual_text = _load_manual_text(manual_root)
    return annotate_manual_mentions(rows, manual_text)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        None.

    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(description="Generate extension coverage report.")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--repo-root", type=Path, default=repo_root())
    parser.add_argument("--manual-path", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    """Run the coverage report CLI.

    Args:
        None.

    Returns:
        Process exit code.
    """
    args = parse_args()
    rows = build_report(args.repo_root, args.manual_path)
    if args.format == "json":
        print(render_json(rows), end="")
    else:
        print(render_markdown(rows), end="")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
