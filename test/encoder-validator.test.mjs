import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIT_MASK_32,
  classifyOverlap,
  encodingToMatchMask,
  normalizePatternSource,
  normalizeProposedInput,
  overlapExampleWord,
  patternsOverlap,
} from '../src/encoder_validator.mjs';

const wordMatches = (word, match, mask) => (((word ^ match) & mask) & BIT_MASK_32) === 0n;

test('encodingToMatchMask derives a 32-bit pair from encoding text', () => {
  const result = encodingToMatchMask('00000000000000000000000000110011');
  assert.equal(result.error, null);
  assert.equal(result.match, 0x33n);
  assert.equal(result.mask, 0xffffffffn);
});

test('normalizeProposedInput rejects partial match/mask input', () => {
  const result = normalizeProposedInput({ encoding: '', match: '0x33', mask: '' });
  assert.equal(result.normalized, null);
  assert.deepEqual(result.errors, ['Provide both Match and Mask together.']);
});

test('normalizeProposedInput rejects match bits outside mask', () => {
  const result = normalizeProposedInput({ encoding: '', match: '0x33', mask: '0x7' });
  assert.equal(result.normalized, null);
  assert.ok(result.errors.includes('Match contains bits outside Mask.'));
});

test('normalizeProposedInput rejects mismatched encoding and match/mask', () => {
  const result = normalizeProposedInput({
    encoding: '-------------------------0110111',
    match: '0x00000017',
    mask: '0x0000007f',
  });
  assert.equal(result.normalized, null);
  assert.ok(result.errors.includes('Encoding does not match the provided Match/Mask.'));
});

test('normalizePatternSource flags inconsistent existing metadata', () => {
  const result = normalizePatternSource({
    encoding: '-------------------------0110111',
    match: '0x00000017',
    mask: '0x0000007f',
  });
  assert.ok(result.errors.includes('Encoding does not match the provided Match/Mask.'));
});

test('classifyOverlap distinguishes subset and partial overlap cases', () => {
  assert.equal(classifyOverlap(0x33n, 0x7fn, 0x33n, 0xffffffffn), 'existing_subset_of_proposed');
  assert.equal(classifyOverlap(0x33n, 0xffffffffn, 0x33n, 0x7fn), 'proposed_subset_of_existing');
  assert.equal(classifyOverlap(0x1n, 0x1n, 0x0n, 0x2n), 'partial_overlap');
});

test('overlapExampleWord produces a concrete witness for overlapping patterns', () => {
  const aMatch = 0x33n;
  const aMask = 0x7fn;
  const bMatch = 0x1033n;
  const bMask = 0x707fn;
  assert.equal(patternsOverlap(aMatch, aMask, bMatch, bMask), true);

  const word = overlapExampleWord(aMatch, aMask, bMatch, bMask);
  assert.equal(wordMatches(word, aMatch, aMask), true);
  assert.equal(wordMatches(word, bMatch, bMask), true);
});
