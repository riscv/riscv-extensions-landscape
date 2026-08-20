/**
 * ExtensionTile — one extension in the grid.
 *
 * This lived inside RISCVExplorer as a nested `const ExtensionBlock = …`. That
 * is the React anti-pattern that made the page feel broken: a component defined
 * in a render body is a NEW function on every render, React compares element
 * types by reference, and a different reference reads as a different component
 * type. The whole subtree gets unmounted and rebuilt rather than updated.
 *
 * With 227 tiles, every click, keystroke and toggle tore down and recreated 227
 * subtrees. A user reported selections taking "seconds to minutes" on Chrome
 * under macOS. Confirmed in the browser beforehand: after a click the tile DOM
 * nodes were replaced rather than reused.
 *
 * Two things make this fast:
 *
 *   1. Defining it at module scope, so its identity is stable across renders
 *      and React updates instead of remounting.
 *   2. tilePropsAreEqual below, which compares each tile against ITS OWN state
 *      rather than against container identity. workspaceIds is a fresh Set on
 *      every change, so a shallow compare would re-render all 227 tiles; asking
 *      "did membership change for THIS id" re-renders only what changed.
 */
import React from 'react';
import { Plus } from 'lucide-react';
import { tilePropsAreEqual } from './tileMemo.js';

function ExtensionTile({
  data,
  colorClass,
  searchQuery,
  searchIndex,
  selectedExtId,
  workspaceIds,
  lockedExtensions,
  builderMode,
  isHighlighted,
  isDimmed,
  onSelect,
  onToggleWorkspace,
}) {
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = q.length ? (searchIndex || '').includes(q) : false;

  const isDiscontinued = data.discontinued === 1;
  const isSelected = selectedExtId === data.id;
  const highlighted = isHighlighted(data.id) || matchesSearch || isSelected;
  const dimmed = isDimmed(data.id) && !matchesSearch && !isSelected;
  const inWorkspace = workspaceIds.has(data.id);

  return (
    <div
      id={`ext-${data.id}`}
      onClick={() => onSelect(data)}
      className={[
        'ext-tile group relative rounded-lg border cursor-pointer select-none',
        isSelected ? 'ext-tile-active' : '',
        highlighted && !isSelected ? 'ext-tile-highlighted' : '',
        dimmed ? 'opacity-20 grayscale pointer-events-none' : '',
        isDiscontinued && !dimmed
          ? 'border-[var(--riscv-border-2)] bg-[var(--riscv-surface)]'
          : !dimmed ? colorClass : '',
      ].join(' ')}
      style={{
        padding: '10px',
        // Amber glow ring when in the builder
        ...(inWorkspace && !isDiscontinued ? {
          borderColor: 'rgba(245,197,66,0.55)',
          boxShadow: '0 0 0 1px rgba(245,197,66,0.2), inset 0 0 12px rgba(245,197,66,0.04)',
        } : {}),
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* EOL badge */}
      {isDiscontinued && (
        <span
          className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider"
          style={{
            background: 'rgba(255,77,107,0.12)',
            color: '#ff7a8a',
            border: '1px solid rgba(255,77,107,0.25)',
          }}
        >
          EOL
        </span>
      )}

      {/* Add/remove control — only while the builder is switched on */}
      {builderMode && !isDiscontinued && (() => {
        const isLocked = inWorkspace && lockedExtensions.has(data.id);
        const lockedBy = isLocked ? lockedExtensions.get(data.id) : [];

        // Amber says "you can add this"; green says "it is in". Using one colour
        // for both made a full configuration a wall of undifferentiated amber.
        // Locked tiles stay dimmed to read as unavailable.
        const accent = '#f5c542';
        return (
          <button
            type="button"
            data-in-workspace={inWorkspace ? 'true' : 'false'}
            onClick={(e) => {
              e.stopPropagation();
              // The handler reports lock rejections itself.
              onToggleWorkspace(data.id);
            }}
            className="workspace-tile-btn absolute top-1.5 right-1.5"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18,
              borderRadius: 5,
              border: `1px solid ${
                isLocked ? 'rgba(245,197,66,0.3)'
                  : inWorkspace ? 'var(--riscv-check-edge)' : 'rgba(245,197,66,0.6)'
              }`,
              background: inWorkspace
                ? (isLocked ? 'rgba(245,197,66,0.08)' : 'var(--riscv-check-fill)')
                : 'rgba(245,197,66,0.14)',
              backdropFilter: 'blur(4px)',
              boxShadow: inWorkspace || isLocked ? 'none' : '0 0 0 2px rgba(245,197,66,0.12)',
              color: isLocked ? 'rgba(245,197,66,0.5)' : (inWorkspace ? 'var(--riscv-check)' : accent),
              cursor: isLocked ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              padding: 0,
            }}
            title={isLocked
              ? `Required by ${lockedBy.join(', ')} — remove dependent first`
              : (inWorkspace
                ? `Remove ${data.id} from ISA Configuration Builder`
                : `Add ${data.id} to ISA Configuration Builder`)}
          >
            {inWorkspace
              ? (
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )
              : <Plus size={9} />
            }
          </button>
        );
      })()}

      <div className="flex items-start justify-between mb-1">
        <span
          className="font-mono font-semibold text-[12px] leading-tight"
          style={{ letterSpacing: '0.02em' }}
        >
          {data.name}
        </span>
      </div>
      <div
        className="text-[11px] leading-snug line-clamp-2"
        style={{ color: 'var(--riscv-text-2)' }}
      >
        {data.desc}
      </div>
    </div>
  );
}

export default React.memo(ExtensionTile, tilePropsAreEqual);
