import assert from 'node:assert/strict';

import {
  normalizeTag,
  expandGExtension,
  MANUAL_OVERRIDES,
  normalizeTagCandidates,
} from '../tag_normalizer.mjs';

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}

runTest('normalizes rv_zba to zba', () => {
  assert.equal(normalizeTag('rv_zba'), 'zba');
});

runTest('normalizes rv64_zba to zba', () => {
  assert.equal(normalizeTag('rv64_zba'), 'zba');
});

runTest('normalizes Zba to zba', () => {
  assert.equal(normalizeTag('Zba'), 'zba');
});

runTest('expands G to canonical component list', () => {
  assert.deepEqual(expandGExtension('G'), ['i', 'm', 'a', 'f', 'd', 'zicsr', 'zifencei']);
});

runTest('applies manual overrides', () => {
  assert.equal(MANUAL_OVERRIDES.rv_svinval_h, 'svinval');
  assert.equal(normalizeTag('rv_svinval_h'), 'svinval');
});

runTest('unknown tags pass through with warning when enabled', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(String(msg));

  try {
    const normalized = normalizeTag('rv_unknown_foo', {
      warnUnknown: true,
      knownCatalogTags: new Set(['zba', 'zicsr']),
    });
    assert.equal(normalized, 'unknown');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /unresolved tag/i);
  } finally {
    console.warn = originalWarn;
  }
});

runTest('throws on empty or invalid inputs', () => {
  assert.throws(() => normalizeTag(''), /cannot be empty/i);
  assert.throws(() => normalizeTag(42), /must be a string/i);
});

runTest('candidate normalization expands G and returns singleton for non-G', () => {
  assert.deepEqual(normalizeTagCandidates('g'), ['i', 'm', 'a', 'f', 'd', 'zicsr', 'zifencei']);
  assert.deepEqual(normalizeTagCandidates('rv_zicsr'), ['zicsr']);
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error('tag_normalizer tests failed.');
}
