import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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
  if (markerIndex === -1) return null;

  const braceStart = jsxText.indexOf('{', markerIndex);
  if (braceStart === -1) return null;

  const braceEnd = findMatchingBrace(jsxText, braceStart);
  if (braceEnd === -1) return null;

  const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
  const sandbox = {};
  return vm.runInNewContext(`(${objectLiteral})`, sandbox, { timeout: 1000 });
}

function mnemonicToInstrDictKey(mnemonic) {
  return String(mnemonic).trim().toLowerCase().replaceAll('.', '_');
}

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function isMappedExtension(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const instructions = entry.instructions;
  if (!instructions || typeof instructions !== 'object' || Array.isArray(instructions)) return false;
  return Object.keys(instructions).length > 0;
}

function buildCoverage(catalog) {
  const groups = [];
  const allUnmappedExtensionIds = [];
  let total = 0;
  let mapped = 0;

  for (const [group, entries] of Object.entries(catalog)) {
    if (!Array.isArray(entries)) continue;

    let groupTotal = 0;
    let groupMapped = 0;
    const groupUnmappedIds = [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.id ?? '(missing-id)';
      groupTotal += 1;
      total += 1;

      if (isMappedExtension(entry)) {
        groupMapped += 1;
        mapped += 1;
      } else {
        groupUnmappedIds.push(id);
        allUnmappedExtensionIds.push(id);
      }
    }

    const groupUnmapped = groupTotal - groupMapped;
    groups.push({
      group,
      total: groupTotal,
      mapped: groupMapped,
      unmapped: groupUnmapped,
      coverage_percent: toPercent(groupMapped, groupTotal),
      unmapped_extension_ids: groupUnmappedIds,
    });
  }

  const unmapped = total - mapped;
  return {
    totals: {
      total_extensions: total,
      mapped_extensions: mapped,
      unmapped_extensions: unmapped,
      coverage_percent: toPercent(mapped, total),
    },
    groups,
    catalog_unmapped_extension_ids: allUnmappedExtensionIds,
  };
}

function buildCatalogIndex(catalog) {
  const index = new Set();
  for (const entries of Object.values(catalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.id) index.add(entry.id);
    }
  }
  return index;
}

function buildReconciliationReport(catalog, instrDict, extensionInstructions) {
  if (!extensionInstructions || typeof extensionInstructions !== 'object') {
    return {
      available: false,
      reason: 'Could not parse extensionInstructions from src/risc_v_visualizer.jsx',
    };
  }

  const catalogIds = buildCatalogIndex(catalog);
  const missingExtensionsInCatalog = [];
  const unresolvedByExtension = {};
  let unresolvedTotal = 0;

  for (const [extId, mnemonics] of Object.entries(extensionInstructions)) {
    if (!catalogIds.has(extId)) {
      missingExtensionsInCatalog.push(extId);
      continue;
    }
    if (!Array.isArray(mnemonics)) continue;

    const missing = [];
    for (const mnemonic of mnemonics) {
      const key = mnemonicToInstrDictKey(mnemonic);
      if (!instrDict[key]) missing.push(mnemonic);
    }

    if (missing.length > 0) {
      unresolvedByExtension[extId] = missing;
      unresolvedTotal += missing.length;
    }
  }

  return {
    available: true,
    missing_extensions_in_catalog: missingExtensionsInCatalog.sort((a, b) => a.localeCompare(b)),
    unresolved_opcode_tags_total: unresolvedTotal,
    unresolved_opcode_tags_by_extension: Object.fromEntries(
      Object.entries(unresolvedByExtension).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

function formatTextReport(report) {
  const lines = [];
  const totals = report.totals;
  const reconciliation = report.reconciliation;

  lines.push('Extension Coverage Report');
  lines.push('');
  lines.push(`Total extensions: ${totals.total_extensions}`);
  lines.push(`Mapped: ${totals.mapped_extensions}`);
  lines.push(`Unmapped: ${totals.unmapped_extensions}`);
  lines.push(`Coverage: ${totals.coverage_percent}%`);
  lines.push('');
  lines.push('Group-wise summary');
  lines.push('group,total,mapped,unmapped,coverage_percent');
  for (const g of report.groups) {
    lines.push(`${g.group},${g.total},${g.mapped},${g.unmapped},${g.coverage_percent}`);
  }
  lines.push('');
  lines.push(`Catalog unmapped extension IDs (${report.catalog_unmapped_extension_ids.length}):`);
  lines.push(report.catalog_unmapped_extension_ids.join(', ') || '(none)');

  if (reconciliation.available) {
    lines.push('');
    lines.push('Reconciliation summary');
    lines.push(
      `Extensions in extensionInstructions but missing in catalog (${reconciliation.missing_extensions_in_catalog.length}): ${reconciliation.missing_extensions_in_catalog.join(', ') || '(none)'}`,
    );
    lines.push(`Unresolved opcode tags total: ${reconciliation.unresolved_opcode_tags_total}`);
  }

  return lines.join('\n');
}

function main() {
  const args = new Set(process.argv.slice(2));
  const asJson = args.has('--json');

  const workspaceRoot = process.cwd();
  const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
  const instrDictPath = path.join(workspaceRoot, 'src', 'instr_dict.json');
  const visualizerPath = path.join(workspaceRoot, 'src', 'risc_v_visualizer.jsx');

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const instrDict = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
  const visualizerSource = fs.readFileSync(visualizerPath, 'utf8');
  const extensionInstructions = extractExtensionInstructions(visualizerSource);

  const coverage = buildCoverage(catalog);
  const reconciliation = buildReconciliationReport(catalog, instrDict, extensionInstructions);

  const report = {
    generated_at: new Date().toISOString(),
    source_files: {
      catalog: path.relative(workspaceRoot, catalogPath),
      instr_dict: path.relative(workspaceRoot, instrDictPath),
      visualizer: path.relative(workspaceRoot, visualizerPath),
    },
    ...coverage,
    reconciliation,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatTextReport(report));
}

main();
