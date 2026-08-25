/**
 * CompareTray — the pinned items waiting to be compared.
 *
 * Two sets rather than one. Extensions and instructions are compared
 * separately, and keeping a set each is what lets someone pin an instruction
 * without silently throwing away the extensions they had lined up. The
 * alternative — one set that changes kind — needs a confirmation dialog on
 * every switch to avoid destroying work.
 *
 * Hidden entirely when nothing is pinned: a permanently docked empty bar is a
 * control for a mode the user has not asked to be in.
 */
import React from 'react';
import { Columns, X, Trash2 } from 'lucide-react';
import { COMPARE_MAX, parseInstructionKey } from './compareModel.js';

const chipLabel = (kind, key) => {
  if (kind === 'ext') return key;
  const parsed = parseInstructionKey(key);
  return parsed ? parsed.mnemonic : key;
};

const chipTitle = (kind, key) => {
  if (kind === 'ext') return `Remove ${key} from the comparison`;
  const parsed = parseInstructionKey(key);
  return parsed
    ? `Remove ${parsed.mnemonic} (${parsed.extId}) from the comparison`
    : `Remove ${key} from the comparison`;
};

export default function CompareTray({
  extIds,
  instrKeys,
  kind,
  onKindChange,
  onRemove,
  onClear,
  onOpen,
}) {
  const counts = { ext: extIds.size, instr: instrKeys.size };
  if (counts.ext === 0 && counts.instr === 0) return null;

  const active = kind === 'instr' ? [...instrKeys] : [...extIds];
  const canCompare = active.length >= 2;

  const tab = (value, label) => (
    <button
      key={value}
      type="button"
      onClick={() => onKindChange(value)}
      className="px-2 py-1 rounded text-[11px] font-mono"
      aria-pressed={kind === value}
      style={{
        border: `1px solid ${kind === value ? 'var(--riscv-gold)' : 'var(--riscv-border-2)'}`,
        background: kind === value ? 'var(--riscv-tint-3)' : 'transparent',
        color: kind === value ? 'var(--riscv-text)' : 'var(--riscv-text-3)',
      }}
    >
      {label} ({counts[value]})
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Comparison tray"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        background: 'var(--riscv-panel)',
        borderTop: '1px solid var(--riscv-tint-3)',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <div className="flex items-center gap-1.5">
        <Columns size={13} style={{ color: 'var(--riscv-gold)' }} />
        {tab('ext', 'Extensions')}
        {tab('instr', 'Instructions')}
      </div>

      <div className="flex items-center gap-1 flex-wrap" style={{ flex: 1, minWidth: 120 }}>
        {active.length === 0 && (
          <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
            Nothing pinned in this tab yet.
          </span>
        )}
        {active.map((key) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono"
            style={{
              border: '1px solid var(--riscv-border-2)',
              background: 'var(--riscv-surface-2)',
              color: 'var(--riscv-text-2)',
            }}
          >
            {chipLabel(kind, key)}
            <button
              type="button"
              onClick={() => onRemove(kind, key)}
              title={chipTitle(kind, key)}
              aria-label={chipTitle(kind, key)}
              style={{ display: 'flex', color: 'var(--riscv-text-3)' }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {active.length > 0 && (
          <button
            type="button"
            className="riscv-btn px-2 py-1 text-[11px] inline-flex items-center gap-1"
            onClick={() => onClear(kind)}
            title="Clear this tab"
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
        <button
          type="button"
          className="riscv-btn px-3 py-1 text-[11px] font-semibold disabled:opacity-40"
          onClick={onOpen}
          disabled={!canCompare}
          title={canCompare ? 'Open the comparison' : 'Pin at least two items to compare'}
        >
          Compare ({active.length})
        </button>
        <span className="text-[10px] font-mono" style={{ color: 'var(--riscv-text-3)' }}>
          max {COMPARE_MAX}
        </span>
      </div>
    </div>
  );
}
