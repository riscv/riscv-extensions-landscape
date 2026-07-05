#!/usr/bin/env node
/**
 * Merge instr_dict.json encodings into riscv_extensions.json using catalog `tags`.
 *
 * Replaces JSX-driven membership with tag-based matching:
 *   instr_dict.extension[]  ↔  catalog entry tags[]
 *
 * JSX extensionInstructions is still read for mnemonic casing and display order.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  dictKeyToMnemonic,
  resolveSplitTargets,
} from './lib/sync_rules.mjs';

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
  if (markerIndex === -1) return {};

  const braceStart = jsxText.indexOf('{', markerIndex);
  if (braceStart === -1) return {};

  const braceEnd = findMatchingBrace(jsxText, braceStart);
  if (braceEnd === -1) return {};

  const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
  return vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 1000 });
}

function buildExtensionIndex(extensionsCatalog) {
  const byId = new Map();
  const tagToIds = new Map();

  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.id) continue;
      const locations = byId.get(entry.id) ?? [];
      locations.push({ category, entry });
      byId.set(entry.id, locations);

      for (const tag of entry.tags || []) {
        const ids = tagToIds.get(tag) ?? new Set();
        ids.add(entry.id);
        tagToIds.set(tag, ids);
      }
    }
  }

  return { byId, tagToIds };
}

function buildMnemonicCasingMaps(extensionsCatalog, extensionInstructions) {
  const keyToMnemonic = new Map();

  for (const entries of Object.values(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.instructions) continue;
      for (const mnemonic of Object.keys(entry.instructions)) {
        const key = mnemonic.trim().toLowerCase().replaceAll('.', '_');
        keyToMnemonic.set(key, mnemonic);
      }
    }
  }

  for (const mnemonics of Object.values(extensionInstructions)) {
    for (const mnemonic of mnemonics) {
      const key = mnemonic.trim().toLowerCase().replaceAll('.', '_');
      keyToMnemonic.set(key, mnemonic);
    }
  }

  return keyToMnemonic;
}

const workspaceRoot = process.cwd();
const instrDictPath = path.join(workspaceRoot, 'src', 'instr_dict.json');
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const visualizerPath = path.join(workspaceRoot, 'src', 'risc_v_visualizer.jsx');

const instrDict = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
const extensionsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const visualizerSource = fs.readFileSync(visualizerPath, 'utf8');

const extensionInstructions = extractExtensionInstructions(visualizerSource);
const { byId, tagToIds } = buildExtensionIndex(extensionsCatalog);
const keyToMnemonic = buildMnemonicCasingMaps(extensionsCatalog, extensionInstructions);

const entriesWithoutTags = [];
for (const locations of byId.values()) {
  for (const { entry } of locations) {
    if (!entry.tags) entry.tags = [];
    if (entry.tags.length === 0) entriesWithoutTags.push(entry.id);
  }
}
if (entriesWithoutTags.length) {
  console.warn(
    `Catalog entries with no opcode tags (capability-only): ${[...new Set(entriesWithoutTags)].sort().join(', ')}`
  );
}

for (const locations of byId.values()) {
  for (const { entry } of locations) {
    entry.instructions = {};
  }
}

const orphanTags = new Set();
const unmappedInstructions = [];
let addedCount = 0;

for (const [dictKey, details] of Object.entries(instrDict)) {
  const tags = details?.extension || [];
  if (!tags.length) {
    unmappedInstructions.push({ dictKey, reason: 'no_extension_tags' });
    continue;
  }

  const mnemonic = keyToMnemonic.get(dictKey) || dictKeyToMnemonic(dictKey);
  const targetIds = new Set();

  for (const tag of tags) {
    const candidates = tagToIds.get(tag);
    if (!candidates || candidates.size === 0) {
      orphanTags.add(tag);
      continue;
    }

    const resolved = resolveSplitTargets(mnemonic, tag, [...candidates]);
    for (const extId of resolved) targetIds.add(extId);
  }

  if (targetIds.size === 0) {
    unmappedInstructions.push({ dictKey, mnemonic, tags, reason: 'no_catalog_match' });
    continue;
  }

  for (const extId of targetIds) {
    const locations = byId.get(extId);
    if (!locations) continue;
    for (const { entry } of locations) {
      entry.instructions[mnemonic] = details;
      addedCount += 1;
    }
  }
}

fs.writeFileSync(catalogPath, `${JSON.stringify(extensionsCatalog, null, 2)}\n`);

console.log(`Updated ${path.relative(workspaceRoot, catalogPath)} with ${addedCount} instruction assignments.`);
if (orphanTags.size) {
  console.warn(`Opcode tags with no catalog entry: ${[...orphanTags].sort().join(', ')}`);
}
if (unmappedInstructions.length) {
  console.warn(`instr_dict entries not assigned to any extension: ${unmappedInstructions.length}`);
}
