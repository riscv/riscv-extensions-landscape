/**
 * The graph is checked on every commit, in two ways.
 *
 * Structural: the shipped graph must be well formed and must cover every
 * extension in the catalog. That second half is the point — adding an extension
 * without adding its node fails the build, so the graph cannot quietly rot into
 * the stale table it replaced.
 *
 * Traversal: the walk must report what it did. Silent behaviour is the bug we
 * are fixing, so each traversal test asserts on the diagnostics, not just the
 * resulting set.
 *
 * Every validation rule also has a negative test built on a deliberately broken
 * fixture. A checker nobody has watched fail is a checker nobody knows works.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEPENDENCY_GRAPH,
  SMART_DEPENDENCIES,
  INCOMPATIBLE_WITH,
  validateGraph,
  resolveSelection,
  closure,
  explain,
} from '../src/isaGraph.js';

const catalogIds = (() => {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'riscv_extensions.json');
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = [];
  for (const group of Object.values(catalog)) {
    if (Array.isArray(group)) group.forEach((entry) => entry?.id && ids.push(entry.id));
  }
  return ids;
})();

/** Minimal well-formed graph for negative tests to corrupt. */
function fixture(nodes) {
  return { version: 1, nodes };
}
const cite = (ext, ref = 'test fixture') => ({ ext, src: 'udb', ref });

// ---------------------------------------------------------------------------
// The shipped graph
// ---------------------------------------------------------------------------

test('shipped graph is structurally valid', () => {
  const { errors, stats } = validateGraph(DEPENDENCY_GRAPH);
  assert.deepEqual(errors, [], `graph has structural errors:\n  ${errors.join('\n  ')}`);
  assert.ok(stats.nodes > 200, `expected the full catalog, got ${stats.nodes} nodes`);
  assert.ok(stats.edges > 0, 'graph has no edges at all');
});

test('every catalog extension has a graph node', () => {
  // The gate. A new extension without a node fails here, by design.
  const { errors } = validateGraph(DEPENDENCY_GRAPH, catalogIds);
  const missing = errors.filter((e) => e.includes('no graph node'));
  assert.deepEqual(missing, [], `extensions missing from the graph:\n  ${missing.join('\n  ')}`);
});

test('every edge cites a source', () => {
  for (const [id, node] of Object.entries(DEPENDENCY_GRAPH.nodes)) {
    for (const edge of node.requires ?? []) {
      assert.ok(edge.ref?.trim(), `${id} -> ${edge.ext} has no citation`);
      assert.ok(['udb', 'isa-manual', 'clang'].includes(edge.src), `${id} -> ${edge.ext} has src "${edge.src}"`);
    }
  }
});

test('known dependencies survived the move off the hand-written table', () => {
  // Spot-checks of edges the old table asserted, so a bad regeneration is loud.
  assert.deepEqual(SMART_DEPENDENCIES.D, ['F']);
  assert.ok(SMART_DEPENDENCIES.F.includes('Zicsr'), 'F -> Zicsr lost');
  assert.ok(SMART_DEPENDENCIES.Zfh.includes('Zfhmin'), 'Zfh -> Zfhmin lost');
  assert.ok(closure('Q').has('F'), 'Q should reach F transitively');
  assert.ok(INCOMPATIBLE_WITH.RV32E.includes('F'), 'RV32E/F conflict lost');
});

test('requirements nested under allOf are read, not skipped', () => {
  // UDB writes `requirements: {allOf: [{extension: {name: Zvl32b}}, {param: ...}]}`
  // as well as the flatter `requirements: {extension: {name: F}}`. Reading only
  // the second loses ~44 blocks, the whole Zvl*b chain among them.
  assert.deepEqual(SMART_DEPENDENCIES.Zvl64b, ['Zvl32b']);
  assert.deepEqual(SMART_DEPENDENCIES.Zvl128b, ['Zvl64b']);
  assert.ok(closure('Zvl1024b').has('Zvl32b'), 'the VLEN chain should be transitive');
  assert.deepEqual(SMART_DEPENDENCIES.Sv39, ['S']);
  assert.deepEqual(SMART_DEPENDENCIES.Za64rs, ['Za128rs']);
});

test('conditional requirements are not flattened into hard edges', () => {
  // C.yaml reads "Zca, and (not F or xlen 64 or Zcf), and (not D or Zcd)".
  // Flattening yields "C requires F and D", which is false — C is legal with
  // neither. Only the unconditional member is an edge.
  assert.deepEqual(SMART_DEPENDENCIES.C, ['Zca']);
  const c = DEPENDENCY_GRAPH.nodes.C;
  assert.equal(c.conditionalRequirements, true, 'C should be marked as having conditions we drop');

  // Supm and Zicfiss use if/then implications; only the unconditional part is an edge.
  assert.deepEqual(SMART_DEPENDENCIES.Supm, ['U']);
  assert.deepEqual(SMART_DEPENDENCIES.Zicfiss.sort(), ['Zaamo', 'Zicsr', 'Zimop']);
  assert.equal(DEPENDENCY_GRAPH.nodes.Zicfiss.conditionalRequirements, true);
});

test('what every branch of a choice requires is required outright', () => {
  // Zce's version block is a oneOf of three whole configurations that differ
  // only in xlen and F. All three demand Zca, Zcb, Zcmp and Zcmt, so those are
  // real edges — dropping the group entirely would understate them as zero.
  assert.deepEqual(SMART_DEPENDENCIES.Zce.sort(), ['Zca', 'Zcb', 'Zcmp', 'Zcmt']);
  const zce = DEPENDENCY_GRAPH.nodes.Zce;
  assert.equal(zce.conditionalRequirements, true, 'the branch-specific parts are still dropped');
  assert.equal(zce.verified, undefined, 'an unmodelled conditional is not a verified absence');
  // Nothing that appears in only some branches leaks in.
  assert.ok(!SMART_DEPENDENCIES.Zce.includes('F'), 'F is only in one branch');
  assert.ok(!SMART_DEPENDENCIES.Zce.includes('Zcf'), 'Zcf is only in one branch');
});

test('UDB negations become conflicts, not dependencies', () => {
  // Zfinx declares "Zicsr, and not F" — it replaces the F register file. Read
  // as a dependency this inverts into "Zfinx requires F", which would build an
  // architecturally invalid config.
  assert.deepEqual(SMART_DEPENDENCIES.Zfinx, ['Zicsr']);
  assert.deepEqual(INCOMPATIBLE_WITH.Zfinx, ['F']);
  assert.deepEqual(INCOMPATIBLE_WITH.Zhinxmin, ['Zfhmin']);
  assert.deepEqual(INCOMPATIBLE_WITH.Zcmp, ['Zcd']);

  // A negation inside a condition is NOT an absolute exclusion: C's
  // "anyOf[not F, xlen 64, Zcf]" does not make C incompatible with F.
  assert.equal(INCOMPATIBLE_WITH.C, undefined, 'C must not be marked incompatible with F');

  const result = resolveSelection({ selected: ['Zfinx', 'F'] });
  assert.ok(
    result.conflicts.some((c) => c.ext === 'F' && c.with === 'Zfinx'),
    `selecting Zfinx with F should conflict, got ${JSON.stringify(result.conflicts)}`,
  );
});

test('the Zvl divergence against clang is closed in the graph', () => {
  // clang and UDB both imply a minimum-VLEN token for the Zve* profiles; the
  // old table did not, and carried the gap in a KNOWN_DIVERGENCES ratchet.
  assert.ok(closure('Zve32x').has('Zvl32b'), 'Zve32x should require Zvl32b');
  assert.ok(closure('Zve64x').has('Zvl64b'), 'Zve64x should require Zvl64b');
  assert.ok(closure('V').has('Zvl32b'), 'V should reach Zvl32b transitively');
});

// ---------------------------------------------------------------------------
// Structural validation — negative tests
// ---------------------------------------------------------------------------

test('validation catches a dangling edge', () => {
  const { errors } = validateGraph(fixture({ A: { requires: [cite('Nope')] } }));
  assert.ok(errors.some((e) => e.includes('dangling edge')), `expected a dangling-edge error, got: ${errors}`);
});

test('validation catches a self-edge', () => {
  const { errors } = validateGraph(fixture({ A: { requires: [cite('A')] } }));
  assert.ok(errors.some((e) => e.includes('requires itself')), `got: ${errors}`);
});

test('validation catches a cycle', () => {
  const { errors } = validateGraph(fixture({
    A: { requires: [cite('B')] },
    B: { requires: [cite('C')] },
    C: { requires: [cite('A')] },
  }));
  const cycles = errors.filter((e) => e.startsWith('dependency cycle'));
  assert.equal(cycles.length, 1, `expected exactly one cycle, got: ${errors}`);
  assert.match(cycles[0], /A -> B -> C -> A/);
});

test('validation catches an uncited edge', () => {
  const { errors } = validateGraph(fixture({
    A: { requires: [{ ext: 'B', src: 'udb' }] },
    B: { requires: [], verified: 'udb' },
  }));
  assert.ok(errors.some((e) => e.includes('missing "ref"')), `got: ${errors}`);
});

test('validation catches an unknown provenance value', () => {
  const { errors } = validateGraph(fixture({
    A: { requires: [{ ext: 'B', src: 'vibes', ref: 'trust me' }] },
    B: { requires: [], verified: 'udb' },
  }));
  assert.ok(errors.some((e) => e.includes('is not one of')), `got: ${errors}`);
});

test('validation catches a one-of default outside its own options', () => {
  const { errors } = validateGraph(fixture({
    A: { requires: [], requiresOneOf: [{ options: ['B', 'C'], default: 'D', src: 'udb', ref: 'x' }] },
    B: { requires: [], verified: 'udb' },
    C: { requires: [], verified: 'udb' },
    D: { requires: [], verified: 'udb' },
  }));
  assert.ok(errors.some((e) => e.includes('is not among its options')), `got: ${errors}`);
});

test('validation catches a duplicate edge', () => {
  const { errors } = validateGraph(fixture({
    A: { requires: [cite('B'), cite('B')] },
    B: { requires: [], verified: 'udb' },
  }));
  assert.ok(errors.some((e) => e.includes('duplicate edge')), `got: ${errors}`);
});

test('a node with no dependencies and no verified marker warns but does not fail', () => {
  const { errors, warnings } = validateGraph(fixture({ A: { requires: [] } }));
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('checked, or assumed')), `got: ${warnings}`);
});

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

test('traversal reports what it implied, and why', () => {
  const result = resolveSelection({ selected: ['D'] });
  assert.ok(result.resolved.includes('F'), 'D should pull in F');
  assert.ok(result.resolved.includes('Zicsr'), 'and Zicsr transitively through F');
  assert.deepEqual(explain('F', result).split(' -> '), ['D', 'F']);
  assert.deepEqual(explain('Zicsr', result).split(' -> '), ['D', 'F', 'Zicsr']);
  assert.equal(explain('D', result), 'D was selected directly');
});

test('traversal explains a conflict with the path that caused it', () => {
  // The case that used to vanish silently: nothing the user picked is F, but
  // Zve64d reaches it through D, and RV32E has no F registers.
  const result = resolveSelection({ selected: ['Zve64d'], base: 'RV32E' });
  const conflict = result.conflicts.find((c) => c.ext === 'F');
  assert.ok(conflict, `expected an F conflict, got ${JSON.stringify(result.conflicts)}`);
  assert.equal(conflict.with, 'RV32E');
  assert.deepEqual(conflict.path, ['Zve64d', 'D', 'F']);
  assert.ok(conflict.ref.includes('GPR'), 'the conflict should carry its citation');
});

test('no conflict is reported when the base has no quarrel with the selection', () => {
  const result = resolveSelection({ selected: ['Zve64d'], base: 'RV64I' });
  assert.deepEqual(result.conflicts, []);
});

test('traversal flags a selection another selection already implies', () => {
  const result = resolveSelection({ selected: ['D', 'F'] });
  const redundant = result.redundant.find((r) => r.ext === 'F');
  assert.ok(redundant, `expected F to be redundant, got ${JSON.stringify(result.redundant)}`);
  assert.deepEqual(redundant.impliedBy, ['D']);
  // D itself is not redundant — nothing else selected implies it.
  assert.ok(!result.redundant.some((r) => r.ext === 'D'));
});

test('an unsatisfied one-of group applies its documented default', () => {
  const result = resolveSelection({ selected: ['Svpbmt'] });
  const choice = result.choices.find((c) => c.node === 'Svpbmt');
  assert.ok(choice, 'Svpbmt should present a choice group');
  assert.equal(choice.satisfiedBy, null, 'nothing in the selection satisfies it');
  assert.equal(choice.applied, 'Sv39', 'the weakest option is the honest default');
  assert.ok(result.resolved.includes('Sv39'));
});

test('a one-of group already satisfied does not add the default', () => {
  const result = resolveSelection({ selected: ['Svpbmt', 'Sv48'] });
  const choice = result.choices.find((c) => c.node === 'Svpbmt');
  assert.equal(choice.satisfiedBy, 'Sv48');
  assert.equal(choice.applied, null, 'must not pull in Sv39 when Sv48 already satisfies the group');
});

test('one-of defaults can be turned off for callers that want to prompt', () => {
  const result = resolveSelection({ selected: ['Svpbmt'], applyChoiceDefaults: false });
  const choice = result.choices.find((c) => c.node === 'Svpbmt');
  assert.equal(choice.applied, null);
  assert.ok(!result.resolved.includes('Sv39'), 'nothing should be auto-added');
});

test('an unknown extension is reported, not thrown', () => {
  const result = resolveSelection({ selected: ['Znotreal', 'D'] });
  assert.ok(result.unknown.some((u) => u.ext === 'Znotreal'));
  assert.ok(result.resolved.includes('F'), 'the rest of the selection still resolves');
});

test('traversal survives a cyclic graph instead of hanging', () => {
  const cyclic = fixture({
    A: { requires: [cite('B')] },
    B: { requires: [cite('A')] },
  });
  const result = resolveSelection({ selected: ['A'], graph: cyclic });
  assert.deepEqual(result.resolved.sort(), ['A', 'B']);
  assert.deepEqual([...closure('A', cyclic)].sort(), ['B']);
});

test('the implied path is the shortest one', () => {
  // C is reachable as A->C and as A->B->C; the explanation should be the former.
  const graph = fixture({
    A: { requires: [cite('B'), cite('C')] },
    B: { requires: [cite('C')] },
    C: { requires: [], verified: 'udb' },
  });
  const result = resolveSelection({ selected: ['A'], graph });
  assert.deepEqual(explain('C', result).split(' -> '), ['A', 'C']);
});
