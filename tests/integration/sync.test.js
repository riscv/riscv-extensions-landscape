/**
 * Integration test for scripts/sync_instructions.mjs
 *
 * Runs the sync script and validates the output catalog.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const catalogPath = path.join(rootDir, 'src', 'riscv_extensions.json');

describe('sync_instructions.mjs integration', () => {
  let catalogBefore;

  beforeAll(() => {
    // Snapshot the catalog before running sync
    catalogBefore = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  });

  test('sync script runs without errors', () => {
    expect(() => {
      execSync('node scripts/sync_instructions.mjs', {
        cwd: rootDir,
        timeout: 15000,
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  test('catalog is valid JSON after sync', () => {
    const raw = fs.readFileSync(catalogPath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test('sync does not reduce total instruction count', () => {
    const catalogAfter = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    let countBefore = 0;
    let countAfter = 0;

    for (const entries of Object.values(catalogBefore)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry?.instructions && typeof entry.instructions === 'object') {
          countBefore += Object.keys(entry.instructions).length;
        }
      }
    }

    for (const entries of Object.values(catalogAfter)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry?.instructions && typeof entry.instructions === 'object') {
          countAfter += Object.keys(entry.instructions).length;
        }
      }
    }

    // Sync should maintain or increase instruction count
    expect(countAfter).toBeGreaterThanOrEqual(countBefore);
  });

  test('catalog structure (group keys) is preserved after sync', () => {
    const catalogAfter = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const keysBefore = Object.keys(catalogBefore).sort();
    const keysAfter = Object.keys(catalogAfter).sort();
    expect(keysAfter).toEqual(keysBefore);
  });
});
