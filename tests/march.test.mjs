/**
 * Unit tests for src/marchUtils.js — the -march generator and dependency table.
 *
 * These are pure-function tests: marchUtils imports no React and no JSON, and
 * takes the flat extension array as a parameter, so it can be exercised
 * directly with no DOM and no fixtures beyond the catalog itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildMarchString,
  parseMarchString,
  SMART_DEPENDENCIES,
  INCOMPATIBLE_WITH,
  NON_MARCH_IDS,
} from '../src/marchUtils.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '..', 'src', 'riscv_extensions.json'), 'utf8'));
const ALL = Object.values(catalog).flat();

const march = (ids) => buildMarchString(ids, ALL);

// ---------------------------------------------------------------------------
// Canonical generation — these encode spec §27 rules and must always hold.
// ---------------------------------------------------------------------------

test('emits canonical single-letter order, base letter not repeated', () => {
  const r = march(['RV64I', 'M', 'A', 'F', 'D', 'C']);
  assert.equal(r.march, 'rv64imafdc');
});

test('multi-letter tokens are underscore-prefixed and alphabetical', () => {
  const r = march(['RV64I', 'M', 'Zbb', 'Zba', 'Zicsr']);
  assert.equal(r.march, 'rv64im_zba_zbb_zicsr');
});

test('never emits the g shorthand', () => {
  const r = march(['RV64I', 'M', 'A', 'F', 'D', 'Zicsr', 'Zifencei']);
  assert.ok(!/(^|[^a-z])g([^a-z]|$)/.test(r.march), `g leaked into ${r.march}`);
});

test('decoder expands g, encoder round-trips to explicit tokens', () => {
  const p = parseMarchString('rv64gc', ALL);
  assert.equal(p.xlen, 64);
  assert.ok(p.gExpanded, 'g should be flagged as expanded');
  const r = march(p.resolvedIds);
  assert.ok(!r.march.includes('g'), `re-encoded string still contains g: ${r.march}`);
});

test('requires a base ISA', () => {
  const r = march(['M', 'A']);
  assert.equal(r.march, null);
  assert.match(r.warnings.join(' '), /base ISA/i);
});

test('UI-only grouping tags are excluded, not emitted', () => {
  for (const tag of NON_MARCH_IDS) {
    const r = march(['RV64I', tag]);
    assert.ok(
      r.excluded.some((e) => e.id === tag),
      `${tag} should appear in excluded[]`,
    );
    assert.ok(!r.march.includes(tag.toLowerCase()), `${tag} leaked into ${r.march}`);
  }
});

test('privileged spec version tags are excluded', () => {
  const r = march(['RV64I', 'Sm1p12']);
  assert.ok(r.excluded.some((e) => e.id === 'Sm1p12'));
});

// ---------------------------------------------------------------------------
// Dependency table integrity
// ---------------------------------------------------------------------------

test('every dependency target exists in the catalog', () => {
  const ids = new Set(ALL.map((e) => e.id));
  const missing = [];
  for (const [ext, deps] of Object.entries(SMART_DEPENDENCIES)) {
    for (const d of deps) if (!ids.has(d)) missing.push(`${ext} -> ${d}`);
  }
  assert.deepEqual(missing, [], `dependencies pointing at non-existent extensions:\n  ${missing.join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// Known defects — these are expected to FAIL until fixed.
// Each corresponds to a review finding on PR #139.
// ---------------------------------------------------------------------------

test('[defect] E-base and F are rejected as incompatible', () => {
  // INCOMPATIBLE_WITH declares RV32E/RV64E incompatible with F, but nothing
  // consults the table, so an invalid string is produced silently.
  assert.ok(INCOMPATIBLE_WITH.RV32E.includes('F'), 'table should declare the conflict');
  const r = march(['RV32E', 'F']);
  assert.ok(
    r.march === null || r.excluded.some((e) => e.id === 'F') || r.warnings.length > 0,
    `RV32E + F produced "${r.march}" with no warning or exclusion`,
  );
});

test('[defect] I and E cannot both be selected', () => {
  // buildMarchString filters only the base's own letter, so an E base with I
  // also selected yields rv32ei..., which no toolchain accepts.
  const r = march(['RV32E', 'I']);
  assert.ok(
    !/^rv32ei/.test(r.march ?? ''),
    `produced mutually exclusive base letters: ${r.march}`,
  );
});

test('[defect] F implies Zicsr', () => {
  // F defines fcsr/frm/fflags, so it depends on Zicsr; GCC's riscv_ext_info
  // encodes the same implication. Absent here, a config with F but no Zicsr
  // resolves without complaint.
  assert.ok(
    SMART_DEPENDENCIES.F?.includes('Zicsr'),
    'SMART_DEPENDENCIES has no F -> Zicsr entry',
  );
});

test('decoder handles extension version suffixes on base and sub-extensions (RISC-V §27)', () => {
  // Single-letter extensions with versions (e.g. GCC/Clang rv64i2p0)
  const p1 = parseMarchString('rv64i2p0', ALL);
  assert.equal(p1.xlen, 64);
  assert.deepEqual(p1.resolvedIds, ['RV64I']);
  assert.deepEqual(p1.unknownTokens, []);
  assert.equal(p1.warnings.length, 0);

  // Single-letter multi-extension head with versions
  const p2 = parseMarchString('rv32i2p1m2p0c2p0', ALL);
  assert.equal(p2.xlen, 32);
  assert.deepEqual(p2.resolvedIds, ['RV32I', 'M', 'C']);
  assert.deepEqual(p2.unknownTokens, []);

  // Multi-letter extensions with versions
  const p3 = parseMarchString('rv64i2p1_zba1p0_zbb1p0_zicsr2p0', ALL);
  assert.equal(p3.xlen, 64);
  assert.deepEqual(p3.resolvedIds, ['RV64I', 'Zba', 'Zbb', 'Zicsr']);
  assert.deepEqual(p3.unknownTokens, []);

  // Unrecognized extensions retain version suffix in unknownTokens
  const p4 = parseMarchString('rv64i_unknown1p0', ALL);
  assert.equal(p4.xlen, 64);
  assert.deepEqual(p4.resolvedIds, ['RV64I']);
  assert.deepEqual(p4.unknownTokens, ['unknown1p0']);
});
