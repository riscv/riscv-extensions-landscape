# CLAUDE.md

## What this project is

An interactive, static web reference for RISC-V extensions, profiles, and
per-instruction encodings. A React SPA (bundled by webpack, published to GitHub
Pages) lets you pick a base ISA or ratified profile, add extensions, and get a
dependency-resolved config with a valid `-march` string, plus encoding-overlap
and encoding-space tools.

Mental model: it is a **data project with a UI on top**. Three JSON/JS data
files are the real content; the `.jsx` files render them. The hard correctness
lives in the data and in `src/isaGraph.js` (dependency resolution). Data is
synced from upstream sources (riscv-opcodes, riscv-unified-db) and validated in
CI against a real clang — a wrong dependency that "looks right" is the failure
mode this project guards against.

## Setup

Node.js + npm are the only requirements (CI uses Node 22).

```bash
npm ci
npm run build                      # outputs to dist/
python3 -m http.server 8080 -d dist   # then open http://localhost:8080
```

For live-reload development: `npm run dev` (serves on :8080 with source maps).

## Commands

| Command | When |
|---|---|
| `npm ci` | Install (clean, from lockfile) |
| `npm run build` | Production bundle → `dist/` (webpack, no `--mode` = production) |
| `npm run dev` | Dev server with HMR + source maps |
| `npm test` | Full suite (`node --test tests/*.test.mjs`) |
| `node --test tests/march.test.mjs` | Run a **single test file** |
| `node --test --test-name-pattern="never emits the g shorthand"` | Run **one test by name** |
| `npm run lint` | ESLint (flat config, must stay green — it's a ratchet) |
| `npm run format` | Prettier over `src/**/*.{js,jsx,css}` |
| `npm run sync` | Regenerate instruction data from `src/instr_dict.json` |
| `npm run sync:check` | Check instruction drift, write nothing (`sync --strict`) |
| `npm run sync:udb` | Sync extension metadata from riscv-unified-db |
| `npm run graph:check -- <path-to-udb>` | Check dependency graph vs UDB |
| `npm run links:check` | Verify doc URLs resolve on docs.riscv.org |
| `npm run opcodes:check -- <path-to-riscv-opcodes>` | Report instruction-encoding drift |
| `npm run deploy` | Manual publish of `dist/` to `gh-pages` (normally automatic) |

There is no separate typecheck (no TypeScript).

## Architecture

Entry: `src/main.jsx` mounts `<RISCVExplorer/>` (`src/risc_v_visualizer.jsx`).

```
src/
  main.jsx                    # React entry, imports index.css
  risc_v_visualizer.jsx       # main view
  WorkspacePanel.jsx          # ISA Configuration Builder panel
  ExtensionTile.jsx           # one extension tile (memoised; see tileMemo.js)
  CompareView / CompareTray / compareModel.js   # side-by-side comparison
  EncodingMap.jsx / encodingMap.js              # opcode-space map
  EncodingDiagram.jsx                           # bit-field diagram
  isaGraph.js                 # dependency resolution: resolveSelection, closure, explain, validateGraph
  marchUtils.js               # -march assembly + canonical ordering (pure, no React, no catalog import)
  exportUtils.js              # YAML + riscv-config export
  focusTrap.js                # modal focus trapping
  profiles.js                 # ratified profile definitions
  --- data (the source of truth) ---
  riscv_extensions.json       # extension catalogue + per-extension instruction encodings
  isa-dependency-graph.json   # dependencies/conflicts/params, one citation per edge
  instr_dict.json             # instruction encodings, HAND-MAINTAINED (see gotchas)
scripts/                      # sync/seed/check tooling (.mjs / .cjs)
tests/                        # node:test suites (*.test.mjs)
public/index.html             # webpack HTML template
```

Data flow: upstream (riscv-opcodes, riscv-unified-db) → `scripts/*` sync → data
files → `isaGraph.js` resolves a selection → `marchUtils.js`/`exportUtils.js`
emit strings/files → React renders. `marchUtils.js` never imports the catalog;
callers pass the flat array. Dependency data is owned only by `isaGraph.js`.

**To add an extension:** add an entry to the right group in
`src/riscv_extensions.json` (`id`, `name`, `tags`, `desc`, `use`, `url`; `tags`
are riscv-opcodes extension names and drive instruction membership), then
`node scripts/seed-dependency-graph.mjs --udb <path-to-udb>` to create its graph
node, then `npm test`. A catalogue entry without a graph node fails the tests.

**To add an instruction:** add to `src/instr_dict.json` keyed by mnemonic
lowercased with `.`→`_` (`SC.W` → `sc_w`), with `encoding`/`variable_fields`/
`extension`/`match`/`mask`. `extension` must match a catalogue entry's `tags`.
Then `npm run sync` and `npm test && npm run build`.

**To add a profile:** edit `src/profiles.js` by hand from the spec.

## Conventions

- Prettier: single quotes, `printWidth: 100`, trailing commas `all`, always
  parenthesise arrow params. Run `npm run format`.
- JSX uses the **classic** React transform (Babel `@babel/preset-react`, no
  `runtime` option) — every `.jsx` needs `React` in scope even if unused;
  `react/react-in-jsx-scope` is an error. Do not "clean up" that import.
- Data files carry provenance: every dependency-graph edge needs a citation
  (`udb`, `isa-manual`, or `clang`); an uncited edge fails `validateGraph`.
- Pure modules (`marchUtils.js`, `exportUtils.js`) take no React and don't
  import data — the catalog is passed in. Keep it that way.
- Tests are `node:test` + `assert`, one `*.test.mjs` per concern; no framework.
- Commit subjects: Conventional Commits (`fix:`, `feat:`, `chore:`, `data:`,
  `ci:`), imperative, often ending with the PR number.

## Gotchas / do-not-touch

- **`src/instr_dict.json` is hand-maintained, NOT regenerated.** It carries
  entries upstream lacks (the 56 `vlseg` segment loads; expanded MOP/C.MOP). A
  regenerate would delete them. `npm run opcodes:check` only *reports* drift and
  leaves the call to a human — never auto-apply it.
- **`dist/` and `node_modules/` are generated** (dist is git-ignored / rebuilt;
  eslint ignores both). Don't hand-edit `dist/`.
- **`gh-pages` branch is machine-published** by CI on every push to `main`.
  Don't commit to it by hand.
- After editing the catalogue, **re-run the graph seeder** or `tests/isa-graph.test.mjs`
  fails (every extension needs a node).
- Never declare a React component inside another component's render body — it
  remounts the whole subtree. `react/no-unstable-nested-components` is an error
  and there's a test for it.
- Light and dark themes must both work; text contrast must clear WCAG AA 4.5:1.
- Unit tests don't render the UI (except the shallow `render-smoke` test) —
  verify interface changes in a real browser.

## Workflow

- Branch off `main`; branch names are prefixed (`fix/…`, `feat/…`, `docs/…`,
  `chore/…`). PRs merge squashed with the number in the subject.
- **Every commit must be signed off** (`git commit -s`, DCO 1.1). CI enforces it
  (`.github/workflows/dco.yml`). Fix a whole branch with
  `git rebase --signoff origin/main` then force-push with `--force-with-lease`.
- Before a PR: `npm test && npm run build` (both must pass — see the PR template
  checklist).
- CI (`.github/workflows/ci.yml`) runs install → build → test → feeds every
  generated `-march` string to clang. Distro clang (18) skips four `modern`
  profile strings; they're covered by tests instead. A `-march` string no
  compiler accepts fails the build.

## Where to look for more

- `README.md` — feature tour, data-source authority table, Encoder Validator /
  Encoding Map explanations, regeneration commands.
- `CONTRIBUTING.md` — DCO details, the invariants the tests enforce (and why
  each exists), interface-change checklist.
- `src/isaGraph.js` and `src/marchUtils.js` header comments — the design
  rationale for the dependency model and `-march` assembly.
- `.github/workflows/` — exact CI, DCO, and scheduled sync/drift jobs.
