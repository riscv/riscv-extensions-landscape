# RISC-V Extensions Landscape

Interactive visualization of RISC-V extensions, profiles, and per-instruction encoding details.

## Quickstart (local)

Prereqs: Node.js + npm.

```bash
npm install
npm run build
python3 -m http.server 8080 -d dist
```

Then open `http://localhost:8080`.

### Docker (optional)

```bash
docker compose up --build
```

Open `http://localhost:8080`.

## Build + deploy

- Build: `npm run build` (outputs to `dist/`)
- Deploy to GitHub Pages: `npm run deploy` (publishes `dist/` to the `gh-pages` branch)

## Data model (where things live)

- Extension catalog (groups + metadata + embedded instruction detail maps):
  - `src/riscv_extensions.json`
- Instruction detail dictionary (canonical instruction encodings/fields):
  - `src/instr_dict.json`
- Instruction membership lists (which mnemonics belong to which extension, and in what order they appear):
  - `src/risc_v_visualizer.jsx` (`extensionInstructions`)
- Sync script (merges `instr_dict.json` into `riscv_extensions.json`):
  - `scripts/sync_instructions.mjs`

## Add a new extension (step-by-step)

1. Pick the right group in `src/riscv_extensions.json` (e.g. `z_bit`, `z_atomics`, `z_system`, `s_mem`, …).
2. Add an entry like:

```json
{
  "id": "Zfoo",
  "name": "Zfoo",
  "desc": "Short description",
  "use": "Why it matters / what it enables",
  "discontinued": 0,
  "url": "https://github.com/riscv/riscv-isa-manual"
}
```

Notes:
- `discontinued: 1` enables the “Discontinued” badge on the tile and in Selected Details.
- The `url` is currently a placeholder used for the Selected Details title link.

3. If the extension should be highlighted by **Volume II**, ensure it’s represented in one of:
   - `src/risc_v_visualizer.jsx` volume membership logic (currently: `S`, `U`, `H`, `N` + `s_*` groups).

## Add a new instruction + all details (step-by-step)

This project separates “which instructions belong to an extension” from “what the instruction encoding details are”.

### 1) Add the instruction to the extension’s mnemonic list

Edit `src/risc_v_visualizer.jsx` in `extensionInstructions` and add the mnemonic to the right extension ID list.

Example:

```js
A: [
  'LR.W', 'SC.W',
  // add yours here
],
```

### 2) Add the instruction’s encoding details

Edit `src/instr_dict.json` and add a new entry under the normalized key:

- YAML/JSON mnemonic: `SC.W`
- `instr_dict.json` key: `sc_w` (lowercase + `.` replaced with `_`)

Example:

```json
"sc_w": {
  "encoding": "00011------------010-----0101111",
  "variable_fields": ["rd", "rs1", "rs2", "aq", "rl"],
  "extension": ["rv_a"],
  "match": "0x1800202f",
  "mask": "0xf800707f"
}
```

### 3) Sync into the catalog

Run:

```bash
node scripts/sync_instructions.mjs
```

This updates `src/riscv_extensions.json` by populating `instructions` maps under each extension (keyed by mnemonic, e.g. `"SC.W": { ... }`).

### 4) Verify

```bash
npm run build
python3 -m http.server 8080 -d dist
```

Then:
- Search by mnemonic (e.g. `sc.w`) or by hex fields (e.g. `0x1800202f`)
- Open Selected Details → Instruction Details
- Use the Copy button to copy a formatted block for email/docs

## Encoder Validator (conflict checking)

Use the **Encoder Validator** button in the header to check a proposed instruction encoding against the current instruction database.

How it works:
- Enter either a 32-bit `Encoding` pattern (32 chars of `0/1/-`) or a `Match` + `Mask` in hex.
- The validator normalizes your input into a `match`/`mask` pair. If you provide both encoding and match/mask, it checks they agree.
- It compares your proposed pattern against every existing instruction pattern in `src/riscv_extensions.json`.
- A conflict is reported if the two patterns overlap (there exists any 32-bit word that satisfies both match/mask pairs).
- Each conflict is classified as `identical`, `proposed_subset_of_existing`, `existing_subset_of_proposed`, or `partial_overlap`.
- For each conflict, the report includes a plain-language reason, common mask, and an example word that matches both patterns.

You can use **Copy report** in the modal to copy a full conflict report for sharing.


## Automated Coverage Reporting

The sync workflow can generate a Markdown coverage report that highlights mapping gaps by category and extension group.

### Usage

```bash
node scripts/sync_instructions.mjs --coverage-report coverage.md
```

### Output Includes

- Overall mapped / partially-mapped / unmapped counts
- Category-level coverage (supervisor, vector, vector-crypto, atomics, etc.)
- Group-level coverage table
- Explicit unmapped extension list with expected vs populated instruction counts
