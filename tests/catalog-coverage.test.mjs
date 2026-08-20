/**
 * Coverage invariants for the extension catalogue.
 *
 * Context, because the raw numbers mislead: 125 of 227 entries have neither
 * instructions nor CSRs, and that is mostly correct. Umbrellas and aliases
 * (K, N, P, Zve, Zvf), VLEN parameter entries (Zvl32b ... Zvl1024b) and
 * behavioural guarantees (Zkt, which promises data-independent timing and
 * defines nothing) all legitimately carry no encodings.
 *
 * So this does not assert "every extension has content", which would be false,
 * and it does not carry a 125-entry allowlist, which would be unmaintainable
 * fiction. It asserts what is actually knowable, each case having caught or
 * being able to catch a real defect:
 *
 *   1. A tag that yields nothing is a broken mapping, not an empty extension.
 *   2. An umbrella that resolves to nothing means its members went stale.
 *   3. CSR coverage is a ratchet, so a sync regression cannot pass silently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const catalog = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'src', 'riscv_extensions.json'), 'utf8'),
);

const entries = [];
(function collect(node) {
  if (Array.isArray(node)) node.forEach(collect);
  else if (node && typeof node === 'object') {
    if (node.id && node.desc) entries.push(node);
    Object.values(node).forEach(collect);
  }
}(catalog));

const instructionCount = (e) => Object.keys(e.instructions || {}).length;
const csrCount = (e) => Object.keys(e.csrs || {}).length;

test('the catalogue is non-trivial', () => {
  assert.ok(entries.length > 200, `expected the full catalogue, found ${entries.length} entries`);
});

test('every tagged extension yields instructions or CSRs', () => {
  // A tag exists to route upstream data onto an entry. One that routes nothing
  // is either a typo or a tag upstream has since renamed, and it fails
  // silently: the extension just looks empty. This is the #8 / #107 failure.
  const barren = entries
    .filter((e) => (e.tags || []).length > 0)
    .filter((e) => instructionCount(e) === 0 && csrCount(e) === 0)
    .map((e) => `${e.id} [${e.tags.join(', ')}]`);

  assert.deepEqual(
    barren, [],
    'these entries carry tags that resolved to nothing, so the tag is wrong or upstream renamed it:\n  '
      + barren.join('\n  '),
  );
});

test('every umbrella resolves to instructions', () => {
  // Umbrellas take their content from `members`. One resolving to nothing means
  // a member id no longer exists, which the sync cannot detect by itself.
  const hollow = entries
    .filter((e) => (e.members || []).length > 0)
    .filter((e) => instructionCount(e) === 0)
    .map((e) => `${e.id} <- ${e.members.join(', ')}`);

  assert.deepEqual(hollow, [], `umbrella extensions resolved to no instructions:\n  ${hollow.join('\n  ')}`);
});

test('umbrella members all exist', () => {
  const ids = new Set(entries.map((e) => e.id));
  const dangling = [];
  for (const e of entries) {
    for (const m of e.members || []) if (!ids.has(m)) dangling.push(`${e.id} -> ${m}`);
  }
  assert.deepEqual(dangling, [], `umbrella members that are not catalogue entries:\n  ${dangling.join('\n  ')}`);
});

test('CSR coverage does not regress', () => {
  // Ratchet. CSRs come from riscv-unified-db via scripts/sync_udb_extensions.cjs,
  // and the two ways that sync silently under-delivered are worth pinning:
  // reading only the top level of csr/ (85 of 396 files, so F, V and Zihpm came
  // back empty), and matching definedBy as text rather than as structure (which
  // filed mstatus under both V and F).
  const withCsrs = entries.filter((e) => csrCount(e) > 0);
  const total = withCsrs.reduce((n, e) => n + csrCount(e), 0);

  assert.ok(
    withCsrs.length >= 30,
    `expected at least 30 extensions with CSRs, found ${withCsrs.length}`,
  );
  assert.ok(total >= 234, `expected at least 234 CSRs in total, found ${total}`);
});

test('CSRs land on the extension a reader would look under', () => {
  // Spot checks with unambiguous answers. Each of these was wrong at some point
  // during the sync work, so they are worth naming explicitly.
  const byId = new Map(entries.map((e) => [e.id, e]));
  const expected = {
    F: ['fcsr', 'fflags', 'frm'],
    V: ['vl', 'vtype', 'vlenb'],
    Zicntr: ['cycle', 'instret', 'time'],
    S: ['satp'],
  };

  for (const [id, names] of Object.entries(expected)) {
    const entry = byId.get(id);
    assert.ok(entry, `${id} is missing from the catalogue`);
    const have = new Set(Object.keys(entry.csrs || {}).map((n) => n.toLowerCase()));
    for (const n of names) {
      assert.ok(have.has(n), `${id} should list the ${n.toUpperCase()} CSR`);
    }
  }

  // And the inverse. MSTATUS is a machine CSR; it declares a conditional
  // relationship to V and F because it carries the VS and FS fields, which a
  // text-matching parser mistook for ownership.
  for (const id of ['V', 'F']) {
    const have = new Set(Object.keys(byId.get(id)?.csrs || {}).map((n) => n.toLowerCase()));
    assert.ok(!have.has('mstatus'), `${id} must not claim the MSTATUS CSR`);
  }
});

test('no unratified draft instructions are published', () => {
  // Wrong data is worse than missing data in a reference: a fabricated encoding
  // can be implemented against. These are draft bitmanip operations that were
  // dropped before ratification, and our vendored instr_dict still tagged the
  // first four rv_zbb / rv64_zbb, so they appeared inside a ratified extension.
  // Zbp was never ratified at all: it is 404 upstream and absent from UDB.
  const withdrawn = [
    'SLO', 'SLOI', 'SRO', 'SROI',                       // draft Zbb shift-ones
    'GORCI', 'GREVI', 'SHFLI', 'UNSHFLI',               // draft Zbp
    'XPERM16', 'XPERM32',                               // draft Zbp
  ];
  const published = [];
  for (const e of entries) {
    for (const m of Object.keys(e.instructions || {})) {
      if (withdrawn.includes(m.toUpperCase())) published.push(`${e.id}.${m}`);
    }
  }
  assert.deepEqual(
    published, [],
    `these instructions were withdrawn before ratification and must not ship:\n  ${published.join('\n  ')}`,
  );
});

test('Zbb matches the ratified instruction set', () => {
  // The concrete symptom of the above: Zbb read 28 instructions instead of 24.
  const zbb = entries.find((e) => e.id === 'Zbb');
  assert.ok(zbb, 'Zbb is missing from the catalogue');
  assert.equal(
    Object.keys(zbb.instructions || {}).length, 24,
    'ratified Zbb has 24 instructions across RV32 and RV64',
  );
});

test('extension ids are unique', () => {
  const seen = new Set();
  const dupes = [];
  for (const e of entries) {
    if (seen.has(e.id)) dupes.push(e.id);
    seen.add(e.id);
  }
  assert.deepEqual(dupes, [], `duplicate extension ids: ${dupes.join(', ')}`);
});
