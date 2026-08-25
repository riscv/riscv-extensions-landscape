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

test('extensions that define no new opcodes carry their pseudo-instructions', () => {
  // Zihintpause, Zihintntl, Zicntr, Zicfilp and Zicbop introduce no encodings of
  // their own; they name specific encodings of existing instructions. They read
  // as empty extensions unless those aliases are carried explicitly.
  const byId = new Map(entries.map((e) => [e.id, e]));
  const expected = {
    Zihintpause: { count: 1, alias: 'FENCE' },
    Zihintntl: { count: 4, alias: 'ADD' },
    Zicntr: { count: 6, alias: 'CSRRS' },
    Zicfilp: { count: 1, alias: 'AUIPC' },
    Zicbop: { count: 3, alias: 'ORI' },
  };

  for (const [id, { count, alias }] of Object.entries(expected)) {
    const entry = byId.get(id);
    assert.ok(entry, `${id} is missing from the catalogue`);
    const instructions = Object.entries(entry.instructions || {});
    assert.equal(instructions.length, count, `${id} should carry ${count} instruction(s)`);

    // Each must record what it aliases. Without that the encoding looks wrong,
    // since PAUSE decodes as a FENCE, and the validator's overlap against the
    // base instruction reads as a data error rather than as a fact.
    for (const [mnemonic, details] of instructions) {
      assert.equal(
        details.alias_of, alias,
        `${id}.${mnemonic} should record alias_of ${alias}, got ${details.alias_of ?? 'nothing'}`,
      );
    }
  }
});

test('a mnemonic never carries two different encodings', () => {
  // Guards the case deliberately left out: rv32_zclsd redefines c.ld and c.sd
  // onto the C.FLW/C.FSW encodings for RV32, while Zca already defines those
  // mnemonics for RV64. Importing that pair would leave one mnemonic meaning
  // two different things depending on XLEN, so it stays out until represented
  // properly. This fails if someone imports it without making that decision.
  // One legitimate exception, and it is worth naming rather than loosening the
  // rule around. The shift-immediate instructions genuinely differ by XLEN:
  // RV32 takes a 5-bit shamt so bit 25 must be zero (mask 0xfe00707f), RV64
  // takes 6 bits (0xfc00707f). Same mnemonic, same meaning, different width.
  // See the RV32 shift-mask injection in scripts/sync_instructions.mjs and
  // ISA Vol I section 2.6. That is different in kind from the Zclsd case, where
  // the mnemonic would mean a different operation depending on XLEN.
  const XLEN_VARIANTS = new Set(['SLLI', 'SRLI', 'SRAI']);

  const byMnemonic = new Map();
  for (const e of entries) {
    for (const [m, d] of Object.entries(e.instructions || {})) {
      if (!d.match || !d.mask) continue;
      const prev = byMnemonic.get(m);
      if (prev && (prev.match !== d.match || prev.mask !== d.mask)) {
        // A width-only difference on a known shift instruction is expected.
        const widthOnly = XLEN_VARIANTS.has(m.toUpperCase()) && prev.match === d.match;
        assert.ok(
          widthOnly,
          `${m} has two different encodings: ${prev.ext} says ${prev.match}/${prev.mask}, `
          + `${e.id} says ${d.match}/${d.mask}`,
        );
        continue;
      }
      if (!prev) byMnemonic.set(m, { match: d.match, mask: d.mask, ext: e.id });
    }
  }
});

test('ratification labelling does not regress', () => {
  // A reader has to be able to tell a ratified extension from a proposal. With
  // no state field, Zvabd's instructions read exactly as settled as Zbb's,
  // which is the same hazard as publishing a withdrawn encoding.
  const labelled = entries.filter((e) => e.state);
  assert.ok(
    labelled.length >= 165,
    `expected at least 165 extensions to carry a ratification state, found ${labelled.length}`,
  );

  // Dates are year-month, as UDB records them.
  for (const e of labelled) {
    if (!e.ratification_date) continue;
    assert.match(
      String(e.ratification_date), /^\d{4}-\d{2}$/,
      `${e.id} has ratification_date ${e.ratification_date}, expected YYYY-MM`,
    );
  }
});

test('the ratified base ISAs are labelled ratified', () => {
  // UDB models the base integer ISA as one extension, I, parameterised by XLEN,
  // so the concrete bases a reader looks for come back unlabelled without an
  // explicit alias. Left that way they read as though their status were in
  // doubt, which is wrong: I was ratified in 2019.
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of ['RV32I', 'RV64I']) {
    const entry = byId.get(id);
    assert.ok(entry, `${id} is missing from the catalogue`);
    assert.equal(entry.state, 'ratified', `${id} should be labelled ratified`);
  }
});

test('an extension that ships instructions is never left unlabelled', () => {
  // Policy, now enforceable: if a reader can see encodings, they can see
  // whether the thing is ratified. Zvfofp8min was the last holdout — three real
  // encodings reading as "status unconfirmed" — and it is a draft: zero
  // mentions in the ratified unprivileged manual and no UDB entry.
  const unlabelled = entries
    .filter((e) => Object.keys(e.instructions || {}).length > 0 && !e.state)
    .map((e) => `${e.id} (${Object.keys(e.instructions).length} instructions)`);
  assert.deepEqual(unlabelled, [], 'these ship encodings with no ratification status');
});

test('Sm exists and owns MRET and WFI', () => {
  // The catalogue had 25 Sm-prefixed entries and no Sm, so the two most basic
  // machine-mode instructions were in instr_dict.json and reachable from
  // nowhere. UDB defines both as `definedBy: extension: name: Sm`, and the
  // privileged manual carries them 17 and 33 times respectively.
  const sm = entries.find((e) => e.id === 'Sm');
  assert.ok(sm, 'Sm is missing; MRET and WFI have no home without it');
  assert.equal(sm.state, 'ratified');
  for (const m of ['MRET', 'WFI']) {
    assert.ok(sm.instructions[m], `Sm should own ${m}`);
  }
});

test('the E bases are labelled ratified, locally', () => {
  // These carry a state that no sync produced, and that is deliberate.
  // riscv-unified-db has no E extension under any name and riscv-opcodes has no
  // rv_e tag, so both syncs are silent and the entries fell through to the
  // panel's "Status unconfirmed" badge — which was honest about the gap but
  // understated what the specification says. The chapter is titled "RV32E and
  // RV64E Base Integer Instruction Sets, Version 2.0" and sits in the ratified
  // library, covering both bases in one place.
  //
  // No ratification_date: the chapter gives a version, not a date, and an
  // invented one would be the RV128I mistake in a new costume.
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of ['RV32E', 'RV64E']) {
    const entry = byId.get(id);
    assert.ok(entry, `${id} is missing from the catalogue`);
    assert.equal(entry.state, 'ratified', `${id} should be labelled ratified`);
    assert.equal(entry.ratification_date, undefined, `${id} has no date we can source`);
  }

  // One chapter covers both, so sharing its URL is correct rather than sloppy.
  assert.equal(byId.get('RV64E').url, byId.get('RV32E').url);
});

test('RV128I is not labelled ratified, because it is not', () => {
  // This test used to assert the opposite. RV128I inherited I's ratification
  // because it is aliased onto I, but that 2019-06 ratification covers RV32I
  // and RV64I. The RV128 chapter carries version 1.7 against the bases' 2.1 and
  // says so directly: "We have not frozen the RV128 spec at this time, as there
  // might be need to evolve the design based on actual usage of 128-bit address
  // spaces."
  const rv128 = entries.find((e) => e.id === 'RV128I');
  assert.ok(rv128, 'RV128I is missing from the catalogue');
  assert.notEqual(rv128.state, 'ratified');
  assert.equal(rv128.state, 'draft');
  assert.equal(rv128.ratification_date, undefined, 'it has no ratification to date');
  assert.match(rv128.url, /rv128\.html$/, 'it should link to its own chapter');
});

test('RV128I does not borrow another extension\'s instruction set', () => {
  // It carried RV64I's 52 instructions verbatim, each stamped extension
  // ["rv64_i"], and none of the instructions RV128 actually defines — LQ, SQ,
  // LDU, or the *D family. Neither riscv-opcodes nor riscv-unified-db models
  // RV128, so there is nothing to sync; showing RV64I's set in its place was
  // the one answer that is certainly wrong.
  const rv128 = entries.find((e) => e.id === 'RV128I');
  assert.deepEqual(Object.keys(rv128.instructions || {}), []);

  // No routing tags either: `tags` is what pulls an upstream tag's instructions
  // onto an entry, so leaving rv64_i here would repopulate it on the next sync.
  assert.equal(rv128.tags, undefined, 'RV128I must not route to an upstream tag');
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
