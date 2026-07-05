/**
 * Tag resolution rules for matching instr_dict.extension tags to catalog entries.
 *
 * riscv-opcodes uses rv_* prefixes; the catalog uses ISA manual names (Zba, A, …).
 * Each catalog entry carries a `tags` array that lists which opcode-file tags it owns.
 */

/** @type {Record<string, string[]>} */
export const EXTENSION_TAG_OVERRIDES = {
  RV32I: ['rv_i'],
  RV64I: ['rv_i', 'rv64_i'],
  RV128I: ['rv_i'],
  RV32E: ['rv_i'],
  RV64E: ['rv_i', 'rv64_i'],
  Zicbom: ['rv_zicbo'],
  Zicbop: ['rv_zicbo'],
  Zicboz: ['rv_zicbo'],
  Zabha: ['rv_zabha'],
  Zacas: ['rv_zacas', 'rv64_zacas', 'rv_zabha_zacas'],
};

/**
 * When one opcode tag maps to multiple catalog extensions, route by mnemonic.
 * @type {Record<string, Record<string, string[]>>}
 */
export const SPLIT_RULES = {
  rv_zicbo: {
    Zicbom: ['CBO.CLEAN', 'CBO.FLUSH', 'CBO.INVAL'],
    Zicboz: ['CBO.ZERO'],
    Zicbop: ['PREFETCH.R', 'PREFETCH.W'],
  },
  rv_zabha_zacas: {
    Zacas: ['AMOCAS.B', 'AMOCAS.H'],
  },
};

/**
 * Infer default opcode tags from a catalog extension id when no instruction data exists.
 * @param {string} id
 * @returns {string[]}
 */
export function inferTagsFromExtensionId(id) {
  if (EXTENSION_TAG_OVERRIDES[id]) return [...EXTENSION_TAG_OVERRIDES[id]];

  if (/^RV\d{2,3}[IE]$/.test(id)) {
    const bits = id.match(/^RV(\d+)/)?.[1];
    const letter = id.endsWith('E') ? 'e' : 'i';
    const tags = [`rv_${letter}`];
    if (bits && bits !== '32') tags.push(`rv${bits}_${letter}`);
    return tags;
  }

  if (/^[AMFDQCHVN]$/.test(id)) return [`rv_${id.toLowerCase()}`];
  if (id === 'P') return ['rv_p'];

  if (id.startsWith('Z') || id.startsWith('S')) {
    return [`rv_${id.charAt(0).toLowerCase()}${id.slice(1)}`];
  }

  return [];
}

/**
 * @param {string} tag
 * @returns {'RV32' | 'RV64' | 'RV128' | 'both' | null}
 */
export function inferArchitectureFromTag(tag) {
  if (tag.startsWith('rv128_')) return 'RV128';
  if (tag.startsWith('rv64_')) return 'RV64';
  if (tag.startsWith('rv32_')) return 'RV32';
  if (tag.startsWith('rv_')) return 'both';
  return null;
}

/**
 * @param {string} dictKey e.g. cbo_clean, sc_w, c_addi
 * @returns {string}
 */
export function dictKeyToMnemonic(dictKey) {
  const parts = String(dictKey).split('_');
  if (parts.length === 1) return parts[0].toUpperCase();

  const widthSuffixes = new Set(['w', 'd', 'h', 'b', 'q']);
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && widthSuffixes.has(last) && parts[0].length > 1) {
    const base = parts.slice(0, -1).join('_').toUpperCase();
    return `${base}.${last.toUpperCase()}`;
  }

  return parts.map((p) => p.toUpperCase()).join('.');
}

/**
 * @param {string} mnemonic
 * @param {string} tag
 * @param {string[]} candidateExtensionIds
 * @returns {string[]}
 */
export function resolveSplitTargets(mnemonic, tag, candidateExtensionIds) {
  const split = SPLIT_RULES[tag];
  if (!split) return candidateExtensionIds;

  const matched = candidateExtensionIds.filter((extId) => {
    const allowed = split[extId];
    return allowed && allowed.includes(mnemonic);
  });

  if (matched.length > 0) return matched;

  // Tag has split rules but mnemonic isn't listed — avoid fan-out to every candidate.
  return [];
}
