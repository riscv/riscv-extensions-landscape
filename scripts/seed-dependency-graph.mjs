#!/usr/bin/env node
/**
 * Seeds src/isa-dependency-graph.json from riscv-unified-db.
 *
 * This is a bootstrap/reconcile tool, NOT part of the build. The committed
 * graph is the source of truth and is maintained by hand; this script exists so
 * a human can ask "has upstream moved?" and get a diff instead of guessing.
 *
 *   node scripts/seed-dependency-graph.mjs --udb <path-to-udb-checkout>          # write
 *   node scripts/seed-dependency-graph.mjs --udb <path-to-udb-checkout> --check  # diff only
 *
 * UDB schema note (this cost us once already): extension requirements live in
 * BOTH `requirements:` at the top level and `versions[].requirements:`, and the
 * `extension:` node is either a bare `{name: X}` or a combinator
 * (`allOf`/`anyOf`) containing `{name: X}` entries. Parsing only the top-level
 * `allOf` shape silently loses D->F, Q->D, B->Zba/Zbb/Zbs and ~15 others, which
 * reads as "UDB has gaps" when in fact the parser did.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const args = process.argv.slice(2);
const udbFlag = args.indexOf('--udb');
const udbRoot = udbFlag === -1 ? null : args[udbFlag + 1];
const checkOnly = args.includes('--check');
if (!udbRoot || udbRoot.startsWith('--')) {
  console.error('usage: seed-dependency-graph.mjs --udb <path-to-riscv-unified-db> [--check]');
  process.exit(2);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.join(here, '..');
const GRAPH_PATH = path.join(repoRoot, 'src', 'isa-dependency-graph.json');

// ---------------------------------------------------------------------------
// UDB extraction
// ---------------------------------------------------------------------------

/**
 * Extension requirements reachable from a `requirements:` node, any shape.
 *
 * `allOf` members are hard requirements. `anyOf`/`oneOf` members are a CHOICE
 * and must not be flattened into the hard set — Svpbmt requires S and *one of*
 * Sv39/Sv48/Sv57, and demanding all three would over-constrain every config
 * that uses it.
 */
function extensionRequirements(requirements) {
  const hard = [];
  const choices = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string') return void hard.push(node.name);
    if ('allOf' in node) walk(node.allOf);
    for (const combinator of ['anyOf', 'oneOf']) {
      if (combinator in node) {
        const options = [];
        const collect = (n) => {
          if (Array.isArray(n)) return n.forEach(collect);
          if (n && typeof n === 'object') {
            if (typeof n.name === 'string') options.push(n.name);
            else for (const c of ['allOf', 'anyOf', 'oneOf']) if (c in n) collect(n[c]);
          }
        };
        collect(node[combinator]);
        if (options.length) choices.push(options);
      }
    }
  };
  walk(requirements?.extension);
  return { hard, choices };
}

function readUdb(root) {
  const dir = path.join(root, 'spec', 'std', 'isa', 'ext');
  const graph = {};
  const known = new Set();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const id = file.slice(0, -5);
    known.add(id);
    const doc = parseYaml(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!doc || typeof doc !== 'object') continue;
    const hard = new Set();
    const choices = [];
    for (const req of [doc.requirements, ...(doc.versions ?? []).map((v) => v?.requirements)]) {
      if (!req) continue;
      const found = extensionRequirements(req);
      found.hard.forEach((n) => hard.add(n));
      for (const options of found.choices) {
        const key = options.slice().sort().join('|');
        if (!choices.some((c) => c.slice().sort().join('|') === key)) choices.push(options);
      }
    }
    hard.delete(id); // a few files name themselves via version constraints
    if (hard.size || choices.length) {
      graph[id] = { hard: [...hard].sort(), choices };
    }
  }
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { /* not a git checkout — provenance degrades, extraction still works */ }
  return { graph, known, commit };
}

/** Extension ids in the shipped catalog. */
function readCatalogIds() {
  const cat = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'riscv_extensions.json'), 'utf8'));
  const ids = [];
  for (const group of Object.values(cat)) {
    if (Array.isArray(group)) group.forEach((e) => e?.id && ids.push(e.id));
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Edges we assert ourselves, where UDB is silent.
// Every entry needs a citation — an uncited edge is a guess wearing a fact's
// clothes, and this graph is meant to be auditable.
// ---------------------------------------------------------------------------
const LOCAL_EDGES = {
  Zdinx:    [{ ext: 'Zicsr', src: 'isa-manual', ref: 'Vol.I §21 — Zdinx uses the fcsr/frm/fflags CSRs' }],
  Zhinx:    [{ ext: 'Zicsr', src: 'isa-manual', ref: 'Vol.I §21 — Zhinx uses the fcsr/frm/fflags CSRs' }],
  Zhinxmin: [{ ext: 'Zicsr', src: 'isa-manual', ref: 'Vol.I §21 — Zhinxmin uses the fcsr/frm/fflags CSRs' }],
  Zfh:      [{ ext: 'Zfhmin', src: 'isa-manual', ref: 'Vol.I §16.2 — Zfh is a superset of Zfhmin' }],
  // clang implies zvfhmin for Zvfh, and Zvfh is the full vector half-precision
  // extension to Zvfhmin's conversion-only subset — the same superset relation
  // UDB *does* record for the scalar pair (Zfh -> Zfhmin). UDB's Zvfh.yaml
  // lists only Zve32f and Zfhmin, so this edge rests on clang plus the scalar
  // analogue rather than on UDB. Marked src:clang so the weaker backing shows.
  Zvfh:     [{ ext: 'Zvfhmin', src: 'clang', ref: 'clang -march=rv64i_zvfh implies +zvfhmin; UDB Zvfh.yaml is silent' }],
};

/** Base-ISA conflicts. Not dependencies, but they belong to the same graph. */
const CONFLICTS = {
  RV32E: [{ ext: 'F', ref: 'Vol.I §5 — RV32E has 16 GPRs and no F register file' }],
  RV64E: [{ ext: 'F', ref: 'Vol.I §5 — RV64E has 16 GPRs and no F register file' }],
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const { graph: udb, known: udbKnown, commit } = readUdb(udbRoot);
const catalogIds = readCatalogIds();

/**
 * Which option to auto-select when a choice group is unsatisfied. The weakest
 * option is the honest default: it is the minimum that satisfies the
 * requirement, so it never silently buys capability the user did not ask for.
 * Ordered weakest-first; the first member present in the group wins.
 */
const WEAKEST_FIRST = ['Sv32', 'Sv39', 'Sv48', 'Sv57'];
function pickDefault(options) {
  for (const candidate of WEAKEST_FIRST) if (options.includes(candidate)) return candidate;
  return options.slice().sort()[0];
}

const nodes = {};
for (const id of catalogIds.slice().sort((a, b) => a.localeCompare(b))) {
  const requires = [];
  for (const dep of udb[id]?.hard ?? []) {
    requires.push({ ext: dep, src: 'udb', ref: `${id}.yaml requirements.extension` });
  }
  for (const local of LOCAL_EDGES[id] ?? []) {
    if (requires.some((r) => r.ext === local.ext)) continue; // UDB already covers it
    requires.push({ ext: local.ext, src: local.src, ref: local.ref });
  }
  requires.sort((a, b) => a.ext.localeCompare(b.ext));

  const node = { requires };

  const choices = udb[id]?.choices ?? [];
  if (choices.length) {
    node.requiresOneOf = choices.map((options) => ({
      options: options.slice().sort(),
      default: pickDefault(options),
      src: 'udb',
      ref: `${id}.yaml requirements.extension.anyOf`,
    }));
  }

  if (CONFLICTS[id]) {
    node.conflicts = CONFLICTS[id].map((c) => ({ ext: c.ext, src: 'isa-manual', ref: c.ref }));
  }
  // How far to trust an empty `requires`. "udb" means UDB models this extension
  // and records no extension requirements; "none" means nothing authoritative
  // was consulted, so the emptiness is an assumption rather than a finding.
  if (requires.length === 0 && !node.requiresOneOf) {
    node.verified = udbKnown.has(id) ? 'udb' : 'none';
  }
  nodes[id] = node;
}

// Close the graph. UDB requires a few extensions our catalog does not carry
// (S -> Sm, for one), and an edge pointing at nothing is a validation error, so
// pull those in transitively. They are marked catalogued:false — they exist to
// keep traversal total, not because the UI offers them.
const pending = [];
const collectTargets = (node) => {
  for (const edge of node.requires ?? []) pending.push(edge.ext);
  for (const choice of node.requiresOneOf ?? []) pending.push(...choice.options);
};
Object.values(nodes).forEach(collectTargets);

while (pending.length) {
  const id = pending.pop();
  if (nodes[id]) continue;
  const requires = (udb[id]?.hard ?? []).map((dep) => ({
    ext: dep,
    src: 'udb',
    ref: `${id}.yaml requirements.extension`,
  }));
  const node = { requires, catalogued: false };
  if (udb[id]?.choices?.length) {
    node.requiresOneOf = udb[id].choices.map((options) => ({
      options: options.slice().sort(),
      default: pickDefault(options),
      src: 'udb',
      ref: `${id}.yaml requirements.extension.anyOf`,
    }));
  }
  if (requires.length === 0 && !node.requiresOneOf) {
    node.verified = udbKnown.has(id) ? 'udb' : 'none';
  }
  nodes[id] = node;
  collectTargets(node);
}

const graph = {
  $comment:
    'Dependency graph for RISC-V extensions. Source of truth, maintained by hand. ' +
    'Every catalog extension must appear here — tests/isa-graph.test.mjs enforces it. ' +
    'Reconcile against upstream with scripts/seed-dependency-graph.mjs --check.',
  version: 1,
  sources: {
    udb: { repo: 'riscv/riscv-unified-db', commit, path: 'spec/std/isa/ext' },
    'isa-manual': { repo: 'riscv/riscv-isa-manual', note: 'section cited per edge' },
  },
  // Sorted so a regeneration produces a reviewable diff rather than a reshuffle.
  nodes: Object.fromEntries(
    Object.keys(nodes).sort((a, b) => a.localeCompare(b)).map((id) => [id, nodes[id]]),
  ),
};

if (checkOnly) {
  if (!fs.existsSync(GRAPH_PATH)) {
    console.error(`no graph at ${GRAPH_PATH} — run without --check to seed it`);
    process.exit(1);
  }
  const committed = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8')).nodes ?? {};
  const summarize = (node) => {
    const hard = (node?.requires ?? []).map((r) => r.ext).sort();
    const choices = (node?.requiresOneOf ?? [])
      .map((c) => `one-of(${c.options.slice().sort().join('|')})`)
      .sort();
    return [...hard, ...choices].join(',');
  };
  const drift = [];
  for (const id of [...new Set([...Object.keys(nodes), ...Object.keys(committed)])].sort()) {
    const mine = summarize(committed[id]);
    const theirs = summarize(nodes[id]);
    if (mine !== theirs) drift.push(`  ${id}: committed [${mine || '-'}] vs upstream [${theirs || '-'}]`);
  }
  if (drift.length) {
    console.error(`upstream drift in ${drift.length} node(s):\n${drift.join('\n')}`);
    process.exit(1);
  }
  console.log(`no drift — ${Object.keys(nodes).length} nodes match UDB ${commit.slice(0, 8)}`);
} else {
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n');
  const withDeps = Object.values(nodes).filter((n) => n.requires.length).length;
  const unverified = Object.values(nodes).filter((n) => n.verified === 'none').length;
  console.log(`wrote ${path.relative(repoRoot, GRAPH_PATH)}`);
  console.log(`  ${Object.keys(nodes).length} nodes, ${withDeps} with dependencies`);
  console.log(`  ${unverified} with no dependencies and no authoritative source (verified: none)`);
}
