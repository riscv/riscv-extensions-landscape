#!/usr/bin/env node
/**
 * Emit baseline coverage metrics for the extension/instruction catalog.
 * Writes reports/baseline_metrics.json for CI and PR review.
 */

import fs from 'node:fs';
import path from 'node:path';
import { inferTagsFromExtensionId } from './lib/sync_rules.mjs';

const workspaceRoot = process.cwd();
const instrDictPath = path.join(workspaceRoot, 'src', 'instr_dict.json');
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const reportDir = path.join(workspaceRoot, 'reports');
const reportPath = path.join(reportDir, 'baseline_metrics.json');

const instrDict = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const catalogEntries = [];
const catalogIds = new Set();
const tagToCatalogIds = new Map();

for (const [category, entries] of Object.entries(catalog)) {
  if (!Array.isArray(entries)) continue;
  for (const entry of entries) {
    if (!entry?.id) continue;
    catalogIds.add(entry.id);
    catalogEntries.push({ category, entry });

    for (const tag of entry.tags || []) {
      const ids = tagToCatalogIds.get(tag) ?? new Set();
      ids.add(entry.id);
      tagToCatalogIds.set(tag, ids);
    }
  }
}

let extensionsWithInstructions = 0;
let extensionsEmpty = 0;
let extensionsNoTags = 0;
let totalInstructionAssignments = 0;
const uniqueSyncedMnemonics = new Set();

for (const { entry } of catalogEntries) {
  const count = entry.instructions ? Object.keys(entry.instructions).length : 0;
  if (count > 0) {
    extensionsWithInstructions += 1;
    totalInstructionAssignments += count;
    for (const mnemonic of Object.keys(entry.instructions)) {
      uniqueSyncedMnemonics.add(mnemonic.trim().toLowerCase().replaceAll('.', '_'));
    }
  } else {
    extensionsEmpty += 1;
  }
  if (!entry.tags || entry.tags.length === 0) extensionsNoTags += 1;
}

const instrDictKeys = Object.keys(instrDict);
const instrDictUnmapped = [];
const orphanTags = new Set();

for (const [dictKey, details] of Object.entries(instrDict)) {
  const tags = details?.extension || [];
  const hasCatalogTag = tags.some((tag) => tagToCatalogIds.has(tag));
  if (!hasCatalogTag) instrDictUnmapped.push({ dictKey, tags });
  for (const tag of tags) {
    if (!tagToCatalogIds.has(tag)) orphanTags.add(tag);
  }
}

const coveragePercent =
  instrDictKeys.length === 0
    ? 0
    : Number((((instrDictKeys.length - instrDictUnmapped.length) / instrDictKeys.length) * 100).toFixed(2));

const extensionCoveragePercent =
  catalogIds.size === 0
    ? 0
    : Number(((extensionsWithInstructions / catalogIds.size) * 100).toFixed(2));

const report = {
  generated_at: new Date().toISOString(),
  summary: {
    instr_dict_entries: instrDictKeys.length,
    catalog_extensions: catalogIds.size,
    extensions_with_instructions: extensionsWithInstructions,
    extensions_without_instructions: extensionsEmpty,
    extensions_missing_tags: extensionsNoTags,
    unique_synced_mnemonics: uniqueSyncedMnemonics.size,
    total_instruction_assignments: totalInstructionAssignments,
    instr_dict_unmapped: instrDictUnmapped.length,
    orphan_opcode_tags: orphanTags.size,
    instr_dict_coverage_percent: coveragePercent,
    extension_instruction_coverage_percent: extensionCoveragePercent,
  },
  orphan_opcode_tags: [...orphanTags].sort(),
  top_unmapped_instr_dict: instrDictUnmapped.slice(0, 50),
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log('=== Baseline Metrics ===');
console.log(`instr_dict entries:              ${report.summary.instr_dict_entries}`);
console.log(`Catalog extensions:              ${report.summary.catalog_extensions}`);
console.log(`Extensions with instructions:    ${report.summary.extensions_with_instructions}`);
console.log(`Extensions without instructions: ${report.summary.extensions_without_instructions}`);
console.log(`Extensions missing tags:         ${report.summary.extensions_missing_tags}`);
console.log(`Unique synced mnemonics:         ${report.summary.unique_synced_mnemonics}`);
console.log(`instr_dict unmapped:             ${report.summary.instr_dict_unmapped}`);
console.log(`instr_dict coverage:             ${report.summary.instr_dict_coverage_percent}%`);
console.log(`Extension instruction coverage:    ${report.summary.extension_instruction_coverage_percent}%`);
console.log(`Orphan opcode tags:              ${report.summary.orphan_opcode_tags}`);
console.log(`\nWrote ${path.relative(workspaceRoot, reportPath)}`);
