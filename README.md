# RISC-V Extension Landscape

An interactive reference for RISC-V extensions, profiles, and per-instruction
encodings. Pick a base ISA or start from a ratified profile, add extensions, and
get a dependency-resolved configuration with a valid `-march` string.

**[Open the live site](https://rpsene.github.io/riscv-extensions-landscape/)**

[![CI](https://github.com/rpsene/riscv-extensions-landscape/actions/workflows/ci.yml/badge.svg)](https://github.com/rpsene/riscv-extensions-landscape/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![DCO](https://img.shields.io/badge/DCO-required-brightgreen.svg)](DCO)

## What it does

- **Browse** every catalogued extension, grouped and searchable by name,
  mnemonic, or hex encoding.
- **Build a configuration.** Select extensions and dependencies resolve
  automatically, with conflicts blocked and a reason shown for every implied
  extension.
- **Start from a profile.** RVA23, RVB23 and the other ratified profiles load as
  a starting point rather than being rebuilt by hand.
- **Export** a `-march` string, a YAML configuration, or a `riscv-config`
  compatible file.
- **Check an encoding.** The Encoder Validator tests a proposed instruction
  pattern against every existing one and reports overlaps.
- **Link out to the specification.** Each extension links to its section on
  docs.riscv.org.

## Quickstart

Node.js and npm are the only requirements.

```bash
npm ci
npm run build
python3 -m http.server 8080 -d dist
```

Then open `http://localhost:8080`.

Docker, if you prefer:

```bash
docker compose up --build
```

## Where the data comes from

Three sources with different authority, which is worth knowing before changing
anything:

| file | holds | source of truth |
|---|---|---|
| `src/riscv_extensions.json` | the extension catalogue, and instruction encodings per extension | [riscv-opcodes](https://github.com/riscv/riscv-opcodes), via `src/instr_dict.json` |
| `src/isa-dependency-graph.json` | dependencies, conflicts and parameters, with a citation on every edge | [riscv-unified-db](https://github.com/riscv-software-src/riscv-unified-db) |
| `src/profiles.js` | the ratified profiles | the profile specifications |

`riscv-unified-db` is normative for dependencies. clang is the check that what we
emit is actually usable: CI feeds every generated `-march` string to a real
compiler. `riscv-config`, RISC-V International's own validator, disagrees with
clang in a few places, and where it does both opinions are recorded rather than
one being quietly preferred.

Regenerate with:

```bash
npm run sync          # instruction encodings from riscv-opcodes
npm run sync:udb      # extension metadata from riscv-unified-db
node scripts/seed-dependency-graph.mjs --udb <path-to-riscv-unified-db>
node scripts/map-doc-links.mjs                # documentation links
```

Or check for drift without writing anything:

```bash
npm run sync:check
npm run graph:check -- <path-to-riscv-unified-db>
npm run links:check
```

## Code layout

| file | responsibility |
|---|---|
| `src/risc_v_visualizer.jsx` | the main view |
| `src/ExtensionTile.jsx` | a single extension tile, memoised per tile |
| `src/WorkspacePanel.jsx` | the ISA Configuration Builder panel |
| `src/isaGraph.js` | dependency resolution: `resolveSelection`, `closure`, `explain`, `validateGraph` |
| `src/marchUtils.js` | `-march` assembly and canonical ordering |
| `src/exportUtils.js` | YAML and `riscv-config` export |
| `src/profiles.js` | profile definitions |

## Tests

```bash
npm test        # 114 tests
```

CI runs the tests, builds, then validates every generated `-march` string against
clang. The suite covers dependency closure, graph integrity, profile
correctness, `riscv-config` conventions, export formats, documentation links, and
a jsdom smoke test that fails if the page renders blank.

## Adding an extension

Add an entry to the appropriate group in `src/riscv_extensions.json`:

```json
{
  "id": "Zfoo",
  "name": "Zfoo",
  "tags": ["rv_zfoo"],
  "desc": "Short description",
  "use": "What it enables",
  "url": "https://docs.riscv.org/reference/..."
}
```

- `tags` are riscv-opcodes extension names. Instruction membership is derived
  from them, so a wrong tag produces a wrong instruction count.
- `url` points at the extension's page on docs.riscv.org; `npm run links:check`
  verifies it resolves.
- `discontinued: 1` adds the "Discontinued" badge.

Then add a graph node, or the tests fail:

```bash
node scripts/seed-dependency-graph.mjs --udb <path-to-riscv-unified-db>
npm test
```

## Adding an instruction

Encodings live in `src/instr_dict.json`, keyed by the mnemonic lowercased with
`.` replaced by `_`, so `SC.W` becomes `sc_w`:

```json
"sc_w": {
  "encoding": "00011------------010-----0101111",
  "variable_fields": ["rd", "rs1", "rs2", "aq", "rl"],
  "extension": ["rv_a"],
  "match": "0x1800202f",
  "mask": "0xf800707f"
}
```

The `extension` values match the `tags` on a catalogue entry, and that is what
places the instruction. Merge it in and verify:

```bash
npm run sync
npm test && npm run build
```

## Encoder Validator

The **Encoder Validator** in the header checks a proposed encoding against every
instruction in the database. Give it either a 32-bit pattern of `0`, `1` and `-`,
or a `match` and `mask` pair in hex; supplying both cross-checks them against
each other.

Overlaps are reported as `identical`, `proposed_subset_of_existing`,
`existing_subset_of_proposed`, or `partial_overlap`, each with a plain-language
reason and an example 32-bit word that satisfies both patterns.

## Deployment

Pushes to `main` build and publish to the `gh-pages` branch automatically. To
publish by hand:

```bash
npm run deploy
```

## Contributing

Contributions are welcome, data corrections especially. See
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, the invariants the tests enforce,
and the sign-off requirement.

All commits must be signed off under the [Developer Certificate of Origin](DCO):

```bash
git commit -s
```

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). To report
a vulnerability, see [SECURITY.md](SECURITY.md).

## Licence

[Apache License 2.0](LICENSE).
