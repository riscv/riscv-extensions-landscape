import React from 'react';
import { Grid3x3, X } from 'lucide-react';
import { buildEncodingMap, FREE_SLOT_KINDS } from './encodingMap.js';

/**
 * The RISC-V opcode map, drawn from the catalogue.
 *
 * Derived at runtime from src/riscv_extensions.json, the same source the tiles
 * and the builder read. There is no generated asset behind this and nothing to
 * regenerate: sync the catalogue and the map follows.
 *
 * Plain markup and CSS grid, no charting library. The layout is a 4x8 table and
 * the quantities are small integers, so d3 would have added 87 KB or more to
 * compute what a division already does.
 *
 * Density is a bar, not a colour wash. The first version shaded the whole cell
 * and it failed on both counts. Contrast collapsed exactly where the data
 * mattered most, because --riscv-gold is bright on the dark theme, so the
 * busiest cells became pale plates under pale text: OP-V measured 2.56:1
 * against a 4.5:1 floor, and seven more cells failed with it. And colour is a
 * poor channel for quantity, so JAL with 1, MADD with 4 and MISC-MEM with 7
 * were indistinguishable. A bar on a constant surface fixes both: the text
 * contrast no longer varies with the data at all, and the number is right there
 * beside the bar when the bar is too short to compare.
 */

/** Log scale, because OP-V holds 349 and the median occupied slot holds single digits. */
function barWidth(count, max) {
  if (count <= 0) return 0;
  // Floor at 6% so a slot holding one instruction is still visibly not empty.
  return 6 + (Math.log(count + 1) / Math.log(max + 1)) * 94;
}

const CATEGORY_LABEL = {
  vendor: 'vendor custom',
  reserved: 'reserved',
  wide: '> 32-bit',
  unratified: 'unratified',
  unassigned: 'unassigned',
};

const CATEGORY_COLOUR = {
  vendor: 'var(--riscv-accent-4)',
  reserved: 'var(--riscv-text-3)',
  wide: 'var(--riscv-accent-8)',
  // Not --riscv-warn: its light value #b06f05 measured 3.95:1 on the cell
  // surface, under the 4.5:1 floor. accent-7 is the same warning register and
  // clears it at 4.99:1.
  unratified: 'var(--riscv-accent-7)',
  unassigned: 'var(--riscv-text-3)',
};

function Cell({ cell, max, selected, onSelect }) {
  const isFree = cell.count === 0;
  const colour = CATEGORY_COLOUR[cell.category] ?? 'var(--riscv-text-3)';
  const label = CATEGORY_LABEL[cell.category] ?? 'unassigned';
  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : cell)}
      title={`${cell.name} · opcode 0x${cell.opcode.toString(16).padStart(2, '0')} · inst[6:5]=${cell.colBits} inst[4:2]=${cell.rowBits} · ${cell.count} instruction${cell.count === 1 ? '' : 's'}`}
      className="slot-cell text-left rounded px-2 py-1.5"
      style={{
        borderStyle: isFree ? 'dashed' : 'solid',
        borderColor: isFree ? colour : 'var(--riscv-border-2)',
        ...(selected ? { outline: '2px solid var(--riscv-gold)', outlineOffset: 1 } : null),
      }}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className="font-mono text-[10.5px] leading-tight truncate"
          style={{ color: 'var(--riscv-text)' }}
        >
          {cell.name}
        </span>
        <span className="font-mono text-[9px] shrink-0" style={{ color: 'var(--riscv-text-3)' }}>
          0x{cell.opcode.toString(16).padStart(2, '0')}
        </span>
      </div>

      {isFree ? (
        <div className="font-mono text-[9.5px] mt-1 truncate" style={{ color: colour }}>
          {/* The slot named "reserved" would otherwise read "reserved / reserved". */}
          {label === cell.name.toLowerCase() ? '—' : label}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="slot-bar-track" aria-hidden="true">
            <span className="slot-bar-fill" style={{ width: `${barWidth(cell.count, max)}%` }} />
          </span>
          <span
            className="font-mono text-[10px] tabular-nums shrink-0"
            style={{ color: 'var(--riscv-text-2)' }}
          >
            {cell.count}
          </span>
        </div>
      )}
    </button>
  );
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
  const free = totals.freeByKind;
  const freeTotal = Object.values(free).reduce((a, b) => a + b, 0);
  const rows = [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = [0, 1, 2, 3];
  const at = (row, col) => cells.find((c) => c.row === row && c.col === col);

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
                The base opcode map, laid out as the ISA manual prints it. Every cell implies{' '}
                <span className="font-mono">inst[1:0]=11</span>. Longer bars mean busier.
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
              className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] mb-1"
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

            {/* The headline figure invites the wrong conclusion on its own: the
                free slots are almost all spoken for. */}
            <p className="text-[11.5px] mb-4" style={{ color: 'var(--riscv-text-3)' }}>
              The {freeTotal} unused slots are not spare capacity. {free.vendor ?? 0} are vendor
              custom space, {free.wide ?? 0} are reserved for instructions longer than 32 bits,{' '}
              {free.unratified ?? 0} is allocated to an unratified extension, and{' '}
              {free.reserved ?? 0} is reserved outright. None is available for a new standard
              extension.
            </p>

            <div className="overflow-x-auto -mx-1 px-1">
              <div className="min-w-[560px]">
                {/* Column headers: inst[6:5]. */}
                <div className="encoding-grid mb-1.5">
                  <div
                    className="font-mono text-[9.5px] self-end pb-0.5"
                    style={{ color: 'var(--riscv-text-3)' }}
                  >
                    inst[4:2]
                  </div>
                  {cols.map((col) => (
                    <div
                      key={col}
                      className="font-mono text-[10px] text-center"
                      style={{ color: 'var(--riscv-text-2)' }}
                    >
                      <span style={{ color: 'var(--riscv-text-3)' }}>inst[6:5]=</span>
                      {col.toString(2).padStart(2, '0')}
                    </div>
                  ))}
                </div>

                {rows.map((row) => (
                  <div key={row} className="encoding-grid mb-1.5">
                    <div
                      className="font-mono text-[10px] flex items-center justify-end pr-1"
                      style={{ color: 'var(--riscv-text-2)' }}
                    >
                      {row.toString(2).padStart(3, '0')}
                    </div>
                    {cols.map((col) => {
                      const cell = at(row, col);
                      return (
                        <Cell
                          key={cell.opcode}
                          cell={cell}
                          max={max}
                          selected={selected?.opcode === cell.opcode}
                          onSelect={setSelected}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mt-3 flex flex-wrap gap-x-4 gap-y-1 items-center text-[10.5px]"
              style={{ color: 'var(--riscv-text-3)' }}
            >
              {['vendor', 'wide', 'unratified', 'reserved'].map((kind) => (
                <span key={kind} className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      border: `1px dashed ${CATEGORY_COLOUR[kind]}`,
                      borderRadius: 2,
                    }}
                  />
                  {CATEGORY_LABEL[kind]}
                </span>
              ))}
            </div>

            <div
              className="mt-3 flex flex-wrap gap-2 items-center text-[11px]"
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
                <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                  <h4
                    className="font-mono text-[13px] font-bold"
                    style={{ color: 'var(--riscv-gold)' }}
                  >
                    {selected.name}{' '}
                    <span className="font-normal" style={{ color: 'var(--riscv-text-3)' }}>
                      opcode 0x{selected.opcode.toString(16).padStart(2, '0')} · inst[6:5]=
                      {selected.colBits} inst[4:2]={selected.rowBits}
                    </span>
                  </h4>
                  <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                    {selected.count} instruction{selected.count === 1 ? '' : 's'}
                  </span>
                </div>

                {selected.count === 0 ? (
                  <p className="text-[12px]" style={{ color: 'var(--riscv-text-2)' }}>
                    <span
                      className="font-mono"
                      style={{ color: CATEGORY_COLOUR[selected.category] }}
                    >
                      {CATEGORY_LABEL[selected.category]}
                    </span>
                    {'. '}
                    {FREE_SLOT_KINDS[selected.category] ?? 'Not allocated by the specification.'}
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
