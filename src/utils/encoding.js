/**
 * Encoding utilities for RISC-V instruction match/mask/encoding operations.
 *
 * Extracted from risc_v_visualizer.jsx for testability and reuse.
 * All functions are pure — no React, no DOM, no side-effects.
 */

const BIT_WIDTH = 32n;
const BIT_MASK_32 = (1n << BIT_WIDTH) - 1n;

/**
 * Normalize a mnemonic key: trim, uppercase, take first whitespace-delimited token.
 * @param {*} value - raw mnemonic string (or any value)
 * @returns {string} normalized key, e.g. "SC.W"
 */
const normalizeMnemonicKey = (value) =>
  String(value ?? '').trim().toUpperCase().split(/\s+/)[0];

/**
 * Normalize a hex string to lowercase with "0x" prefix.
 * Returns '' for empty/null/undefined input.
 * @param {*} value
 * @returns {string}
 */
const normalizeHexString = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.toLowerCase().startsWith('0x')
    ? text.toLowerCase()
    : `0x${text.toLowerCase()}`;
};

/**
 * Parse a hex string into a BigInt, or return null on failure.
 * @param {*} value
 * @returns {bigint|null}
 */
const parseHexToBigInt = (value) => {
  const normalized = normalizeHexString(value);
  if (!normalized) return null;
  if (!/^0x[0-9a-f]+$/i.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
};

/**
 * Format a BigInt as a zero-padded 32-bit hex string with "0x" prefix.
 * @param {bigint} value
 * @returns {string} e.g. "0x00000067"
 */
const toHex32 = (value) => {
  const v = (value ?? 0n) & BIT_MASK_32;
  return `0x${v.toString(16).padStart(8, '0')}`;
};

/**
 * Strip whitespace from an encoding string.
 * @param {*} value
 * @returns {string}
 */
const normalizeEncodingString = (value) => {
  const encoding = String(value ?? '').replace(/\s+/g, '');
  if (!encoding) return '';
  return encoding;
};

/**
 * Convert a 32-character encoding pattern (0/1/-) into match and mask BigInts.
 * @param {string} encoding - 32 chars of '0', '1', '-'
 * @returns {{ match: bigint|null, mask: bigint|null, error: string|null }}
 */
const encodingToMatchMask = (encoding) => {
  const normalized = normalizeEncodingString(encoding);
  if (!normalized)
    return { match: null, mask: null, error: 'Provide an encoding or match/mask.' };
  if (normalized.length !== 32) {
    return {
      match: null,
      mask: null,
      error: `Encoding must be 32 characters (got ${normalized.length}).`,
    };
  }
  if (!/^[01-]{32}$/.test(normalized)) {
    return { match: null, mask: null, error: 'Encoding may only contain 0, 1, and -.' };
  }

  let match = 0n;
  let mask = 0n;
  for (let i = 0; i < 32; i++) {
    const bit = 31n - BigInt(i);
    const ch = normalized[i];
    if (ch === '-') continue;
    mask |= 1n << bit;
    if (ch === '1') match |= 1n << bit;
  }
  return { match, mask, error: null };
};

/**
 * Convert match + mask BigInts back into a 32-character encoding string.
 * @param {bigint} match
 * @param {bigint} mask
 * @returns {string} 32 chars of '0', '1', '-'
 */
const matchMaskToEncoding = (match, mask) => {
  const m = (match ?? 0n) & BIT_MASK_32;
  const k = (mask ?? 0n) & BIT_MASK_32;
  let out = '';
  for (let bit = 31n; bit >= 0n; bit--) {
    const bitMask = 1n << bit;
    if ((k & bitMask) === 0n) out += '-';
    else out += (m & bitMask) === 0n ? '0' : '1';
  }
  return out;
};

/**
 * Check if two instruction patterns overlap (could both match the same 32-bit word).
 * @param {bigint} aMatch
 * @param {bigint} aMask
 * @param {bigint} bMatch
 * @param {bigint} bMask
 * @returns {boolean}
 */
const patternsOverlap = (aMatch, aMask, bMatch, bMask) => {
  const commonMask = (aMask & bMask) & BIT_MASK_32;
  const diff = ((aMatch ^ bMatch) & commonMask) & BIT_MASK_32;
  return diff === 0n;
};

/**
 * Check if one pattern is a subset of another (every word matching the subset
 * also matches the superset).
 * @param {bigint} subsetMatch
 * @param {bigint} subsetMask
 * @param {bigint} supMatch
 * @param {bigint} supMask
 * @returns {boolean}
 */
const isSubsetPattern = (subsetMatch, subsetMask, supMatch, supMask) => {
  const subsetMaskNorm = (subsetMask ?? 0n) & BIT_MASK_32;
  const supMaskNorm = (supMask ?? 0n) & BIT_MASK_32;
  const subsetMatchNorm = (subsetMatch ?? 0n) & BIT_MASK_32;
  const supMatchNorm = (supMatch ?? 0n) & BIT_MASK_32;

  const supBitsNotConstrainedBySubset = supMaskNorm & ~subsetMaskNorm;
  if (supBitsNotConstrainedBySubset !== 0n) return false;
  const mismatch = (subsetMatchNorm ^ supMatchNorm) & supMaskNorm;
  return mismatch === 0n;
};

/**
 * Produce an example 32-bit word that matches both patterns.
 * @param {bigint} aMatch
 * @param {bigint} aMask
 * @param {bigint} bMatch
 * @param {bigint} bMask
 * @returns {bigint}
 */
const overlapExampleWord = (aMatch, aMask, bMatch, bMask) => {
  const am = (aMatch ?? 0n) & BIT_MASK_32;
  const ak = (aMask ?? 0n) & BIT_MASK_32;
  const bm = (bMatch ?? 0n) & BIT_MASK_32;
  const bk = (bMask ?? 0n) & BIT_MASK_32;
  return ((am & ak) | (bm & (bk & ~ak))) & BIT_MASK_32;
};

module.exports = {
  BIT_WIDTH,
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
};
