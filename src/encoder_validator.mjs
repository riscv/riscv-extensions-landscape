export const BIT_WIDTH = 32n;
export const BIT_MASK_32 = (1n << BIT_WIDTH) - 1n;

export const normalizeHexString = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.toLowerCase().startsWith('0x') ? text.toLowerCase() : `0x${text.toLowerCase()}`;
};

export const parseHexToBigInt = (value) => {
  const normalized = normalizeHexString(value);
  if (!normalized) return null;
  if (!/^0x[0-9a-f]+$/i.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
};

export const toHex32 = (value) => {
  const v = (value ?? 0n) & BIT_MASK_32;
  return `0x${v.toString(16).padStart(8, '0')}`;
};

export const normalizeEncodingString = (value) => {
  const encoding = String(value ?? '').replace(/\s+/g, '');
  if (!encoding) return '';
  return encoding;
};

export const encodingToMatchMask = (encoding) => {
  const normalized = normalizeEncodingString(encoding);
  if (!normalized) return { match: null, mask: null, error: 'Provide an encoding or match/mask.' };
  if (normalized.length !== 32) {
    return { match: null, mask: null, error: `Encoding must be 32 characters (got ${normalized.length}).` };
  }
  if (!/^[01-]{32}$/.test(normalized)) {
    return { match: null, mask: null, error: 'Encoding may only contain 0, 1, and -.' };
  }

  let match = 0n;
  let mask = 0n;
  for (let i = 0; i < 32; i += 1) {
    const bit = 31n - BigInt(i);
    const ch = normalized[i];
    if (ch === '-') continue;
    mask |= 1n << bit;
    if (ch === '1') match |= 1n << bit;
  }
  return { match, mask, error: null };
};

export const matchMaskToEncoding = (match, mask) => {
  const m = (match ?? 0n) & BIT_MASK_32;
  const k = (mask ?? 0n) & BIT_MASK_32;
  let out = '';
  for (let bit = 31n; bit >= 0n; bit -= 1n) {
    const bitMask = 1n << bit;
    if ((k & bitMask) === 0n) out += '-';
    else out += (m & bitMask) === 0n ? '0' : '1';
  }
  return out;
};

export const patternsOverlap = (aMatch, aMask, bMatch, bMask) => {
  const commonMask = (aMask & bMask) & BIT_MASK_32;
  const diff = ((aMatch ^ bMatch) & commonMask) & BIT_MASK_32;
  return diff === 0n;
};

export const isSubsetPattern = (subsetMatch, subsetMask, supMatch, supMask) => {
  const subsetMaskNorm = (subsetMask ?? 0n) & BIT_MASK_32;
  const supMaskNorm = (supMask ?? 0n) & BIT_MASK_32;
  const subsetMatchNorm = (subsetMatch ?? 0n) & BIT_MASK_32;
  const supMatchNorm = (supMatch ?? 0n) & BIT_MASK_32;

  const supBitsNotConstrainedBySubset = supMaskNorm & ~subsetMaskNorm;
  if (supBitsNotConstrainedBySubset !== 0n) return false;
  const mismatch = (subsetMatchNorm ^ supMatchNorm) & supMaskNorm;
  return mismatch === 0n;
};

export const overlapExampleWord = (aMatch, aMask, bMatch, bMask) => {
  const am = (aMatch ?? 0n) & BIT_MASK_32;
  const ak = (aMask ?? 0n) & BIT_MASK_32;
  const bm = (bMatch ?? 0n) & BIT_MASK_32;
  const bk = (bMask ?? 0n) & BIT_MASK_32;
  return ((am & ak) | (bm & (bk & ~ak))) & BIT_MASK_32;
};

export const classifyOverlap = (proposedMatch, proposedMask, existingMatch, existingMask) => {
  if (proposedMatch === existingMatch && proposedMask === existingMask) return 'identical';
  if (isSubsetPattern(proposedMatch, proposedMask, existingMatch, existingMask)) {
    return 'proposed_subset_of_existing';
  }
  if (isSubsetPattern(existingMatch, existingMask, proposedMatch, proposedMask)) {
    return 'existing_subset_of_proposed';
  }
  return 'partial_overlap';
};

export const describeConflictType = (type) => {
  if (type === 'identical') return 'Exact same match/mask pattern.';
  if (type === 'proposed_subset_of_existing') {
    return 'Your proposed pattern is more specific, but every word it matches also matches the existing instruction.';
  }
  if (type === 'existing_subset_of_proposed') {
    return 'Your proposed pattern is more general, and it would also match words intended for the existing instruction.';
  }
  return 'Overlapping decode space (there exist instruction words that satisfy both patterns).';
};

export const normalizePatternSource = ({ encoding, match, mask }) => {
  const normalizedEncoding = normalizeEncodingString(encoding);
  const parsedMatch = parseHexToBigInt(match);
  const parsedMask = parseHexToBigInt(mask);
  const errors = [];

  let normalizedMatch = parsedMatch;
  let normalizedMask = parsedMask;
  let derivedEncoding = normalizedEncoding;

  if (normalizedMatch != null && normalizedMask != null) {
    normalizedMatch &= BIT_MASK_32;
    normalizedMask &= BIT_MASK_32;
    if ((normalizedMatch & ~normalizedMask) !== 0n) {
      errors.push('Match contains bits outside Mask.');
    }
  }

  if ((normalizedMatch == null || normalizedMask == null) && normalizedEncoding) {
    const derived = encodingToMatchMask(normalizedEncoding);
    if (derived.error) {
      errors.push(derived.error);
    } else {
      normalizedMatch = derived.match;
      normalizedMask = derived.mask;
    }
  }

  if (normalizedEncoding && normalizedMatch != null && normalizedMask != null) {
    const derived = encodingToMatchMask(normalizedEncoding);
    if (derived.error) {
      errors.push(derived.error);
    } else if (
      (derived.match & BIT_MASK_32) !== (normalizedMatch & BIT_MASK_32) ||
      (derived.mask & BIT_MASK_32) !== (normalizedMask & BIT_MASK_32)
    ) {
      errors.push('Encoding does not match the provided Match/Mask.');
    }
  }

  if (!derivedEncoding && normalizedMatch != null && normalizedMask != null) {
    derivedEncoding = matchMaskToEncoding(normalizedMatch, normalizedMask);
  }

  return {
    encoding: derivedEncoding,
    match: normalizedMatch == null ? null : normalizedMatch & BIT_MASK_32,
    mask: normalizedMask == null ? null : normalizedMask & BIT_MASK_32,
    errors,
  };
};

export const normalizeProposedInput = ({ encoding, match, mask }) => {
  const errors = [];
  const normalizedEncodingInput = normalizeEncodingString(encoding);
  const normalizedMatchInput = String(match ?? '').trim();
  const normalizedMaskInput = String(mask ?? '').trim();

  const hasEncoding = Boolean(normalizedEncodingInput);
  const hasMatch = Boolean(normalizedMatchInput);
  const hasMask = Boolean(normalizedMaskInput);

  if (!hasEncoding && !hasMatch && !hasMask) {
    return { errors: ['Provide either Encoding, or both Match and Mask.'], normalized: null };
  }

  if ((hasMatch && !hasMask) || (!hasMatch && hasMask)) {
    errors.push('Provide both Match and Mask together.');
  }

  const normalized = normalizePatternSource({
    encoding: normalizedEncodingInput,
    match: normalizedMatchInput,
    mask: normalizedMaskInput,
  });

  errors.push(...normalized.errors);

  if (normalized.match == null || normalized.mask == null) {
    if (errors.length === 0) {
      errors.push('Unable to derive a complete Match/Mask pair from the provided input.');
    }
    return { errors, normalized: null };
  }

  if (errors.length > 0) {
    return { errors, normalized: null };
  }

  return {
    errors: [],
    normalized: {
      encoding: normalized.encoding,
      match: normalized.match,
      mask: normalized.mask,
    },
  };
};
