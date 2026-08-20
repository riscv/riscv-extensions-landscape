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
