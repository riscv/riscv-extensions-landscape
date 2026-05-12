/**
 * Unit tests for src/utils/search.js
 *
 * Covers: instructionMatchesQuery — mnemonic, hex, encoding, field matching.
 */

const { instructionMatchesQuery } = require('../../src/utils/search');

describe('instructionMatchesQuery', () => {
  const sampleDetails = {
    encoding: '0000000----------000-----0110011',
    variable_fields: ['rd', 'rs1', 'rs2'],
    extension: ['rv_i'],
    match: '0x00000033',
    mask: '0xfe00707f',
  };

  // ---- Mnemonic matching ----
  test('matches mnemonic substring (case-insensitive)', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, 'add')).toBe(true);
  });

  test('matches partial mnemonic', () => {
    expect(instructionMatchesQuery('AMOSWAP.W', null, 'swap')).toBe(true);
  });

  test('does not match unrelated query against mnemonic', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, 'mul')).toBe(false);
  });

  // ---- Hex field matching ----
  test('matches match hex value', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, '0x00000033')).toBe(true);
  });

  test('matches partial mask hex value', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, '707f')).toBe(true);
  });

  // ---- Encoding string matching ----
  test('matches encoding pattern substring', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, '0110011')).toBe(true);
  });

  // ---- Variable fields matching ----
  test('matches variable field name', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, 'rs2')).toBe(true);
  });

  test('matches extension tag', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, 'rv_i')).toBe(true);
  });

  // ---- Edge cases ----
  test('returns false for empty query', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, '')).toBe(false);
  });

  test('returns false for whitespace-only query', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, '   ')).toBe(false);
  });

  test('returns false for null query', () => {
    expect(instructionMatchesQuery('ADD', sampleDetails, null)).toBe(false);
  });

  test('handles null details gracefully (mnemonic-only match)', () => {
    expect(instructionMatchesQuery('ADD', null, 'add')).toBe(true);
    expect(instructionMatchesQuery('ADD', null, 'rs2')).toBe(false);
  });

  test('handles details with missing fields', () => {
    const partial = { encoding: '0000000----------000-----0110011' };
    expect(instructionMatchesQuery('ADD', partial, '0110011')).toBe(true);
    expect(instructionMatchesQuery('ADD', partial, 'rs2')).toBe(false);
  });

  test('handles non-object details gracefully', () => {
    expect(instructionMatchesQuery('ADD', 'not-an-object', 'add')).toBe(true);
    expect(instructionMatchesQuery('ADD', 42, 'rs2')).toBe(false);
  });
});
