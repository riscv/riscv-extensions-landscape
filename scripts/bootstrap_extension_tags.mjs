#!/usr/bin/env node
/**
 * Seeds `tags` arrays on riscv_extensions.json catalog entries.
 *
 * Strategy:
 * 1. Union opcode tags from existing synced instructions (ground truth)
 * 2. Fill gaps with inferTagsFromExtensionId() heuristics
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXTENSION_TAG_OVERRIDES, inferTagsFromExtensionId } from './lib/sync_rules.mjs';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

const workspaceRoot = process.cwd();
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

let seededFromInstructions = 0;
let seededFromInference = 0;
let alreadyPresent = 0;

for (const entries of Object.values(catalog)) {
  if (!Array.isArray(entries)) continue;

  for (const entry of entries) {
    if (!entry?.id) continue;

    const fromInstructions = [];
    if (entry.instructions && typeof entry.instructions === 'object') {
      for (const details of Object.values(entry.instructions)) {
        for (const tag of details?.extension || []) fromInstructions.push(tag);
      }
    }

    const override = EXTENSION_TAG_OVERRIDES[entry.id];
    if (override) {
      entry.tags = uniqueSorted(override);
      continue;
    }

    const inferred = inferTagsFromExtensionId(entry.id);
    const merged = uniqueSorted([...fromInstructions, ...inferred]);

    if (entry.tags && Array.isArray(entry.tags) && entry.tags.length > 0) {
      alreadyPresent += 1;
      entry.tags = uniqueSorted([...entry.tags, ...merged]);
      continue;
    }

    entry.tags = merged;
    if (fromInstructions.length > 0) seededFromInstructions += 1;
    else if (inferred.length > 0) seededFromInference += 1;
  }
}

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`Bootstrapped tags in ${path.relative(workspaceRoot, catalogPath)}`);
console.log(`- Seeded from instructions: ${seededFromInstructions}`);
console.log(`- Seeded from id inference: ${seededFromInference}`);
console.log(`- Merged into existing tags: ${alreadyPresent}`);
