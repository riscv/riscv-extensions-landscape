/**
 * Data schema validation for src/instr_dict.json
 *
 * Ensures every instruction entry has valid encoding, match, mask,
 * and that match/mask are consistent with the encoding pattern.
 */

const fs = require('fs');
const path = require('path');
const { encodingToMatchMask, parseHexToBigInt } = require('../../src/utils/encoding');

const dictPath = path.join(__dirname, '..', '..', 'src', 'instr_dict.json');
const instrDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

describe('instr_dict.json schema', () => {
  const entries = Object.entries(instrDict);

  test('dictionary is a non-empty object', () => {
    expect(typeof instrDict).toBe('object');
    expect(entries.length).toBeGreaterThan(0);
  });

  test('contains at least 1000 instructions', () => {
    expect(entries.length).toBeGreaterThanOrEqual(1000);
  });
});

describe('instruction entry schema', () => {
  const entries = Object.entries(instrDict);

  test('every entry has an encoding field', () => {
    const missing = entries
      .filter(([, v]) => !v.encoding)
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  test('every encoding is exactly 32 characters of 0/1/-', () => {
    const bad = [];
    for (const [key, val] of entries) {
      const enc = String(val.encoding || '');
      if (enc.length !== 32) {
        bad.push(`${key}: length=${enc.length}`);
      } else if (!/^[01-]{32}$/.test(enc)) {
        bad.push(`${key}: invalid chars`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('every entry has match and mask as valid hex strings', () => {
    const bad = [];
    for (const [key, val] of entries) {
      if (!val.match || !val.mask) {
        bad.push(`${key}: missing match/mask`);
        continue;
      }
      if (parseHexToBigInt(val.match) === null) {
        bad.push(`${key}: invalid match hex '${val.match}'`);
      }
      if (parseHexToBigInt(val.mask) === null) {
        bad.push(`${key}: invalid mask hex '${val.mask}'`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('match and mask are consistent with encoding pattern', () => {
    const bad = [];
    for (const [key, val] of entries) {
      if (!val.encoding || !val.match || !val.mask) continue;

      const derived = encodingToMatchMask(val.encoding);
      if (derived.error) continue; // skip entries with non-standard encodings

      const matchParsed = parseHexToBigInt(val.match);
      const maskParsed = parseHexToBigInt(val.mask);
      if (matchParsed === null || maskParsed === null) continue;

      // Compare derived match/mask with declared match/mask
      // Allow for masking to 32 bits
      const matchOk = (derived.match & 0xFFFFFFFFn) === (matchParsed & 0xFFFFFFFFn);
      const maskOk = (derived.mask & 0xFFFFFFFFn) === (maskParsed & 0xFFFFFFFFn);

      if (!matchOk || !maskOk) {
        bad.push(
          `${key}: encoding-derived match/mask mismatch ` +
          `(derived: ${derived.match?.toString(16)}/${derived.mask?.toString(16)}, ` +
          `declared: ${matchParsed.toString(16)}/${maskParsed.toString(16)})`
        );
      }
    }
    expect(bad).toEqual([]);
  });

  test('variable_fields is an array of strings when present', () => {
    const bad = [];
    for (const [key, val] of entries) {
      if (!('variable_fields' in val)) continue;
      if (!Array.isArray(val.variable_fields)) {
        bad.push(`${key}: variable_fields is not an array`);
        continue;
      }
      for (const field of val.variable_fields) {
        if (typeof field !== 'string' || !field.trim()) {
          bad.push(`${key}: variable_fields contains non-string: ${field}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('extension field is an array of strings when present', () => {
    const bad = [];
    for (const [key, val] of entries) {
      if (!('extension' in val)) continue;
      if (!Array.isArray(val.extension)) {
        bad.push(`${key}: extension is not an array`);
        continue;
      }
      for (const ext of val.extension) {
        if (typeof ext !== 'string' || !ext.trim()) {
          bad.push(`${key}: extension contains non-string: ${ext}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
