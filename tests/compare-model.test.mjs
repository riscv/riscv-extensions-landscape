/**
 * Unit tests for src/compareModel.js — the aligned row model behind
 * side-by-side comparison.
 *
 * Pure-function tests against the real catalog. The catalog is the fixture
 * deliberately: the cases worth asserting (60 extensions carry no `state`,
 * SLLI differs between RV32I and RV64I) are properties of the real data, and a
 * hand-written fixture would drift away from them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COMPARE_MAX,
  instructionKey,
  parseInstructionKey,
  normalizeCell,
  cellsAllSame,
  buildExtensionComparison,
  encodingBitDiff,
  buildInstructionComparison,
  buildComparePermalink,
  parseComparePermalink,
} from '../src/compareModel.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '..', 'src', 'riscv_extensions.json'), 'utf8'));
const allExts = Object.values(catalog).flat().filter(Boolean);
const byId = (id) => allExts.find((e) => e.id === id);
const rowOf = (model, key) => model.rows.find((r) => r.key === key);

test('COMPARE_MAX is the documented cap', () => {
  assert.equal(COMPARE_MAX, 6);
});

test('instruction keys split on the first dot, because mnemonics contain dots', () => {
  assert.equal(instructionKey('Zba', 'ADD.UW'), 'Zba.ADD.UW');
  assert.deepEqual(parseInstructionKey('Zba.ADD.UW'), { extId: 'Zba', mnemonic: 'ADD.UW' });
  assert.deepEqual(parseInstructionKey('RV32I.SLLI'), { extId: 'RV32I', mnemonic: 'SLLI' });
});

test('a key with no mnemonic or no extension is not a key', () => {
  assert.equal(parseInstructionKey('SLLI'), null);
  assert.equal(parseInstructionKey('.SLLI'), null);
  assert.equal(parseInstructionKey('RV32I.'), null);
  assert.equal(parseInstructionKey(undefined), null);
});

test('absent normalizes to null and stays distinct from empty', () => {
  assert.equal(normalizeCell(undefined), null);
  assert.equal(normalizeCell(null), null);
  assert.notEqual(normalizeCell([]), null);
  assert.notEqual(normalizeCell(''), null);
});

test('arrays compare as sets, because tag order is not meaningful', () => {
  assert.equal(normalizeCell(['bit', 'addr']), normalizeCell(['addr', 'bit']));
  assert.equal(cellsAllSame([['bit', 'addr'], ['addr', 'bit']]), true);
  assert.equal(cellsAllSame([['bit'], ['addr']]), false);
});

test('a single column always agrees with itself', () => {
  assert.equal(cellsAllSame(['ratified']), true);
  assert.equal(cellsAllSame([]), true);
});

test('null is not equal to a present value', () => {
  assert.equal(cellsAllSame([null, 'ratified']), false);
  assert.equal(cellsAllSame([null, null]), true);
});

test('the extension model puts one cell per column, in column order', () => {
  const model = buildExtensionComparison([byId('Zba'), byId('Zbb'), byId('Zbc')]);
  assert.equal(model.kind, 'ext');
  assert.deepEqual(model.columns.map((c) => c.key), ['Zba', 'Zbb', 'Zbc']);
  assert.equal(model.bitDiff, null);
  for (const r of model.rows) {
    assert.equal(r.cells.length, 3, `row ${r.key} has ${r.cells.length} cells for 3 columns`);
  }
});

test('instruction counts differ across Zba, Zbb and Zbc and are flagged', () => {
  const model = buildExtensionComparison([byId('Zba'), byId('Zbb'), byId('Zbc')]);
  const counts = rowOf(model, 'instruction_count');
  assert.deepEqual(counts.cells, [
    Object.keys(byId('Zba').instructions).length,
    Object.keys(byId('Zbb').instructions).length,
    Object.keys(byId('Zbc').instructions).length,
  ]);
  assert.equal(counts.allSame, false);
});

test('comparing an extension with itself marks every row as agreeing', () => {
  const model = buildExtensionComparison([byId('Zba'), byId('Zba')]);
  assert.deepEqual(model.rows.filter((r) => !r.allSame).map((r) => r.key), []);
});

test('an extension with no state yields null, not a throw and not a blank', () => {
  const stateless = allExts.find((e) => e.state === undefined);
  assert.ok(stateless, 'expected at least one extension with no state');
  const model = buildExtensionComparison([stateless, byId('Zba')]);
  assert.equal(rowOf(model, 'state').cells[0], null);
  assert.equal(rowOf(model, 'state').allSame, false);
});

test('the dependency closure is exposed as a sorted chip row', () => {
  const model = buildExtensionComparison([byId('Zba'), byId('Zbb')]);
  const requires = rowOf(model, 'requires');
  assert.ok(requires, 'expected a requires row');
  for (const cell of requires.cells) {
    if (cell === null) continue;
    assert.deepEqual(cell, [...cell].sort(), 'closure should be sorted');
  }
});

test('every row declares a renderer the view knows', () => {
  const model = buildExtensionComparison([byId('Zba'), byId('Zbb')]);
  const known = new Set(['text', 'mono', 'chips', 'link', 'encoding']);
  for (const r of model.rows) {
    assert.ok(known.has(r.render), `row ${r.key} has unknown renderer ${r.render}`);
  }
});

const instrItem = (extId, mnemonic) => ({
  extId,
  mnemonic,
  instr: byId(extId).instructions[mnemonic],
});

test('SLLI differs between RV32I and RV64I at exactly bit 25', () => {
  // RV64 widens shamt by one bit, so bit 25 goes from a fixed 0 to part of a
  // variable field. This is the case the feature exists to make visible, and
  // the reason items are keyed by (extId, mnemonic) rather than by mnemonic.
  const model = buildInstructionComparison([instrItem('RV32I', 'SLLI'), instrItem('RV64I', 'SLLI')]);
  assert.ok(Array.isArray(model.bitDiff));
  assert.equal(model.bitDiff.length, 32);
  const differing = model.bitDiff.map((d, i) => (d ? 31 - i : null)).filter((b) => b !== null);
  assert.deepEqual(differing, [25]);
});

test('the instruction columns carry the mnemonic and its owning extension', () => {
  const model = buildInstructionComparison([instrItem('RV32I', 'SLLI'), instrItem('RV64I', 'SLLI')]);
  assert.equal(model.kind, 'instr');
  assert.deepEqual(model.columns, [
    { key: 'RV32I.SLLI', label: 'SLLI', sublabel: 'RV32I' },
    { key: 'RV64I.SLLI', label: 'SLLI', sublabel: 'RV64I' },
  ]);
  assert.equal(rowOf(model, 'owner').allSame, false);
  assert.equal(rowOf(model, 'encoding').allSame, false);
});

test('an instruction compared with itself has an all-false bit diff', () => {
  const model = buildInstructionComparison([instrItem('Zba', 'ADD.UW'), instrItem('Zba', 'ADD.UW')]);
  assert.deepEqual(model.bitDiff, new Array(32).fill(false));
  assert.deepEqual(model.rows.filter((r) => !r.allSame).map((r) => r.key), []);
});

test('a non-32-character encoding yields no bit diff rather than a wrong one', () => {
  assert.equal(encodingBitDiff(['0000', '0001']), null);
  assert.equal(encodingBitDiff(['0'.repeat(32), 'nonsense']), null);
  assert.equal(encodingBitDiff([]), null);
  assert.equal(encodingBitDiff(['0'.repeat(32)]), null, 'one encoding has nothing to differ from');
});

test('whitespace in an encoding does not shift the bit alignment', () => {
  const spaced = '0000000 ---------- 001 ----- 0010011';
  const plain = '0000000----------001-----0010011';
  assert.deepEqual(encodingBitDiff([spaced, plain]), new Array(32).fill(false));
});

test('deprecated reads as yes or no, never as absent', () => {
  const model = buildInstructionComparison([instrItem('Zba', 'ADD.UW'), instrItem('Zba', 'SH1ADD')]);
  for (const cell of rowOf(model, 'deprecated').cells) {
    assert.ok(cell === 'yes' || cell === 'no', `unexpected deprecated cell ${cell}`);
  }
});

test('items with no instruction record are dropped rather than rendered as holes', () => {
  const model = buildInstructionComparison([
    instrItem('Zba', 'ADD.UW'),
    { extId: 'Zba', mnemonic: 'NOPE', instr: undefined },
  ]);
  assert.equal(model.columns.length, 1);
});

test('an extension comparison round-trips through the permalink', () => {
  const encoded = buildComparePermalink('ext', ['Zba', 'Zbb', 'Zbc']);
  assert.equal(encoded, 'e:Zba,Zbb,Zbc');
  const parsed = parseComparePermalink(encoded, allExts);
  assert.equal(parsed.kind, 'ext');
  assert.deepEqual(parsed.resolved, ['Zba', 'Zbb', 'Zbc'], 'order must be preserved');
  assert.deepEqual(parsed.dropped, []);
});

test('an instruction comparison round-trips, dots in mnemonics included', () => {
  const encoded = buildComparePermalink('instr', ['RV32I.SLLI', 'Zba.ADD.UW']);
  assert.equal(encoded, 'i:RV32I.SLLI,Zba.ADD.UW');
  const parsed = parseComparePermalink(encoded, allExts);
  assert.equal(parsed.kind, 'instr');
  assert.deepEqual(parsed.resolved, ['RV32I.SLLI', 'Zba.ADD.UW']);
});

test('an empty selection encodes to nothing rather than a bare prefix', () => {
  assert.equal(buildComparePermalink('ext', []), '');
  assert.equal(buildComparePermalink('instr', []), '');
  assert.equal(buildComparePermalink('nonsense', ['Zba']), '');
});

test('ids resolve case-insensitively but come back in catalog casing', () => {
  const parsed = parseComparePermalink('e:zba,ZBB', allExts);
  assert.deepEqual(parsed.resolved, ['Zba', 'Zbb']);
});

test('unknown ids are dropped and reported, never thrown', () => {
  const parsed = parseComparePermalink('e:Zba,Zqqq,Zbb', allExts);
  assert.deepEqual(parsed.resolved, ['Zba', 'Zbb']);
  assert.deepEqual(parsed.dropped, ['Zqqq']);
});

test('an instruction its named extension does not define is dropped', () => {
  const parsed = parseComparePermalink('i:RV32I.SLLI,Zba.SLLI', allExts);
  assert.deepEqual(parsed.resolved, ['RV32I.SLLI']);
  assert.deepEqual(parsed.dropped, ['Zba.SLLI']);
});

test('a missing or unknown kind prefix yields no kind and no throw', () => {
  for (const bad of ['Zba,Zbb', 'x:Zba', ':Zba', '']) {
    const parsed = parseComparePermalink(bad, allExts);
    assert.equal(parsed.kind, null, `expected no kind for ${JSON.stringify(bad)}`);
    assert.deepEqual(parsed.resolved, []);
  }
  assert.doesNotThrow(() => parseComparePermalink(undefined, allExts));
  assert.doesNotThrow(() => parseComparePermalink('e:Zba', undefined));
});

test('duplicates collapse and the cap is enforced by dropping the overflow', () => {
  const dup = parseComparePermalink('e:Zba,Zba,Zbb', allExts);
  assert.deepEqual(dup.resolved, ['Zba', 'Zbb']);

  const ids = allExts.slice(0, COMPARE_MAX + 2).map((e) => e.id);
  const over = parseComparePermalink(`e:${ids.join(',')}`, allExts);
  assert.equal(over.resolved.length, COMPARE_MAX);
  assert.equal(over.dropped.length, 2);
});
