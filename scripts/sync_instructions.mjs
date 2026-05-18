import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function die(message) {
  console.error(message);
  process.exit(1);
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\\\') {
      if (inSingle || inDouble || inTemplate) escape = true;
      continue;
    }

    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }

    if (inTemplate) {
      if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;

    if (depth === 0) return i;
  }

  return -1;
}

function extractExtensionInstructions(jsxText) {
  const marker = 'const extensionInstructions =';
  const markerIndex = jsxText.indexOf(marker);
  if (markerIndex === -1) die(`Could not find \`${marker}\` in src/risc_v_visualizer.jsx`);

  const braceStart = jsxText.indexOf('{', markerIndex);
  if (braceStart === -1) die('Could not find opening `{` for extensionInstructions object');

  const braceEnd = findMatchingBrace(jsxText, braceStart);
  if (braceEnd === -1) die('Could not find closing `}` for extensionInstructions object');

  const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
  const sandbox = {};
  return vm.runInNewContext(`(${objectLiteral})`, sandbox, { timeout: 1000 });
}

function buildExtensionIndex(extensionsCatalog) {
  const index = new Map();

  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.id;
      if (!id) continue;
      const list = index.get(id) ?? [];
      list.push({ category, entry });
      index.set(id, list);
    }
  }

  return index;
}

function mnemonicToInstrDictKey(mnemonic) {
  if (
    mnemonic === 'mop_r_N' ||
    mnemonic === 'mop_rr_N' ||
    mnemonic === 'c_mop_N'
  ) {
    return mnemonic;
  }

  return String(mnemonic)
    .trim()
    .toLowerCase()
    .replaceAll('.', '_');
}

const workspaceRoot = process.cwd();
const instrDictPath = path.join(workspaceRoot, 'src', 'instr_dict.json');
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const visualizerPath = path.join(workspaceRoot, 'src', 'risc_v_visualizer.jsx');

const instrDict = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
const extensionsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const visualizerSource = fs.readFileSync(visualizerPath, 'utf8');

const extensionInstructions = extractExtensionInstructions(visualizerSource);
const extIndex = buildExtensionIndex(extensionsCatalog);

const missingExtensions = new Set();
const missingInstructions = new Map();
let addedCount = 0;

for (const [extId, mnemonics] of Object.entries(extensionInstructions)) {
  const locations = extIndex.get(extId);
  if (!locations || locations.length === 0) {
    missingExtensions.add(extId);
    continue;
  }

  for (const { entry } of locations) {
    if (!entry.instructions || typeof entry.instructions !== 'object') entry.instructions = {};
    for (const mnemonic of mnemonics) {
      const key = mnemonicToInstrDictKey(mnemonic);
      const details = instrDict[key];
      if (!details) {
        const missing = missingInstructions.get(extId) ?? [];
        missing.push(mnemonic);
        missingInstructions.set(extId, missing);
        continue;
      }
      entry.instructions[mnemonic] = details;
      addedCount += 1;
    }
  }
}

fs.writeFileSync(catalogPath, `${JSON.stringify(extensionsCatalog, null, 2)}\n`);

console.log(`Updated ${path.relative(workspaceRoot, catalogPath)} with ${addedCount} instruction entries.`);
if (missingExtensions.size) {
  console.warn(`Extensions referenced in JSX but not found in YAML: ${Array.from(missingExtensions).sort().join(', ')}`);
}
if (missingInstructions.size) {
  const sorted = Array.from(missingInstructions.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.warn('Instructions missing from instr_dict.json (by extension):');
  for (const [extId, list] of sorted) {
    console.warn(`- ${extId}: ${list.length}`);
  }
}
