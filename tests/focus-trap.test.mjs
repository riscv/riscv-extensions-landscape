/**
 * The modal focus trap.
 *
 * A dialog that takes focus but does not hold it is barely better than one that
 * does neither: Tab walks out into the page behind the backdrop, which is still
 * focusable and now invisible. These assert the wrap-around arithmetic, which is
 * where that goes wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFocus, focusableWithin } from '../src/focusTrap.js';

const items = ['a', 'b', 'c'];

test('Tab from the last element wraps to the first', () => {
  assert.equal(nextFocus(items, 'c', false), 'a');
});

test('Shift+Tab from the first element wraps to the last', () => {
  assert.equal(nextFocus(items, 'a', true), 'c');
});

test('Tab in the middle is left to the browser', () => {
  // Intercepting every Tab would mean reimplementing the browser's own
  // traversal. Only the ends need holding.
  assert.equal(nextFocus(items, 'a', false), null);
  assert.equal(nextFocus(items, 'b', false), null);
  assert.equal(nextFocus(items, 'b', true), null);
});

test('focus outside the trap is pulled to the end the user is heading for', () => {
  // This is the case on open, when focus sits on the dialog container itself
  // and so is not in the list.
  assert.equal(nextFocus(items, 'not-in-list', false), 'a');
  assert.equal(nextFocus(items, 'not-in-list', true), 'c');
});

test('a dialog with one focusable element keeps focus on it', () => {
  assert.equal(nextFocus(['only'], 'only', false), 'only');
  assert.equal(nextFocus(['only'], 'only', true), 'only');
});

test('an empty dialog does not throw or claim a target', () => {
  assert.equal(nextFocus([], 'x', false), null);
  assert.equal(nextFocus(null, 'x', false), null);
  assert.equal(nextFocus(undefined, undefined, true), null);
});

test('focusableWithin tolerates being handed nothing', () => {
  // It runs against a ref that may be null on the first pass.
  assert.deepEqual(focusableWithin(null), []);
  assert.deepEqual(focusableWithin(undefined), []);
  assert.deepEqual(focusableWithin({}), []);
});
