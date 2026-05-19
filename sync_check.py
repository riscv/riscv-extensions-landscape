#!/usr/bin/env python3
"""Detect drift between riscv-opcodes extension files and local tags."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from extension_utils import collect_extension_tags, load_instr_dict, repo_root


def collect_upstream_extension_keys(opcodes_root: Path) -> set[str]:
    """Collect `rv*` extension file names from riscv-opcodes.

    Args:
        opcodes_root: Local riscv-opcodes checkout root.

    Returns:
        Set of extension file basenames.
    """
    keys: set[str] = set()
    for subdir in ("extensions", "extensions/unratified"):
        directory = opcodes_root / subdir
        if not directory.exists():
            continue
        for file_path in directory.rglob("rv*"):
            if file_path.is_file():
                keys.add(file_path.name)
    return keys


def clone_riscv_opcodes(destination: Path) -> None:
    """Clone riscv-opcodes into `destination`.

    Args:
        destination: Target clone path.

    Returns:
        None.
    """
    try:
        subprocess.run(
            ["git", "clone", "--depth=1", "https://github.com/riscv/riscv-opcodes.git", str(destination)],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        message = stderr or "unknown git clone error"
        raise RuntimeError(f"Failed to clone riscv-opcodes: {message}") from exc


def compare_extension_sets(local_keys: set[str], upstream_keys: set[str]) -> tuple[list[str], list[str]]:
    """Return sorted added/removed keys.

    Args:
        local_keys: Keys in local instr_dict extension tags.
        upstream_keys: Keys found in upstream riscv-opcodes files.

    Returns:
        Tuple of (new_upstream_keys, removed_local_keys).
    """
    new = sorted(upstream_keys - local_keys)
    removed = sorted(local_keys - upstream_keys)
    return new, removed


def build_report(new: list[str], removed: list[str]) -> str:
    """Create human-readable sync report.

    Args:
        new: Keys that are present upstream but missing locally.
        removed: Keys that are present locally but absent upstream.

    Returns:
        Formatted report text.
    """
    lines = ["# Upstream Sync Check", ""]
    if not new and not removed:
        lines.append("No drift detected. Local extension tags are in sync with riscv-opcodes.")
        return "\n".join(lines) + "\n"

    if new:
        lines.append("## New keys upstream")
        for key in new:
            lines.append(f"- {key}")
        lines.append("")
    if removed:
        lines.append("## Keys missing upstream")
        for key in removed:
            lines.append(f"- {key}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        None.

    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(description="Detect drift with riscv-opcodes extension tags.")
    parser.add_argument("--opcodes-path", type=Path, default=None, help="Path to a local riscv-opcodes checkout.")
    parser.add_argument("--repo-root", type=Path, default=repo_root(), help="Repository root path.")
    return parser.parse_args()


def main() -> int:
    """Run sync check and emit a report.

    Args:
        None.

    Returns:
        Exit code: 0 in sync, 1 drift detected.
    """
    args = parse_args()
    local_instr = load_instr_dict(args.repo_root / "src" / "instr_dict.json")
    local_keys = collect_extension_tags(local_instr)

    cleanup_path: Path | None = None
    opcodes_path = args.opcodes_path
    if opcodes_path is None:
        temp_dir = Path(tempfile.mkdtemp(prefix="riscv-opcodes-"))
        cleanup_path = temp_dir
        opcodes_path = temp_dir / "riscv-opcodes"
        try:
            clone_riscv_opcodes(opcodes_path)
        except RuntimeError as exc:
            print(str(exc))
            return 2

    try:
        upstream_keys = collect_upstream_extension_keys(opcodes_path)
        new, removed = compare_extension_sets(local_keys, upstream_keys)
        print(build_report(new, removed), end="")
        return 1 if new or removed else 0
    finally:
        if cleanup_path and cleanup_path.exists():
            shutil.rmtree(cleanup_path, ignore_errors=True)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
