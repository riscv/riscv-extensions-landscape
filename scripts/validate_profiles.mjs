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

    if (ch === '\\') {
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

function extractProfiles(jsxText) {
  const marker = 'const profiles =';
  const markerIndex = jsxText.indexOf(marker);
  if (markerIndex === -1) {
    die('Could not find `const profiles =` in src/risc_v_visualizer.jsx');
  }

  const braceStart = jsxText.indexOf('{', markerIndex);
  if (braceStart === -1) {
    die('Could not find opening `{` for profiles object in src/risc_v_visualizer.jsx');
  }

  const braceEnd = findMatchingBrace(jsxText, braceStart);
  if (braceEnd === -1) {
    die('Could not find closing `}` for profiles object in src/risc_v_visualizer.jsx');
  }

  const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
  return vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 1000 });
}

const workspaceRoot = process.cwd();
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const visualizerPath = path.join(workspaceRoot, 'src', 'risc_v_visualizer.jsx');

const extensionsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const visualizerSource = fs.readFileSync(visualizerPath, 'utf8');
const profiles = extractProfiles(visualizerSource);

const extensionIds = new Set(
  Object.values(extensionsCatalog)
    .flat()
    .filter(Boolean)
    .map((ext) => ext.id)
);

const unknownByProfile = [];

for (const [profile, ids] of Object.entries(profiles)) {
  if (!Array.isArray(ids)) continue;
  const unknown = Array.from(new Set(ids.filter((id) => !extensionIds.has(id)))).sort();
  if (unknown.length) {
    unknownByProfile.push({ profile, unknown });
  }
}

if (unknownByProfile.length) {
  console.error('Profile validation failed: unknown extension IDs detected.');
  for (const item of unknownByProfile) {
    console.error(`- ${item.profile}: ${item.unknown.join(', ')}`);
  }
  process.exit(1);
}

console.log('Profile validation passed: all profile extension IDs exist in src/riscv_extensions.json.');
