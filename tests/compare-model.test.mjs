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
