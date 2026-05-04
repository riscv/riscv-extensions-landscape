# Contributing to RISC-V Extensions Landscape

Thank you for contributing.

This project is a static React app that shows RISC-V extensions and instruction details.
Most contributions are data updates and small UI/tooling improvements.

## 1) Local setup

Prerequisites:
- Node.js
- npm
- Python 3 (for local static server)

Install and build:

```bash
npm install
npm run build
python3 -m http.server 8080 -d dist
```

Open: `http://localhost:8080`

## 2) Project data files (important)

- `src/riscv_extensions.json`
  - Extension catalog (groups, IDs, descriptions, and synced instruction maps)
- `src/instr_dict.json`
  - Canonical instruction details (encoding, variable_fields, extension, match, mask)
- `src/risc_v_visualizer.jsx`
  - UI code and `extensionInstructions` mapping (which mnemonics belong to each extension)
- `scripts/sync_instructions.mjs`
  - Sync script that merges instruction details into the extension catalog

## 3) Add or update an extension

1. Edit `src/riscv_extensions.json`.
2. Add/update an extension in the correct group.
3. Keep fields consistent:
   - `id`
   - `name`
   - `desc`
   - `use`
   - `discontinued` (0 or 1)
   - `url`

## 4) Add or update instruction mapping

There are two required steps.

### Step A: Add mnemonic under extension

Edit `extensionInstructions` in `src/risc_v_visualizer.jsx`.

Example:
- extension ID: `A`
- mnemonic: `SC.W`

### Step B: Add instruction details in dictionary

Edit `src/instr_dict.json`.

Key naming rule:
- Convert mnemonic to lowercase
- Replace `.` with `_`

Examples:
- `SC.W` -> `sc_w`
- `FENCE.I` -> `fence_i`
- `ADD` -> `add`

Each instruction entry should include:
- `encoding`
- `variable_fields`
- `extension`
- `match`
- `mask`

## 5) Run sync after data changes

```bash
node scripts/sync_instructions.mjs
```

This updates `src/riscv_extensions.json` by filling extension `instructions` maps.

## 6) Validate your change

Run:

```bash
npm run build
```

Then check in UI:
- Search by extension ID and instruction mnemonic
- Open Selected Details and verify instruction details are visible
- For encoding updates, optionally test in Encoder Validator

## 7) Commit/PR scope

Please keep PRs small and focused.

Good PR examples:
- one data mapping fix
- one extension group update
- one tooling or docs improvement

Avoid mixing many unrelated changes in one PR.

## 8) Pull request checklist

Before opening a PR, verify:

- [ ] Build passes (`npm run build`)
- [ ] Sync ran if mapping/data changed (`node scripts/sync_instructions.mjs`)
- [ ] Only intended files are changed
- [ ] No unrelated formatting/noise changes
- [ ] PR description explains what changed and why

## 9) Notes for data contributors

- Some extensions may exist in catalog without instruction mappings yet.
- Some naming differences between upstream opcode tags and local extension IDs are expected.
- If a mapping cannot be resolved, mention it clearly in the PR description.

Thanks again for helping improve coverage and data quality.
