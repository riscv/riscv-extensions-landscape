/**
 * exportUtils.js — Export generator for the ISA Configuration Builder
 *
 * Goal: produce a complete, accurate, self-describing ISA configuration file
 * that is valuable on its own terms, not shaped to satisfy any specific
 * external validator (riscv-config is confirmed deprecated; its named
 * successor carries an explicit "work-in-progress" caution).
 *
 * COMPILER COMPATIBILITY SCOPE (per extension family):
 *   Scalar crypto (Zk, Zkn, Zks, Zbkb, etc.): supported since ~GCC 12-13 / LLVM 14-15.
 *   Vector crypto (Zvkned, Zvbb, Zvbc, Zvkg family): GCC 14+ / LLVM 18+ (stable).
 *   Zve/Zvl sub-profile tokens: exact min version unconfirmed; verify with your toolchain.
 *   Base/gc extensions: universally stable.
 *   Full details and CI gap: see marchUtils.js COMPILER VERIFICATION SCOPE.
 */

import { buildMarchString, BASE_ISA_IDS, BASE_ISA_PREFIX_MAP } from './marchUtils.js';
import { buildCombinedCatalog } from './marchUtils.js';
import { resolveParams } from './isaGraph.js';

// Tokens that are not valid ISA string entries (e.g. K, P are retired/placeholder)
const INVALID_ISA_TOKENS = new Set(['K', 'P']);

// Privilege / virtual-memory extension prefix patterns
function isPrivilegeTag(id) {
  return /^S[vms]/i.test(id) || id.toLowerCase().startsWith('sm') || id.toLowerCase().startsWith('ss');
}

/**
 * Generates a complete, self-describing ISA configuration YAML for the
 * selected extensions.
 *
 * The output is structured in two parts:
 *   Part 1 — Header: base ISA, extension list, -march string, inferred
 *             spec-version annotations, optional Vendor/Device fields.
 *   Part 2 — Instruction catalog (if includeInstructions is true): the full
 *             deduplicated instruction list for the selection, including
 *             encoding, match/mask, variable fields, and source extension(s).
 *
 * @param {string[]} selectedIds      — extension IDs currently in the workspace
 * @param {Array}    allExts          — full extension catalog (for catalog lookup)
 * @param {boolean}  includeInstructions — whether to append the instruction catalog
 * @returns {{ yaml: string, warnings: string[] }}
 */
export function buildIsaConfigYaml(selectedIds, allExts, includeInstructions = true) {
  const warnings = [];

  if (!selectedIds || selectedIds.length === 0) {
    return { yaml: '', warnings: ['No extensions selected.'] };
  }

  // 1. Identify base ISA
  let baseInfo = null;
  for (const id of selectedIds) {
    if (BASE_ISA_IDS.has(id)) {
      baseInfo = { id, ...BASE_ISA_PREFIX_MAP[id] };
      break;
    }
  }
  if (!baseInfo) {
    return { yaml: '', warnings: ['No base ISA selected.'] };
  }

  // 2. Partition extensions
  const singleLetters = [];
  const zExts        = [];
  const privExts     = [];
  const allExtTokens = []; // ordered list for the extensions: block

  let hasZicsrOrZifencei = false;
  let hasSupervisor      = false;

  for (const id of selectedIds) {
    if (BASE_ISA_IDS.has(id)) continue;

    const idUpper = id.toUpperCase();

    if (idUpper === 'ZICSR' || idUpper === 'ZIFENCEI') hasZicsrOrZifencei = true;
    if (idUpper === 'S' || isPrivilegeTag(id)) hasSupervisor = true;

    if (INVALID_ISA_TOKENS.has(idUpper)) continue;

    if (isPrivilegeTag(id)) {
      privExts.push(id);
      allExtTokens.push(id);
      continue;
    }

    if (id.length === 1) {
      singleLetters.push(idUpper);
      allExtTokens.push(idUpper);
    } else {
      const formatted = id.charAt(0).toUpperCase() + id.slice(1).toLowerCase();
      zExts.push(formatted);
      allExtTokens.push(formatted);
    }
  }

  // 3. Sort single letters canonically (RISC-V Unprivileged ISA §27)
  const CANONICAL_ORDER = ['I','E','M','A','F','D','Q','L','C','J','T','V','N','H','S','U'];
  const canonMap = Object.fromEntries(CANONICAL_ORDER.map((c, i) => [c, i]));
  singleLetters.sort((a, b) => {
    const ia = canonMap[a] ?? 999, ib = canonMap[b] ?? 999;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });
  const filteredSingles = singleLetters.filter(l => l !== baseInfo.base.toUpperCase());

  // 4. Sort Z-extensions alphabetically
  zExts.sort((a, b) => a.localeCompare(b));

  // 5. Build the ISA march-like string
  const basePrefix = `RV${baseInfo.xlen}${baseInfo.base.toUpperCase()}`;
  const singlesStr = filteredSingles.join('');
  const zStr       = zExts.length > 0 ? zExts.join('_') : '';
  const isaString  = `${basePrefix}${singlesStr}${zStr ? (singlesStr ? '_' : '') + zStr : ''}`;

  // 6. Infer spec-version annotations
  // These are informational annotations derived from which extensions are
  // present. They are NOT enum-validated fields for any specific tool.
  const userSpecVersion  = hasZicsrOrZifencei ? '2.3' : '2.2';
  const privSpecVersion  = hasSupervisor      ? '1.11' : '1.10';

  // 7. Build -march string (compiler flag)
  // Compatibility: scalar crypto ~GCC12-13/LLVM14-15; vector crypto GCC14+/LLVM18+;
  // Zve/Zvl version floor unconfirmed. See marchUtils.js COMPILER VERIFICATION SCOPE.
  const marchRes    = buildMarchString(selectedIds, allExts);
  const marchString = marchRes.march || 'none';

  // 8. Build all extensions list for YAML
  const allExtsList = [baseInfo.id, ...filteredSingles, ...zExts, ...privExts];

  // 9. Assemble YAML
  const lines = [];

  // — File header comments —
  lines.push(`# ISA Configuration — generated by RISC-V Extension Landscape`);
  lines.push(`# https://github.com/riscv/riscv-extensions-landscape`);
  lines.push(`#`);
  lines.push(`# This file is a complete, self-describing configuration of your selected`);
  lines.push(`# RISC-V extensions. It is not tied to any specific external validator schema.`);
  lines.push(`# Adjust field names/structure once your target submission format is known.`);
  lines.push(`#`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(``);

  // — Part 1: Header —
  // ##########################################################################
  // Part 1: ISA Configuration Header
  // ##########################################################################
  lines.push(``);
  lines.push(`vendor: ""   # Optional — your organization name (e.g. "SiFive", "Qualcomm")`);
  lines.push(`device: ""   # Optional — your core/chip name  (e.g. "U74", "Oryon")`);
  lines.push(``);
  lines.push(`base_isa: ${basePrefix}   # Base ISA only (e.g. RV64I, RV32E)`);
  lines.push(`isa_string: ${isaString}   # Full ISA descriptor (base + all selected extensions)`);
  lines.push(`xlen: ${baseInfo.xlen}`);
  lines.push(``);
  lines.push(`# Compiler -march flag. Toolchain compatibility varies by extension family:`);
  lines.push(`#   Scalar crypto (Zk, Zkn, Zks, Zbkb, etc.): supported since ~GCC 12-13 / LLVM 14-15.`);
  lines.push(`#   Vector crypto (Zvkned, Zvbb, Zvbc family): requires GCC 14+ / non-experimental LLVM 18+.`);
  lines.push(`#   Zve/Zvl sub-profile tokens: exact min version unconfirmed — verify with your toolchain:`);
  lines.push(`#     gcc: riscv64-unknown-elf-gcc -march=help`);
  lines.push(`#     clang: clang --target=riscv64-unknown-elf --print-supported-extensions`);
  lines.push(`#   Non-ISA extensions excluded from this string.`);
  lines.push(`march: ${marchString}`);
  lines.push(``);
  lines.push(`# Spec-version annotations — inferred from selected extensions.`);
  lines.push(`# Zicsr/Zifencei present → User Spec 2.3+; supervisor exts → Priv Spec 1.11+`);
  lines.push(`user_spec_version: "${userSpecVersion}"`);
  lines.push(`privilege_spec_version: "${privSpecVersion}"`);
  lines.push(``);
  lines.push(`# Implementation parameters the selection constrains, from`);
  lines.push(`# riscv-unified-db. -march can express only VLEN, and only obliquely`);
  lines.push(`# through the Zvl*b extensions, so these are the part of the`);
  lines.push(`# configuration a compiler flag cannot carry.`);
  lines.push(`#`);
  lines.push(`#   greaterThanOrEqual — a floor; the largest wins`);
  lines.push(`#   includes           — the value must offer at least these`);
  lines.push(`#   oneOf              — pick one; each extension narrows the field`);
  lines.push(`#   equal              — fixed`);
  const params = resolveParams(selectedIds);
  if (params.length === 0) {
    lines.push(`parameters: {}   # nothing in this selection constrains one`);
  } else {
    lines.push(`parameters:`);
    for (const prm of params) {
      lines.push(`  ${prm.name}:`);
      lines.push(`    constraint: ${prm.kind}`);
      const value = Array.isArray(prm.value)
        ? `[${prm.value.map((v) => (typeof v === 'string' ? JSON.stringify(v) : v)).join(', ')}]`
        : (typeof prm.value === 'string' ? JSON.stringify(prm.value) : prm.value);
      lines.push(`    value: ${value}`);
      lines.push(`    required_by: [${prm.from.join(', ')}]`);
      if (prm.reason) lines.push(`    reason: ${JSON.stringify(prm.reason)}`);
      // A conflict is left in the file on purpose: silently dropping it would
      // produce a configuration that looks valid and is not.
      if (prm.conflict) lines.push(`    CONFLICT: ${JSON.stringify(prm.conflict)}`);
    }
  }
  lines.push(``);
  lines.push(`extensions:`);
  for (const ext of allExtsList) {
    lines.push(`  - ${ext}`);
  }

  if (privExts.length > 0) {
    lines.push(``);
    lines.push(`# Note: the following are privilege/virtual-memory descriptors.`);
    lines.push(`# They belong in a separate privilege-spec config document if your`);
    lines.push(`# toolchain requires that distinction.`);
    lines.push(`privilege_extensions:`);
    for (const ext of privExts) {
      lines.push(`  - ${ext}`);
    }
  }

  // — Part 2: Instruction catalog —
  if (includeInstructions) {
    const catalog = buildCombinedCatalog(selectedIds, allExts);

    lines.push(``);
    lines.push(`# ##########################################################################`);
    lines.push(`# Part 2: Full Instruction Catalog (${catalog.length} instructions)`);
    lines.push(`#`);
    lines.push(`# Deduplicated by mnemonic + encoding. Instructions shared across multiple`);
    lines.push(`# extensions list all source extensions under defined_by.`);
    lines.push(`# ##########################################################################`);
    lines.push(``);
    lines.push(`instructions:`);

    for (const instr of catalog) {
      lines.push(`  - mnemonic: ${instr.mnemonic}`);
      lines.push(`    encoding: "${instr.encoding}"`);
      lines.push(`    match: "${instr.match}"`);
      lines.push(`    mask: "${instr.mask}"`);
      if (instr.variable_fields && instr.variable_fields.length > 0) {
        lines.push(`    variable_fields: [${instr.variable_fields.join(', ')}]`);
      }
      lines.push(`    defined_by: [${instr.sources.map(s => s.extId).join(', ')}]`);
    }
  }

  lines.push(``); // trailing newline
  return { yaml: lines.join('\n'), warnings };
}
