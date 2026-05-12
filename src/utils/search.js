/**
 * Search / query-matching utilities for RISC-V instruction data.
 *
 * Extracted from risc_v_visualizer.jsx for testability.
 * All functions are pure — no React, no DOM, no side-effects.
 */

/**
 * Check if an instruction (mnemonic + details) matches a search query.
 *
 * Matches against: mnemonic name, encoding string, match/mask hex values,
 * variable_fields list, and extension tag list.
 *
 * @param {string} mnemonic - e.g. "SC.W"
 * @param {object|null} details - instruction details from riscv_extensions.json
 * @param {string} q - search query (will be lowercased internally)
 * @returns {boolean}
 */
const instructionMatchesQuery = (mnemonic, details, q) => {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return false;

  if (mnemonic && String(mnemonic).toLowerCase().includes(needle)) return true;
  if (!details || typeof details !== 'object') return false;

  for (const field of [details.encoding, details.match, details.mask]) {
    if (field && String(field).toLowerCase().includes(needle)) return true;
  }
  for (const list of [details.variable_fields, details.extension]) {
    if (Array.isArray(list) && list.join(' ').toLowerCase().includes(needle))
      return true;
  }

  return false;
};

module.exports = {
  instructionMatchesQuery,
};
