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
  return String(mnemonic).trim().toLowerCase().replaceAll('.', '_');
}

// Prints a full coverage breakdown: overall %, per-category progress bars,
// and a list of every extension still missing instruction data with a
// diagnosis of why (no JSX list vs. instrs absent from instr_dict.json).
// Triggered by passing --report on the command line.
function printCoverageReport(extensionsCatalog, extensionInstructions) {
  const totalPerCat = {};
  const filledPerCat = {};
  let grandTotal = 0;
  let grandFilled = 0;

  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      grandTotal += 1;
      totalPerCat[category] = (totalPerCat[category] ?? 0) + 1;
      const count = Object.keys(entry.instructions ?? {}).length;
      if (count > 0) {
        grandFilled += 1;
        filledPerCat[category] = (filledPerCat[category] ?? 0) + 1;
      }
    }
  }

  const pct = grandTotal > 0 ? ((grandFilled / grandTotal) * 100).toFixed(1) : '0.0';
  console.log('');
  console.log('=== RISC-V Extensions Landscape — Coverage Report ===');
  console.log('');
  console.log(`  Overall: ${grandFilled}/${grandTotal} extensions with instruction data (${pct}%)`);
  console.log('');
  console.log('  Category breakdown:');

  const BAR_WIDTH = 20;
  for (const category of Object.keys(totalPerCat)) {
    const total = totalPerCat[category] ?? 0;
    const filled = filledPerCat[category] ?? 0;
    const catPct = total > 0 ? filled / total : 0;
    const bar = '#'.repeat(Math.round(catPct * BAR_WIDTH)).padEnd(BAR_WIDTH, '.');
    const catPctStr = (catPct * 100).toFixed(0).padStart(3);
    console.log(`    ${category.padEnd(22)} [${bar}] ${String(filled).padStart(3)}/${total} (${catPctStr}%)`);
  }

  console.log('');
  console.log('  Extensions without instruction data:');

  const jsxIds = new Set(Object.keys(extensionInstructions));
  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const count = Object.keys(entry.instructions ?? {}).length;
      if (count === 0) {
        const diagnosis = jsxIds.has(entry.id)
          ? '(has JSX list, instrs missing from instr_dict)'
          : '(no JSX list)';
        console.log(`    - ${entry.id.padEnd(25)} [${category}]  ${diagnosis}`);
      }
    }
  }
  console.log('');
}

// ---- main ------------------------------------------------------------------

const showReport = process.argv.includes('--report');

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
  console.warn(`Extensions referenced in JSX but not found in catalog: ${Array.from(missingExtensions).sort().join(', ')}`);
}
if (missingInstructions.size) {
  const sorted = Array.from(missingInstructions.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.warn('Instructions listed in JSX but missing from instr_dict.json (by extension):');
  for (const [extId, list] of sorted) {
    console.warn(`  - ${extId}: ${list.length} missing`);
  }
}

if (showReport) {
  printCoverageReport(extensionsCatalog, extensionInstructions);
}
