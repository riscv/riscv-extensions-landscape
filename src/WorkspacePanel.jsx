/**
 * WorkspacePanel.jsx — ISA Workspace
 * Redesigned for professional tool-level UX.
 */

import React from 'react';
import {
  X,
  Copy,
  CheckCircle2,
  Search,
  Cpu,
  ArrowRight,
  ExternalLink,
  Trash2,
  Package,
  Download,
  Info,
  BookOpen,
  Terminal,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Zap,
  Sliders,
} from 'lucide-react';

import {
  parseMarchString,
  buildMarchString,
  buildCombinedCatalog,
  DATA_PROVENANCE,
} from './marchUtils.js';
import { buildIsaConfigYaml } from './exportUtils.js';
import { resolveParams, impliedVlen, vlenExtension } from './isaGraph.js';

// ---------------------------------------------------------------------------
// WorkspacePanel
// ---------------------------------------------------------------------------
/**
 * Sort direction indicator for the catalog table header.
 *
 * At module scope deliberately. It used to be declared inside WorkspacePanel,
 * which made it a new component type on every render and remounted the icon
 * each time. Same defect as the extension tile, smaller blast radius.
 */
function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={10} style={{ opacity: 0.3 }} />;
  return sort.dir === 1
    ? <ChevronUp size={10} style={{ color: 'var(--riscv-gold)' }} />
    : <ChevronDown size={10} style={{ color: 'var(--riscv-gold)' }} />;
}

export default function WorkspacePanel({
  open,
  onClose,
  workspaceIds,
  lockedExtensions,
  allExts,
  onAddId,
  onSetVlen,
  onRemoveId,
  onClear,
  onLoadIds,
  onSelectInstruction,
}) {
  const [marchTab, setMarchTab] = React.useState('encode');
  const [marchInput, setMarchInput] = React.useState('');
  const [parseResult, setParseResult] = React.useState(null);
  const [encodeResult, setEncodeResult] = React.useState(null);
  const [copiedMarch, setCopiedMarch] = React.useState(false);
  const [catalogQuery, setCatalogQuery] = React.useState('');
  const [catalogSort, setCatalogSort] = React.useState({ col: 'mnemonic', dir: 1 });
  const [hoveredRow, setHoveredRow] = React.useState(null);
  const [showExportOptions, setShowExportOptions] = React.useState(false);
  const [includeInstructions, setIncludeInstructions] = React.useState(true);

  const marchInputRef = React.useRef(null);

  // Derived
  const workspaceExts = React.useMemo(() => {
    const lookup = new Map(allExts.map(e => [e.id, e]));
    return Array.from(workspaceIds).map(id => lookup.get(id)).filter(Boolean);
  }, [workspaceIds, allExts]);

  const combinedCatalog = React.useMemo(
    () => buildCombinedCatalog(Array.from(workspaceIds), allExts),
    [workspaceIds, allExts]
  );

  const totalInstructions = combinedCatalog.length;

  const filteredCatalog = React.useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    let rows = q
      ? combinedCatalog.filter(row =>
        row.mnemonic.toLowerCase().includes(q) ||
        row.match.toLowerCase().includes(q) ||
        row.sources.some(s => s.extId.toLowerCase().includes(q))
      )
      : combinedCatalog;

    const { col, dir } = catalogSort;
    return [...rows].sort((a, b) => {
      if (col === 'mnemonic') return dir * a.mnemonic.localeCompare(b.mnemonic);
      if (col === 'source') return dir * a.sources[0].extId.localeCompare(b.sources[0].extId);
      if (col === 'match') return dir * a.match.localeCompare(b.match);
      return 0;
    });
  }, [combinedCatalog, catalogQuery, catalogSort]);

  React.useEffect(() => {
    if (marchTab !== 'encode') return;
    setEncodeResult(buildMarchString(Array.from(workspaceIds), allExts));
  }, [workspaceIds, allExts, marchTab]);

  // Smart default: auto-disable instruction catalog for large selections
  React.useEffect(() => {
    setIncludeInstructions(totalInstructions <= 100);
  }, [totalInstructions]);

  React.useEffect(() => {
    if (open && marchTab === 'decode') setTimeout(() => marchInputRef.current?.focus(), 80);
  }, [open, marchTab]);

  function handleParse() {
    const result = parseMarchString(marchInput, allExts);
    setParseResult(result);
    if (result.resolvedIds.length > 0) onLoadIds(result.resolvedIds);
  }

  function handleCopyMarch() {
    const march = encodeResult?.march;
    if (!march) return;
    navigator.clipboard?.writeText(march).catch(() => {
      const el = document.createElement('textarea');
      el.value = march; el.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopiedMarch(true);
    setTimeout(() => setCopiedMarch(false), 1500);
  }

  function handleExportYaml() {
    const { yaml } = buildIsaConfigYaml(Array.from(workspaceIds), allExts, includeInstructions);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseProfile = encodeResult?.march ? encodeResult.march.split('_')[0] : 'core';
    a.download = `riscv_${baseProfile}_config.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revocation — revoking synchronously cancels the download before
    // the browser has had time to start reading the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowExportOptions(false);
  }

  function toggleSort(col) {
    setCatalogSort(prev =>
      prev.col === col ? { col, dir: -prev.dir } : { col, dir: 1 }
    );
  }

  if (!open) return null;

  const isEmpty = workspaceIds.size === 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 40, display: 'flex',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(4,4,10,0.72)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative', marginLeft: 'auto',
          width: 'min(640px, 100vw)',
          height: '100%',
          display: 'flex', flexDirection: 'column',
          background: '#0b0b16',
          borderLeft: '1px solid var(--riscv-tint-3)',
          boxShadow: '-32px 0 80px rgba(0,0,0,0.8), -1px 0 0 rgba(245,197,66,0.06)',
          animation: 'wsSlideIn 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* =========================================================================
            HEADER
            ========================================================================= */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--riscv-tint-3)',
          background: 'linear-gradient(180deg, rgba(245,197,66,0.04) 0%, transparent 100%)',
          flexShrink: 0,
        }}>
          {/* Icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'rgba(245,197,66,0.12)',
              border: '1px solid rgba(245,197,66,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Cpu size={13} style={{ color: 'var(--riscv-gold)' }} />
            </div>
            <span style={{
              fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em',
              color: 'var(--riscv-text)',
            }}>
              ISA Configuration Builder
            </span>

            {/* Stats badges */}
            {!isEmpty && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 6,
                  background: 'rgba(245,197,66,0.1)',
                  border: '1px solid rgba(245,197,66,0.22)',
                  fontSize: 11, fontWeight: 700, color: 'var(--riscv-gold)',
                  letterSpacing: '0.03em', minWidth: 52, justifyContent: 'center',
                }}>
                  <span style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{workspaceIds.size}</span>
                  <span style={{ opacity: 0.65, fontWeight: 500 }}>ext</span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>·</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 6,
                  background: 'rgba(99,179,237,0.08)',
                  border: '1px solid rgba(99,179,237,0.18)',
                  fontSize: 11, fontWeight: 700, color: '#7ec8e3',
                  letterSpacing: '0.03em', minWidth: 68, justifyContent: 'center',
                }}>
                  <span style={{ color: '#bee3f8', fontVariantNumeric: 'tabular-nums' }}>{totalInstructions.toLocaleString()}</span>
                  <span style={{ opacity: 0.65, fontWeight: 500 }}>instr</span>
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!isEmpty && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowExportOptions(!showExportOptions)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 6,
                    background: showExportOptions ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    color: '#34d399', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                  }}
                  onMouseLeave={e => { 
                    if (!showExportOptions) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)';
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.25)';
                    } else {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.25)';
                    }
                  }}
                >
                  <Download size={13} /> Export YAML
                </button>

                {showExportOptions && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    zIndex: 50,
                    display: 'flex', flexDirection: 'column', gap: 0,
                    borderRadius: 10,
                    background: 'linear-gradient(145deg, #1a1f2e 0%, #141824 100%)',
                    border: '1px solid rgba(245,197,66,0.25)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px var(--riscv-tint-2) inset',
                    minWidth: 280, overflow: 'hidden',
                  }}>

                    {/* Header strip */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--riscv-tint-3)',
                      background: 'rgba(245,197,66,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Package size={12} style={{ color: 'var(--riscv-gold)', opacity: 0.85 }} />
                        <span style={{ fontSize: 12, color: 'var(--riscv-text)', fontWeight: 700, letterSpacing: '0.01em' }}>
                          Export Configuration YAML
                        </span>
                      </div>
                      <button
                        onClick={() => setShowExportOptions(false)}
                        style={{ background: 'none', border: 'none', color: '#6f7f95', cursor: 'pointer', padding: 2, lineHeight: 0, borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                        onMouseLeave={e => e.currentTarget.style.color = '#6f7f95'}
                      ><X size={13} /></button>
                    </div>

                    {/* Toggle card */}
                    <div style={{ padding: '12px 14px' }}>
                      <div
                        onClick={() => setIncludeInstructions(v => !v)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                          background: includeInstructions ? 'rgba(245,197,66,0.07)' : 'var(--riscv-tint-2)',
                          border: `1px solid ${includeInstructions ? 'rgba(245,197,66,0.2)' : 'var(--riscv-tint-3)'}`,
                          transition: 'all 0.2s',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <span style={{
                            fontSize: 12.5, fontWeight: 600,
                            color: includeInstructions ? 'var(--riscv-text)' : '#94a3b8',
                            display: 'block', lineHeight: 1.35, transition: 'color 0.2s',
                          }}>
                            Include instruction catalog
                          </span>
                          <span style={{
                            fontSize: 11, marginTop: 2, display: 'block',
                            color: totalInstructions > 100 ? '#f59e0b' : '#64748b',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {totalInstructions.toLocaleString()} instructions{totalInstructions > 100 ? ' · large export' : ''}
                          </span>
                        </div>

                        {/* Premium toggle track */}
                        <div style={{
                          width: 38, height: 21, borderRadius: 11, flexShrink: 0,
                          background: includeInstructions
                            ? 'linear-gradient(135deg, #f5c542 0%, #fde68a 100%)'
                            : 'rgba(255,255,255,0.08)',
                          boxShadow: includeInstructions ? '0 0 8px rgba(245,197,66,0.4)' : 'none',
                          position: 'relative', transition: 'all 0.25s',
                          border: `1px solid ${includeInstructions ? 'rgba(245,197,66,0.7)' : 'var(--riscv-tint-4)'}`,
                        }}>
                          <div style={{
                            width: 15, height: 15, borderRadius: '50%',
                            background: includeInstructions ? '#1a1206' : '#6f7f95',
                            position: 'absolute', top: 2,
                            left: includeInstructions ? 19 : 2,
                            transition: 'all 0.25s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                          }} />
                        </div>
                      </div>
                    </div>

                    {/* Download button */}
                    <div style={{ padding: '0 14px 13px' }}>
                      <button
                        onClick={handleExportYaml}
                        style={{
                          width: '100%', padding: '9px 14px', borderRadius: 7,
                          background: 'linear-gradient(135deg, rgba(245,197,66,0.22) 0%, rgba(245,197,66,0.12) 100%)',
                          color: 'var(--riscv-gold)',
                          border: '1px solid rgba(245,197,66,0.4)',
                          fontSize: 12.5, fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.18s',
                          letterSpacing: '0.02em',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(245,197,66,0.35) 0%, rgba(245,197,66,0.22) 100%)';
                          e.currentTarget.style.boxShadow = '0 0 12px rgba(245,197,66,0.2)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(245,197,66,0.22) 0%, rgba(245,197,66,0.12) 100%)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <Package size={11} />
                        Download .yaml
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isEmpty && (
              <button
                onClick={onClear}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                }}
              >
                <Trash2 size={13} /> Clear all
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--riscv-tint-2)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#64748b', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--riscv-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--riscv-tint-2)'; e.currentTarget.style.color = '#64748b'; }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* =========================================================================
            SCROLLABLE BODY
            ========================================================================= */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

          {/* --- EMPTY STATE --- */}
          {isEmpty && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center',
              padding: '60px 40px', gap: 20,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'rgba(245,197,66,0.06)',
                border: '1px solid rgba(245,197,66,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 40px rgba(245,197,66,0.06)',
              }}>
                <Package size={28} style={{ color: 'rgba(245,197,66,0.4)' }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  No extensions selected
                </p>
                <p style={{ fontSize: 13, color: '#6f7f95', maxWidth: 260, lineHeight: 1.6 }}>
                  Hover any extension tile and click the <strong style={{ color: 'var(--riscv-gold)' }}>+</strong> badge to add it here. Or paste a{' '}
                  <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#94a3b8' }}>-march</code> string in the decode tab.
                </p>
              </div>
              {/* Show decode input when empty too */}
              <button
                onClick={() => setMarchTab('decode')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8,
                  background: 'rgba(245,197,66,0.1)',
                  border: '1px solid rgba(245,197,66,0.25)',
                  color: 'var(--riscv-gold)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Terminal size={12} /> Paste -march string
              </button>
            </div>
          )}

          {/* Populated state */}
          {!isEmpty && (
            <Section label="Selected Extensions" count={workspaceIds.size} icon={<Cpu size={11} />}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {workspaceExts.map(ext => (
                  <ExtChip
                    key={ext.id}
                    ext={ext}
                    lockedBy={lockedExtensions?.get(ext.id)}
                    onRemove={() => onRemoveId(ext.id)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Tabs */}
          <Divider />
          <Section label="-march Tool" icon={<Terminal size={11} />}>
            {/* Tab row */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {['encode', 'decode'].map(tab => (
                <button
                  key={tab}
                  onClick={() => { setMarchTab(tab); setParseResult(null); }}
                  style={{
                    padding: '6px 14px', borderRadius: 7, fontSize: 12,
                    fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
                    cursor: 'pointer', letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    transition: 'all 0.15s',
                    ...(marchTab === tab ? {
                      background: 'rgba(245,197,66,0.15)',
                      border: '1px solid rgba(245,197,66,0.35)',
                      color: 'var(--riscv-gold)',
                    } : {
                      background: 'var(--riscv-tint-2)',
                      border: '1px solid var(--riscv-tint-3)',
                      color: '#6f7f95',
                    }),
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Encode tab */}
            {marchTab === 'encode' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {encodeResult?.march ? (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 0,
                      borderRadius: 9, overflow: 'hidden',
                      border: '1px solid rgba(245,197,66,0.2)',
                      background: 'rgba(245,197,66,0.04)',
                    }}>
                      <code style={{
                        flex: 1, padding: '11px 14px',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 13.5, color: '#f5c542',
                        wordBreak: 'break-all', letterSpacing: '0.01em',
                      }}>
                        {encodeResult.march}
                      </code>
                      <button
                        onClick={handleCopyMarch}
                        style={{
                          flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 44, alignSelf: 'stretch',
                          borderLeft: '1px solid rgba(245,197,66,0.15)',
                          background: copiedMarch ? 'rgba(32,217,160,0.1)' : 'transparent',
                          color: copiedMarch ? '#20d9a0' : '#6f7f95',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!copiedMarch) { e.currentTarget.style.background = 'rgba(245,197,66,0.1)'; e.currentTarget.style.color = 'var(--riscv-gold)'; } }}
                        onMouseLeave={e => { if (!copiedMarch) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6f7f95'; } }}
                        title="Copy -march string"
                      >
                        {copiedMarch
                          ? <CheckCircle2 size={14} />
                          : <Copy size={14} />}
                      </button>
                    </div>

                    {encodeResult.excluded.length > 0 && (
                      <div style={{
                        borderRadius: 8, padding: '12px 14px',
                        background: 'rgba(255,160,122,0.06)',
                        border: '1px solid rgba(255,160,122,0.15)',
                        marginTop: 4
                      }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ffa07a', marginBottom: 10, marginTop: 0 }}>
                          <Info size={13} /> Excluded from -march
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {encodeResult.excluded.map(ex => (
                            <div key={ex.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <span style={{
                                display: 'inline-flex', padding: '2px 6px', borderRadius: 4,
                                background: 'rgba(255,255,255,0.08)',
                                fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--riscv-text)'
                              }}>
                                {ex.id}
                              </span>
                              <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{ex.reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{
                    borderRadius: 8, padding: '14px',
                    background: 'var(--riscv-tint-1)',
                    border: '1px solid var(--riscv-tint-3)',
                    textAlign: 'center',
                    fontSize: 13, color: '#6f7f95',
                  }}>
                    {isEmpty
                      ? 'Select extensions from the tile view to generate a -march string.'
                      : 'Add a base ISA (RV32I, RV64I, …) to generate a -march string.'}
                  </div>
                )}
              </div>
            )}

            {/* Decode tab */}
            {marchTab === 'decode' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center',
                    borderRadius: 8, overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.09)',
                    background: 'var(--riscv-tint-2)',
                    transition: 'border-color 0.15s',
                  }}>
                    <input
                      ref={marchInputRef}
                      type="text"
                      value={marchInput}
                      onChange={e => { setMarchInput(e.target.value); setParseResult(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleParse()}
                      placeholder="rv64gc_zba_zbb_zicsr_zifencei"
                      style={{
                        flex: 1, padding: '10px 12px',
                        background: 'transparent', border: 'none', outline: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 13, color: 'var(--riscv-text)',
                        caretColor: 'var(--riscv-gold)',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleParse}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '10px 14px', borderRadius: 8,
                      background: 'rgba(245,197,66,0.14)',
                      border: '1px solid rgba(245,197,66,0.3)',
                      color: 'var(--riscv-gold)', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s', flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,197,66,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,197,66,0.14)'}
                  >
                    <ArrowRight size={12} /> Parse
                  </button>
                </div>

                {parseResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {parseResult.resolvedIds.length > 0 && (
                      <div style={{
                        borderRadius: 8, padding: '12px',
                        background: 'rgba(32,217,160,0.06)',
                        border: '1px solid rgba(32,217,160,0.18)',
                      }}>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#20d9a0', marginBottom: 9 }}>
                          ✓ Resolved {parseResult.resolvedIds.length} extensions — added to workspace
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {parseResult.resolvedIds.map(id => (
                            <span key={id} style={{
                              padding: '3px 8px', borderRadius: 5,
                              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                              background: 'rgba(32,217,160,0.08)',
                              border: '1px solid rgba(32,217,160,0.25)',
                              color: '#a7f3d0',
                            }}>{id}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {parseResult.gExpanded && (
                      <InfoPill icon={<Zap size={10} />}>
                        "g" expanded → {['I', 'M', 'A', 'F', 'D', 'Zicsr', 'Zifencei'].join(' · ')}
                      </InfoPill>
                    )}
                    {parseResult.unknownTokens && parseResult.unknownTokens.length > 0 && (
                      <div style={{
                        borderRadius: 8, padding: '10px 12px',
                        background: 'rgba(245,197,66,0.05)',
                        border: '1px solid rgba(245,197,66,0.15)',
                      }}>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f59e0b', marginBottom: 7 }}>
                          Not in catalog ({parseResult.unknownTokens.length})
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {parseResult.unknownTokens.map(t => (
                            <span key={t} style={{
                              padding: '2px 7px', borderRadius: 4,
                              fontFamily: 'monospace', fontSize: 11,
                              background: 'rgba(245,197,66,0.07)',
                              border: '1px solid rgba(245,197,66,0.2)',
                              color: '#fde68a',
                            }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {parseResult.warnings && parseResult.warnings.length > 0 && (
                      <div style={{
                        borderRadius: 8, padding: '12px 14px',
                        background: 'rgba(255,160,122,0.06)',
                        border: '1px solid rgba(255,160,122,0.15)',
                        marginTop: 4
                      }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ffa07a', marginBottom: 10, marginTop: 0 }}>
                          <Info size={13} /> Decoder Notes
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {parseResult.warnings.map((warn, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
                              • {warn}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Implementation parameters */}
          {!isEmpty && (() => {
            const ids = Array.from(workspaceIds);
            const params = resolveParams(ids);
            const vlen = impliedVlen(ids);
            const VLEN_CHOICES = [32, 64, 128, 256, 512, 1024];
            return (
              <>
                <Divider />
                <Section label="Implementation Parameters" count={params.length} icon={<Sliders size={11} />}>
                  {/* Vector length first: it is the one parameter -march can
                      carry, and the one people come looking for. It is set by
                      picking a Zvl*b extension, which is not obvious. */}
                  <div style={{ marginBottom: params.length ? 14 : 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--riscv-text-2)', marginBottom: 6 }}>
                      Vector length (VLEN)
                      {vlen
                        ? <span style={{ color: 'var(--riscv-gold)', fontWeight: 700 }}>{`  ≥ ${vlen} bits`}</span>
                        : <span style={{ color: 'var(--riscv-text-3)' }}>  not constrained — no vector extension selected</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {VLEN_CHOICES.map((bits) => {
                        const ext = vlenExtension(bits);
                        const active = vlen === bits;
                        return (
                          <button
                            key={bits}
                            type="button"
                            // Clicking the active value clears the floor; clicking
                            // any other sets it, which means dropping the higher
                            // Zvl*b extensions rather than just adding a lower one.
                            onClick={() => onSetVlen(active ? null : bits)}
                            title={active
                              ? `VLEN is ≥ ${bits}. Click to clear it (removes ${ext}).`
                              : `Set VLEN ≥ ${bits}${vlen && bits < vlen ? ` — lowers it from ${vlen}` : ''}`}
                            style={{
                              fontSize: 11, fontFamily: 'monospace', padding: '4px 9px', borderRadius: 6,
                              cursor: 'pointer',
                              border: `1px solid ${active ? 'rgba(245,197,66,0.6)' : 'var(--riscv-tint-4)'}`,
                              background: active ? 'rgba(245,197,66,0.18)' : 'var(--riscv-tint-2)',
                              color: active ? 'var(--riscv-gold)' : 'var(--riscv-text-2)',
                            }}
                          >
                            {bits}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--riscv-text-3)', marginTop: 6 }}>
                      There is no VLEN flag: vector length is expressed by the Zvl*b extensions.
                      Click a value to set the floor, or click the selected one to clear it. A
                      vector extension may hold the floor above your choice — Zve64x requires
                      Zvl64b — in which case the higher value stands.
                    </div>
                  </div>

                  {params.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {params.map((prm) => (
                        <div key={prm.name} style={{
                          borderRadius: 7, padding: '8px 10px',
                          background: prm.conflict ? 'rgba(255,77,107,0.08)' : 'var(--riscv-tint-1)',
                          border: `1px solid ${prm.conflict ? 'rgba(255,77,107,0.3)' : 'var(--riscv-tint-3)'}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--riscv-text)' }}>{prm.name}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--riscv-gold)' }}>
                              {prm.kind === 'greaterThanOrEqual' ? `≥ ${prm.value}`
                                : Array.isArray(prm.value) ? prm.value.length === 1 ? String(prm.value[0]) : `one of ${prm.value.length}`
                                : String(prm.value)}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--riscv-text-3)', marginTop: 3 }}>
                            required by {prm.from.join(', ')}
                          </div>
                          {prm.conflict && (
                            <div style={{ fontSize: 10, color: '#ff7a8a', marginTop: 4 }}>{prm.conflict}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            );
          })()}

          {/* Instruction catalog tab */}
          {!isEmpty && (
            <>
              <Divider />
              <Section
                label="Combined Instruction Catalog"
                count={filteredCatalog.length}
                total={totalInstructions}
                icon={<BookOpen size={11} />}
              >
                {/* Search bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 11px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.025)',
                  marginBottom: 10,
                }}>
                  <Search size={13} style={{ color: '#6f7f95', flexShrink: 0 }} />
                  <input
                    type="text"
                    value={catalogQuery}
                    onChange={e => setCatalogQuery(e.target.value)}
                    placeholder="Filter by mnemonic, extension, match value…"
                    style={{
                      flex: 1, background: 'transparent',
                      border: 'none', outline: 'none',
                      fontSize: 13, color: 'var(--riscv-text)',
                      caretColor: 'var(--riscv-gold)',
                    }}
                  />
                  {catalogQuery && (
                    <button
                      onClick={() => setCatalogQuery('')}
                      style={{ color: '#6f7f95', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Table */}
                <div style={{
                  borderRadius: 10,
                  border: '1px solid var(--riscv-tint-3)',
                  overflow: 'hidden',
                }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 1.5fr',
                    padding: '9px 14px',
                    background: 'var(--riscv-tint-2)',
                    borderBottom: '1px solid var(--riscv-tint-3)',
                  }}>
                    {[
                      { col: 'mnemonic', label: 'Mnemonic' },
                      { col: 'source', label: 'Source(s)' },
                      { col: 'match', label: 'Match' },
                    ].map(({ col, label }) => (
                      <button
                        key={col}
                        onClick={() => toggleSort(col)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          fontSize: 11, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                          color: catalogSort.col === col ? '#94a3b8' : '#334155',
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#64748b'}
                        onMouseLeave={e => e.currentTarget.style.color = catalogSort.col === col ? '#94a3b8' : '#334155'}
                      >
                        {label} <SortIcon sort={catalogSort} col={col} />
                      </button>
                    ))}
                  </div>

                  {/* Rows */}
                  <div style={{ maxHeight: 380, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                    {filteredCatalog.length === 0 ? (
                      <div style={{
                        padding: '24px', textAlign: 'center',
                        fontSize: 13, color: '#334155',
                      }}>
                        {catalogQuery ? 'No instructions match the filter.' : 'No instructions in selected extensions.'}
                      </div>
                    ) : (
                      filteredCatalog.slice(0, 300).map((row, i) => (
                        <CatalogRow
                          key={row.key}
                          row={row}
                          isEven={i % 2 === 0}
                          isHovered={hoveredRow === row.key}
                          onHover={setHoveredRow}
                          onSelect={onSelectInstruction}
                        />
                      ))
                    )}
                    {filteredCatalog.length > 300 && (
                      <div style={{
                        padding: '10px 14px',
                        background: 'var(--riscv-tint-1)',
                        borderTop: '1px solid var(--riscv-tint-3)',
                        fontSize: 11, color: '#334155', textAlign: 'center',
                      }}>
                        Showing first 300 of {filteredCatalog.length.toLocaleString()}. Use filter to narrow results.
                      </div>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>
                  Deduplicated by mnemonic + encoding.
                  Same instruction shared across extensions → shown once, all sources listed.
                </p>
              </Section>
            </>
          )}

          {/* =========================================================================
              DATA PROVENANCE FOOTER
              ========================================================================= */}
          <div style={{
            margin: '8px 18px 18px',
            borderRadius: 9,
            background: 'var(--riscv-tint-1)',
            border: '1px solid var(--riscv-tint-3)',
            padding: '12px 14px',
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: '#334155', marginBottom: 9,
            }}>
              Data Sources
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DATA_PROVENANCE.map(p => (
                <div key={p.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#6f7f95', flexShrink: 0 }}>{p.label}</span>
                  <span style={{ height: 1, flex: 1, background: 'var(--riscv-tint-2)', alignSelf: 'center' }} />
                  <a
                    href={p.url} target="_blank" rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: '#8b7cf8', textDecoration: 'none',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a89af9'}
                    onMouseLeave={e => e.currentTarget.style.color = '#8b7cf8'}
                  >
                    {p.source} <ExternalLink size={9} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Animation keyframes injected once */}
      <style>{`
        @keyframes wsSlideIn {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Section({ label, icon, count, total, children }) {
  return (
    <div style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <span style={{ color: '#334155' }}>{icon}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#6f7f95',
        }}>
          {label}
        </span>
        {count !== undefined && (
          <span style={{
            fontSize: 11, color: '#334155', fontFamily: 'JetBrains Mono, monospace',
          }}>
            {total !== undefined && count !== total
              ? `${count.toLocaleString()} / ${total.toLocaleString()}`
              : count.toLocaleString()}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      margin: '0 18px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }} />
  );
}

function InfoPill({ icon, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 7,
      padding: '8px 11px', borderRadius: 7,
      background: 'var(--riscv-tint-2)',
      border: '1px solid var(--riscv-tint-3)',
      fontSize: 12, color: '#64748b',
    }}>
      <span style={{ flexShrink: 0, marginTop: 1, color: '#6f7f95' }}>{icon}</span>
      {children}
    </div>
  );
}

// ============================================================================
// Extension chip with remove button
// ============================================================================
function ExtChip({ ext, lockedBy, onRemove }) {
  const [hovered, setHovered] = React.useState(false);
  const isLocked = lockedBy && lockedBy.length > 0;

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        paddingLeft: 9, paddingRight: 5, paddingTop: 4, paddingBottom: 4,
        borderRadius: 7,
        background: hovered && !isLocked ? 'rgba(245,197,66,0.12)' : (isLocked ? 'rgba(245,197,66,0.03)' : 'rgba(245,197,66,0.07)'),
        border: `1px solid ${hovered && !isLocked ? 'rgba(245,197,66,0.35)' : (isLocked ? 'rgba(245,197,66,0.1)' : 'rgba(245,197,66,0.18)')}`,
        transition: 'all 0.15s',
        opacity: isLocked ? 0.7 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isLocked ? `Required by ${lockedBy.join(', ')} — remove dependent first` : undefined}
    >
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12, fontWeight: 600,
        color: isLocked ? 'rgba(245,197,66,0.6)' : 'var(--riscv-gold)',
        letterSpacing: '0.02em',
      }}>
        {ext.id}
      </span>
      <button
        onClick={isLocked ? undefined : onRemove}
        disabled={isLocked}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 4,
          background: (hovered && !isLocked) ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer',
          color: isLocked ? 'rgba(255,255,255,0.15)' : (hovered ? '#94a3b8' : '#6f7f95'),
          transition: 'all 0.12s',
          padding: 0,
        }}
      >
        <X size={9} />
      </button>
    </span>
  );
}

// ============================================================================
// Catalog table row
// ============================================================================
/**
 * One row of the combined instruction catalogue.
 *
 * Memoised because 300 of these render at once and the panel re-renders on
 * every hover and every selection change. Without it, moving the pointer down
 * the table repaints all 300 rows per row entered, which is most of the lag
 * reported when clicking around the builder.
 */
function CatalogRowInner({ row, isEven, isHovered, onHover, onSelect }) {
  const multiSource = row.sources.length > 1;

  // Assign a color per source extension (deterministic, based on first char)
  function srcColor(extId) {
    const palette = [
      '#8b7cf8', '#f472b6', '#2dd4bf', '#60a5fa', '#f5c542',
      '#34d399', '#fb923c', '#a78bfa', '#f87171',
    ];
    let h = 0;
    for (const c of extId) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return palette[h % palette.length];
  }

  return (
    <button
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect({
        extId: row.sources[0].extId,
        mnemonic: row.mnemonic,
        encoding: row.encoding,
        variable_fields: row.variable_fields,
        match: row.match,
        mask: row.mask,
      })}
      style={{
        display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr',
        width: '100%', padding: '9px 14px',
        background: isHovered
          ? 'rgba(139,124,248,0.07)'
          : isEven ? 'transparent' : 'rgba(255,255,255,0.012)',
        borderBottom: '1px solid var(--riscv-tint-2)',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.1s',
        border: 'none',
        outline: isHovered ? '1px solid rgba(139,124,248,0.2)' : 'none',
        outlineOffset: -1,
      }}
    >
      {/* Mnemonic */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13, fontWeight: 600,
        color: isHovered ? '#c4b5fd' : 'var(--riscv-text)',
        paddingRight: 8,
        transition: 'color 0.1s',
      }}>
        {row.mnemonic}
      </span>

      {/* Source(s) */}
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, paddingRight: 8, alignItems: 'center' }}>
        {row.sources.map(s => (
          <span key={s.extId} style={{
            padding: '1px 6px', borderRadius: 4,
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 500,
            background: `${srcColor(s.extId)}18`,
            border: `1px solid ${srcColor(s.extId)}38`,
            color: srcColor(s.extId),
            letterSpacing: '0.02em',
          }}>
            {s.extId}
          </span>
        ))}
      </span>

      {/* Match */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12, color: '#6f7f95',
        letterSpacing: '0.01em',
      }}>
        {row.match || '—'}
      </span>
    </button>
  );
}

const CatalogRow = React.memo(CatalogRowInner);
