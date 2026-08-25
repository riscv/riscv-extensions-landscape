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
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--riscv-text-3)' }}>—</span>;
  }

  if (row.render === 'encoding') {
    return <EncodingDiagram encoding={value} diffMask={bitDiff} />;
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

export default function CompareView({ open, model, onClose, onCopyMarkdown, onCopyLink }) {
  const [differencesOnly, setDifferencesOnly] = React.useState(false);
  const dialogRef = React.useRef(null);
  const restoreFocusRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const restore = restoreFocusRef.current;
      if (restore && typeof restore.focus === 'function') restore.focus();
    };
  }, [open, onClose]);

  if (!open || !model || model.columns.length === 0) return null;

  const rows = differencesOnly ? model.rows.filter((r) => !r.allSame) : model.rows;
  const differing = model.rows.filter((r) => !r.allSame).length;
  const heading = model.kind === 'instr' ? 'Compare instructions' : 'Compare extensions';
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
                {differing} of {model.rows.length} attributes differ
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
                      data-diff={row.allSame ? undefined : '1'}
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
