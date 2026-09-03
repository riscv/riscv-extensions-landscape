/**
 * marchUtils.js — RISC-V -march String Utilities
 *
 * Pure functions. No React. Callers pass the flat extension array from
 * riscv_extensions.json — the catalog is never imported here.
 *
 * Exception: dependency data now comes from ./isaGraph.js, which owns
 * isa-dependency-graph.json. That table used to live in this file and drifted;
 * see isaGraph.js for why it moved and how it is validated.
 *
 * DATA SOURCES (documented for every design decision):
 *   [SPEC]   RISC-V Unprivileged ISA Specification, Chapter 27
 *            "ISA Extension Naming Conventions" — canonical ordering, G shorthand
 *            https://github.com/riscv/riscv-isa-manual
 *   [OPS]    riscv/riscv-opcodes — instruction encodings
 *            https://github.com/riscv/riscv-opcodes
 *   [GCC]    GCC 12+ riscv/riscv.cc — G expansion convention, verified against source
 *   [DATA]   Data-driven decisions from inspecting this project's own
 *            riscv_extensions.json (noted inline where used)
 *
 * COMPILER VERIFICATION SCOPE:
 *   The -march strings produced by this module have been cross-checked by primary source
 *   (GCC docs, LLVM docs, riscv-toolchain-conventions). Findings per extension family:
 *
 *   Scalar crypto (Zk, Zkn, Zks, Zbkb, Zbkc, Zbkx, Zknd, Zkne, Zknh, Zksed, Zksh):
 *     Supported since roughly GCC 12-13 / LLVM 14-15. These have worked in production
 *     toolchains since early 2022. No bleeding-edge requirement.
 *
 *   Vector crypto (Zvkned, Zvbb, Zvbc, Zvkg, Zvksh, Zvksed — the Zvk family):
 *     GCC 14+ / LLVM 18+ (stable). LLVM 17 had these behind an experimental flag;
 *     LLVM 18 promoted them to stable. Use GCC 14 or LLVM 18 for non-experimental use.
 *
 *   Zve/Zvl sub-profile tokens (Zve32x, Zve64d, Zvl128b, etc.):
 *     Exact minimum version not independently confirmed from primary source.
 *     Do not cite a hard version number here. Engineers should verify against their
 *     installed toolchain directly:
 *       gcc:   riscv64-unknown-elf-gcc -march=help
 *       clang: clang --target=riscv64-unknown-elf --print-supported-extensions
 *
 *   Base / gc extensions (Zicsr, Zifencei, C, M, A, F, D, etc.):
 *     Universally stable across all modern RISC-V toolchains.
 *
 *   CI does compile-check the generated -march strings against clang. Rows that
 *   need a newer clang than the job provides are skipped and reported, so the
 *   check is a floor rather than full coverage — that is the remaining gap.
 */

/**
 * The compiler-compatibility summary, condensed, as the single source of truth.
 *
 * This prose used to live in three hand-maintained copies: the scope block
 * above, the header of exportUtils.js, and the comment exportUtils.js emits
 * into every exported file. They had drifted apart — the export header named
 * Zvkg where the emitted copy omitted it, while the block above lists the
 * fuller Zvk family — so a reader comparing an exported file against the
 * source got two different answers to one question. The emitted copy is
 * generated from here now, and the export header points at this rather than
 * restating it.
 *
 * The vector-crypto family is named by prefix deliberately. Enumerating a
 * handful of its members is exactly what went stale, and riscv_extensions.json
 * carries 21 of them; `Zvk*` cannot drift.
 */
export const COMPILER_COMPAT_NOTES = [
  'Scalar crypto (Zk, Zkn, Zks, Zbkb, etc.): supported since ~GCC 12-13 / LLVM 14-15.',
  'Vector crypto (the Zvk* family, plus Zvbb and Zvbc): requires GCC 14+ / non-experimental LLVM 18+.',
  'Zve/Zvl sub-profile tokens: exact min version unconfirmed — verify with your toolchain:',
  '  gcc: riscv64-unknown-elf-gcc -march=help',
  '  clang: clang --target=riscv64-unknown-elf --print-supported-extensions',
  'Non-ISA extensions excluded from this string.',
];

// ============================================================================
// Canonical single-letter extension ordering
// ============================================================================
/**
 * Order per RISC-V Unprivileged ISA Spec §27 (Table 27.11). [SPEC]
 *
 * Extensions not present in this project's catalog (L, J, T) are included
 * so that if they are ever added, ordering stays spec-compliant without a
 * code change.
 *
 * NOTE: This array is the ONLY hardcoded ordering in this module.
 * It is hardcoded because the ISA spec defines it normatively and the
 * project's riscv_extensions.json carries no machine-readable canonical order.
 */
export const SINGLE_LETTER_CANONICAL_ORDER = [
  'i', 'e', 'm', 'a', 'f', 'd', 'q', 'l', 'c', 'b', 'j', 't', 'p', 'v', 'n',
  's', 'u', 'h', 'k',
];

// ============================================================================
// G shorthand
// ============================================================================
/**
 * Expansion of the 'g' shorthand. [SPEC] §27 + [GCC]
 *
 *   G = I + M + A + F + D + Zicsr + Zifencei
 *
 * Historical note:
 *   Prior to the ISA split (~2019), Zicsr and Zifencei were part of the base
 *   I extension. They were separated so deeply-embedded systems could omit them.
 *   GCC 12+ and all current LLVM versions expand 'g' to include Zicsr and
 *   Zifencei. Verified against GCC riscv/riscv.cc (riscv_ext_info table) and
 *   LLVM RISCVISAInfo.cpp.
 *
 * DECODER: expands 'g' using this list.
 * ENCODER: NEVER emits 'g'. Always emits explicit tokens.
 * Rationale: explicit tokens are unambiguous across toolchain versions.
 */
export const G_EXPANSION_TOKENS = ['i', 'm', 'a', 'f', 'd', 'zicsr', 'zifencei'];

// ============================================================================
// Base ISA definitions
// ============================================================================
/**
 * Base ISA IDs. These form the rv{xlen}{base} prefix, not extension tokens.
 * [DATA] — derived from the 'base' group of riscv_extensions.json.
 */
export const BASE_ISA_IDS = new Set(['RV32I', 'RV64I', 'RV32E', 'RV64E', 'RV128I']);

export const BASE_ISA_PREFIX_MAP = {
  RV32I: { xlen: 32, base: 'i' },
  RV64I: { xlen: 64, base: 'i' },
  RV32E: { xlen: 32, base: 'e' },
  RV64E: { xlen: 64, base: 'e' },
  RV128I: { xlen: 128, base: 'i' },
};

// ============================================================================
// Dependencies and conflicts
// ============================================================================
/**
 * These used to be hand-written tables here, covering ~21 extensions. They are
 * now derived from src/isa-dependency-graph.json, which carries a node for every
 * catalog extension and a citation on every edge.
 *
 * Re-exported in the flat `{id: [ext]}` shape the existing callers expect. New
 * code should prefer resolveSelection() from ./isaGraph.js, which reports what
 * it implied and why instead of returning a bare set.
 */
// Imported, not `export ... from`: a re-export creates no local binding, and
// isIncompatible()/dependsOnIncompatible() below reference these directly.
import { SMART_DEPENDENCIES, INCOMPATIBLE_WITH } from './isaGraph.js';

export { SMART_DEPENDENCIES, INCOMPATIBLE_WITH };

// ============================================================================
// Architectural tags that are not -march ISA options
// ============================================================================
/**
 * Privileged spec version compliance tags.
 * These indicate which privileged spec version a platform complies with.
 * They are NOT ISA extension options expressible in -march.
 * [DATA] — pattern observed in riscv_extensions.json s_trap group
 */
const SPEC_VERSION_TAG_PATTERN = /^(Sm|Ss)\d+p\d+$/;

/**
 * Non-ISA spec/trace tags present in the catalog. [DATA]
 */
const NON_ISA_EXTENSION_IDS = new Set(['RERI', 'HTI']);

/**
 * Catalog entries that exist for UI/grouping purposes only and MUST NOT be
 * emitted into a -march string or resolved by the decoder.
 *
 * Verified against GCC 12+ and LLVM source (riscv.cc / RISCVISAInfo.cpp):
 *
 *   K  — UI umbrella tag for Zk-star/Zvk-star crypto bundles.
 *        GCC/LLVM do not recognize 'k' as a -march letter; use 'zk' instead.
 *        [GCC] https://github.com/riscv/riscv-isa-manual S27
 *
 *   B  — Originally grouped Zba/Zbb/Zbc/Zbs. Never ratified as a single-
 *        letter march token; toolchains require explicit Z-extensions.
 *
 *   N  — User-Level Interrupts. Removed from the RISC-V spec (2024).
 *        No mainstream toolchain recognizes it.
 *
 *   P  — Packed-SIMD/DSP. Not ratified; not in GCC or LLVM march tables.
 *
 *   S  — Supervisor ISA (Volume II). A privilege-level descriptor, not an
 *        ISA extension token expressible in -march.
 *
 *   U  — User ISA (Volume II). Same reasoning as S above.
 *
 * H is deliberately NOT in this list — GCC and LLVM both recognize 'h'
 * (Hypervisor) as a valid -march single-letter extension.
 *
 * [DATA] Cross-checked against our riscv_extensions.json catalog descriptions.
 */
/**
 * Sv32/Sv39/Sv48/Sv57 are address-translation MODES, not extensions. They name
 * the page-table depth a hart supports and are selected at runtime through the
 * `satp` MODE field — the same category as S and U above.
 *
 * Verified against clang 21: `-march=rv64imafdc_sv39` is rejected with
 * "unsupported standard supervisor-level extension 'sv'" (the parser reads `sv`
 * plus version `39`), while every other Sv* extension — Svbare, Svade, Svadu,
 * Svnapot, Svpbmt, Svinval — is accepted. Emitting them produced an invalid
 * -march for all four ratified profiles, each of which mandates Sv39.
 */
/**
 * Shorthand extensions that ABSORB their members in an ISA string.
 *
 * These are not ordinary dependencies. D depends on F and both belong in the
 * string; Zkn is a *name for* its members, so listing both is malformed. The
 * riscv-config validator (riscv/riscv-config, isa_validator.py) rejects it:
 *
 *   "Zkn is a superset of Zbkb, Zbkc, Zbkx, Zkne, Zknd, Zknh. In presence of
 *    Zkn the subsets must be ignored in the ISA string."
 *
 * clang accepts the redundant form, which is why a toolchain check never
 * noticed. The members stay in the dependency graph — selecting Zkn genuinely
 * does give you Zbkb — they are simply not spelled out in -march.
 */
export const SHORTHAND_BUNDLES = {
  Zkn: ['Zbkb', 'Zbkc', 'Zbkx', 'Zknd', 'Zkne', 'Zknh'],
  Zks: ['Zbkb', 'Zbkc', 'Zbkx', 'Zksed', 'Zksh'],
  Zk:  ['Zbkb', 'Zbkc', 'Zbkx', 'Zknd', 'Zkne', 'Zknh', 'Zkn', 'Zkr', 'Zkt'],
};

/** The satp MODE values, kept separate so the exclusion reason can be accurate. */
export const SATP_MODE_IDS = new Set(['Sv32', 'Sv39', 'Sv48', 'Sv57']);

export const NON_MARCH_IDS = new Set([
  'K', 'N', 'P', 'S', 'U',   // privilege levels and UI grouping tags
  ...SATP_MODE_IDS,
]); // B removed — ratified, decode-accept + explicit-encode

// ============================================================================
// Data provenance — displayed in ISA Workspace footer
// ============================================================================
/**
 * Every piece of data in the workspace has a documented origin.
 * Shown in the workspace footer so engineers know exactly where
 * information came from.
 */
export const DATA_PROVENANCE = [
  {
    label: 'Instruction Encodings',
    source: 'riscv/riscv-opcodes',
    url: 'https://github.com/riscv/riscv-opcodes',
  },
  {
    label: 'Extension Metadata & Profiles',
    source: 'RISC-V ISA Manual',
    url: 'https://github.com/riscv/riscv-isa-manual',
  },
  {
    label: '-march Naming Rules',
    source: 'RISC-V ISA Spec §27 · GCC 12+ / LLVM convention',
    url: 'https://github.com/riscv/riscv-isa-manual',
  },
];

// ============================================================================
// Internal helpers
// ============================================================================
/**
 * Build a lowercase-id to extension-object Map for O(1) lookup.
 * @param {Array} allExts
 * @returns {Map<string, object>}
 */
function buildLookup(allExts) {
  const m = new Map();
  for (const ext of allExts) {
    if (ext?.id) m.set(ext.id.toLowerCase(), ext);
  }
  return m;
}

/**
 * Is `extId` architecturally invalid alongside `otherId`?
 *
 * INCOMPATIBLE_WITH is evaluated in both directions, so a single entry
 * (RV32E -> F) covers both "E base excludes F" and "F excludes E base".
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isIncompatible(a, b) {
  return (INCOMPATIBLE_WITH[a] || []).includes(b)
      || (INCOMPATIBLE_WITH[b] || []).includes(a);
}

/**
 * Does `extId` transitively depend on something incompatible with `baseId`?
 *
 * Walks SMART_DEPENDENCIES so that excluding a prerequisite also excludes
 * everything built on it: with an E base, F is incompatible, so D (which
 * requires F) and Q (which requires D) must be excluded too.
 *
 * @param {string} baseId
 * @param {string} extId
 * @returns {boolean}
 */
function dependsOnIncompatible(baseId, extId, seen = new Set()) {
  if (seen.has(extId)) return false;
  seen.add(extId);
  for (const dep of SMART_DEPENDENCIES[extId] || []) {
    if (isIncompatible(baseId, dep)) return true;
    if (dependsOnIncompatible(baseId, dep, seen)) return true;
  }
  return false;
}

// ============================================================================
// parseMarchString
// ============================================================================
/**
 * Parse a RISC-V -march string and resolve extension IDs from the catalog.
 *
 * @param {string} marchStr  e.g. "rv64gc_zba_zbb_zicsr_zifencei"
 * @param {Array}  allExts   Flat array from riscv_extensions.json
 * @returns {{
 *   xlen: number|null,
 *   resolvedIds: string[],
 *   unknownTokens: string[],
 *   warnings: string[],
 *   gExpanded: boolean,
 * }}
 */
export function parseMarchString(marchStr, allExts) {
  const out = {
    xlen: null,
    resolvedIds: [],
    unknownTokens: [],
    warnings: [],
    gExpanded: false,
  };

  if (!marchStr || typeof marchStr !== 'string') {
    out.warnings.push('Input is empty or not a string.');
    return out;
  }

  const lookup = buildLookup(allExts);
  let s = marchStr.trim().toLowerCase();

  if (!s.startsWith('rv')) {
    out.warnings.push('Expected string to start with "rv" (e.g. rv64gc_zba).');
    return out;
  }
  s = s.slice(2);

  const xlenMatch = s.match(/^(32|64|128)/);
  if (!xlenMatch) {
    out.warnings.push('Could not parse XLEN — expected 32, 64, or 128 after "rv".');
    return out;
  }
  out.xlen = parseInt(xlenMatch[1], 10);
  s = s.slice(xlenMatch[1].length);

  // Split on '_'. Part before first '_' contains concatenated single-letter extensions.
  const parts = s.split('_');
  const tokens = [];

  // Expand single-letter head (may include 'g')
  for (const ch of parts[0] || '') {
    if (ch === 'g') {
      out.gExpanded = true;
      out.warnings.push(
        '"g" expanded to: ' + G_EXPANSION_TOKENS.join(', ') +
        '. Source: RISC-V ISA Spec §27 + GCC 12+/LLVM. ' +
        'Encoder will always emit explicit tokens, never "g".'
      );
      for (const t of G_EXPANSION_TOKENS) tokens.push(t);
    } else if (ch === 'b') {
      out.warnings.push(
        '"b" expanded to: zba, zbb, zbs. Source: Ratified B extension (March 2024). ' +
        'Encoder will emit explicit Z-extensions for broader toolchain compatibility.'
      );
      tokens.push('zba', 'zbb', 'zbs', 'b');
    } else {
      tokens.push(ch);
    }
  }

  // Multi-letter tokens
  for (let i = 1; i < parts.length; i++) {
    if (parts[i]) tokens.push(parts[i]);
  }

  // Resolve each token
  const resolvedSet = new Set();
  for (const token of tokens) {
    if (!token) continue;

    // Base ISA letters ('i' or 'e') combine with parsed xlen
    if ((token === 'i' || token === 'e') && out.xlen) {
      const baseId = `rv${out.xlen}${token}`;
      if (lookup.has(baseId)) {
        resolvedSet.add(lookup.get(baseId).id);
        continue;
      }
    }

    if (lookup.has(token)) {
      const resolved = lookup.get(token);
      // Reject UI-grouping / non-march catalog entries — treat as unknown
      if (NON_MARCH_IDS.has(resolved.id) || NON_ISA_EXTENSION_IDS.has(resolved.id)) {
        out.unknownTokens.push(token);
        out.warnings.push(
          `"${token.toUpperCase()}" is in the extension catalog but is NOT a valid -march token ` +
          `(UI grouping tag or non-ISA entry). It has been ignored.`
        );
        continue;
      }
      resolvedSet.add(resolved.id);
      continue;
    }

    out.unknownTokens.push(token);
  }

  out.resolvedIds = Array.from(resolvedSet);
  return out;
}

// ============================================================================
// buildMarchString
// ============================================================================
/**
 * Generate a canonical RISC-V -march string from selected extension IDs.
 *
 * Rules (RISC-V Unprivileged ISA Spec §27.11): [SPEC]
 *   1. Prefix:  rv{xlen}{base}
 *   2. Single-letter: canonical order (SINGLE_LETTER_CANONICAL_ORDER)
 *   3. Multi-letter: sorted alphabetically, each preceded by '_'
 *
 * Encoder NEVER emits 'g'. See G_EXPANSION_TOKENS for rationale.
 *
 * @param {string[]} selectedIds
 * @param {Array}    allExts
 * @returns {{ march: string|null, excluded: {id,reason}[], warnings: string[] }}
 */
export function buildMarchString(selectedIds, _allExts) {
  const out = { march: null, excluded: [], warnings: [] };

  if (!selectedIds || selectedIds.length === 0) {
    out.warnings.push('No extensions selected.');
    return out;
  }

  // Find base ISA
  let baseInfo = null;
  for (const id of selectedIds) {
    if (BASE_ISA_IDS.has(id)) {
      baseInfo = { id, ...BASE_ISA_PREFIX_MAP[id] };
      break;
    }
  }

  if (!baseInfo) {
    out.warnings.push(
      'No base ISA selected (RV32I, RV64I, RV32E, RV64E, RV128I). ' +
      'Select a base ISA to generate a -march string.'
    );
    return out;
  }

  const canonIdx = Object.fromEntries(
    SINGLE_LETTER_CANONICAL_ORDER.map((ch, i) => [ch, i])
  );

  const singles = [];
  const multis = [];

  // A shorthand and its members must not both appear. riscv-config rejects
  // "Zkn is a superset of Zbkb, Zbkc, Zbkx, Zkne, Zknd, Zknh. In presence of
  // Zkn the subsets must be ignored in the ISA string." clang tolerates the
  // redundant form, so this is invisible to a toolchain check.
  //
  // Deliberately narrow. It is NOT "drop anything implied by something else" —
  // D implies F and both belong in the string. Only these three shorthands
  // absorb their members.
  const absorbed = new Map(); // member -> shorthand that covers it
  for (const [shorthand, members] of Object.entries(SHORTHAND_BUNDLES)) {
    if (!selectedIds.includes(shorthand)) continue;
    for (const member of members) absorbed.set(member, shorthand);
  }

  for (const id of selectedIds) {
    if (BASE_ISA_IDS.has(id)) continue;

    if (absorbed.has(id)) {
      out.excluded.push({
        id,
        reason: `Covered by ${absorbed.get(id)} — a shorthand must not list its own members`,
      });
      continue;
    }

    if (SPEC_VERSION_TAG_PATTERN.test(id)) {
      out.excluded.push({ id, reason: 'Privileged spec version compliance tag — not an -march option' });
      continue;
    }
    if (NON_ISA_EXTENSION_IDS.has(id)) {
      out.excluded.push({ id, reason: 'Non-ISA specification tag — not an architecture option' });
      continue;
    }
    if (NON_MARCH_IDS.has(id)) {
      // Two different reasons live in NON_MARCH_IDS, and telling a user that
      // Sv39 is a "UI grouping tag" is simply wrong — it is a real
      // architectural feature, just not one -march can express.
      out.excluded.push({
        id,
        reason: SATP_MODE_IDS.has(id)
          ? 'Address-translation mode selected via the satp MODE field — not an -march extension'
          : 'UI grouping tag / Non-ISA tag — not a valid -march token',
      });
      continue;
    }
    if (id === 'B') {
      out.excluded.push({ id, reason: 'Ratified but pending broad toolchain support for single-letter "b". Explicit Zba_Zbb_Zbs emitted instead.' });
      continue;
    }

    // 'i' and 'e' name base ISAs, not extensions. The selected base's letter is
    // already in the rv{xlen}{base} prefix; the other one is mutually exclusive
    // with it (RV32E/RV64E and RVxxI cannot be combined).
    const baseLetter = id.toLowerCase();
    if (baseLetter === 'i' || baseLetter === 'e') {
      if (baseLetter !== baseInfo.base) {
        out.excluded.push({
          id,
          reason: `Mutually exclusive with base ISA ${baseInfo.id} — the I and E base ISAs cannot be combined`,
        });
        out.warnings.push(
          `"${id}" was dropped: it names a base ISA that is mutually exclusive with ${baseInfo.id}.`
        );
      }
      continue;
    }

    // Architecturally invalid alongside the selected base, either directly or
    // because it depends on something that is. Excluding F for an E base while
    // keeping D would emit a configuration whose dependency is unsatisfied —
    // clang rejects exactly that ("ILP32E cannot be used with the D ISA
    // extension"), so the exclusion must cascade through SMART_DEPENDENCIES.
    if (isIncompatible(baseInfo.id, id) || dependsOnIncompatible(baseInfo.id, id)) {
      out.excluded.push({
        id,
        reason: `Architecturally incompatible with base ISA ${baseInfo.id}`,
      });
      out.warnings.push(
        `"${id}" is not architecturally valid with ${baseInfo.id} and has been excluded ` +
        `from the generated -march string.`
      );
      continue;
    }

    const token = id.toLowerCase();
    if (id.length === 1) singles.push(token);
    else multis.push(token);
  }

  // Sort single-letter by canonical spec order
  singles.sort((a, b) => {
    const ia = canonIdx[a] ?? 999;
    const ib = canonIdx[b] ?? 999;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });

  const filteredSingles = singles.filter(t => t !== baseInfo.base);

  // Sort multi-letter alphabetically
  multis.sort((a, b) => a.localeCompare(b));

  const prefix = `rv${baseInfo.xlen}${baseInfo.base}`;
  out.march = `${prefix}${filteredSingles.join('')}${multis.map(t => `_${t}`).join('')}`;
  return out;
}

// ============================================================================
// buildCombinedCatalog
// ============================================================================
/**
 * Build a deduplicated instruction catalog for the selected extensions.
 *
 * ATTRIBUTION RULE (True Owner Algorithm):
 *   Instructions in riscv_extensions.json are often nested inside parent
 *   extensions for legacy "browsing convenience" (e.g. Zicsr instructions
 *   are duplicated inside RV32E/RV32I/RV64I). However, each instruction
 *   carries an `extension` tag (e.g. "rv_zicsr").
 *   This algorithm statically resolves the "True Owner" of every tag across
 *   the entire catalog (e.g. rv_zicsr belongs to Zicsr, rv_i belongs to the
 *   selected base ISA). An instruction is ONLY included if its True Owner
 *   was explicitly selected, and it is strictly attributed to that True Owner.
 *
 * DEDUPLICATION KEY: uppercase(mnemonic) + "||" + normalized encoding
 *
 * @param {string[]} selectedIds
 * @param {Array}    allExts
 * @returns {Array<{
 *   key: string,
 *   mnemonic: string,
 *   encoding: string,
 *   variable_fields: string[],
 *   match: string,
 *   mask: string,
 *   sources: {extId: string, extName: string}[],
 *   primaryExtId: string,
 * }>}
 */
export function buildCombinedCatalog(selectedIds, allExts) {
  if (!selectedIds || selectedIds.length === 0) return [];

  const lookup = buildLookup(allExts);
  const selectedBaseId = selectedIds.find(id => BASE_ISA_IDS.has(id));

  // 1. Determine the True Owner for each tag in the catalog
  const tagToTrueOwner = new Map();
  for (const ext of allExts) {
    if (!ext.tags) continue;
    for (const tag of ext.tags) {
      const t = tag.toLowerCase();
      
      // Base ISA tags belong to whichever base ISA the user actually selected
      if (['rv_i', 'rv64_i', 'rv32_e', 'rv64_e'].includes(t)) {
        if (selectedBaseId) tagToTrueOwner.set(t, lookup.get(selectedBaseId.toLowerCase()));
        continue;
      }
      
      // For standard extensions, the True Owner is the extension whose ID matches the tag natively
      const stripped = t.replace(/^rv(32|64)?_/, '');
      if (ext.id.toLowerCase() === stripped) {
        tagToTrueOwner.set(t, ext);
      } else if (!tagToTrueOwner.has(t)) {
        // Fallback if no exact match is found
        tagToTrueOwner.set(t, ext);
      }
    }
  }

  const byKey = new Map();

  // 2. Iterate over selected extensions and process their nested instructions
  for (const id of selectedIds) {
    const ext = lookup.get(id.toLowerCase());
    if (!ext?.instructions) continue;

    for (const [mnemonic, details] of Object.entries(ext.instructions)) {
      const instrTags = Array.isArray(details?.extension) ? details.extension : [];
      
      // Resolve the True Owner of this specific instruction
      let trueOwner = null;
      for (const tag of instrTags) {
        const owner = tagToTrueOwner.get(tag.toLowerCase());
        if (owner) {
          trueOwner = owner;
          break;
        }
      }
      // If we somehow couldn't resolve a true owner, fallback to the extension it was nested inside
      if (!trueOwner) trueOwner = ext;

      // CRITICAL: If the True Owner wasn't explicitly selected by the user, EXCLUDE IT.
      // This prevents "ghost" Zicsr instructions from appearing when only RV32I is selected.
      if (!selectedIds.some(sel => sel.toLowerCase() === trueOwner.id.toLowerCase())) {
        continue;
      }

      const upperMnem = mnemonic.toUpperCase();
      const normEncoding = (details?.encoding || '').replace(/\s+/g, '');
      const dedupKey = `${upperMnem}||${normEncoding}`;

      if (byKey.has(dedupKey)) {
        const entry = byKey.get(dedupKey);
        if (!entry.sources.some(s => s.extId === trueOwner.id)) {
          entry.sources.push({ extId: trueOwner.id, extName: trueOwner.name || trueOwner.id });
        }
      } else {
        byKey.set(dedupKey, {
          key: dedupKey,
          mnemonic: upperMnem,
          encoding: normEncoding,
          variable_fields: Array.isArray(details?.variable_fields) ? details.variable_fields : [],
          match: details?.match || '',
          mask: details?.mask || '',
          sources: [{ extId: trueOwner.id, extName: trueOwner.name || trueOwner.id }],
          primaryExtId: trueOwner.id,
        });
      }
    }
  }

  // Sort: mnemonic A→Z, then encoding for identical mnemonics
  return Array.from(byKey.values()).sort((a, b) => {
    const m = a.mnemonic.localeCompare(b.mnemonic);
    return m !== 0 ? m : a.encoding.localeCompare(b.encoding);
  });
}
