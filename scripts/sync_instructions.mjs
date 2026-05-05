import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { normalizeTag, normalizeTagCandidates } from './lib/tag_normalizer.mjs';

function die(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    useNormalizer: flags.has('--use-normalizer'),
    dryRun: flags.has('--dry-run'),
  };
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
  const byId = new Map();
  const byNormalized = new Map();

  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.id;
      if (!id) continue;
      const location = { category, entry };

      const directList = byId.get(id) ?? [];
      directList.push(location);
      byId.set(id, directList);

      const normalized = normalizeTag(id);
      const normalizedList = byNormalized.get(normalized) ?? [];
      normalizedList.push(location);
      byNormalized.set(normalized, normalizedList);
    }
  }

  return { byId, byNormalized };
}

function buildKnownCatalogTagSet(extensionsCatalog) {
  const known = new Set();
  for (const entries of Object.values(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && entry.id) {
        known.add(normalizeTag(entry.id));
      }
    }
  }
  return known;
}

function resolveExtensionLocations(extId, index, useNormalizer) {
  const direct = index.byId.get(extId);
  if (direct && direct.length) {
    return { locations: direct, resolution: 'direct' };
  }

  if (!useNormalizer) {
    return { locations: null, resolution: 'not_found' };
  }

  const normalized = normalizeTag(extId);
  const normalizedMatches = index.byNormalized.get(normalized);
  if (normalizedMatches && normalizedMatches.length) {
    return { locations: normalizedMatches, resolution: 'normalized' };
  }

  return { locations: null, resolution: 'not_found' };
}

function mnemonicToInstrDictKey(mnemonic) {
  return String(mnemonic).trim().toLowerCase().replaceAll('.', '_');
}

function collectTagNormalizationStats(instrDict, knownCatalogTags) {
  const matched = [];
  const unmatched = [];
  const seen = new Set();

  for (const payload of Object.values(instrDict)) {
    if (!payload || typeof payload !== 'object') continue;
    const tags = payload.extension;
    if (!Array.isArray(tags)) continue;

    for (const rawTag of tags) {
      const tag = String(rawTag || '').trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);

      const candidates = normalizeTagCandidates(tag, { includeGExpansion: true });
      const firstMatch = candidates.find((candidate) => knownCatalogTags.has(candidate));
      if (firstMatch) {
        matched.push({ tag, normalized: firstMatch, reason: 'normalized_candidate_match' });
      } else {
        unmatched.push({ tag, candidates, reason: 'no_catalog_candidate_match' });
      }
    }
  }

  matched.sort((a, b) => a.tag.localeCompare(b.tag));
  unmatched.sort((a, b) => a.tag.localeCompare(b.tag));

  return { matched, unmatched };
}

const options = parseArgs(process.argv);
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
let normalizedResolutionCount = 0;

for (const [extId, mnemonics] of Object.entries(extensionInstructions)) {
  const { locations, resolution } = resolveExtensionLocations(extId, extIndex, options.useNormalizer);
  if (!locations || locations.length === 0) {
    missingExtensions.add(extId);
    continue;
  }
  if (resolution === 'normalized') normalizedResolutionCount += 1;

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

if (!options.dryRun) {
  fs.writeFileSync(catalogPath, `${JSON.stringify(extensionsCatalog, null, 2)}\n`);
}

console.log(
  `${options.dryRun ? 'Dry run: would update' : 'Updated'} ${path.relative(workspaceRoot, catalogPath)} with ${addedCount} instruction entries.`
);
if (options.useNormalizer) {
  console.log(`Normalizer assisted extension resolution count: ${normalizedResolutionCount}`);
}
if (missingExtensions.size) {
  console.warn(`Extensions referenced in JSX but not found in catalog: ${Array.from(missingExtensions).sort().join(', ')}`);
}
if (missingInstructions.size) {
  const sorted = Array.from(missingInstructions.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.warn('Instructions missing from instr_dict.json (by extension):');
  for (const [extId, list] of sorted) {
    console.warn(`- ${extId}: ${list.length}`);
  }
}

if (options.useNormalizer) {
  const knownCatalogTags = buildKnownCatalogTagSet(extensionsCatalog);
  const normalizationStats = collectTagNormalizationStats(instrDict, knownCatalogTags);
  console.log(
    `Tag normalization summary: ${normalizationStats.matched.length} matched candidates, ${normalizationStats.unmatched.length} unmatched candidates.`
  );
  if (normalizationStats.unmatched.length) {
    console.warn('Unmatched riscv-opcodes tags after normalization:');
    for (const row of normalizationStats.unmatched) {
      console.warn(`- ${row.tag} -> [${row.candidates.join(', ')}]`);
    }
  }
}
