/**
 * CompareView — N extensions or N instructions in aligned columns.
 *
 * It renders whatever compareModel hands it and knows nothing about the
 * catalog: a row carries its own label, its cells, whether the items agree, and
 * the name of a renderer. Adding a field to a comparison is a change to the
 * model, not to this file.
 *
 * Dimming the rows that agree is the point of the whole feature. A wall of
 * identical values is what makes two detail panels hard to compare by eye; the
 * differences have to be the thing that stands out.
 */
import React from 'react';
import { X, Copy, Link2, Columns } from 'lucide-react';
import { toMarkdown } from './compareModel.js';
import EncodingDiagram from './EncodingDiagram.jsx';

function Cell({ row, value, bitDiff }) {
  if (row.render !== 'presence' && (value === null || value === undefined)) {
    return <span style={{ color: 'var(--riscv-text-3)' }}>—</span>;
  }

  if (row.render === 'encoding') {
    return <EncodingDiagram encoding={value} diffMask={bitDiff} />;
  }

  if (row.render === 'presence') {
    // A mark rather than the word "true": the question a presence row answers
    // is "is this in the profile", and a column of `true`/`false` reads far
    // worse across forty rows than a column of ticks and dashes.
    //
    // Colour is spent only where the profiles disagree. When every profile
    // has an extension the marks go muted, because a green tick that means
    // "same as everywhere else" is noise competing with the rows that matter.
    // In a differing row present reads green and absent reads red, so a gap
    // is findable at a glance. The tick/dash shapes carry the same
    // information, so nothing depends on telling red from green.
    const tone = row.allSame
      ? 'var(--riscv-text-3)'
      : value
        ? 'var(--riscv-success)'
        : 'var(--riscv-danger)';
    return value ? (
      <span
        aria-label="present"
        style={{ color: tone, fontWeight: row.allSame ? 400 : 700 }}
      >
        &#10003;
      </span>
    ) : (
      <span
        aria-label="absent"
        style={{ color: tone, fontWeight: row.allSame ? 400 : 700 }}
      >
        &mdash;
      </span>
    );
  }

  if (row.render === 'chips') {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((item) => (
          <span
            key={item}
            className="px-1.5 py-0.5 rounded border text-[11px] font-mono"
            style={{
              borderColor: 'var(--riscv-border-2)',
              background: 'var(--riscv-surface-2)',
              color: 'var(--riscv-text-2)',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (row.render === 'link') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[11px] underline break-all"
        style={{ color: 'var(--riscv-gold)' }}
      >
        {value}
      </a>
    );
  }

  if (row.render === 'mono') {
    return <span className="font-mono text-[12px]">{value}</span>;
  }

  return <span className="text-[12px] leading-snug">{value}</span>;
}

export default function CompareView({
  open,
  model,
  onClose,
  onCopyMarkdown,
  onCopyLink,
  expandDeps,
  onToggleExpandDeps,
}) {
  const [differencesOnly, setDifferencesOnly] = React.useState(false);
  const dialogRef = React.useRef(null);
  const restoreFocusRef = React.useRef(null);

  // Held in a ref, not a dependency, so a caller passing an inline arrow
  // (a new function identity on every parent render) cannot re-run this
  // effect. A re-run while open steals focus: the cleanup restores focus to
  // the trigger behind the modal, then the effect immediately re-focuses the
  // dialog container, yanking focus away from whatever the user was doing —
  // e.g. every parent render while a toast is counting down to auto-clear.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const restore = restoreFocusRef.current;
      if (restore && typeof restore.focus === 'function') restore.focus();
    };
  }, [open]);

  if (!open || !model || model.columns.length === 0) return null;

  const rows = differencesOnly ? model.rows.filter((r) => !r.allSame) : model.rows;
  const differing = model.rows.filter((r) => !r.allSame).length;
  const heading =
    model.kind === 'instr'
      ? 'Compare instructions'
      : model.kind === 'profile'
        ? 'Compare profiles'
        : 'Compare extensions';
  const gridColumns = `minmax(140px, 180px) repeat(${model.columns.length}, minmax(260px, 1fr))`;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(7,7,14,0.85)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        role="presentation"
      />

      <div className="absolute inset-0 p-3 md:p-8 flex items-start justify-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-view-title"
          tabIndex={-1}
          className="animate-scale-in riscv-card w-full h-full flex flex-col overflow-hidden"
          style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,197,66,0.12)' }}
        >
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid var(--riscv-border-2)' }}
          >
            <h2
              id="compare-view-title"
              className="text-[13px] font-bold uppercase tracking-wider inline-flex items-center gap-2"
              style={{ color: 'var(--riscv-gold)' }}
            >
              <Columns size={14} /> {heading}
              <span
                className="font-mono normal-case tracking-normal text-[11px]"
                style={{ color: 'var(--riscv-text-3)' }}
              >
                {differing} of {model.rows.length}{' '}
                {model.kind === 'profile' ? 'rows' : 'attributes'} differ
                {model.kind === 'profile' &&
                  (model.expandedDependencies
                    ? ' \u00b7 including implied extensions'
                    : ' \u00b7 as listed in the specification')}
              </span>
            </h2>

            <div className="flex items-center gap-2">
              <label
                className="inline-flex items-center gap-1.5 text-[11px]"
                style={{ color: 'var(--riscv-text-2)' }}
              >
                <input
                  type="checkbox"
                  checked={differencesOnly}
                  onChange={(e) => setDifferencesOnly(e.target.checked)}
                />
                Show only differences
              </label>
              {model.kind === 'profile' && (
                <label
                  className="inline-flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--riscv-text-2)' }}
                  title="profiles.js lists what the specification enumerates. Expanding runs each list through the dependency graph to show what a conforming implementation actually provides."
                >
                  <input
                    type="checkbox"
                    checked={Boolean(expandDeps)}
                    onChange={(e) => onToggleExpandDeps(e.target.checked)}
                  />
                  Include implied extensions
                </label>
              )}
              <button
                type="button"
                className="riscv-btn px-2 py-1 text-[11px] inline-flex items-center gap-1"
                onClick={() => onCopyMarkdown(toMarkdown(model, { differencesOnly }))}
              >
                <Copy size={11} /> Markdown
              </button>
              <button
                type="button"
                className="riscv-btn px-2 py-1 text-[11px] inline-flex items-center gap-1"
                onClick={onCopyLink}
              >
                <Link2 size={11} /> Link
              </button>
              <button
                type="button"
                className="riscv-btn p-1"
                onClick={onClose}
                aria-label="Close comparison"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="compare-grid" style={{ gridTemplateColumns: gridColumns }}>
              <div className="compare-head compare-attr" />
              {model.columns.map((col) => (
                <div key={col.key} className="compare-head">
                  <div
                    className="font-mono text-[12px] font-bold"
                    style={{ color: 'var(--riscv-text)' }}
                  >
                    {col.label}
                  </div>
                  {col.sublabel && col.sublabel !== col.label && (
                    <div className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>
                      {col.sublabel}
                    </div>
                  )}
                </div>
              ))}

              {rows.map((row) => (
                <React.Fragment key={row.key}>
                  <div
                    className={`compare-attr compare-cell ${row.allSame ? 'compare-same' : 'compare-diff'}`}
                  >
                    {row.label}
                  </div>
                  {row.cells.map((value, i) => (
                    <div
                      key={`${row.key}-${model.columns[i].key}`}
                      className={`compare-cell ${row.allSame ? 'compare-same' : 'compare-diff'}`}
                    >
                      <Cell row={row} value={value} bitDiff={model.bitDiff} />
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>

            {rows.length === 0 && (
              <div className="p-6 text-center text-[12px]" style={{ color: 'var(--riscv-text-3)' }}>
                These items agree on every attribute.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
