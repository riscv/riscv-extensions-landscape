/**
 * Does the app actually render?
 *
 * Nothing else here answers that. While hoisting the extension tile out of the
 * render body I rewrote 17 call sites with an indentation-sensitive match, hit
 * only 2 of them, and shipped a build where searchQuery was undefined and the
 * grid was blank. All 94 tests stayed green, because none of them render
 * anything. I found it by opening the page.
 *
 * This mounts the real built bundle in jsdom and asserts the page came up. It
 * runs against dist/, not src/, for two reasons: the bundle is plain JS so no
 * JSX transform is needed, and it tests the artefact that actually ships. CI
 * builds before it tests, so dist/ is present.
 *
 * Deliberately shallow. It is a smoke test, not a UI suite: it answers "did the
 * page render and did anything throw", which is exactly the class of failure
 * that slipped through.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const here = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(here, '..', 'dist');
const bundlePath = path.join(dist, 'bundle.js');

let dom;
const consoleErrors = [];

before(async () => {
  assert.ok(
    fs.existsSync(bundlePath),
    'dist/bundle.js is missing — run `npm run build` first (CI builds before testing)',
  );

  dom = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,   // gives requestAnimationFrame, which React wants
    url: 'https://example.test/',
  });

  // Capture anything React complains about, so a render that "works" but throws
  // inside an effect still fails.
  dom.window.console.error = (...args) => consoleErrors.push(args.join(' '));

  // jsdom has no layout engine; the app scrolls and measures in places.
  dom.window.Element.prototype.scrollIntoView = () => {};
  dom.window.matchMedia ??= () => ({
    matches: false,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
  });

  dom.window.eval(fs.readFileSync(bundlePath, 'utf8'));

  // Let React flush its first commit.
  await new Promise((resolve) => setTimeout(resolve, 300));
});

test('the app mounts and puts something in #root', () => {
  const root = dom.window.document.getElementById('root');
  assert.ok(root, 'no #root element');
  assert.ok(root.children.length > 0, 'the app mounted nothing — the page is blank');
});

test('the extension grid renders every catalogue entry', () => {
  // The blank-grid bug left #root populated but the tiles missing, so counting
  // tiles is the assertion that would actually have caught it.
  const tiles = dom.window.document.querySelectorAll('.ext-tile');
  assert.ok(
    tiles.length > 200,
    `expected the full catalogue to render, found ${tiles.length} tiles`,
  );
});

test('the header, the counts and the builder control are present', () => {
  // Note the casing: the header labels are uppercased by CSS, so the DOM text
  // is "Extensions", not "EXTENSIONS". Assert the rendered text, not the styled
  // appearance.
  const text = dom.window.document.body.textContent;
  for (const expected of ['RISC-V Extension Landscape', 'Extensions', 'ISA Configuration Builder']) {
    assert.ok(text.includes(expected), `page text is missing "${expected}"`);
  }

  // The count comes from the catalogue, so this proves the data loaded rather
  // than merely that a shell painted.
  const tiles = dom.window.document.querySelectorAll('.ext-tile').length;
  assert.ok(
    text.includes(String(tiles)),
    `the header should report the ${tiles} extensions the grid rendered`,
  );
});

test('nothing threw during the first render', () => {
  // React reports render errors through console.error rather than by throwing,
  // so a silent failure would otherwise look like a pass.
  const real = consoleErrors.filter((line) => !/DevTools|deprecat|not wrapped in act/i.test(line));
  assert.deepEqual(real, [], `console errors during render:\n  ${real.join('\n  ')}`);
});

/**
 * A second mount, at a comparison permalink.
 *
 * Going in through the URL rather than through synthetic clicks tests the whole
 * chain — parse, resolve, build model, render — and matches how a shared
 * comparison actually arrives.
 *
 * These exist because the suite above cannot see the comparison feature at all:
 * nothing on the landing page mounts CompareView, so a component that throws on
 * render passes 179 tests. One did. CompareTray had its React import removed as
 * "unused" — correct for the automatic JSX runtime, wrong here, because
 * webpack.config.js uses @babel/preset-react with no runtime option and so
 * compiles JSX to React.createElement. Lint and build both stayed green; the
 * page only broke when a comparison opened.
 */
async function mountAt(url) {
  const win = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url,
  });
  const errors = [];
  win.window.console.error = (...args) => errors.push(args.join(' '));
  win.window.Element.prototype.scrollIntoView = () => {};
  win.window.matchMedia ??= () => ({
    matches: false,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
  });
  win.window.eval(fs.readFileSync(bundlePath, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { dom: win, errors };
}

const compareDialog = (d) =>
  d.window.document.querySelector('[role="dialog"][aria-labelledby="compare-view-title"]');

const realErrors = (errors) =>
  errors.filter((line) => !/DevTools|deprecat|not wrapped in act/i.test(line));

test('an extension comparison permalink opens the comparison', async () => {
  const { dom: d, errors } = await mountAt('https://example.test/?cmp=e:Zba,Zbb');
  const dialog = compareDialog(d);
  assert.ok(dialog, 'the comparison did not open');

  // One attribute-column header plus one per item.
  const headers = dialog.querySelectorAll('.compare-head');
  assert.equal(headers.length, 3, `expected 3 header cells, found ${headers.length}`);
  assert.ok(dialog.textContent.includes('Zba'));
  assert.ok(dialog.textContent.includes('Zbb'));

  assert.deepEqual(realErrors(errors), [], 'console errors while rendering the comparison');
});

test('the tray appears with a comparison and stays hidden without one', async () => {
  const withPins = await mountAt('https://example.test/?cmp=e:Zba,Zbb');
  assert.ok(
    withPins.dom.window.document.querySelector('[aria-label="Comparison tray"]'),
    'the tray should be docked when items are pinned',
  );
  assert.equal(
    dom.window.document.querySelector('[aria-label="Comparison tray"]'),
    null,
    'the tray must not render when nothing is pinned',
  );
});

test('SLLI across RV32I and RV64I renders exactly one differing bit', async () => {
  // RV64 widens shamt by one bit, so bit 25 goes from a fixed 0 to part of a
  // variable field. Keyed by (extId, mnemonic) precisely because SLLI is
  // defined by five different base ISAs.
  const { dom: d } = await mountAt('https://example.test/?cmp=i:RV32I.SLLI,RV64I.SLLI');
  const dialog = compareDialog(d);
  assert.ok(dialog, 'the comparison did not open');

  // Two encodings are drawn, each marking the same single differing position.
  const marked = dialog.querySelectorAll('[data-diff="1"]');
  assert.equal(marked.length, 2, `expected one marked bit per column, found ${marked.length}`);
  for (const cell of marked) {
    assert.ok(
      cell.getAttribute('data-tooltip').startsWith('bit[25]'),
      `marked the wrong bit: ${cell.getAttribute('data-tooltip')}`,
    );
  }
});

test('a comparison permalink naming nothing real does not open a comparison', async () => {
  const { dom: d, errors } = await mountAt('https://example.test/?cmp=e:Zqqq,Zwww');
  assert.equal(compareDialog(d), null, 'opened a comparison with no resolvable items');
  assert.ok(
    d.window.document.getElementById('root').children.length > 0,
    'the page should still render',
  );
  assert.deepEqual(realErrors(errors), [], 'console errors on an unresolvable comparison');
});

test('a malformed comparison permalink does not break the page', async () => {
  for (const bad of ['?cmp=', '?cmp=x:Zba', '?cmp=:::', '?cmp=i:...']) {
    const { dom: d, errors } = await mountAt(`https://example.test/${bad}`);
    assert.ok(
      d.window.document.getElementById('root').children.length > 0,
      `the page went blank on ${bad}`,
    );
    assert.deepEqual(realErrors(errors), [], `console errors on ${bad}`);
  }
});

/**
 * Every other comparison test above arrives via a `?cmp=` URL, so nothing
 * ever exercises the click path: toggleCompareExt, removeCompareItem, the
 * tray's Compare button, or the auto-close effect when pins drop below two.
 * This drives it with real DOM events dispatched the way React's delegated
 * listeners expect, against a mount at the plain URL.
 */
test('clicking pins, opening Compare, and unpinning drives the whole tray/dialog flow', async () => {
  const { dom: d, errors } = await mountAt('https://example.test/');
  const doc = d.window.document;

  const click = (el) => {
    el.dispatchEvent(new d.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

  // 1. Pin two different extension tiles.
  const pins = doc.querySelectorAll('.ext-tile-compare');
  assert.ok(pins.length >= 2, `need at least 2 compare pins to drive this test, found ${pins.length}`);
  click(pins[0]);
  await tick();
  click(pins[1]);
  await tick();

  // 2. The tray appears and its Compare button is enabled.
  const tray = doc.querySelector('[aria-label="Comparison tray"]');
  assert.ok(tray, 'the tray did not appear after pinning two tiles');
  const findCompareButton = () =>
    [...doc.querySelectorAll('[aria-label="Comparison tray"] button')].find((b) =>
      b.textContent.trim().startsWith('Compare ('),
    );
  const compareBtn = findCompareButton();
  assert.ok(compareBtn, 'no Compare button found in the tray');
  assert.equal(compareBtn.disabled, false, 'Compare button should be enabled with two pins');

  // 3. Click Compare; the dialog opens.
  click(compareBtn);
  await tick();
  const dialog = compareDialog(d);
  assert.ok(dialog, 'clicking Compare did not open the dialog');

  // 4. The URL gained a cmp parameter.
  const url = new d.window.URL(d.window.location.href);
  assert.ok(url.searchParams.get('cmp'), 'the URL should have gained a cmp parameter');

  // 5. Close the dialog, remove one pin via its tray chip, Compare disables again.
  const closeBtn = dialog.querySelector('[aria-label="Close comparison"]');
  assert.ok(closeBtn, 'no close button found on the dialog');
  click(closeBtn);
  await tick();
  assert.equal(compareDialog(d), null, 'the dialog should have closed');

  const removeBtn = doc.querySelector('[aria-label="Comparison tray"] button[aria-label^="Remove "]');
  assert.ok(removeBtn, 'no remove button found on a tray chip');
  click(removeBtn);
  await tick();

  const compareBtnAfter = findCompareButton();
  assert.ok(compareBtnAfter, 'Compare button missing from the tray after removing a pin');
  assert.equal(
    compareBtnAfter.disabled,
    true,
    'Compare button should be disabled again with fewer than two pins',
  );

  assert.deepEqual(realErrors(errors), [], 'console errors while driving the pin/compare/remove flow');
});

test('the compare pin renders on every tile, discontinued or not', () => {
  // Comparison is read-only inspection, not ISA configuration: pinning a
  // discontinued extension for comparison is legitimate (it's already
  // resolvable from a `?cmp=` permalink), unlike the workspace "+" button,
  // which stays gated because you cannot build a shippable config from an
  // EOL extension. So, unlike that button, the pin count must equal the
  // tile count exactly, not merely approach it.
  const tiles = dom.window.document.querySelectorAll('.ext-tile').length;
  const pins = dom.window.document.querySelectorAll('.ext-tile-compare').length;
  assert.ok(pins > 0, 'no compare pins rendered');
  assert.equal(pins, tiles, `expected a pin on every tile, got ${pins} of ${tiles}`);
});
