/**
 * Automated coverage reporter for RISC-V Extensions Landscape.
 *
 * Identifies mapping gaps and generates actionable reports.
 *
 * @module coverage_reporter
 */

'use strict';

import fs from 'node:fs';

export const EXTENSION_GROUPS = {
  supervisor: ['s_mem', 's_trap', 's_interrupt'],
  vector: ['z_vector'],
  vector_crypto: ['z_vector_crypto'],
  bit_manipulation: ['z_bit'],
  atomics: ['z_atomics'],
  crypto_scalar: ['z_crypto'],
  system: ['z_system', 'z_caches', 'z_load_store', 'z_security'],
  base_and_standard: ['base', 'standard', 'z_float', 'z_compress', 'z_integer'],
};

function normalizeTag(tag) {
  const lowered = String(tag || '').trim().toLowerCase();
  return lowered.replace(/^rv(?:32|64|128)?_/, '').split(/[_\s]+/).filter(Boolean)[0] || lowered;
}

function flattenCatalog(extensions) {
  const rows = [];
  if (Array.isArray(extensions)) {
    for (const block of extensions) {
      if (!block || typeof block !== 'object') continue;
      const group = String(block.group || 'unknown');
      const extList = Array.isArray(block.extensions) ? block.extensions : [];
      for (const ext of extList) {
        if (ext && typeof ext === 'object') rows.push({ group, ext });
      }
    }
    return rows;
  }

  if (extensions && typeof extensions === 'object') {
    for (const [group, extList] of Object.entries(extensions)) {
      if (!Array.isArray(extList)) continue;
      for (const ext of extList) {
        if (ext && typeof ext === 'object') rows.push({ group, ext });
      }
    }
    return rows;
  }

  throw new Error('Unsupported extension catalog structure.');
}

function buildExpectedByNormalizedExtension(instructions) {
  const byNorm = new Map();
  for (const [mnemonic, payload] of Object.entries(instructions || {})) {
    if (!payload || typeof payload !== 'object') continue;
    const extTags = Array.isArray(payload.extension) ? payload.extension : [];
    for (const tag of extTags) {
      const norm = normalizeTag(tag);
      if (!norm) continue;
      const set = byNorm.get(norm) ?? new Set();
      set.add(String(mnemonic));
      byNorm.set(norm, set);
    }
  }
  return byNorm;
}

function getCategory(group) {
  for (const [category, groups] of Object.entries(EXTENSION_GROUPS)) {
    if (groups.includes(group)) return category;
  }
  return 'other';
}

/**
 * Generate coverage report.
 *
 * @param {Object} extensions - riscv_extensions.json data.
 * @param {Object} instructions - instr_dict.json data.
 * @returns {Object} Coverage statistics.
 */
export function generateCoverageReport(extensions, instructions) {
  const catalogRows = flattenCatalog(extensions);
  const expectedByNorm = buildExpectedByNormalizedExtension(instructions);

  const extensionsReport = [];
  const groupStats = new Map();
  const categoryStats = new Map();

  for (const { group, ext } of catalogRows) {
    const id = String(ext.id || '').trim();
    if (!id) continue;

    const populatedInstructions = ext.instructions && typeof ext.instructions === 'object'
      ? Object.keys(ext.instructions).length
      : 0;

    const expected = expectedByNorm.get(normalizeTag(id));
    const expectedCount = expected ? expected.size : 0;

    let status = 'UNMAPPED';
    if (populatedInstructions > 0 && expectedCount > 0 && populatedInstructions < expectedCount) {
      status = 'PARTIALLY_MAPPED';
    } else if (populatedInstructions > 0) {
      status = 'FULLY_MAPPED';
    }

    const entry = {
      group,
      category: getCategory(group),
      id,
      name: String(ext.name || id),
      discontinued: Boolean(ext.discontinued),
      populated_instructions: populatedInstructions,
      expected_instructions: expectedCount,
      status,
    };
    extensionsReport.push(entry);

    const g = groupStats.get(group) ?? { total: 0, mapped: 0, partially: 0, unmapped: 0 };
    g.total += 1;
    if (status === 'FULLY_MAPPED') g.mapped += 1;
    if (status === 'PARTIALLY_MAPPED') g.partially += 1;
    if (status === 'UNMAPPED') g.unmapped += 1;
    groupStats.set(group, g);

    const c = categoryStats.get(entry.category) ?? { total: 0, mapped: 0, partially: 0, unmapped: 0 };
    c.total += 1;
    if (status === 'FULLY_MAPPED') c.mapped += 1;
    if (status === 'PARTIALLY_MAPPED') c.partially += 1;
    if (status === 'UNMAPPED') c.unmapped += 1;
    categoryStats.set(entry.category, c);
  }

  const summary = {
    total_extensions: extensionsReport.length,
    mapped: extensionsReport.filter((row) => row.status === 'FULLY_MAPPED').length,
    partially_mapped: extensionsReport.filter((row) => row.status === 'PARTIALLY_MAPPED').length,
    unmapped: extensionsReport.filter((row) => row.status === 'UNMAPPED').length,
  };

  summary.coverage_percent = summary.total_extensions
    ? Number(((summary.mapped / summary.total_extensions) * 100).toFixed(2))
    : 0;

  return {
    summary,
    groups: Object.fromEntries(groupStats),
    categories: Object.fromEntries(categoryStats),
    extensions: extensionsReport.sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id)),
  };
}

/**
 * Format report as Markdown.
 *
 * @param {Object} stats - Coverage statistics.
 * @returns {string} Markdown report.
 */
export function formatMarkdownReport(stats) {
  const lines = [];
  lines.push('# RISC-V Coverage Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total extensions: **${stats.summary.total_extensions}**`);
  lines.push(`- Fully mapped: **${stats.summary.mapped}**`);
  lines.push(`- Partially mapped: **${stats.summary.partially_mapped}**`);
  lines.push(`- Unmapped: **${stats.summary.unmapped}**`);
  lines.push(`- Coverage: **${stats.summary.coverage_percent}%**`);
  lines.push('');

  lines.push('## Category Coverage');
  lines.push('');
  lines.push('| Category | Total | Mapped | Partial | Unmapped | Coverage |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [category, row] of Object.entries(stats.categories).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pct = row.total ? ((row.mapped / row.total) * 100).toFixed(1) : '0.0';
    lines.push(`| ${category} | ${row.total} | ${row.mapped} | ${row.partially} | ${row.unmapped} | ${pct}% |`);
  }
  lines.push('');

  lines.push('## Group Coverage');
  lines.push('');
  lines.push('| Group | Total | Mapped | Partial | Unmapped | Coverage |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [group, row] of Object.entries(stats.groups).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pct = row.total ? ((row.mapped / row.total) * 100).toFixed(1) : '0.0';
    lines.push(`| ${group} | ${row.total} | ${row.mapped} | ${row.partially} | ${row.unmapped} | ${pct}% |`);
  }
  lines.push('');

  lines.push('## Unmapped Extensions');
  lines.push('');
  lines.push('| Group | Extension | Expected | Populated | Status |');
  lines.push('|---|---|---:|---:|---|');
  for (const ext of stats.extensions) {
    if (ext.status === 'UNMAPPED') {
      lines.push(`| ${ext.group} | ${ext.id} | ${ext.expected_instructions} | ${ext.populated_instructions} | ${ext.status} |`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Convenience function for CLI workflows.
 *
 * @param {string} extensionsPath - Path to riscv_extensions.json.
 * @param {string} instrDictPath - Path to instr_dict.json.
 * @returns {Object} Coverage statistics.
 */
export function generateCoverageReportFromFiles(extensionsPath, instrDictPath) {
  const extensions = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));
  const instructions = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
  return generateCoverageReport(extensions, instructions);
}
