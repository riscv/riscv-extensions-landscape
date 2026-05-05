/**
 * Canonical tag normalizer for RISC-V extension names.
 *
 * Bridges naming conventions between:
 * - riscv-opcodes: rv_zba, rv64_zba, rv_zicsr
 * - landscape catalog: Zba, Zicsr
 * - ISA manual: Zba, Zicsr
 *
 * @module tag_normalizer
 */

'use strict';

/** @type {Record<string, string>} */
export const MANUAL_OVERRIDES = {
  rv_svinval_h: 'svinval',
  rv_zicbo: 'zicbom',
};

/** @type {string[]} */
export const G_COMPONENTS = ['i', 'm', 'a', 'f', 'd', 'zicsr', 'zifencei'];

const PREFIX_RE = /^rv(?:32|64|128)?_/i;

/**
 * Normalize an extension tag to canonical form.
 *
 * @param {string} tag - Raw tag (e.g., 'rv64_zba', 'Zba').
 * @param {{ warnUnknown?: boolean, knownCatalogTags?: Set<string> }} [options] - Optional behavior toggles.
 * @returns {string} Normalized tag (e.g., 'zba').
 * @throws {TypeError} If tag is not a string.
 * @throws {Error} If tag is empty after trimming.
 */
export function normalizeTag(tag, options = {}) {
  if (typeof tag !== 'string') {
    throw new TypeError('normalizeTag(tag): tag must be a string.');
  }

  const trimmed = tag.trim();
  if (!trimmed) {
    throw new Error('normalizeTag(tag): tag cannot be empty.');
  }

  const rawLower = trimmed.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MANUAL_OVERRIDES, rawLower)) {
    return MANUAL_OVERRIDES[rawLower];
  }

  const withoutPrefix = rawLower.replace(PREFIX_RE, '');
  const tokens = withoutPrefix.split(/[_\s]+/).filter(Boolean);
  const normalized = (tokens[0] ?? withoutPrefix).trim();

  if (
    options.warnUnknown &&
    options.knownCatalogTags &&
    !options.knownCatalogTags.has(normalized)
  ) {
    console.warn(`normalizeTag: unresolved tag '${tag}' -> '${normalized}'`);
  }

  return normalized;
}

/**
 * Expand G composite extension into constituent extensions.
 *
 * @param {string} tag - Extension tag.
 * @returns {string[]} Constituent tags or [normalizedTag] if not G.
 */
export function expandGExtension(tag) {
  const normalized = normalizeTag(tag);
  if (normalized === 'g') {
    return [...G_COMPONENTS];
  }
  return [normalized];
}

/**
 * Normalize and expand extension tags into canonical token candidates.
 *
 * @param {string} tag - Raw extension tag.
 * @param {{ includeGExpansion?: boolean }} [options] - Expansion options.
 * @returns {string[]} Canonical candidate tags.
 */
export function normalizeTagCandidates(tag, options = {}) {
  const includeGExpansion = options.includeGExpansion ?? true;
  const normalized = normalizeTag(tag);
  if (includeGExpansion && normalized === 'g') {
    return [...G_COMPONENTS];
  }
  return [normalized];
}
