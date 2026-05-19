"""Tests for coverage report classification logic."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from coverage_report import (
    _load_manual_text,
    annotate_manual_mentions,
    build_report,
    build_tag_instruction_counts,
    classify_extensions,
    load_catalog_extensions,
    map_counts_to_canonical,
    parse_args,
    render_json,
    render_markdown,
    summarize,
    main,
)


def test_classify_extensions_covers_all_statuses() -> None:
    """Classification should emit MAPPED, KEY_MISMATCH, and ABSENT."""
    catalog_counts = {"Zba": 2, "Zbb": 0, "Zvzip": 0}
    tag_counts = {"rv_zbb": 4, "rv_zvzip": 1}
    name_map = {"rv_zbb": "Zbb", "rv_zvzip": "ZvzipFuture"}
    canonical_counts = map_counts_to_canonical(tag_counts, name_map)
    rows = classify_extensions(catalog_counts, canonical_counts)
    by_ext = {row.extension: row for row in rows}

    assert by_ext["Zba"].status == "MAPPED"
    assert by_ext["Zbb"].status == "KEY_MISMATCH"
    assert by_ext["Zbb"].mapped_tag_count == 4
    assert by_ext["Zvzip"].status == "ABSENT"


def test_classify_extensions_aliases_rv64_prefix() -> None:
    """Alias matching should map RV64-prefixed canonical names."""
    catalog_counts = {"Zba": 0}
    tag_counts = {"rv64_zba": 7}
    name_map = {"rv64_zba": "RV64Zba"}
    canonical_counts = map_counts_to_canonical(tag_counts, name_map)
    rows = classify_extensions(catalog_counts, canonical_counts)

    assert rows[0].status == "KEY_MISMATCH"
    assert rows[0].mapped_tags == ["rv64_zba"]
    assert rows[0].mapped_tag_count == 7


def test_summarize_counts() -> None:
    """Summary totals should match row statuses."""
    catalog_counts = {"A": 1, "B": 0}
    tag_counts = {"rv_b": 2}
    name_map = {"rv_b": "B"}
    rows = classify_extensions(catalog_counts, map_counts_to_canonical(tag_counts, name_map))
    summary = summarize(rows)

    assert summary["TOTAL"] == 2
    assert summary["MAPPED"] == 1
    assert summary["KEY_MISMATCH"] == 1
    assert summary["ABSENT"] == 0


def test_load_catalog_and_tag_count_builders(tmp_path: Path) -> None:
    """Catalog and tag count loaders should handle sparse data."""
    catalog_path = tmp_path / "riscv_extensions.json"
    catalog_path.write_text(
        json.dumps(
            {
                "g1": [{"id": "A", "instructions": {"X": {}}}, {"id": "B"}],
                "g2": ["ignore"],
                "g3": {},
                "g4": [{"id": 123}],
            }
        ),
        encoding="utf-8",
    )
    counts = load_catalog_extensions(catalog_path)
    assert counts == {"A": 1, "B": 0}

    tag_counts = build_tag_instruction_counts(
        {
            "insn1": {"extension": ["rv_a", "rv_b"]},
            "insn2": {"extension": ["rv_b"]},
            "insn3": {"extension": "rv_c"},
            "insn4": "not-a-mapping",
            "insn5": {"extension": ["rv_d", None]},
        }
    )
    assert tag_counts == {"rv_a": 1, "rv_b": 2, "rv_d": 1}


def test_manual_annotation_renderers_and_report_builder(tmp_path: Path) -> None:
    """Manual annotation, markdown/json rendering, and integration should work."""
    rows = classify_extensions({"Zba": 0}, map_counts_to_canonical({"rv_zba": 2}, {"rv_zba": "Zba"}))
    manual = "zba appears here"
    annotated = annotate_manual_mentions(rows, manual)
    assert annotated[0].status == "KEY_MISMATCH"

    absent_rows = classify_extensions({"Nope": 0}, {})
    absent_annotated = annotate_manual_mentions(absent_rows, "")
    assert "manual not found" in absent_annotated[0].notes

    markdown = render_markdown(absent_annotated)
    as_json = render_json(absent_annotated)
    assert "| Extension | Status |" in markdown
    assert '"summary"' in as_json

    manual_root = tmp_path / "manual"
    (manual_root / "a.adoc").parent.mkdir(parents=True, exist_ok=True)
    (manual_root / "a.adoc").write_text("Zba", encoding="utf-8")
    assert "zba" in _load_manual_text(manual_root)

    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True, exist_ok=True)
    (repo / "src" / "instr_dict.json").write_text(
        json.dumps({"add": {"extension": ["rv_zba"]}}),
        encoding="utf-8",
    )
    (repo / "src" / "riscv_extensions.json").write_text(
        json.dumps({"g": [{"id": "Zba", "instructions": {}}, {"id": "Other"}]}),
        encoding="utf-8",
    )
    (repo / "extension_name_map.json").write_text(json.dumps({"rv_zba": "Zba"}), encoding="utf-8")

    built = build_report(repo, manual_root)
    assert any(row.extension == "Zba" and row.status == "KEY_MISMATCH" for row in built)
    assert _load_manual_text(tmp_path / "missing") == ""


def test_parse_args_and_main_json_output(monkeypatch, capsys) -> None:
    """CLI parsing and main entrypoint should emit JSON when requested."""
    monkeypatch.setattr("sys.argv", ["coverage_report.py", "--format", "json"])
    args = parse_args()
    assert args.format == "json"

    monkeypatch.setattr(
        "coverage_report.parse_args",
        lambda: SimpleNamespace(format="json", repo_root=Path("."), manual_path=None),
    )
    monkeypatch.setattr(
        "coverage_report.build_report",
        lambda repo_root, manual_path: [
            classify_extensions({"A": 1}, {})[0],
        ],
    )
    exit_code = main()
    out = capsys.readouterr().out
    assert exit_code == 0
    assert '"summary"' in out

    monkeypatch.setattr(
        "coverage_report.parse_args",
        lambda: SimpleNamespace(format="markdown", repo_root=Path("."), manual_path=None),
    )
    monkeypatch.setattr(
        "coverage_report.build_report",
        lambda repo_root, manual_path: [
            classify_extensions({"B": 0}, {"B": {"rv_b": 1}})[0],
        ],
    )
    exit_code = main()
    out = capsys.readouterr().out
    assert exit_code == 0
    assert "| Extension | Status |" in out


def test_classify_with_rv_prefixed_catalog_id() -> None:
    """RV-prefixed catalog IDs should match tail aliases."""
    rows = classify_extensions({"RV64Zba": 0}, {"Zba": {"rv_zba": 3}})
    assert rows[0].status == "KEY_MISMATCH"
