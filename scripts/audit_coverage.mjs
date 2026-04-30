#!/usr/bin/env node
// audit_coverage.mjs
// Shows which extensions still need instruction data.
//
//   node scripts/audit_coverage.mjs          # table
//   node scripts/audit_coverage.mjs --json   # JSON

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const instrDict = JSON.parse(read('src/instr_dict.json'));
const catalog   = JSON.parse(read('src/riscv_extensions.json'));
const jsxSource = read('src/risc_v_visualizer.jsx');

// Pull the extensionInstructions object out of the JSX by finding its braces.
function extractExtensionInstructions(text) {
  const marker = 'const extensionInstructions =';
  const idx = text.indexOf(marker);
  if (idx === -1) throw new Error('Cannot find extensionInstructions in JSX');
  const open = text.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) {
      return vm.runInNewContext(`(${text.slice(open, i + 1)})`, {}, { timeout: 2000 });
    }
  }
  throw new Error('Unmatched brace in extensionInstructions');
}

const extInstr = extractExtensionInstructions(jsxSource);

// Walk the catalog and count instructions per extension.
const stats = [];
const jsxIds = new Set(Object.keys(extInstr));

for (const [category, entries] of Object.entries(catalog)) {
  if (!Array.isArray(entries)) continue;
  for (const ext of entries) {
    const instrCount = ext.instructions ? Object.keys(ext.instructions).length : 0;
    stats.push({ category, id: ext.id, instrCount, inJsx: jsxIds.has(ext.id) });
  }
}

// Catch anything in the JSX mapping that isn't in the catalog.
const catalogIds = new Set(stats.map((s) => s.id));
const jsxOnly = [...jsxIds].filter((id) => !catalogIds.has(id)).sort();

// Roll up per-category totals.
const byCat = {};
for (const s of stats) {
  const c = (byCat[s.category] ??= { total: 0, populated: 0, empty: 0 });
  c.total++;
  if (s.instrCount > 0) c.populated++;
  else c.empty++;
}

const jsonFlag = process.argv.includes('--json');
const totalExt = stats.length;
const populated = stats.filter((s) => s.instrCount > 0);
const empty = stats.filter((s) => s.instrCount === 0);

if (jsonFlag) {
  const report = {
    summary: {
      totalExtensions: totalExt,
      withInstructions: populated.length,
      withoutInstructions: empty.length,
      coveragePercent: +((populated.length / totalExt) * 100).toFixed(1),
      totalInstrDictEntries: Object.keys(instrDict).length,
      jsxMappings: jsxIds.size,
    },
    byCategory: byCat,
    emptyExtensions: empty.map((s) => ({ category: s.category, id: s.id, inJsx: s.inJsx })),
    jsxOnlyExtensions: jsxOnly,
  };
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('=== Coverage Report ===\n');
  console.log(`Total extensions:        ${totalExt}`);
  console.log(`With instructions:       ${populated.length}  (${((populated.length / totalExt) * 100).toFixed(1)}%)`);
  console.log(`Without instructions:    ${empty.length}  (${((empty.length / totalExt) * 100).toFixed(1)}%)`);
  console.log(`instr_dict.json entries: ${Object.keys(instrDict).length}`);
  console.log(`JSX mnemonic mappings:   ${jsxIds.size}\n`);

  console.log('--- By Category ---');
  const cats = Object.entries(byCat).sort(([, a], [, b]) => a.populated / a.total - b.populated / b.total);
  const maxName = Math.max(...cats.map(([n]) => n.length));
  for (const [name, c] of cats) {
    const pct = ((c.populated / c.total) * 100).toFixed(0).padStart(3);
    console.log(`  ${name.padEnd(maxName)}  ${String(c.populated).padStart(2)}/${String(c.total).padStart(2)}  (${pct}%)`);
  }

  console.log(`\n--- Extensions Without Instructions (${empty.length}) ---`);
  for (const s of empty) {
    const jsx = s.inJsx ? '' : '  [not in JSX]';
    console.log(`  ${s.category.padEnd(maxName)}  ${s.id}${jsx}`);
  }

  if (jsxOnly.length) {
    console.log(`\n--- In JSX but Missing from Catalog (${jsxOnly.length}) ---`);
    jsxOnly.forEach((id) => console.log(`  ${id}`));
  }
}
