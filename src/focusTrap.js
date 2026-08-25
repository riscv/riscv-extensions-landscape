/**
 * focusTrap.js — which element Tab should reach next inside a modal.
 *
 * A dialog that takes focus but does not hold it is barely better than one that
 * does neither: Tab walks out of the modal and into the page behind it, which
 * is still there, still focusable, and now invisible behind a backdrop. The
 * keyboard user is editing a page they cannot see.
 *
 * Pure logic in a .js file rather than .jsx for the same reason tileMemo.js is:
 * node's test runner cannot import .jsx, and the wrap-around arithmetic is
 * exactly the part worth testing.
 */

/** Elements that can hold focus, in DOM order. Disabled and hidden ones cannot. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {Element} container
 * @returns {Element[]} focusable descendants, skipping anything not rendered
 */
export function focusableWithin(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => {
    // offsetParent is null for display:none. A zero-size box is also
    // unreachable in practice — the compare tray's hidden tabs, for instance.
    if (el.hasAttribute('aria-hidden')) return false;
    const r = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    return !r || r.width > 0 || r.height > 0;
  });
}

/**
 * The element Tab should land on, or null to let the browser handle it.
 *
 * Returns a target only at the ends of the list, where the browser would
 * otherwise leave the dialog. Everywhere else it returns null so normal tab
 * order applies — intercepting every Tab would mean reimplementing the
 * browser's own traversal, which is not worth owning.
 *
 * @param {Element[]} items    focusable elements, in order
 * @param {Element}   active   currently focused element
 * @param {boolean}   backwards true for Shift+Tab
 */
export function nextFocus(items, active, backwards) {
  if (!items || items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const index = items.indexOf(active);

  // Focus is on the dialog container itself, or somewhere outside the trap:
  // pull it to whichever end the user is heading for.
  if (index === -1) return backwards ? last : first;

  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
