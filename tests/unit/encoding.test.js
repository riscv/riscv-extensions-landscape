/**
 * Unit tests for src/utils/encoding.js
 *
 * Covers: encoding ↔ match/mask conversion, hex normalization,
 * BigInt parsing, pattern overlap/subset detection.
 */

const {
  BIT_MASK_32,
  normalizeMnemonicKey,
  normalizeHexString,
  parseHexToBigInt,
  toHex32,
  normalizeEncodingString,
  encodingToMatchMask,
  matchMaskToEncoding,
  patternsOverlap,
  isSubsetPattern,
  overlapExampleWord,
} = require('../../src/utils/encoding');

// ---------------------------------------------------------------------------
// normalizeMnemonicKey
// ---------------------------------------------------------------------------
describe('normalizeMnemonicKey', () => {
  test('trims and uppercases a simple mnemonic', () => {
    expect(normalizeMnemonicKey('  sc.w  ')).toBe('SC.W');
  });

  test('takes only the first token when whitespace is present', () => {
    expect(normalizeMnemonicKey('add x0, x1')).toBe('ADD');
  });

  test('returns empty string for null/undefined', () => {
    expect(normalizeMnemonicKey(null)).toBe('');
    expect(normalizeMnemonicKey(undefined)).toBe('');
  });

  test('handles numeric input gracefully', () => {
    expect(normalizeMnemonicKey(42)).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// normalizeHexString
// ---------------------------------------------------------------------------
describe('normalizeHexString', () => {
  test('adds 0x prefix when missing', () => {
    expect(normalizeHexString('ff')).toBe('0xff');
  });

  test('lowercases existing 0x prefix', () => {
    expect(normalizeHexString('0xFF')).toBe('0xff');
  });

  test('returns empty string for null/undefined/empty', () => {
    expect(normalizeHexString(null)).toBe('');
    expect(normalizeHexString(undefined)).toBe('');
    expect(normalizeHexString('')).toBe('');
    expect(normalizeHexString('   ')).toBe('');
  });

  test('handles full 32-bit hex value', () => {
    expect(normalizeHexString('0xFE00707F')).toBe('0xfe00707f');
  });
});

// ---------------------------------------------------------------------------
// parseHexToBigInt
// ---------------------------------------------------------------------------
describe('parseHexToBigInt', () => {
  test('parses valid hex with prefix', () => {
    expect(parseHexToBigInt('0x67')).toBe(0x67n);
  });

  test('parses valid hex without prefix', () => {
    expect(parseHexToBigInt('ff')).toBe(0xffn);
  });

  test('parses full 32-bit value', () => {
    expect(parseHexToBigInt('0xfe00707f')).toBe(0xfe00707fn);
  });

  test('returns null for empty/null/undefined', () => {
    expect(parseHexToBigInt(null)).toBeNull();
    expect(parseHexToBigInt(undefined)).toBeNull();
    expect(parseHexToBigInt('')).toBeNull();
  });

  test('returns null for invalid hex', () => {
    expect(parseHexToBigInt('0xZZZZ')).toBeNull();
    expect(parseHexToBigInt('not-a-hex')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toHex32
// ---------------------------------------------------------------------------
describe('toHex32', () => {
  test('formats zero with leading zeros', () => {
    expect(toHex32(0n)).toBe('0x00000000');
  });

  test('formats a known instruction match value', () => {
    expect(toHex32(0x67n)).toBe('0x00000067');
  });

  test('formats a full 32-bit value', () => {
    expect(toHex32(0xffffffffn)).toBe('0xffffffff');
  });

  test('masks values beyond 32 bits', () => {
    expect(toHex32(0x1ffffffffn)).toBe('0xffffffff');
  });

  test('handles null/undefined as zero', () => {
    expect(toHex32(null)).toBe('0x00000000');
    expect(toHex32(undefined)).toBe('0x00000000');
  });
});

// ---------------------------------------------------------------------------
// normalizeEncodingString
// ---------------------------------------------------------------------------
describe('normalizeEncodingString', () => {
  test('strips whitespace from encoding', () => {
    expect(normalizeEncodingString('0001 1--- ---- ---- -010 ---- -010 1111'))
      .toBe('00011------------010-----0101111');
  });

  test('returns empty string for null/undefined', () => {
    expect(normalizeEncodingString(null)).toBe('');
    expect(normalizeEncodingString(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// encodingToMatchMask
// ---------------------------------------------------------------------------
describe('encodingToMatchMask', () => {
  test('converts a known JALR encoding correctly', () => {
    // JALR: -----------------000-----1100111
    const encoding = '-----------------000-----1100111';
    const result = encodingToMatchMask(encoding);
    expect(result.error).toBeNull();
    expect(result.match).toBe(0x67n);
    expect(result.mask).toBe(0x707fn);
  });

  test('converts all-fixed encoding (all 0s)', () => {
    const encoding = '00000000000000000000000000000000';
    const result = encodingToMatchMask(encoding);
    expect(result.error).toBeNull();
    expect(result.match).toBe(0n);
    expect(result.mask).toBe(BIT_MASK_32);
  });

  test('converts all-dash (wildcard) encoding', () => {
    const encoding = '--------------------------------';
    const result = encodingToMatchMask(encoding);
    expect(result.error).toBeNull();
    expect(result.match).toBe(0n);
    expect(result.mask).toBe(0n);
  });

  test('returns error for wrong length', () => {
    const result = encodingToMatchMask('0101');
    expect(result.match).toBeNull();
    expect(result.mask).toBeNull();
    expect(result.error).toContain('32 characters');
  });

  test('returns error for invalid characters', () => {
    const result = encodingToMatchMask('0000000000000000000000000000000X');
    expect(result.match).toBeNull();
    expect(result.error).toContain('0, 1, and -');
  });

  test('returns error for empty input', () => {
    const result = encodingToMatchMask('');
    expect(result.match).toBeNull();
    expect(result.error).toBeTruthy();
  });

  test('converts SC.W encoding correctly', () => {
    // SC.W: 00011------------010-----0101111
    const encoding = '00011------------010-----0101111';
    const result = encodingToMatchMask(encoding);
    expect(result.error).toBeNull();
    expect(result.match).toBe(0x1800202fn);
    expect(result.mask).toBe(0xf800707fn);
  });
});

// ---------------------------------------------------------------------------
// matchMaskToEncoding
// ---------------------------------------------------------------------------
describe('matchMaskToEncoding', () => {
  test('converts JALR match/mask back to encoding', () => {
    const encoding = matchMaskToEncoding(0x67n, 0x707fn);
    expect(encoding).toBe('-----------------000-----1100111');
  });

  test('all-zero mask → all dashes', () => {
    const encoding = matchMaskToEncoding(0n, 0n);
    expect(encoding).toBe('--------------------------------');
  });

  test('full mask → all bits shown', () => {
    const encoding = matchMaskToEncoding(0n, BIT_MASK_32);
    expect(encoding).toBe('00000000000000000000000000000000');
  });

  test('handles null inputs as zero', () => {
    const encoding = matchMaskToEncoding(null, null);
    expect(encoding).toBe('--------------------------------');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: encoding → match/mask → encoding
// ---------------------------------------------------------------------------
describe('encoding ↔ match/mask round-trip', () => {
  const testCases = [
    { name: 'JALR', encoding: '-----------------000-----1100111' },
    { name: 'SC.W', encoding: '00011------------010-----0101111' },
    { name: 'ADD',  encoding: '0000000----------000-----0110011' },
    { name: 'LUI',  encoding: '-------------------------0110111' },
    { name: 'wildcard', encoding: '--------------------------------' },
    { name: 'all-zero', encoding: '00000000000000000000000000000000' },
    { name: 'all-one', encoding: '11111111111111111111111111111111' },
  ];

  test.each(testCases)('$name round-trips correctly', ({ encoding }) => {
    const { match, mask } = encodingToMatchMask(encoding);
    const rebuilt = matchMaskToEncoding(match, mask);
    expect(rebuilt).toBe(encoding);
  });
});

// ---------------------------------------------------------------------------
// patternsOverlap
// ---------------------------------------------------------------------------
describe('patternsOverlap', () => {
  test('identical patterns overlap', () => {
    expect(patternsOverlap(0x67n, 0x707fn, 0x67n, 0x707fn)).toBe(true);
  });

  test('completely disjoint opcodes do not overlap', () => {
    // Two different opcode fields that share no common match
    const aMatch = 0x33n; // R-type opcode
    const aMask = 0x7fn;  // opcode mask
    const bMatch = 0x03n; // Load opcode
    const bMask = 0x7fn;
    expect(patternsOverlap(aMatch, aMask, bMatch, bMask)).toBe(false);
  });

  test('wildcard pattern overlaps with everything', () => {
    expect(patternsOverlap(0n, 0n, 0x67n, 0x707fn)).toBe(true);
  });

  test('partial overlap with shared fixed bits', () => {
    // Both require opcode = 0110011, but different funct7
    const aMatch = 0x00000033n; // funct7=0000000
    const aMask = 0xfe00007fn;
    const bMatch = 0x40000033n; // funct7=0100000
    const bMask = 0xfe00007fn;
    expect(patternsOverlap(aMatch, aMask, bMatch, bMask)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSubsetPattern
// ---------------------------------------------------------------------------
describe('isSubsetPattern', () => {
  test('identical patterns are subsets of each other', () => {
    expect(isSubsetPattern(0x67n, 0x707fn, 0x67n, 0x707fn)).toBe(true);
  });

  test('more-constrained pattern is a subset of less-constrained', () => {
    // A: constrains opcode + funct3 + funct7
    // B: constrains only opcode
    const subsetMatch = 0x00000033n;
    const subsetMask = 0xfe00707fn;
    const supMatch = 0x33n;
    const supMask = 0x7fn;
    expect(isSubsetPattern(subsetMatch, subsetMask, supMatch, supMask)).toBe(true);
  });

  test('less-constrained is NOT a subset of more-constrained', () => {
    const subsetMatch = 0x33n;
    const subsetMask = 0x7fn;
    const supMatch = 0x00000033n;
    const supMask = 0xfe00707fn;
    expect(isSubsetPattern(subsetMatch, subsetMask, supMatch, supMask)).toBe(false);
  });

  test('non-overlapping patterns are not subsets', () => {
    expect(isSubsetPattern(0x33n, 0x7fn, 0x03n, 0x7fn)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// overlapExampleWord
// ---------------------------------------------------------------------------
describe('overlapExampleWord', () => {
  test('returns a 32-bit value within range', () => {
    const word = overlapExampleWord(0x67n, 0x707fn, 0x67n, 0x707fn);
    expect(word).toBe(0x67n);
  });

  test('returned word satisfies both patterns', () => {
    const aMatch = 0x33n;
    const aMask = 0x7fn;
    const bMatch = 0x33n;
    const bMask = 0x7fn;
    const word = overlapExampleWord(aMatch, aMask, bMatch, bMask);
    // word & aMask should equal aMatch & aMask
    expect((word & aMask) & BIT_MASK_32).toBe((aMatch & aMask) & BIT_MASK_32);
    expect((word & bMask) & BIT_MASK_32).toBe((bMatch & bMask) & BIT_MASK_32);
  });

  test('handles null inputs without throwing', () => {
    expect(() => overlapExampleWord(null, null, null, null)).not.toThrow();
  });
});
