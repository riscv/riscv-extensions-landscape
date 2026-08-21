import React from 'react';
import { Grid3x3, X } from 'lucide-react';
import { buildEncodingMap } from './encodingMap.js';

/**
 * The RISC-V opcode map, drawn from the catalogue.
 *
 * Derived at runtime from src/riscv_extensions.json, the same source the tiles
 * and the builder read. There is no generated asset behind this and nothing to
 * regenerate: sync the catalogue and the map follows. That is deliberate. A
 * separate data file would drift from the catalogue, which is exactly what made
 * the earlier dependency-graph proposal unmergeable.
 *
 * Plain SVG-free markup and CSS grid, no charting library. The layout is a 4x8
 * table and the only visual encoding is a colour ramp, so d3 would have added
 * 87 KB or more to a 754 KB bundle to compute what a logarithm already does.
 * Worth revisiting for a force-directed dependency view, where the maths is
 * real. Not here.
 */

/**
 * Occupancy to a gold ramp, log scaled.
 *
 * OP-V holds 349 instructions while the median occupied cell holds single
 * digits. On a linear ramp almost every cell lands on the palest step and the
 * distribution disappears.
 */
function densityStyle(count, max) {
  if (count === 0) {
    return {
      background: 'var(--riscv-tint-1)',
      borderColor: 'var(--riscv-border)',
      color: 'var(--riscv-text-3)',
    };
  }
  // Intensity only. The ramp itself lives in CSS (.heat-cell) so it can differ
  // per theme: --riscv-gold is bright on dark and *dark* on light, so a single
  // JS-computed mix made busy cells dark-on-dark in light mode, at 1.5:1.
  return { '--heat': (Math.log(count + 1) / Math.log(max + 1)).toFixed(3) };
}

export default function EncodingMap({ open, onClose, catalog, onSelectExtension }) {
  const map = React.useMemo(() => (open ? buildEncodingMap(catalog) : null), [open, catalog]);
  const [selected, setSelected] = React.useState(null);
  const dialogRef = React.useRef(null);
  const triggerRef = React.useRef(null);

  // Same keyboard contract as the Encoder Validator: Escape closes, focus is
  // trapped and wraps, and it returns to whatever opened the dialog.
  React.useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    triggerRef.current = opener instanceof HTMLElement && opener !== document.body ? opener : null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );

    focusable()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !dialogRef.current?.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  if (!open || !map) return null;

  const { cells, quadrants, totals } = map;
  const max = totals.busiest.count;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(7,7,14,0.85)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        role="presentation"
      />
      <div className="absolute inset-0 p-3 md:p-8 flex items-start justify-center overflow-y-auto">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="encoding-map-title"
          aria-describedby="encoding-map-desc"
          className="animate-scale-in w-full max-w-5xl riscv-card overflow-hidden"
          style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,197,66,0.15)' }}
        >
          <div
            className="p-4 flex items-start justify-between gap-3"
            style={{ borderBottom: '1px solid var(--riscv-border)' }}
          >
            <div className="min-w-0">
              <h3
                id="encoding-map-title"
                className="font-bold flex items-center gap-2"
                style={{ color: 'var(--riscv-text)', fontSize: 14 }}
              >
                <Grid3x3 size={15} style={{ color: 'var(--riscv-gold)' }} />
                <span>Encoding Map</span>
              </h3>
              <p
                id="encoding-map-desc"
                className="text-[12px] mt-1"
                style={{ color: 'var(--riscv-text-3)' }}
              >
                The base opcode map. Rows are <span className="font-mono">inst[4:2]</span>, columns
                are <span className="font-mono">inst[6:5]</span>, and every cell implies{' '}
                <span className="font-mono">inst[1:0]=11</span>. Darker means busier.
              </p>
            </div>
            <button
              type="button"
              className="riscv-btn p-1.5 shrink-0"
              onClick={onClose}
              aria-label="Close the encoding map"
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-4">
            <div
              className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] mb-4"
              style={{ color: 'var(--riscv-text-2)' }}
            >
              <span>
                <strong style={{ color: 'var(--riscv-text)' }}>
                  {totals.occupiedSlots}/{totals.totalSlots}
                </strong>{' '}
                opcode slots used
              </span>
              <span>
                <strong style={{ color: 'var(--riscv-text)' }}>{totals.thirtyTwoBit}</strong> 32-bit
              </span>
              <span>
                <strong style={{ color: 'var(--riscv-text)' }}>{totals.compressed}</strong>{' '}
                compressed
              </span>
              <span>
                busiest is{' '}
                <strong style={{ color: 'var(--riscv-text)' }}>{totals.busiest.name}</strong> with{' '}
                {totals.busiest.count}
              </span>
            </div>

            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}
            >
              {[0, 1, 2, 3].map((col) => (
                <div key={col} className="grid gap-1.5">
                  {cells
                    .filter((c) => c.col === col)
                    .sort((a, b) => a.row - b.row)
                    .map((cell) => {
                      const isSel = selected?.opcode === cell.opcode;
                      return (
                        <button
                          key={cell.opcode}
                          type="button"
                          onClick={() => setSelected(isSel ? null : cell)}
                          title={`${cell.name} · opcode 0x${cell.opcode.toString(16).padStart(2, '0')} · ${cell.count} instruction${cell.count === 1 ? '' : 's'}`}
                          className="heat-cell text-left rounded border px-2 py-1.5 transition-colors"
                          style={{
                            ...densityStyle(cell.count, max),
                            ...(isSel
                              ? { outline: '2px solid var(--riscv-gold)', outlineOffset: 1 }
                              : null),
                          }}
                        >
                          <div className="font-mono text-[10.5px] leading-tight truncate">
                            {cell.name}
                          </div>
                          <div className="text-[10px] opacity-70 font-mono">
                            {cell.count > 0 ? cell.count : '—'}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>

            <div
              className="mt-4 flex flex-wrap gap-2 items-center text-[11px]"
              style={{ color: 'var(--riscv-text-3)' }}
            >
              <span>Compressed, outside the 32-bit map:</span>
              {quadrants.map((q) => (
                <span
                  key={q.quadrant}
                  className="px-2 py-0.5 rounded border font-mono"
                  style={{
                    background: 'var(--riscv-tint-2)',
                    borderColor: 'var(--riscv-border)',
                    color: 'var(--riscv-text-2)',
                  }}
                >
                  inst[1:0]={q.quadrant.toString(2).padStart(2, '0')} · {q.count}
                </span>
              ))}
            </div>

            {selected && (
              <div
                className="mt-4 rounded border p-3"
                style={{ background: 'var(--riscv-surface-2)', borderColor: 'var(--riscv-border)' }}
              >
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h4
                    className="font-mono text-[13px] font-bold"
                    style={{ color: 'var(--riscv-gold)' }}
                  >
                    {selected.name}{' '}
                    <span className="font-normal" style={{ color: 'var(--riscv-text-3)' }}>
                      opcode 0x{selected.opcode.toString(16).padStart(2, '0')}
                    </span>
                  </h4>
                  <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                    {selected.count} instruction{selected.count === 1 ? '' : 's'}
                  </span>
                </div>

                {selected.count === 0 ? (
                  <p className="text-[12px]" style={{ color: 'var(--riscv-text-2)' }}>
                    Nothing in the catalogue uses this slot. Most unused slots are not spare
                    capacity: they are reserved for vendor custom encodings, or for instructions
                    longer than 32 bits.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selected.extensions.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            onSelectExtension?.(id);
                            onClose();
                          }}
                          title={`Open ${id}`}
                          className="px-1.5 py-0.5 rounded border font-mono text-[11px] hover:opacity-80"
                          style={{
                            background: 'var(--riscv-gold-dim)',
                            borderColor: 'var(--riscv-gold-glow)',
                            color: 'var(--riscv-gold)',
                          }}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                      {selected.instructions.map((i) => (
                        <span
                          key={i.mnemonic}
                          className="px-1.5 py-0.5 rounded border font-mono text-[11px]"
                          style={{
                            background: 'var(--riscv-tint-2)',
                            borderColor: 'var(--riscv-border)',
                            color: 'var(--riscv-text-2)',
                          }}
                        >
                          {i.mnemonic}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
