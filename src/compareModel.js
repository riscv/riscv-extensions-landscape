/**
 * compareModel.js — the aligned row model behind side-by-side comparison.
 *
 * Pure logic, in a .js file rather than .jsx for the same reason tileMemo.js
 * is: node's test runner cannot import .jsx, so keeping the diffing here is
 * what makes it testable without adding a transform. Same split as
 * marchUtils.js and isaGraph.js.
 *
 * The view renders whatever this returns and holds no per-field conditionals of
 * its own — each row carries its own label, its cells, whether the items agree,
 * and the name of a renderer. Adding a field to a comparison is a change here,
 * not in the view.
 */
import { closure } from './isaGraph.js';

/** Columns past this are refused rather than silently truncated. */
export const COMPARE_MAX = 6;

/** URL parameter carrying a comparison. `ext` remains the single-selection one. */
export const COMPARE_PARAM = 'cmp';

export function instructionKey(extId, mnemonic) {
  return `${extId}.${mnemonic}`;
}

/**
 * Splits on the FIRST dot, not the last.
 *
 * Extension ids never contain a dot but mnemonics routinely do — ADD.UW,
 * SH1ADD.UW, NTL.P1. Splitting on the last dot would read "Zba.ADD.UW" as
 * extension "Zba.ADD".
 */
export function parseInstructionKey(key) {
  const text = typeof key === 'string' ? key : '';
  const idx = text.indexOf('.');
  if (idx < 1 || idx === text.length - 1) return null;
  return { extId: text.slice(0, idx), mnemonic: text.slice(idx + 1) };
}

/**
 * Reduces a cell to the value equality is decided on.
 *
 * Absent stays distinguishable from empty: 60 of the 227 extensions carry no
 * `state` at all, and "no state recorded" is a different claim from "state is
 * blank". Arrays compare as sets because tag order is not meaningful.
 */
export function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim().toLowerCase());
    return `[${[...new Set(items)].sort().join(' ')}]`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).trim().toLowerCase();
}

/** True when every cell carries the same value. A lone column always agrees. */
export function cellsAllSame(cells) {
  if (!Array.isArray(cells) || cells.length < 2) return true;
  const first = normalizeCell(cells[0]);
  return cells.every((cell) => Object.is(normalizeCell(cell), first));
}

function makeRow(field, items) {
  const cells = items.map(field.get);
  return {
    key: field.key,
    label: field.label,
    render: field.render,
    cells,
    allSame: cellsAllSame(cells),
  };
}

const countOf = (obj) => Object.keys(obj || {}).length;
const orNull = (value) => (value === undefined || value === null || value === '' ? null : value);
const listOrNull = (value) => (Array.isArray(value) && value.length > 0 ? value : null);

const EXTENSION_FIELDS = [
  { key: 'name', label: 'Name', render: 'text', get: (e) => orNull(e.name) },
  { key: 'long_name', label: 'Long name', render: 'text', get: (e) => orNull(e.long_name) },
  { key: 'state', label: 'State', render: 'text', get: (e) => orNull(e.state) },
  {
    key: 'ratification_date',
    label: 'Ratified',
    render: 'text',
    get: (e) => orNull(e.ratification_date),
  },
  { key: 'type', label: 'Type', render: 'text', get: (e) => orNull(e.type) },
  { key: 'tags', label: 'Tags', render: 'chips', get: (e) => listOrNull(e.tags) },
  { key: 'use', label: 'Use', render: 'text', get: (e) => orNull(e.use) },
  {
    key: 'instruction_count',
    label: 'Instructions',
    render: 'mono',
    get: (e) => countOf(e.instructions),
  },
  { key: 'csr_count', label: 'CSRs', render: 'mono', get: (e) => countOf(e.csrs) },
  { key: 'members', label: 'Members', render: 'chips', get: (e) => listOrNull(e.members) },
  {
    key: 'requires',
    label: 'Requires',
    render: 'chips',
    get: (e) => listOrNull([...closure(e.id)].sort()),
  },
  { key: 'desc', label: 'Description', render: 'text', get: (e) => orNull(e.desc) },
  { key: 'url', label: 'Specification', render: 'link', get: (e) => orNull(e.url) },
];

/**
 * @param {Array<object>} exts catalog entries, in the order the user pinned them
 */
export function buildExtensionComparison(exts) {
  const items = (exts || []).filter(Boolean);
  return {
    kind: 'ext',
    columns: items.map((e) => ({
      key: e.id,
      label: e.id,
      sublabel: orNull(e.long_name) ?? orNull(e.name),
    })),
    rows: EXTENSION_FIELDS.map((field) => makeRow(field, items)),
    bitDiff: null,
  };
}
