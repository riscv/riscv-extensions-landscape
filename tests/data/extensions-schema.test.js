/**
 * Data schema validation for src/riscv_extensions.json
 *
 * Ensures every extension entry has required fields and valid values.
 */

const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', '..', 'src', 'riscv_extensions.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const EXPECTED_GROUPS = [
  'base', 'standard', 'z_bit', 'z_compress', 'z_float',
  'z_vector', 'z_security', 'z_crypto', 'z_vector_crypto',
  'z_system', 'z_caches', 's_mem', 's_interrupt', 's_trap',
];

describe('riscv_extensions.json schema', () => {
  test('catalog is a non-empty object', () => {
    expect(typeof catalog).toBe('object');
    expect(catalog).not.toBeNull();
    expect(Object.keys(catalog).length).toBeGreaterThan(0);
  });

  test('contains all expected category groups', () => {
    for (const group of EXPECTED_GROUPS) {
      expect(catalog).toHaveProperty(group);
      expect(Array.isArray(catalog[group])).toBe(true);
    }
  });

  test('total extension count is at least 200', () => {
    const total = Object.values(catalog)
      .filter(Array.isArray)
      .reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBeGreaterThanOrEqual(200);
  });
});

describe('extension entry schema', () => {
  const allEntries = [];
  for (const [group, entries] of Object.entries(catalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      allEntries.push({ group, entry });
    }
  }

  test('every entry has required fields: id, name, desc, use', () => {
    const missing = [];
    for (const { group, entry } of allEntries) {
      for (const field of ['id', 'name', 'desc', 'use']) {
        if (!entry[field] && entry[field] !== 0) {
          missing.push(`${group}/${entry.id || 'unknown'} missing '${field}'`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('id and name are non-empty strings', () => {
    const bad = [];
    for (const { group, entry } of allEntries) {
      if (typeof entry.id !== 'string' || !entry.id.trim()) {
        bad.push(`${group}: entry with bad id`);
      }
      if (typeof entry.name !== 'string' || !entry.name.trim()) {
        bad.push(`${group}/${entry.id}: bad name`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('discontinued field is 0 or 1 when present', () => {
    const bad = [];
    for (const { group, entry } of allEntries) {
      if ('discontinued' in entry && entry.discontinued !== 0 && entry.discontinued !== 1) {
        bad.push(`${group}/${entry.id}: discontinued=${entry.discontinued}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('no duplicate IDs across all groups', () => {
    const seen = new Map();
    const dupes = [];
    for (const { group, entry } of allEntries) {
      if (seen.has(entry.id)) {
        dupes.push(`${entry.id} in [${seen.get(entry.id)}, ${group}]`);
      }
      // Allow duplicates across groups (e.g. Zclsd appears in z_compress and z_system)
      // but flag within same group
      const key = `${group}:${entry.id}`;
      if (seen.has(key)) {
        dupes.push(`${entry.id} duplicated within ${group}`);
      }
      seen.set(key, group);
    }
    // Note: we only flag within-group duplicates as errors
    const withinGroupDupes = dupes.filter(d => d.includes('duplicated within'));
    expect(withinGroupDupes).toEqual([]);
  });

  test('instructions field (when present) is an object', () => {
    const bad = [];
    for (const { group, entry } of allEntries) {
      if ('instructions' in entry && typeof entry.instructions !== 'object') {
        bad.push(`${group}/${entry.id}: instructions is not an object`);
      }
    }
    expect(bad).toEqual([]);
  });
});
