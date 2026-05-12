/**
 * Cross-reference integrity tests.
 *
 * Validates that extensionInstructions (in JSX), riscv_extensions.json (catalog),
 * and instr_dict.json (instruction dictionary) are mutually consistent.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const catalogPath = path.join(__dirname, '..', '..', 'src', 'riscv_extensions.json');
const dictPath = path.join(__dirname, '..', '..', 'src', 'instr_dict.json');
const jsxPath = path.join(__dirname, '..', '..', 'src', 'risc_v_visualizer.jsx');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const instrDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

// ---------------------------------------------------------------------------
// Extract extensionInstructions from JSX using the same technique as sync script
// ---------------------------------------------------------------------------
function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { if (inSingle || inDouble || inTemplate) escape = true; continue; }
    if (inSingle) { if (ch === "'") inSingle = false; continue; }
    if (inDouble) { if (ch === '"') inDouble = false; continue; }
    if (inTemplate) { if (ch === '`') inTemplate = false; continue; }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inTemplate = true; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function extractExtensionInstructions() {
  const jsxText = fs.readFileSync(jsxPath, 'utf8');
  const marker = 'const extensionInstructions =';
  const markerIndex = jsxText.indexOf(marker);
  if (markerIndex === -1) return null;
  const braceStart = jsxText.indexOf('{', markerIndex);
  if (braceStart === -1) return null;
  const braceEnd = findMatchingBrace(jsxText, braceStart);
  if (braceEnd === -1) return null;
  const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
  return vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 2000 });
}

const extensionInstructions = extractExtensionInstructions();

// Build catalog index
function buildCatalogIndex() {
  const index = new Map();
  for (const [group, entries] of Object.entries(catalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || !entry.id) continue;
      index.set(entry.id, { group, entry });
    }
  }
  return index;
}

const catalogIndex = buildCatalogIndex();

describe('extensionInstructions extraction', () => {
  test('successfully extracted from JSX source', () => {
    expect(extensionInstructions).not.toBeNull();
    expect(typeof extensionInstructions).toBe('object');
  });

  test('contains at least 20 extension mappings', () => {
    expect(Object.keys(extensionInstructions).length).toBeGreaterThanOrEqual(20);
  });
});

describe('extensionInstructions → catalog cross-reference', () => {
  test('every extensionInstructions key resolves to a catalog entry', () => {
    const missing = [];
    for (const extId of Object.keys(extensionInstructions)) {
      if (!catalogIndex.has(extId)) {
        missing.push(extId);
      }
    }
    // Some minor mismatches are expected (documented in sync script warnings)
    // but there should be very few
    expect(missing.length).toBeLessThanOrEqual(5);
  });
});

describe('extensionInstructions → instr_dict cross-reference', () => {
  test('majority of mnemonics resolve to instr_dict entries', () => {
    let total = 0;
    let found = 0;
    const missingByExt = {};

    for (const [extId, mnemonics] of Object.entries(extensionInstructions)) {
      if (!Array.isArray(mnemonics)) continue;
      for (const mnemonic of mnemonics) {
        total += 1;
        const key = String(mnemonic).trim().toLowerCase().replaceAll('.', '_');
        if (instrDict[key]) {
          found += 1;
        } else {
          if (!missingByExt[extId]) missingByExt[extId] = [];
          missingByExt[extId].push(mnemonic);
        }
      }
    }

    const hitRate = found / total;
    // At least 85% of mnemonics should resolve
    expect(hitRate).toBeGreaterThanOrEqual(0.85);
  });
});

describe('profile definitions reference valid extensions', () => {
  // Extract profiles from the JSX source
  function extractProfiles() {
    const jsxText = fs.readFileSync(jsxPath, 'utf8');
    const marker = 'const profiles =';
    const markerIndex = jsxText.indexOf(marker);
    if (markerIndex === -1) return null;
    const braceStart = jsxText.indexOf('{', markerIndex);
    if (braceStart === -1) return null;
    const braceEnd = findMatchingBrace(jsxText, braceStart);
    if (braceEnd === -1) return null;
    const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
    return vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 2000 });
  }

  const profiles = extractProfiles();

  test('profiles object extracted successfully', () => {
    expect(profiles).not.toBeNull();
    expect(typeof profiles).toBe('object');
  });

  test('all profile extension IDs exist in the catalog', () => {
    if (!profiles) return;
    const missing = [];
    for (const [profileName, extIds] of Object.entries(profiles)) {
      if (!Array.isArray(extIds)) continue;
      for (const extId of extIds) {
        if (!catalogIndex.has(extId)) {
          missing.push(`${profileName}: ${extId}`);
        }
      }
    }
    // Allow a small number of profile-only tags (e.g. 'Sha' is a profile tag)
    expect(missing.length).toBeLessThanOrEqual(3);
  });

  test('RVA20 extensions are a subset of RVA22', () => {
    if (!profiles || !profiles.RVA20 || !profiles.RVA22) return;
    const rva22Set = new Set(profiles.RVA22);
    const notInRVA22 = profiles.RVA20.filter(id => !rva22Set.has(id));
    // Allow for spec version differences (e.g. Ss1p11 → Ss1p12)
    const unexpectedMissing = notInRVA22.filter(
      id => !id.startsWith('Ss1p') && !id.startsWith('Sm1p') && id !== 'Za128rs'
    );
    expect(unexpectedMissing).toEqual([]);
  });
});

describe('compressed instruction mappings', () => {
  // Extract COMPRESSED_INSTRUCTION_MAPPINGS from JSX
  function extractCompressedMappings() {
    const jsxText = fs.readFileSync(jsxPath, 'utf8');
    const marker = 'const COMPRESSED_INSTRUCTION_MAPPINGS = [';
    const markerIndex = jsxText.indexOf(marker);
    if (markerIndex === -1) return null;
    const bracketStart = jsxText.indexOf('[', markerIndex);
    if (bracketStart === -1) return null;

    // Find matching ]
    let depth = 0;
    let end = -1;
    for (let i = bracketStart; i < jsxText.length; i++) {
      if (jsxText[i] === '[') depth++;
      if (jsxText[i] === ']') depth--;
      if (depth === 0) { end = i; break; }
    }
    if (end === -1) return null;

    const arrayLiteral = jsxText.slice(bracketStart, end + 1);
    return vm.runInNewContext(`(${arrayLiteral})`, {}, { timeout: 2000 });
  }

  const mappings = extractCompressedMappings();

  test('compressed mappings extracted successfully', () => {
    expect(mappings).not.toBeNull();
    expect(Array.isArray(mappings)).toBe(true);
  });

  test('at least 30 compressed instruction mappings exist', () => {
    expect(mappings.length).toBeGreaterThanOrEqual(30);
  });

  test('every compressed mapping has required fields', () => {
    const bad = [];
    for (const entry of mappings) {
      for (const field of ['mnemonic', 'compressed', 'standard', 'description']) {
        if (!entry[field]) {
          bad.push(`${entry.mnemonic || 'unknown'}: missing '${field}'`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('no duplicate compressed mnemonics', () => {
    const seen = new Set();
    const dupes = [];
    for (const entry of mappings) {
      const key = String(entry.mnemonic).toUpperCase().trim();
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
});
