"""Tests for sync drift detection logic."""

from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

from sync_check import (
    build_report,
    clone_riscv_opcodes,
    collect_upstream_extension_keys,
    compare_extension_sets,
    main,
    parse_args,
)


def _touch(path: Path) -> None:
    """Create an empty file and parent directories.

    Args:
        path: File path.

    Returns:
        None.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def test_collect_upstream_extension_keys_reads_ratified_and_unratified(tmp_path: Path) -> None:
    """Collect keys from both extensions trees."""
    _touch(tmp_path / "extensions" / "rv_zba")
    _touch(tmp_path / "extensions" / "notes.txt")
    _touch(tmp_path / "extensions" / "unratified" / "rv_zvzip")

    keys = collect_upstream_extension_keys(tmp_path)
    assert keys == {"rv_zba", "rv_zvzip"}


def test_collect_upstream_extension_keys_missing_dirs(tmp_path: Path) -> None:
    """Missing extension directories should produce an empty set."""
    assert collect_upstream_extension_keys(tmp_path / "nope") == set()


def test_compare_extension_sets_detects_new_and_removed() -> None:
    """Detect both new upstream keys and removed local keys."""
    local = {"rv_zba", "rv_zbb"}
    upstream = {"rv_zba", "rv_zbc"}
    new, removed = compare_extension_sets(local, upstream)

    assert new == ["rv_zbc"]
    assert removed == ["rv_zbb"]


def test_build_report_in_sync_message() -> None:
    """In-sync report should contain no-drift message."""
    report = build_report([], [])
    assert "No drift detected" in report


def test_clone_riscv_opcodes_raises_runtime_error(monkeypatch, tmp_path: Path) -> None:
    """Clone helper should wrap subprocess errors with a clear message."""

    def _raise(*_args, **_kwargs):
        raise subprocess.CalledProcessError(128, "git", stderr="ssl failure")

    monkeypatch.setattr("subprocess.run", _raise)
    try:
        clone_riscv_opcodes(tmp_path / "dst")
        assert False, "Expected RuntimeError"
    except RuntimeError as exc:
        assert "Failed to clone riscv-opcodes" in str(exc)


def test_parse_args_and_main_exit_codes(monkeypatch, tmp_path: Path, capsys) -> None:
    """Main should return 0 when in sync and 1 when drift exists."""
    monkeypatch.setattr("sys.argv", ["sync_check.py", "--opcodes-path", str(tmp_path)])
    args = parse_args()
    assert args.opcodes_path == tmp_path

    monkeypatch.setattr(
        "sync_check.parse_args",
        lambda: SimpleNamespace(opcodes_path=tmp_path, repo_root=tmp_path),
    )
    monkeypatch.setattr("sync_check.load_instr_dict", lambda _path: {"i": {"extension": ["rv_a"]}})
    monkeypatch.setattr("sync_check.collect_extension_tags", lambda _instr: {"rv_a"})
    monkeypatch.setattr("sync_check.collect_upstream_extension_keys", lambda _path: {"rv_a"})
    assert main() == 0
    assert "No drift detected" in capsys.readouterr().out

    monkeypatch.setattr("sync_check.collect_upstream_extension_keys", lambda _path: {"rv_b"})
    assert main() == 1
    out = capsys.readouterr().out
    assert "New keys upstream" in out or "Keys missing upstream" in out


def test_main_clone_failure_returns_two(monkeypatch, tmp_path: Path, capsys) -> None:
    """Main should return 2 when automatic clone fails."""
    monkeypatch.setattr(
        "sync_check.parse_args",
        lambda: SimpleNamespace(opcodes_path=None, repo_root=tmp_path),
    )
    monkeypatch.setattr("sync_check.load_instr_dict", lambda _path: {"i": {"extension": ["rv_a"]}})
    monkeypatch.setattr("sync_check.collect_extension_tags", lambda _instr: {"rv_a"})
    monkeypatch.setattr("sync_check.clone_riscv_opcodes", lambda _path: (_ for _ in ()).throw(RuntimeError("boom")))
    assert main() == 2
    assert "boom" in capsys.readouterr().out


def test_main_temp_clone_path_cleanup(monkeypatch, tmp_path: Path) -> None:
    """Auto-clone temp directory should be cleaned after successful run."""
    temp_root = tmp_path / "temp"
    clone_path = temp_root / "riscv-opcodes"
    temp_root.mkdir()

    monkeypatch.setattr(
        "sync_check.parse_args",
        lambda: SimpleNamespace(opcodes_path=None, repo_root=tmp_path),
    )
    monkeypatch.setattr("sync_check.load_instr_dict", lambda _path: {"i": {"extension": ["rv_a"]}})
    monkeypatch.setattr("sync_check.collect_extension_tags", lambda _instr: {"rv_a"})
    monkeypatch.setattr("tempfile.mkdtemp", lambda prefix: str(temp_root))

    def _fake_clone(path: Path) -> None:
        (path / "extensions").mkdir(parents=True, exist_ok=True)
        (path / "extensions" / "rv_a").write_text("", encoding="utf-8")

    monkeypatch.setattr("sync_check.clone_riscv_opcodes", _fake_clone)
    assert main() == 0
    assert not temp_root.exists()
