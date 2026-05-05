# Analysis Artifacts

This directory contains reproducible analysis artifacts for PR #1.

## Files

- `TAG_RECONCILIATION_REPORT.md`: Human-readable extension tag reconciliation report.
- `results.json`: Machine-readable reconciliation output used by downstream tooling.

## Reproduction

Run the reconciliation workflow against:

- `src/instr_dict.json`
- `src/riscv_extensions.json`

using the `riscv-explorer` reconciliation engine and save outputs into this folder.
