/**
 * Profiles are a starting point for a configuration, so they have to survive the
 * same journey a hand-built selection does: every member must exist, the graph
 * must resolve them without conflict, and the result must produce a -march
 * string a real toolchain accepts.
 *
 * That last step is the one that mattered. While `profiles` was a local const
 * inside the React component, nothing could check it — and all four profiles
 * generated a string clang rejects, because each mandates Sv39 and `sv39` is a
 * satp translation mode rather than an -march token. The clang check itself
 * lives in CI (scripts/emit-march-matrix.mjs); these tests cover everything
 * that does not need a toolchain installed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROFILES } from '../src/profiles.js';
import { resolveSelection } from '../src/isaGraph.js';
import { buildMarchString, NON_MARCH_IDS } from '../src/marchUtils.js';

const ALL = (() => {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'riscv_extensions.json');
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).flat().filter(Boolean);
})();
const CATALOG_IDS = new Set(ALL.map((e) => e.id));

const entries = Object.entries(PROFILES);

test('there are profiles to start from', () => {
  assert.ok(entries.length >= 4, `expected the ratified profiles, got ${entries.length}`);
});

for (const [name, members] of entries) {
  test(`${name}: every member exists in the catalog`, () => {
    const missing = members.filter((id) => !CATALOG_IDS.has(id));
    assert.deepEqual(missing, [], `${name} names extensions the catalog does not have: ${missing.join(', ')}`);
  });

  test(`${name}: names exactly one base ISA`, () => {
    const bases = members.filter((id) => /^RV(32|64|128)[IE]$/.test(id));
    assert.equal(bases.length, 1, `${name} should name one base ISA, found: ${bases.join(', ') || 'none'}`);
  });

  test(`${name}: resolves through the graph without conflict`, () => {
    const base = members.find((id) => /^RV(32|64|128)[IE]$/.test(id));
    const result = resolveSelection({ selected: members, base });
    assert.deepEqual(
      result.conflicts.map((c) => `${c.with} vs ${c.ext} (${c.path.join(' -> ')})`),
      [],
      `${name} resolves to a conflicting configuration`,
    );
    assert.deepEqual(result.unknown, [], `${name} references extensions the graph does not know`);
    // Resolution should never lose a mandated extension.
    for (const id of members) {
      assert.ok(result.resolved.includes(id), `${name}: ${id} vanished during resolution`);
    }
  });

  test(`${name}: produces a -march string`, () => {
    const base = members.find((id) => /^RV(32|64|128)[IE]$/.test(id));
    const { resolved } = resolveSelection({ selected: members, base });
    const { march } = buildMarchString(resolved.filter((id) => CATALOG_IDS.has(id)), ALL);
    assert.ok(march, `${name} produced no -march string`);
    assert.match(march, /^rv(32|64|128)[ie]/, `${name} -march does not start with a base: ${march}`);
    // clang parses `sv39` as extension `sv` at version 39 and rejects it. The
    // same holds for the other satp modes. CI proves this against a real
    // toolchain; here we just assert we never emit the token.
    for (const mode of ['sv32', 'sv39', 'sv48', 'sv57']) {
      assert.ok(
        !march.split('_').includes(mode),
        `${name} emits ${mode}, which no toolchain accepts as an -march extension`,
      );
    }
  });
}

test('satp translation modes are excluded from -march', () => {
  for (const mode of ['Sv32', 'Sv39', 'Sv48', 'Sv57']) {
    assert.ok(NON_MARCH_IDS.has(mode), `${mode} must not be emitted into -march`);
  }
  // The other Sv* extensions are real -march tokens and must stay emittable.
  for (const real of ['Svbare', 'Svade', 'Svnapot', 'Svpbmt', 'Svinval']) {
    assert.ok(!NON_MARCH_IDS.has(real), `${real} is a valid -march extension and should be emitted`);
  }
});
