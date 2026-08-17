import React, { useState } from 'react';
import {
  LayoutGrid,
  Info,
  ScanSearch,
  X,
  ArrowRight,
  ArrowUpRight,
  Copy,
  ChevronLeft,
  ChevronRight,
  Search,
  Cpu,
  Shield,
  Zap,
  Lock,
  Database,
  Settings2,
  Layers,
  Braces,
  FlaskConical,
  Network,
  Activity,
  BookOpen,
  Gem,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Package,
  Binary,
  MemoryStick,
  CircuitBoard,
  Shuffle,
  Timer,
  ServerCrash,
  KeyRound,
  Plus,
  Trash2,
  Download,
  ChevronDown,
  Maximize2,
} from 'lucide-react';
import extensions from './riscv_extensions.json';
import WorkspacePanel from './WorkspacePanel.jsx';
// INCOMPATIBLE_WITH is no longer imported here: conflicts now come back from
// resolveSelection(), which checks them over the resolved closure rather than
// only over what the user clicked.
import { BASE_ISA_IDS, SMART_DEPENDENCIES, buildMarchString, buildCombinedCatalog } from './marchUtils.js';
import { resolveSelection } from './isaGraph.js';
import { PROFILES } from './profiles.js';
import { buildIsaConfigYaml } from './exportUtils.js';

// Ids the catalog can actually render. The dependency graph carries a few nodes
// the catalog does not (UDB's S requires Sm, for which we have no entry), and
// adding one of those to the workspace would show a row with nothing behind it.
const CATALOG_IDS = new Set(
  Object.values(extensions).flat().filter(Boolean).map((e) => e.id),
);

const BIT_WIDTH = 32n;
const BIT_MASK_32 = (1n << BIT_WIDTH) - 1n;

const normalizeMnemonicKey = (value) => String(value ?? '').trim().toUpperCase().split(/\s+/)[0];

const COMPRESSED_INSTRUCTION_MAPPINGS = [
  {
    mnemonic: 'C.NOP',
    compressed: 'C.NOP',
    standard: 'addi x0, x0, 0',
    description: 'No Operation',
    notes: '',
  },
  {
    mnemonic: 'C.LI',
    compressed: 'C.LI rd, imm',
    standard: 'addi rd, x0, imm',
    description: 'Load Immediate',
    notes: 'Expands to addi with x0.',
  },
  {
    mnemonic: 'C.LUI',
    compressed: 'C.LUI rd, imm',
    standard: 'lui rd, imm',
    description: 'Load Upper Immediate',
    notes: '',
  },
  {
    mnemonic: 'C.ADDI',
    compressed: 'C.ADDI rd, imm',
    standard: 'addi rd, rd, imm',
    description: 'Add Immediate',
    notes: '',
  },
  {
    mnemonic: 'C.ADDIW',
    compressed: 'C.ADDIW rd, imm',
    standard: 'addiw rd, rd, imm',
    description: 'Add Word Immediate',
    notes: 'RV64/128 Only.',
  },
  {
    mnemonic: 'C.ADDI16SP',
    compressed: 'C.ADDI16SP imm',
    standard: 'addi sp, sp, imm',
    description: 'Adjust Stack Pointer',
    notes: 'Specific to sp (x2).',
  },
  {
    mnemonic: 'C.ADDI4SPN',
    compressed: "C.ADDI4SPN rd', imm",
    standard: "addi rd', sp, imm",
    description: 'Add Immediate, Scaled 4, SP rel',
    notes: "Used to generate pointers to stack variables. Destination rd' must be x8-x15.",
  },
  {
    mnemonic: 'C.SLLI',
    compressed: 'C.SLLI rd, imm',
    standard: 'slli rd, rd, imm',
    description: 'Shift Left Logical Imm',
    notes: '',
  },
  {
    mnemonic: 'C.SRLI',
    compressed: "C.SRLI rd', imm",
    standard: "srli rd', rd', imm",
    description: 'Shift Right Logical Imm',
    notes: "rd' restricted to x8-x15.",
  },
  {
    mnemonic: 'C.SRAI',
    compressed: "C.SRAI rd', imm",
    standard: "srai rd', rd', imm",
    description: 'Shift Right Arithmetic Imm',
    notes: "rd' restricted to x8-x15.",
  },
  {
    mnemonic: 'C.ANDI',
    compressed: "C.ANDI rd', imm",
    standard: "andi rd', rd', imm",
    description: 'AND Immediate',
    notes: "rd' restricted to x8-x15.",
  },
  {
    mnemonic: 'C.MV',
    compressed: 'C.MV rd, rs2',
    standard: 'add rd, x0, rs2',
    description: 'Move Register',
    notes: 'Copies rs2 to rd.',
  },
  {
    mnemonic: 'C.ADD',
    compressed: 'C.ADD rd, rs2',
    standard: 'add rd, rd, rs2',
    description: 'Add Register',
    notes: 'rd += rs2.',
  },
  {
    mnemonic: 'C.AND',
    compressed: "C.AND rd', rs2'",
    standard: "and rd', rd', rs2'",
    description: 'AND Register',
    notes: "Operands restricted to x8-x15.",
  },
  {
    mnemonic: 'C.OR',
    compressed: "C.OR rd', rs2'",
    standard: "or rd', rd', rs2'",
    description: 'OR Register',
    notes: "Operands restricted to x8-x15.",
  },
  {
    mnemonic: 'C.XOR',
    compressed: "C.XOR rd', rs2'",
    standard: "xor rd', rd', rs2'",
    description: 'XOR Register',
    notes: "Operands restricted to x8-x15.",
  },
  {
    mnemonic: 'C.SUB',
    compressed: "C.SUB rd', rs2'",
    standard: "sub rd', rd', rs2'",
    description: 'Subtract Register',
    notes: "Operands restricted to x8-x15.",
  },
  {
    mnemonic: 'C.SUBW',
    compressed: "C.SUBW rd', rs2'",
    standard: "subw rd', rd', rs2'",
    description: 'Subtract Word',
    notes: "RV64/128 Only. Operands restricted to x8-x15.",
  },
  {
    mnemonic: 'C.ADDW',
    compressed: "C.ADDW rd', rs2'",
    standard: "addw rd', rd', rs2'",
    description: 'Add Word',
    notes: "RV64/128 Only. Operands restricted to x8-x15.",
  },
  {
    mnemonic: 'C.LW',
    compressed: "C.LW rd', imm(rs1')",
    standard: "lw rd', offset(rs1')",
    description: 'Load Word',
    notes: "rd' and rs1' must be x8-x15.",
  },
  {
    mnemonic: 'C.SW',
    compressed: "C.SW rs2', imm(rs1')",
    standard: "sw rs2', offset(rs1')",
    description: 'Store Word',
    notes: "rs2' and rs1' must be x8-x15.",
  },
  {
    mnemonic: 'C.LD',
    compressed: "C.LD rd', imm(rs1')",
    standard: "ld rd', offset(rs1')",
    description: 'Load Doubleword',
    notes: 'RV64/128 Only.',
  },
  {
    mnemonic: 'C.SD',
    compressed: "C.SD rs2', imm(rs1')",
    standard: "sd rs2', offset(rs1')",
    description: 'Store Doubleword',
    notes: 'RV64/128 Only.',
  },
  {
    mnemonic: 'C.LWSP',
    compressed: 'C.LWSP rd, imm',
    standard: 'lw rd, offset(sp)',
    description: 'Load Word (SP-relative)',
    notes: 'Uses sp implicitly. rd cannot be x0.',
  },
  {
    mnemonic: 'C.SWSP',
    compressed: 'C.SWSP rs2, imm',
    standard: 'sw rs2, offset(sp)',
    description: 'Store Word (SP-relative)',
    notes: 'Uses sp implicitly.',
  },
  {
    mnemonic: 'C.LDSP',
    compressed: 'C.LDSP rd, imm',
    standard: 'ld rd, offset(sp)',
    description: 'Load Double (SP-relative)',
    notes: 'RV64/128 Only.',
  },
  {
    mnemonic: 'C.SDSP',
    compressed: 'C.SDSP rs2, imm',
    standard: 'sd rs2, offset(sp)',
    description: 'Store Double (SP-relative)',
    notes: 'RV64/128 Only.',
  },
  {
    mnemonic: 'C.J',
    compressed: 'C.J offset',
    standard: 'jal x0, offset',
    description: 'Jump (Unconditional)',
    notes: 'Essentially a goto.',
  },
  {
    mnemonic: 'C.JAL',
    compressed: 'C.JAL offset',
    standard: 'jal x1, offset',
    description: 'Jump and Link',
    notes: 'RV32 Only. Calls a function (saves return addr to ra).',
  },
  {
    mnemonic: 'C.JR',
    compressed: 'C.JR rs1',
    standard: 'jalr x0, 0(rs1)',
    description: 'Jump Register',
    notes: 'Returns from function (if rs1 is ra).',
  },
  {
    mnemonic: 'C.JALR',
    compressed: 'C.JALR rs1',
    standard: 'jalr x1, 0(rs1)',
    description: 'Jump and Link Register',
    notes: 'Calls function pointer; saves return addr to ra.',
  },
  {
    mnemonic: 'C.BEQZ',
    compressed: "C.BEQZ rs1', offset",
    standard: "beq rs1', x0, offset",
    description: 'Branch if Equal to Zero',
    notes: "rs1' restricted to x8-x15.",
  },
  {
    mnemonic: 'C.BNEZ',
    compressed: "C.BNEZ rs1', offset",
    standard: "bne rs1', x0, offset",
    description: 'Branch if Not Equal Zero',
    notes: "rs1' restricted to x8-x15.",
  },
  {
    mnemonic: 'C.EBREAK',
    compressed: 'C.EBREAK',
    standard: 'ebreak',
    description: 'Environment Break',
    notes: 'Used for debuggers.',
  },
];

const COMPRESSED_INSTRUCTION_LOOKUP = COMPRESSED_INSTRUCTION_MAPPINGS.reduce((acc, entry) => {
  acc[normalizeMnemonicKey(entry.mnemonic)] = entry;
  return acc;
}, {});

const COMPRESSED_BY_STANDARD = COMPRESSED_INSTRUCTION_MAPPINGS.reduce((acc, entry) => {
  const key = normalizeMnemonicKey(entry.standard);
  if (!key) return acc;
  if (!acc[key]) acc[key] = [];
  acc[key].push(entry);
  return acc;
}, {});

const STANDARD_EQUIVALENT_PRIORITY = ['RV32I', 'RV64I', 'RV128I', 'RV32E', 'RV64E'];

const normalizeHexString = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.toLowerCase().startsWith('0x') ? text.toLowerCase() : `0x${text.toLowerCase()}`;
};

const parseHexToBigInt = (value) => {
  const normalized = normalizeHexString(value);
  if (!normalized) return null;
  if (!/^0x[0-9a-f]+$/i.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
};

const toHex32 = (value) => {
  const v = (value ?? 0n) & BIT_MASK_32;
  return `0x${v.toString(16).padStart(8, '0')}`;
};

const normalizeEncodingString = (value) => {
  const encoding = String(value ?? '').replace(/\s+/g, '');
  if (!encoding) return '';
  return encoding;
};

const encodingToMatchMask = (encoding) => {
  const normalized = normalizeEncodingString(encoding);
  if (!normalized) return { match: null, mask: null, error: 'Provide an encoding or match/mask.' };
  if (normalized.length !== 32) {
    return { match: null, mask: null, error: `Encoding must be 32 characters (got ${normalized.length}).` };
  }
  if (!/^[01-]{32}$/.test(normalized)) {
    return { match: null, mask: null, error: 'Encoding may only contain 0, 1, and -.' };
  }

  let match = 0n;
  let mask = 0n;
  for (let i = 0; i < 32; i++) {
    const bit = 31n - BigInt(i);
    const ch = normalized[i];
    if (ch === '-') continue;
    mask |= 1n << bit;
    if (ch === '1') match |= 1n << bit;
  }
  return { match, mask, error: null };
};

const matchMaskToEncoding = (match, mask) => {
  const m = (match ?? 0n) & BIT_MASK_32;
  const k = (mask ?? 0n) & BIT_MASK_32;
  let out = '';
  for (let bit = 31n; bit >= 0n; bit--) {
    const bitMask = 1n << bit;
    if ((k & bitMask) === 0n) out += '-';
    else out += (m & bitMask) === 0n ? '0' : '1';
  }
  return out;
};

const patternsOverlap = (aMatch, aMask, bMatch, bMask) => {
  const commonMask = (aMask & bMask) & BIT_MASK_32;
  const diff = ((aMatch ^ bMatch) & commonMask) & BIT_MASK_32;
  return diff === 0n;
};

const isSubsetPattern = (subsetMatch, subsetMask, supMatch, supMask) => {
  const subsetMaskNorm = (subsetMask ?? 0n) & BIT_MASK_32;
  const supMaskNorm = (supMask ?? 0n) & BIT_MASK_32;
  const subsetMatchNorm = (subsetMatch ?? 0n) & BIT_MASK_32;
  const supMatchNorm = (supMatch ?? 0n) & BIT_MASK_32;

  const supBitsNotConstrainedBySubset = supMaskNorm & ~subsetMaskNorm;
  if (supBitsNotConstrainedBySubset !== 0n) return false;
  const mismatch = (subsetMatchNorm ^ supMatchNorm) & supMaskNorm;
  return mismatch === 0n;
};

const overlapExampleWord = (aMatch, aMask, bMatch, bMask) => {
  const am = (aMatch ?? 0n) & BIT_MASK_32;
  const ak = (aMask ?? 0n) & BIT_MASK_32;
  const bm = (bMatch ?? 0n) & BIT_MASK_32;
  const bk = (bMask ?? 0n) & BIT_MASK_32;
  return ((am & ak) | (bm & (bk & ~ak))) & BIT_MASK_32;
};

const EncodingDiagram = ({ encoding }) => {
  const scrollRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const [scrollState, setScrollState] = React.useState({
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  });

  const normalized = String(encoding || '').replace(/\s+/g, '');
  if (normalized.length !== 32) {
    return (
      <div className="font-mono text-[11px] bg-[var(--riscv-surface-2)] border border-[var(--riscv-border-2)] rounded px-2 py-1 break-all" style={{ color: 'var(--riscv-text-2)' }}>
        {encoding}
      </div>
    );
  }

  // RISC-V standard R-type field ranges (bit index from MSB=0):
  // bit 31..25 → funct7 (i=0..6)
  // bit 24..20 → rs2    (i=7..11)
  // bit 19..15 → rs1    (i=12..16)
  // bit 14..12 → funct3 (i=17..19)
  // bit 11..7  → rd     (i=20..24)
  // bit 6..0   → opcode (i=25..31)
  const getFieldClass = (i, isVar) => {
    if (isVar) return 'enc-var';
    if (i <= 6) return 'enc-funct7';
    if (i <= 11) return 'enc-rs2';
    if (i <= 16) return 'enc-rs1';
    if (i <= 19) return 'enc-funct3';
    if (i <= 24) return 'enc-rd';
    return 'enc-opcode';
  };

  const getFieldName = (i) => {
    if (i <= 6) return 'funct7';
    if (i <= 11) return 'rs2';
    if (i <= 16) return 'rs1';
    if (i <= 19) return 'funct3';
    if (i <= 24) return 'rd';
    return 'opcode';
  };

  // Build field label spans for the legend row
  const FIELD_LABELS = [
    { name: 'funct7', from: 0, to: 6, cls: 'enc-funct7' },
    { name: 'rs2', from: 7, to: 11, cls: 'enc-rs2' },
    { name: 'rs1', from: 12, to: 16, cls: 'enc-rs1' },
    { name: 'funct3', from: 17, to: 19, cls: 'enc-funct3' },
    { name: 'rd', from: 20, to: 24, cls: 'enc-rd' },
    { name: 'opcode', from: 25, to: 31, cls: 'enc-opcode' },
  ];

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState((prev) => {
      const next = {
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
      if (
        prev.scrollLeft === next.scrollLeft &&
        prev.scrollWidth === next.scrollWidth &&
        prev.clientWidth === next.clientWidth
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateScrollState();
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => updateScrollState();
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [updateScrollState, normalized]);

  const maxScrollLeft = Math.max(0, scrollState.scrollWidth - scrollState.clientWidth);
  const canScroll = maxScrollLeft > 0;
  const atLeft = scrollState.scrollLeft <= 0;
  const atRight = scrollState.scrollLeft >= maxScrollLeft - 1;
  const scrollProgress = canScroll ? scrollState.scrollLeft / maxScrollLeft : 0;
  const thumbRatio = canScroll ? Math.min(1, scrollState.clientWidth / scrollState.scrollWidth) : 1;
  const thumbLeftPct = (1 - thumbRatio) * scrollProgress * 100;
  const thumbWidthPct = thumbRatio * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--riscv-text-3)' }}>
          <Binary size={11} />
          <span>Bit Fields</span>
          {canScroll && (
            <span className="inline-flex items-center gap-1 normal-case tracking-normal" style={{ color: 'var(--riscv-gold)' }}>
              scroll <ArrowRight size={11} />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="riscv-btn p-1 disabled:opacity-30"
            onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            disabled={!canScroll || atLeft}
            title="Scroll left"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            className="riscv-btn p-1 disabled:opacity-30"
            onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            disabled={!canScroll || atRight}
            title="Scroll right"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <div className="inline-block pr-2">
          {/* Bit cells */}
          <div className="inline-grid grid-flow-col auto-cols-[20px] rounded-md border border-[var(--riscv-border-2)] overflow-hidden">
            {normalized.split('').map((bit, i) => {
              const isVar = bit === '-';
              const isGroupEnd = (i + 1) % 4 === 0 && i !== 31;
              const value = isVar ? 'x' : bit;
              const fieldCls = getFieldClass(i, isVar);
              const fieldName = getFieldName(i);
              return (
                <div
                  key={`${i}-${bit}`}
                  className={[
                    'h-7 flex items-center justify-center font-mono text-[11px] font-medium border-r',
                    fieldCls,
                    i === 31 ? 'border-r-0' : isGroupEnd ? 'border-r-2' : '',
                  ].join(' ')}
                  title={`bit[${31 - i}] — ${fieldName}`}
                >
                  {value}
                </div>
              );
            })}
          </div>

          {/* Bit number labels */}
          <div className="mt-1 flex justify-between text-[9px] font-mono px-0.5" style={{ color: 'var(--riscv-text-3)' }}>
            <span>31</span>
            <span>0</span>
          </div>

          {/* Field legend row */}
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {FIELD_LABELS.map(({ name, cls }) => (
              <span
                key={name}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${cls}`}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {canScroll && (
        <div
          className="mt-2 h-1.5 rounded-full relative cursor-pointer"
          style={{ background: 'var(--riscv-border)', border: '1px solid var(--riscv-border-2)' }}
          onClick={(e) => {
            const el = scrollRef.current;
            if (!el) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
            const next = (x / rect.width) * maxScrollLeft;
            el.scrollTo({ left: next, behavior: 'smooth' });
          }}
          role="presentation"
          title="Click to scroll"
        >
          <div
            className="absolute top-0 bottom-0 rounded-full cursor-grab active:cursor-grabbing"
            style={{
              left: `${thumbLeftPct}%`,
              width: `${thumbWidthPct}%`,
              background: 'var(--riscv-gold)',
              opacity: 0.5,
            }}
            onPointerDown={(e) => {
              const el = scrollRef.current;
              if (!el) return;
              e.stopPropagation();
              const track = e.currentTarget.parentElement;
              if (!track) return;
              const trackRect = track.getBoundingClientRect();
              dragRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startScrollLeft: el.scrollLeft,
                trackWidth: trackRect.width,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const el = scrollRef.current;
              const drag = dragRef.current;
              if (!el || !drag || drag.pointerId !== e.pointerId) return;
              const dx = e.clientX - drag.startX;
              const delta = (dx / drag.trackWidth) * maxScrollLeft;
              el.scrollLeft = Math.min(maxScrollLeft, Math.max(0, drag.startScrollLeft + delta));
            }}
            onPointerUp={(e) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== e.pointerId) return;
              dragRef.current = null;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                // no-op
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

const RISCVExplorer = () => {

  const [activeProfile, setActiveProfile] = useState(null);
  const [activeVolume, setActiveVolume] = useState(null);
  const [selectedExt, setSelectedExt] = useState(null);
  const [selectedInstruction, setSelectedInstruction] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState(null);
  const [encoderValidatorOpen, setEncoderValidatorOpen] = useState(false);
  const [encoderValidatorInput, setEncoderValidatorInput] = useState({
    mnemonic: '',
    encoding: '',
    match: '',
    mask: '',
  });
  const [encoderValidatorResult, setEncoderValidatorResult] = useState(null);
  const [encoderValidatorCopyStatus, setEncoderValidatorCopyStatus] = useState(null);
  // ── ISA Workspace state ────────────────────────────────────────────────────
  const [workspaceIds, setWorkspaceIds] = useState(new Set());
  const [workspaceNotice, setWorkspaceNotice] = useState(null);
  // Builder mode. The per-tile "+" affordances only exist while this is on.
  // Previously they were always rendered, in a low-contrast grey, with nothing
  // explaining what they did — a permanent control for a mode the user had not
  // asked to be in. Turning the builder on is now a deliberate act.
  const [builderMode, setBuilderMode] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [workspaceQuickOpen, setWorkspaceQuickOpen] = useState(false);
  const [quickExportOpen, setQuickExportOpen] = useState(false);
  const [quickExportIncludeInstr, setQuickExportIncludeInstr] = useState(true);

  // Smart lock: live reverse-lookup of dependencies
  const lockedExtensions = React.useMemo(() => {
    const locked = new Map(); // ext -> [things requiring it]
    const selected = Array.from(workspaceIds);
    for (const ext of selected) {
      const deps = SMART_DEPENDENCIES[ext] || [];
      for (const dep of deps) {
        if (workspaceIds.has(dep)) {
          if (!locked.has(dep)) locked.set(dep, []);
          locked.get(dep).push(ext);
        }
      }
    }
    return locked;
  }, [workspaceIds]);

  // Smart dependency and mutually-exclusive handler
  const addWorkspaceIdsSmart = React.useCallback((idsToAdd, isToggle = false) => {
    setWorkspaceIds(prev => {
      const next = new Set(prev);
      const autoAdded = [];
      let baseChanged = false;

      // Recompute lock state against current `prev` state to ensure up-to-date checks during batch updates
      const currentLocked = new Map();
      const currentSelected = Array.from(prev);
      for (const ext of currentSelected) {
        const deps = SMART_DEPENDENCIES[ext] || [];
        for (const dep of deps) {
          if (prev.has(dep)) {
            if (!currentLocked.has(dep)) currentLocked.set(dep, []);
            currentLocked.get(dep).push(ext);
          }
        }
      }

      const arrToAdd = Array.isArray(idsToAdd) ? idsToAdd : [idsToAdd];

      for (const id of arrToAdd) {
        if (isToggle && next.has(id)) {
          // If locked, we cannot toggle it off
          if (currentLocked.has(id)) {
            setWorkspaceNotice(`Cannot remove ${id}: required by ${currentLocked.get(id).join(', ')}`);
            setTimeout(() => setWorkspaceNotice(null), 4500);
            continue; // block removal
          }
          next.delete(id);
          continue;
        }

        // 1. Mutually Exclusive Base ISAs
        if (BASE_ISA_IDS.has(id)) {
          for (const baseId of BASE_ISA_IDS) {
            if (baseId !== id && next.has(baseId)) {
              // Note: Base ISAs aren't typically locked by other extensions in our SMART_DEPENDENCIES, 
              // but if they were, we might need a lock check here too. Safe for now.
              next.delete(baseId);
              baseChanged = true;
            }
          }
        }

        next.add(id);
      }

      // 2. Dependencies, resolved transitively through the graph.
      //
      // This used to walk SMART_DEPENDENCIES one level deep, which is only
      // correct when a dependency has none of its own. It silently under-selected
      // everything deeper: picking H added S but not U (H -> S -> U), and picking
      // Zve64d added D and Zve64f but none of F, Zicsr, Zve32x, Zve64x or the
      // Zvl*b tokens. resolveSelection() walks the whole closure.
      const resolution = resolveSelection({
        selected: Array.from(next),
        base: Array.from(next).find((x) => BASE_ISA_IDS.has(x)) ?? null,
      });

      // 3. Incompatibility check, over the fully resolved set — so a conflict
      // reached only through a dependency is caught too. The path is what makes
      // the message useful: the offending extension is often one the user never
      // picked (Zve64d -> D -> F on an E-base).
      if (resolution.conflicts.length > 0) {
        const c = resolution.conflicts[0];
        const via = c.path.length > 1 ? ` (pulled in by ${c.path.join(' -> ')})` : '';
        setWorkspaceNotice(`Architecturally Invalid: ${c.with} is incompatible with ${c.ext}${via}`);
        setTimeout(() => setWorkspaceNotice(null), 4500);
        return prev; // revert the whole batch, as before
      }

      for (const dep of resolution.resolved) {
        // Skip graph-only nodes the catalog cannot show.
        if (!CATALOG_IDS.has(dep)) continue;
        if (next.has(dep)) continue;
        next.add(dep);
        autoAdded.push(dep);
      }

      if (autoAdded.length > 0) {
        setWorkspaceNotice(`Auto-added: ${autoAdded.join(', ')} (Required dependency)`);
        setTimeout(() => setWorkspaceNotice(null), 4500);
      } else if (baseChanged) {
        setWorkspaceNotice('Base ISA is mutually exclusive. Previous base removed.');
        setTimeout(() => setWorkspaceNotice(null), 4500);
      }

      return next;
    });
  }, []);

  // Flat list of all extensions — stable reference for workspace utilities
  const allExtsList = React.useMemo(
    () => Object.values(extensions).flat().filter(Boolean),
    []
  );

  const workspaceTotalInstr = React.useMemo(() => {
    if (workspaceIds.size === 0) return 0;
    return buildCombinedCatalog(Array.from(workspaceIds), allExtsList).length;
  }, [workspaceIds, allExtsList]);

  React.useEffect(() => {
    setQuickExportIncludeInstr(workspaceTotalInstr <= 100);
  }, [workspaceTotalInstr]);
  // --------------------------------------------------------------------------
  const lastScrolledKeyRef = React.useRef(null);
  const searchInputRef = React.useRef(null);

  // Ctrl+K / Cmd+K → focus search
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Extension Catalog – loaded from `src/riscv_extensions.json`
  // ---------------------------------------------------------------------------
  /*
  const extensions = {
    base: [
      { id: 'RV32I', name: 'RV32I', desc: 'Standard Integer Base (32-bit)', use: 'Microcontrollers, IoT' },
      { id: 'RV64I', name: 'RV64I', desc: 'Standard Integer Base (64-bit)', use: 'Servers, Mobile, PC' },
      { id: 'RV32E', name: 'RV32E', desc: 'Embedded Base (16 regs)', use: 'Tiny cores (Reduced silicon)' },
      { id: 'RV64E', name: 'RV64E', desc: 'Embedded Base (64-bit, 16 regs)', use: 'Efficient 64-bit controllers' },
      { id: 'RV128I', name: 'RV128I', desc: '128-bit Address Space', use: 'Experimental/Research' },
    ],

    // Single-letter + top-level “ISA environment” markers
    standard: [
      { id: 'A', name: 'A', desc: 'Atomics', use: 'LR/SC & AMO ops in hardware', discontinued: 0 },
      { id: 'B', name: 'B', desc: 'Bit-Manip Bundle', use: 'Aggregates Zba/Zbb/Zbc/Zbs', discontinued: 0 },
      { id: 'C', name: 'C', desc: 'Compressed', use: '16-bit instruction encodings', discontinued: 0 },
      { id: 'D', name: 'D', desc: 'Double-Precision Float (64-bit)', use: 'General-purpose FP, HPC', discontinued: 0 },
      { id: 'F', name: 'F', desc: 'Single-Precision Float (32-bit)', use: 'Basic floating-point workloads', discontinued: 0 },
      { id: 'H', name: 'H', desc: 'Hypervisor', use: 'Virtualization / VMs', discontinued: 0 },
      { id: 'K', name: 'K', desc: 'Crypto Umbrella (Scalar + Vector)', use: 'Top-level tag signaling bundled Zk* /Zvk* NIST & ShangMi crypto support', discontinued: 0 },
      { id: 'M', name: 'M', desc: 'Integer Multiply/Divide', use: 'Hardware multiplication and division', discontinued: 0 },
      { id: 'N', name: 'N', desc: 'User-Level Interrupts', use: 'User-mode interrupt handling', discontinued: 1 },
      { id: 'P', name: 'P', desc: 'Packed-SIMD', use: 'Packed SIMD / DSP-style operations', discontinued: 0 },
      { id: 'Q', name: 'Q', desc: 'Quad-Precision Float (128-bit)', use: 'High-precision scientific math', discontinued: 0 },
      { id: 'S', name: 'S', desc: 'Supervisor ISA', use: 'Supervisor privilege level (Volume II)', discontinued: 0 },
      { id: 'U', name: 'U', desc: 'User ISA', use: 'User privilege level (Volume II)', discontinued: 0 },
      { id: 'V', name: 'V', desc: 'Vector (RVV)', use: 'Full RVV 1.0 vector ISA', discontinued: 0 },
    ],

    // Zb* scalar bit-manip
    z_bit: [
      { id: 'Zba', name: 'Zba', desc: 'Address-Generation Bitmanip', use: 'Shift/add address generation' },
      { id: 'Zbb', name: 'Zbb', desc: 'Basic Bitmanip', use: 'CLZ/CTZ, popcnt, min/max, etc.' },
      { id: 'Zbc', name: 'Zbc', desc: 'Carry-less Multiply', use: 'CRC, Galois-field crypto' },
      { id: 'Zbs', name: 'Zbs', desc: 'Single-Bit Ops', use: 'Set/clear/invert bit in word' },
    ],

    // Zc* compressed
    z_compress: [
      { id: 'Zca', name: 'Zca', desc: 'Base Compressed (no FP)', use: 'Compressed base integer ops' },
      { id: 'Zcb', name: 'Zcb', desc: 'Extra Compressed Integer', use: 'More 16-bit ALU/control ops' },
      { id: 'Zcd', name: 'Zcd', desc: 'Compressed Double Float', use: '16-bit encodings for 64-bit FP' },
      { id: 'Zce', name: 'Zce', desc: 'Embedded Compressed', use: 'RV32E/RV64E-focused compressed subset' },
      { id: 'Zcf', name: 'Zcf', desc: 'Compressed Float Load/Store', use: '16-bit encodings for FP LD/ST' },
      { id: 'Zcmp', name: 'Zcmp', desc: 'Push/Pop & Reg Save/Restore', use: 'Stack push/pop, frame save' },
      { id: 'Zcmt', name: 'Zcmt', desc: 'Compressed Table Jumps', use: 'Switch/jumptable compression' },
      { id: 'Zcmop', name: 'Zcmop', desc: 'Compressed May-Be-Ops', use: 'Reserved 16-bit NOP/future ops' },
      { id: 'Zclsd', name: 'Zclsd', desc: 'Compressed LS-Pair', use: 'Compressed load/store pairs' },
      { id: 'Zcmlsd', name: 'Zcmlsd', desc: 'Compressed Mem-Loop', use: 'Compact memcpy/memset-style sequences' },
    ],

    // Zf* /Za* floating-point & atomics family
    z_float: [
      { id: 'Zfh', name: 'Zfh', desc: 'Half-Precision FP (16-bit)', use: 'Low-precision FP (AI/graphics)' },
      { id: 'Zfhmin', name: 'Zfhmin', desc: 'Minimal Half-Precision FP', use: 'Conversions, no arithmetic' },
      { id: 'Zfbfmin', name: 'Zfbfmin', desc: 'Minimal BF16 FP', use: 'BFloat16 conversions and storage' },
      { id: 'Zfa', name: 'Zfa', desc: 'Additional FP Instructions', use: 'Fused ops, sign inject, etc.' },
      { id: 'Zfinx', name: 'Zfinx', desc: 'FP in Integer Regs (F)', use: 'Single-precision FP in x-regs' },
      { id: 'Zdinx', name: 'Zdinx', desc: 'FP in Integer Regs (D)', use: 'Double-precision FP in x-regs' },
      { id: 'Zhinx', name: 'Zhinx', desc: 'FP in Integer Regs (Half)', use: 'Half-precision FP in x-regs' },
      { id: 'Zhinxmin', name: 'Zhinxmin', desc: 'Minimal Half-in-Int', use: 'Minimal half-precision in x-regs' },
      { id: 'Zacas', name: 'Zacas', desc: 'Atomic Compare-and-Swap', use: 'Lock-free algorithms (CAS)' },
      { id: 'Zawrs', name: 'Zawrs', desc: 'Wait-on-Reservation-Set', use: 'Low-power waiting on LR/SC reservations' },
    ],

    // Vector subsets & capabilities (non-crypto)
    z_vector: [
      // Embedded vector base subsets
      { id: 'Zve', name: 'Zve', desc: 'Embedded Vector Base', use: 'Baseline V subset for MCUs' },
      { id: 'Zve32x', name: 'Zve32x', desc: 'Vec Int (32-bit, embedded)', use: 'Int-only embedded vectors' },
      { id: 'Zve32f', name: 'Zve32f', desc: 'Vec FP32 (embedded)', use: 'Embedded FP32 vector compute' },
      { id: 'Zve64x', name: 'Zve64x', desc: 'Vec Int (64-bit, embedded)', use: '64-bit int embedded vectors' },
      { id: 'Zve64f', name: 'Zve64f', desc: 'Vec FP32+Int (64-bit, embedded)', use: 'FP32 + 64-bit int vectors' },
      { id: 'Zve64d', name: 'Zve64d', desc: 'Vec FP64+FP32+Int', use: 'Full FP64 embedded vectors' },

      // Aliases and VLEN capabilities
      { id: 'Zv', name: 'Zv', desc: 'Vector Alias for V', use: 'ISA alias for full RVV' },
      { id: 'Zvl32b', name: 'Zvl32b', desc: 'Min VLEN ≥ 32b', use: 'Vector length capability' },
      { id: 'Zvl64b', name: 'Zvl64b', desc: 'Min VLEN ≥ 64b', use: 'Vector length capability' },
      { id: 'Zvl128b', name: 'Zvl128b', desc: 'Min VLEN ≥ 128b', use: 'Vector length capability' },
      { id: 'Zvl256b', name: 'Zvl256b', desc: 'Min VLEN ≥ 256b', use: 'Vector length capability' },
      { id: 'Zvl512b', name: 'Zvl512b', desc: 'Min VLEN ≥ 512b', use: 'Vector length capability' },
      { id: 'Zvl1024b', name: 'Zvl1024b', desc: 'Min VLEN ≥ 1024b', use: 'Vector length capability' },

      // Vector FP numerics
      { id: 'Zvf', name: 'Zvf', desc: 'Vector FP minimal', use: 'Minimal scalar-like vector FP' },
      { id: 'Zvfh', name: 'Zvfh', desc: 'Vector Half-Precision FP', use: '16-bit FP vector arithmetic' },
      { id: 'Zvfhmin', name: 'Zvfhmin', desc: 'Vector Half-Precision Minimal', use: 'Conv/storage, minimal Zvfh' },
      { id: 'Zvfbfmin', name: 'Zvfbfmin', desc: 'Vector BF16 Minimal', use: 'BF16 conversions in vectors' },
      { id: 'Zvfbfa', name: 'Zvfbfa', desc: 'Vector BF16 Arithmetic', use: 'BF16 arithmetic in vectors' },
      { id: 'Zvfbfwma', name: 'Zvfbfwma', desc: 'Vector BF16 Widening MAC', use: 'BF16 GEMM-style MAC' },
      { id: 'Zvfofp8min', name: 'Zvfofp8min', desc: 'Vector FP8 Minimal', use: 'Minimal FP8 vector support' },

      // Non-crypto vector arithmetic helpers
      { id: 'Zvabd', name: 'Zvabd', desc: 'Vector Abs-Diff', use: 'Absolute-difference operations' },
      { id: 'Zvbb', name: 'Zvbb', desc: 'Vector Bitmanip Base', use: 'Vectorized scalar Zbb ops' },
      { id: 'Zvbc', name: 'Zvbc', desc: 'Vector Carryless Multiply', use: 'Vector CRC / GF ops' },
      { id: 'Zvbc32e', name: 'Zvbc32e', desc: 'Vector CLMUL (32E)', use: 'Carryless multiply for embedded vectors' },
      { id: 'Zvbdota', name: 'Zvbdota', desc: 'Vector BF16 Dot-Acc', use: 'BF16 dot-product accumulate' },
      { id: 'Zvdota', name: 'Zvdota', desc: 'Vector Dot-Acc', use: 'Generic FP dot-product accumulate' },
      { id: 'Zvdot4a', name: 'Zvdot4a', desc: 'Vector 4-way Dot-Acc', use: '4-way dot-product accumulate' },

      { id: 'Zvw', name: 'Zvw', desc: 'Vector Wide Groups', use: 'Wider element/vector width options' },
    ],

    // Control-flow integrity, hints & “maybe ops”
    z_security: [
      { id: 'Zicfilp', name: 'Zicfilp', desc: 'CFI Landing Pads', use: 'Forward-edge CFI for calls' },
      { id: 'Zicfiss', name: 'Zicfiss', desc: 'CFI Shadow Stacks', use: 'Backward-edge CFI (returns)' },
      { id: 'Zicond', name: 'Zicond', desc: 'Integer Conditional Ops', use: 'Branchless selects / cmov' },
      { id: 'Ziccrse', name: 'Ziccrse', desc: 'LR/SC Forward Progress', use: 'Guarantees LR/SC forward progress' },
      { id: 'Zimop', name: 'Zimop', desc: 'May-Be-Ops (NOP family)', use: 'Reserved NOP encodings for future' },
    ],

    // Scalar & vector crypto
    z_crypto: [
      // Scalar crypto umbrella + splits
      { id: 'Zk', name: 'Zk', desc: 'Scalar Crypto Base', use: 'Top-level scalar crypto bundle' },
      { id: 'Zkn', name: 'Zkn', desc: 'NIST Suite (Scalar)', use: 'AES/SHA NIST suite' },
      { id: 'Zknd', name: 'Zknd', desc: 'NIST AES Decrypt', use: 'AES decryption instructions' },
      { id: 'Zkne', name: 'Zkne', desc: 'NIST AES Encrypt', use: 'AES encryption instructions' },
      { id: 'Zknh', name: 'Zknh', desc: 'NIST Hash', use: 'SHA-2 hash instructions' },
      { id: 'Zkr', name: 'Zkr', desc: 'Entropy Source', use: 'True random source interface' },

      { id: 'Zks', name: 'Zks', desc: 'ShangMi Suite (Scalar)', use: 'Chinese SMx crypto bundle' },
      { id: 'Zksed', name: 'Zksed', desc: 'SM4 Block Cipher', use: 'SM4 encrypt/decrypt' },
      { id: 'Zksh', name: 'Zksh', desc: 'SM3 Hash', use: 'SM3 hash operations' },

      { id: 'Zkt', name: 'Zkt', desc: 'Timing-Safe Crypto', use: 'Data-independent latency constraints' },

      // Scalar crypto bitmanip
      { id: 'Zbkb', name: 'Zbkb', desc: 'Crypto Bitmanip (byte)', use: 'Byte-wise crypto bit ops' },
      { id: 'Zbkc', name: 'Zbkc', desc: 'Crypto Bitmanip (carryless)', use: 'Carryless ops for crypto' },
      { id: 'Zbkx', name: 'Zbkx', desc: 'Crypto Bitmanip (crossbar)', use: 'Bit/byte crossbar operations' },

      // Vector crypto umbrella
      { id: 'Zvk', name: 'Zvk', desc: 'Vector Crypto (umbrella)', use: 'Top-level vector crypto suite' },

      // Vector crypto subsets
      { id: 'Zvkb', name: 'Zvkb', desc: 'Vector Crypto Bitmanip', use: 'Vector crypto bit ops' },
      { id: 'Zvkg', name: 'Zvkg', desc: 'Vector GCM/GMAC', use: 'AES-GCM/GMAC acceleration' },
      { id: 'Zvkgs', name: 'Zvkgs', desc: 'Vector GCM Shim', use: 'Profile-specific GCM subset' },
      { id: 'Zvkn', name: 'Zvkn', desc: 'Vector NIST Suite', use: 'Vector AES/SHA suite' },
      { id: 'Zvknc', name: 'Zvknc', desc: 'Vector NIST + CLMUL', use: 'NIST crypto with carryless multiply' },
      { id: 'Zvkned', name: 'Zvkned', desc: 'Vector AES', use: 'Vector AES-ECB/CTR/GCM cores' },
      { id: 'Zvknf', name: 'Zvknf', desc: 'Vector AES Finite-field', use: 'Vector AES finite-field helpers' },
      { id: 'Zvkng', name: 'Zvkng', desc: 'Vector NIST + GCM', use: 'NIST suite + GCM vector bundle' },
      { id: 'Zvknha', name: 'Zvknha', desc: 'Vector SHA-2 (subset)', use: 'Vector SHA-256 subset' },
      { id: 'Zvknhb', name: 'Zvknhb', desc: 'Vector SHA-2 (full)', use: 'Vector SHA-256/512' },
      { id: 'Zvks', name: 'Zvks', desc: 'Vector ShangMi Suite', use: 'Vector SMx algorithms' },
      { id: 'Zvksc', name: 'Zvksc', desc: 'Vector ShangMi + CLMUL', use: 'SMx with carryless multiply' },
      { id: 'Zvksed', name: 'Zvksed', desc: 'Vector SM4', use: 'Vector SM4 cipher' },
      { id: 'Zvksg', name: 'Zvksg', desc: 'Vector ShangMi + GCM', use: 'ShangMi + GCM vectors' },
      { id: 'Zvksh', name: 'Zvksh', desc: 'Vector SM3 Hash', use: 'Vector SM3' },
      { id: 'Zvkt', name: 'Zvkt', desc: 'Vector Timing-Safe Crypto', use: 'Vector data-independent latency' },
    ],

    // System / caches / atomics / load-store utilities
    z_system: [
      { id: 'Zicsr', name: 'Zicsr', desc: 'CSR Access', use: 'Explicit CSR read/write' },
      { id: 'Zifencei', name: 'Zifencei', desc: 'Instruction-Fetch Fence', use: 'Sync I-cache with writes' },

      { id: 'Zicntr', name: 'Zicntr', desc: 'Base Counters/Timers', use: 'cycle/instret + timers' },
      { id: 'Zihpm', name: 'Zihpm', desc: 'Perf Counters', use: 'Hardware performance monitors' },

      { id: 'Zihintpause', name: 'Zihintpause', desc: 'Pause Hint', use: 'Power-friendly spin-wait' },
      { id: 'Zihintntl', name: 'Zihintntl', desc: 'Non-Temporal Locality Hints', use: 'NT load/store hints' },

      { id: 'Zicbom', name: 'Zicbom', desc: 'Cache Management Operations', use: 'Invalidate/clean/flush blocks' },
      { id: 'Zicbop', name: 'Zicbop', desc: 'Cache Prefetch', use: 'Prefetch cache blocks' },
      { id: 'Zicboz', name: 'Zicboz', desc: 'Cache Block Zero', use: 'Fast memset-to-zero' },

      { id: 'Zmmul', name: 'Zmmul', desc: 'Multiply-Only (no DIV)', use: 'Cheaper M subset (mul only)' },

      { id: 'Zaamo', name: 'Zaamo', desc: 'Atomic Memory Operations', use: 'Defines atomic granularity' },
      { id: 'Zabha', name: 'Zabha', desc: 'Byte/Halfword AMO', use: 'Subword AMO support' },

      { id: 'Zalrsc', name: 'Zalrsc', desc: 'LR/SC Extension', use: 'Extended LR/SC semantics' },
      { id: 'Zalasr', name: 'Zalasr', desc: 'LR/SC Alias Rules', use: 'Alias rules for LR/SC sequences' },

      { id: 'Ztso', name: 'Ztso', desc: 'Total Store Ordering', use: 'x86-style TSO memory model' },

      { id: 'Zilsd', name: 'Zilsd', desc: 'Streaming LS (data)', use: 'Streaming loads/stores (data)' },
      { id: 'Zilsp', name: 'Zilsp', desc: 'Streaming LS (prefetch)', use: 'Streaming prefetch hints' },
      { id: 'Zilsme', name: 'Zilsme', desc: 'Streaming Stores (exclusive)', use: 'Streaming store hints' },
      { id: 'Zilsmea', name: 'Zilsmea', desc: 'Streaming Stores (alloc)', use: 'Streaming store + allocate' },
      { id: 'Zilsm*', name: 'Zilsm*', desc: 'Streaming Mem (pattern)', use: 'Wildcard for Zilsm<x>b family' },
      { id: 'Zilsm<x>b', name: 'Zilsm<x>b', desc: 'Streaming Mem (x-byte)', use: 'Line-size specific streaming ops' },

      { id: 'Zclsd', name: 'Zclsd', desc: 'Compressed LS Pair', use: 'Compressed LS pairs (RV32)' },

      // PMA / cache-block / reservation set / misc
      { id: 'Za64rs', name: 'Za64rs', desc: '64B Reservation Set', use: 'Reservation set granularity (64-byte)' },
      { id: 'Za128rs', name: 'Za128rs', desc: '128B Reservation Set', use: 'Reservation set granularity (128-byte)' },
      { id: 'Zic64b', name: 'Zic64b', desc: '64B Cache Blocks', use: 'Requires 64B naturally aligned cache lines' },
      { id: 'Ziccif', name: 'Ziccif', desc: 'Inst-Fetch Atomicity', use: 'Atomic I-fetch in cacheable+coherent regions' },
      { id: 'Ziccrse', name: 'Ziccrse', desc: 'RsrvEventual', use: 'Reservation-set eventuality guarantees' },
      { id: 'Ziccamoa', name: 'Ziccamoa', desc: 'Atomics PMA', use: 'PMA guarantees for A-extension atomics' },
      { id: 'Zicclsm', name: 'Zicclsm', desc: 'Misaligned L/S Support', use: 'Misaligned loads/stores in cacheable+coherent regions' },
      { id: 'Ziccamoc', name: 'Ziccamoc', desc: 'CAS PMA', use: 'PMA guarantees for CAS-style atomics' },

      { id: 'Zibi', name: 'Zibi', desc: 'Interruptible Mem Ops', use: 'Interruptible load/store semantics' },
      { id: 'Zicntrpmf', name: 'Zicntrpmf', desc: 'Counter Filtering', use: 'Mode-based filtering for counters' },
      { id: 'Zimt', name: 'Zimt', desc: 'Time Instructions', use: 'Extended time/TIMECMP instructions' },
      { id: 'Zitagelide', name: 'Zitagelide', desc: 'Tag & ELIDE', use: 'Tagged-memory / elide behaviors' },
      { id: 'Zjid', name: 'Zjid', desc: 'ICache Coherence Alt', use: 'Alternative to Zifencei for I-cache coherence' },
      { id: 'Zjpm', name: 'Zjpm', desc: 'Pointer-Mask Qualifier', use: 'Auxiliary pointer-masking semantics' },
      { id: 'Zccid', name: 'Zccid', desc: 'Cache-Block ID', use: 'Cache block identity / debugging' },
      { id: 'Zama16b', name: 'Zama16b', desc: '16B Misaligned Atomicity', use: 'Misaligned atomicity granule (16 bytes)' },
    ],

    // S / Sv: memory & address-translation
    s_mem: [
      { id: 'Sv32', name: 'Sv32', desc: 'Virtual Memory, 32-bit', use: '2-level page tables (RV32 Linux)' },
      { id: 'Sv39', name: 'Sv39', desc: 'Virtual Memory, 39-bit VA', use: '3-level page tables (RV64 Linux)' },
      { id: 'Sv48', name: 'Sv48', desc: 'Virtual Memory, 48-bit VA', use: '4-level page tables' },
      { id: 'Sv57', name: 'Sv57', desc: 'Virtual Memory, 57-bit VA', use: '5-level page tables' },

      { id: 'Svbare', name: 'Svbare', desc: 'Bare Mode', use: 'No address translation (satp bare)' },

      { id: 'Svpbmt', name: 'Svpbmt', desc: 'Page-Based Memory Types', use: 'Per-page memory types / cacheability' },
      { id: 'Svnapot', name: 'Svnapot', desc: 'NAPOT Mappings', use: 'Hugepages via NAPOT PTEs' },
      { id: 'Svinval', name: 'Svinval', desc: 'Fine-Grained TLB Invalidate', use: 'Fine-grain TLB shootdown instructions' },
      { id: 'Svade', name: 'Svade', desc: 'Access/Dirty Exceptions', use: 'Page-fault on A/D bit issues' },
      { id: 'Svadu', name: 'Svadu', desc: 'Access/Dirty Update', use: 'Hardware A/D-bit updates' },
      { id: 'Svvptc', name: 'Svvptc', desc: 'Visible PTE Changes', use: 'Bounded-time PTE visibility guarantees' },
      { id: 'Svrsw60t59b', name: 'Svrsw60t59b', desc: 'PTE RSW Bits', use: 'Standard RSW field behavior' },

      { id: 'Svatag', name: 'Svatag', desc: 'Tagged Translations', use: 'Address-tagged translation behavior' },
      { id: 'Svukte', name: 'Svukte', desc: 'User-Keyed TLB Entries', use: 'Per-user TLB tagging' },

      // Pointer masking (user/supervisor view)
      { id: 'Supm', name: 'Supm', desc: 'User Pointer Masking', use: 'Mask user pointers' },
      { id: 'Ssnpm', name: 'Ssnpm', desc: 'Supervisor Next-Pointer Mask', use: 'Mask next-mode pointers (S)' },
      { id: 'Sspm', name: 'Sspm', desc: 'Supervisor Pointer Masking', use: 'Supervisor pointer-mask policy' },
    ],

    // S / Sm / Ss: interrupts, counters, QoS, AIA, etc.
    s_interrupt: [
      { id: 'Smaia', name: 'Smaia', desc: 'AIA Machine Extension', use: 'Advanced interrupt arch (M)' },
      { id: 'Ssaia', name: 'Ssaia', desc: 'AIA Supervisor Extension', use: 'Advanced interrupt arch (S)' },

      { id: 'Smclic', name: 'Smclic', desc: 'Machine CLIC', use: 'Machine-level CLIC interrupt controller' },
      { id: 'Smclicconfig', name: 'Smclicconfig', desc: 'Machine CLIC Config', use: 'MCLIC configuration CSRs' },
      { id: 'Smclicshv', name: 'Smclicshv', desc: 'Machine CLIC SHV', use: 'Selective hardware vectored interrupts' },

      { id: 'Ssclic', name: 'Ssclic', desc: 'Supervisor CLIC', use: 'Supervisor-level CLIC interface' },
      { id: 'Suclic', name: 'Suclic', desc: 'User CLIC', use: 'User-level CLIC interface' },

      { id: 'Sstc', name: 'Sstc', desc: 'Supervisor Timer Compare', use: 'Per-hart timer interrupts' },

      { id: 'Smcdeleg', name: 'Smcdeleg', desc: 'M-Mode Counter Delegation', use: 'Delegates HPM counters to S' },
      { id: 'Smcntrpmf', name: 'Smcntrpmf', desc: 'M-Mode Counter Filtering', use: 'Filter counters by privilege' },
      { id: 'Ssccfg', name: 'Ssccfg', desc: 'Counter Configuration (S)', use: 'S-mode control of delegated HPM' },
      { id: 'Sscntrcfg', name: 'Sscntrcfg', desc: 'S-Mode Counter Config', use: 'Supervisor counter configuration' },
      { id: 'Sscounterenw', name: 'Sscounterenw', desc: 'Writable scounteren', use: 'Writable enables for HPMs' },
      { id: 'Sscofpmf', name: 'Sscofpmf', desc: 'Counter Overflow & Filtering', use: 'Overflow + filtering in S-mode' },
      { id: 'Ssccptr', name: 'Ssccptr', desc: 'S Counter Pointer CSR', use: 'Supervisor counter pointer CSR' },

      { id: 'Ssqosid', name: 'Ssqosid', desc: 'QoS Identifiers', use: 'Per-thread QoS tagging' },
      { id: 'Sshpmcfg', name: 'Sshpmcfg', desc: 'S-Mode HPM Config', use: 'Supervisor HPM configuration' },

      { id: 'Smrnmi', name: 'Smrnmi', desc: 'Resumable NMI', use: 'Restartable non-maskable interrupts' },
    ],

    // Traps, debug, state enable, PMP, CSR indirection, profile tags, hypervisor aux
    s_trap: [
      // Debug
      { id: 'Sdext', name: 'Sdext', desc: 'External Debug', use: 'External debug architecture' },
      { id: 'Sdtrig', name: 'Sdtrig', desc: 'Debug Triggers', use: 'HW breakpoints / watchpoints' },
      { id: 'Sdtrigepm', name: 'Sdtrigepm', desc: 'Debug Trigger EPM', use: 'Trigger matching for external PM' },
      { id: 'Sdtrigpend', name: 'Sdtrigpend', desc: 'Debug Trigger Pending', use: 'Pending trigger cause reporting' },

      // Trap / CSR behavior
      { id: 'Smcsrind', name: 'Smcsrind', desc: 'Indirect CSR Access (M)', use: 'CSR indirection at M-mode' },
      { id: 'Sscsrind', name: 'Sscsrind', desc: 'Indirect CSR Access (S)', use: 'CSR indirection at S-mode' },
      { id: 'Smctr', name: 'Smctr', desc: 'Control Transfer Records (M)', use: 'Hardware CFI logs (M)' },
      { id: 'Ssctr', name: 'Ssctr', desc: 'Control Transfer Records (S)', use: 'Hardware CFI logs (S)' },

      { id: 'Sddbltrp', name: 'Sddbltrp', desc: 'Debug Double Trap', use: 'Debug-level nested traps' },
      { id: 'Ssdbltrp', name: 'Ssdbltrp', desc: 'Supervisor Double Trap', use: 'Recoverable nested traps (S)' },
      { id: 'Smdbltrp', name: 'Smdbltrp', desc: 'Machine Double Trap', use: 'Recoverable nested traps (M)' },

      // State enable / PMP / security-ish arch
      { id: 'Smstateen', name: 'Smstateen', desc: 'M-Mode State Enable', use: 'Gate access to extension CSRs' },
      { id: 'Ssstateen', name: 'Ssstateen', desc: 'S-Mode State Enable', use: 'State-enable for S/VS/VU' },
      { id: 'Smepmp', name: 'Smepmp', desc: 'Enhanced PMP', use: 'More flexible PMP rules' },
      { id: 'Smmpm', name: 'Smmpm', desc: 'Machine PMP Mgmt', use: 'Machine-level PMP management' },

      // Profile-visible architectural tags
      { id: 'Sm1p11', name: 'Sm1p11', desc: 'Priv Spec M v1.11', use: 'Machine architecture tag' },
      { id: 'Ss1p11', name: 'Ss1p11', desc: 'Priv Spec S v1.11', use: 'Supervisor architecture tag' },
      { id: 'Sm1p12', name: 'Sm1p12', desc: 'Priv Spec M v1.12', use: 'Machine architecture tag' },
      { id: 'Ss1p12', name: 'Ss1p12', desc: 'Priv Spec S v1.12', use: 'Supervisor architecture tag' },
      { id: 'Sm1p13', name: 'Sm1p13', desc: 'Priv Spec M v1.13', use: 'Machine architecture tag' },
      { id: 'Ss1p13', name: 'Ss1p13', desc: 'Priv Spec S v1.13', use: 'Supervisor architecture tag' },

      // Trap-behavior niceties
      { id: 'Sstvala', name: 'Sstvala', desc: 'stval Address Rule', use: 'Precise faulting VA / instruction' },
      { id: 'Sstvecd', name: 'Sstvecd', desc: 'stvec Direct Mode', use: 'Direct-mode trap vector' },
      { id: 'Sstvecv', name: 'Sstvecv', desc: 'stvec Vectored Mode', use: 'Vectored trap routing' },
      { id: 'Ssdtso', name: 'Ssdtso', desc: 'Supervisor TSO Opt-in', use: 'Supervisors opt into TSO behavior' },
      { id: 'Sstcfg', name: 'Sstcfg', desc: 'Trap Config', use: 'Per-trap configuration controls' },
      { id: 'Ssstrict', name: 'Ssstrict', desc: 'No Non-Conforming Exts', use: 'Disallows non-conforming extensions' },

      { id: 'Ssu32xl', name: 'Ssu32xl', desc: 'UXL=32 support', use: 'User XLEN=32 capability' },
      { id: 'Ssu64xl', name: 'Ssu64xl', desc: 'UXL=64 support', use: 'User XLEN=64 capability' },
      { id: 'Ssube', name: 'Ssube', desc: 'Big-Endian S', use: 'Supervisor big-endian/bi-endian' },
      { id: 'Ssvxscr', name: 'Ssvxscr', desc: 'VS CSR', use: 'Vector state control at S-mode' },

      { id: 'Ssptead', name: 'Ssptead', desc: 'Sup PTE A/D (legacy)', use: 'Legacy name for Svade-style semantics' },

      // Machine-level trap / debug extras
      { id: 'Smcfiss', name: 'Smcfiss', desc: 'M-Mode Shadow Stack', use: 'Machine-level shadow stack config' },
      { id: 'Smdid', name: 'Smdid', desc: 'Debug ID', use: 'Debug/trace identification' },
      { id: 'Smrnpt', name: 'Smrnpt', desc: 'Non-Precise Traps', use: 'Relaxed trap precision' },
      { id: 'Smrntt', name: 'Smrntt', desc: 'Non-Taken Traps', use: 'Trap behavior when not taken' },
      { id: 'Smnpm', name: 'Smnpm', desc: 'Non-Maskable PM', use: 'Power-management/trap interactions' },
      { id: 'Smpmpmt', name: 'Smpmpmt', desc: 'PMP Machine Trap', use: 'PMP-related trap behavior' },
      { id: 'Smsdia', name: 'Smsdia', desc: 'Soft Debug/Instr', use: 'Soft-debug / diagnostics assist' },
      { id: 'Smtdeleg', name: 'Smtdeleg', desc: 'Trap Delegation', use: 'Fine-grain trap delegation controls' },
      { id: 'Smvatag', name: 'Smvatag', desc: 'VA Tagging (M)', use: 'Machine-level virtual-address tagging' },

      // Non-ISA “spec tags” modeled as tiles too
      { id: 'RERI', name: 'RERI', desc: 'RAS Error Reporting', use: 'RAS error reporting arch tag' },
      { id: 'HTI', name: 'HTI', desc: 'Trace & Instrumentation', use: 'Trace / instrumentation spec tag' },
    ],
  };
  */

  // Profile definitions live in ./profiles.js so scripts and tests can reach
  // them; see that file for why.
  const profiles = PROFILES;

  // ---------------------------------------------------------------------------
  // Instruction lists per extension (used in the details sidebar)
  // ---------------------------------------------------------------------------
  const extensionCsrs = {
    S: [
      'SSTATUS',
      'SIE', 'SIP',
      'STVEC',
      'SSCRATCH',
      'SEPC',
      'SCAUSE',
      'STVAL',
      'SATP',
    ],
    U: [
      'USTATUS',
      'UIE', 'UIP',
      'UTVEC',
      'USCRATCH',
      'UEPC',
      'UCAUSE',
      'UTVAL',
    ],
  };

  const extensionCsrLabels = {
    S: 'Supervisor CSRs',
    U: 'User CSRs',
  };

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------
  const volumeMembership = React.useMemo(() => {
    const allIds = new Set(
      Object.values(extensions)
        .flat()
        .filter(Boolean)
        .map((ext) => ext.id)
    );

    const vol2Ids = new Set();

    for (const ext of extensions.standard || []) {
      if (['S', 'U', 'H', 'N'].includes(ext.id)) vol2Ids.add(ext.id);
    }
    for (const ext of extensions.s_mem || []) vol2Ids.add(ext.id);
    for (const ext of extensions.s_interrupt || []) vol2Ids.add(ext.id);
    for (const ext of extensions.s_trap || []) vol2Ids.add(ext.id);

    const vol1Ids = new Set(Array.from(allIds).filter((id) => !vol2Ids.has(id)));
    return {
      I: vol1Ids,
      II: vol2Ids,
    };
  }, []);

  const instructionMatchesQuery = (mnemonic, details, q) => {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return false;

    if (mnemonic && String(mnemonic).toLowerCase().includes(needle)) return true;
    if (!details || typeof details !== 'object') return false;

    for (const field of [details.encoding, details.match, details.mask]) {
      if (field && String(field).toLowerCase().includes(needle)) return true;
    }
    for (const list of [details.variable_fields, details.extension]) {
      if (Array.isArray(list) && list.join(' ').toLowerCase().includes(needle)) return true;
    }

    return false;
  };

  const selectInstructionByMnemonic = React.useCallback((ext, mnemonic) => {
    const details = ext?.instructions?.[mnemonic];
    setSelectedInstruction(details ? { mnemonic, ...details } : null);
  }, []);

  const instructionIndex = React.useMemo(() => {
    const index = new Map();
    const allExts = Object.values(extensions).flat().filter(Boolean);

    for (const ext of allExts) {
      const instructions = ext?.instructions;
      if (!instructions || typeof instructions !== 'object') continue;

      for (const [mnemonic, details] of Object.entries(instructions)) {
        const key = normalizeMnemonicKey(mnemonic);
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ ext, mnemonic, details });
      }
    }

    return index;
  }, []);

  const selectInstructionByMnemonicKey = React.useCallback(
    (mnemonicKey, preferredExtIds = []) => {
      const key = normalizeMnemonicKey(mnemonicKey);
      if (!key) return false;
      const candidates = instructionIndex.get(key);
      if (!candidates || !candidates.length) return false;

      let chosen = null;
      for (const extId of preferredExtIds) {
        chosen = candidates.find((entry) => entry.ext.id === extId);
        if (chosen) break;
      }
      if (!chosen && selectedExt) {
        chosen = candidates.find((entry) => entry.ext.id === selectedExt.id);
      }
      if (!chosen) [chosen] = candidates;

      if (!chosen) return false;
      setSelectedExt(chosen.ext);
      setSelectedInstruction({ mnemonic: chosen.mnemonic, ...chosen.details });
      setSearchMatches(null);
      return true;
    },
    [instructionIndex, selectedExt]
  );

  const selectStandardEquivalent = React.useCallback(
    (mnemonic) => selectInstructionByMnemonicKey(mnemonic, STANDARD_EQUIVALENT_PRIORITY),
    [selectInstructionByMnemonicKey]
  );

  const selectCompressedEquivalent = React.useCallback(
    (mnemonic) => selectInstructionByMnemonicKey(mnemonic, ['C']),
    [selectInstructionByMnemonicKey]
  );

  const compressedMapping = selectedInstruction
    ? COMPRESSED_INSTRUCTION_LOOKUP[normalizeMnemonicKey(selectedInstruction.mnemonic)]
    : null;
  const standardEquivalentMnemonic = compressedMapping
    ? normalizeMnemonicKey(compressedMapping.standard)
    : '';
  const hasStandardEquivalent =
    Boolean(standardEquivalentMnemonic) && instructionIndex.get(standardEquivalentMnemonic)?.length;
  const compressedEquivalents = selectedInstruction
    ? (COMPRESSED_BY_STANDARD[normalizeMnemonicKey(selectedInstruction.mnemonic)] || []).filter((entry) =>
      instructionIndex.has(normalizeMnemonicKey(entry.mnemonic))
    )
    : [];

  const formatInstructionForClipboard = React.useCallback((ext, instr) => {
    if (!ext || !instr) return '';
    const lines = [
      `RISC-V Extension: ${ext.name} (${ext.id})`,
      ext.desc ? `Description: ${ext.desc}` : null,
      ext.use ? `Use: ${ext.use}` : null,
      `Reference: ${ext.url || 'https://github.com/riscv/riscv-isa-manual'}`,
      '',
      `Instruction: ${instr.mnemonic}`,
      instr.encoding ? `Encoding: ${instr.encoding}` : null,
      Array.isArray(instr.variable_fields) && instr.variable_fields.length
        ? `Variable fields: ${instr.variable_fields.join(', ')}`
        : null,
      instr.match ? `Match: ${instr.match}` : null,
      instr.mask ? `Mask: ${instr.mask}` : null,
      Array.isArray(instr.extension) && instr.extension.length
        ? `Extension tags: ${instr.extension.join(', ')}`
        : null,
    ].filter(Boolean);
    return `${lines.join('\n')}\n`;
  }, []);

  const copyTextToClipboard = React.useCallback(async (text) => {
    if (!text) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through
    }

    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', 'true');
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const allInstructionPatterns = React.useMemo(() => {
    const patterns = [];
    const allExts = Object.values(extensions).flat().filter(Boolean);

    for (const ext of allExts) {
      const instructions = ext?.instructions;
      if (!instructions || typeof instructions !== 'object') continue;

      for (const [mnemonic, details] of Object.entries(instructions)) {
        const encoding = normalizeEncodingString(details?.encoding);
        const matchParsed = parseHexToBigInt(details?.match);
        const maskParsed = parseHexToBigInt(details?.mask);

        let match = matchParsed;
        let mask = maskParsed;

        if ((match == null || mask == null) && encoding) {
          const derived = encodingToMatchMask(encoding);
          match = derived.match;
          mask = derived.mask;
        }

        if (match == null || mask == null) continue;

        patterns.push({
          extId: ext.id,
          extName: ext.name,
          mnemonic,
          encoding: encoding || matchMaskToEncoding(match, mask),
          match: match & BIT_MASK_32,
          mask: mask & BIT_MASK_32,
          url: ext.url || 'https://github.com/riscv/riscv-isa-manual',
        });
      }
    }

    return patterns;
  }, []);

  const formatEncoderValidatorReport = React.useCallback((proposed, result) => {
    const lines = [];
    const now = new Date();
    lines.push(`RISC-V Encoder Validation Report`);
    lines.push(`Generated: ${now.toISOString()}`);
    lines.push('');
    if (proposed.mnemonic) lines.push(`Proposed mnemonic: ${proposed.mnemonic}`);
    if (proposed.encoding) lines.push(`Proposed encoding: ${proposed.encoding}`);
    if (proposed.match) lines.push(`Proposed match: ${proposed.match}`);
    if (proposed.mask) lines.push(`Proposed mask: ${proposed.mask}`);
    lines.push('');

    if (result.errors.length) {
      lines.push(`Errors (${result.errors.length}):`);
      for (const err of result.errors) lines.push(`- ${err}`);
      lines.push('');
    }

    lines.push(`Conflicts (${result.conflicts.length}):`);
    if (!result.conflicts.length) {
      lines.push(`- None found within the current instruction set database.`);
      return `${lines.join('\n')}\n`;
    }

    for (const conflict of result.conflicts) {
      lines.push(`- ${conflict.other.extId}:${conflict.other.mnemonic} (${conflict.type})`);
      lines.push(`  Why: ${conflict.why}`);
      if (conflict.commonMask) lines.push(`  Common mask: ${conflict.commonMask}`);
      if (conflict.exampleWord) lines.push(`  Example word: ${conflict.exampleWord}`);
    }
    return `${lines.join('\n')}\n`;
  }, []);

  const runEncoderValidation = React.useCallback(() => {
    const input = encoderValidatorInput;
    const errors = [];

    const proposedMnemonic = String(input.mnemonic || '').trim();
    const proposedEncoding = normalizeEncodingString(input.encoding);
    const proposedMatchInput = String(input.match || '').trim();
    const proposedMaskInput = String(input.mask || '').trim();

    let proposedMatch = null;
    let proposedMask = null;
    let normalizedEncoding = '';

    const hasEncoding = Boolean(proposedEncoding);
    const hasMatchMask = Boolean(proposedMatchInput || proposedMaskInput);

    if (!hasEncoding && !hasMatchMask) {
      errors.push('Provide either Encoding, or both Match and Mask.');
    }

    if (hasEncoding) {
      const derived = encodingToMatchMask(proposedEncoding);
      if (derived.error) errors.push(derived.error);
      proposedMatch = derived.match;
      proposedMask = derived.mask;
      normalizedEncoding = proposedEncoding;
    }

    if (hasMatchMask) {
      const matchParsed = parseHexToBigInt(proposedMatchInput);
      const maskParsed = parseHexToBigInt(proposedMaskInput);
      if (matchParsed == null) errors.push('Match must be a hex value like 0x1234.');
      if (maskParsed == null) errors.push('Mask must be a hex value like 0x707f.');

      if (matchParsed != null && maskParsed != null) {
        const matchNorm = matchParsed & BIT_MASK_32;
        const maskNorm = maskParsed & BIT_MASK_32;
        if ((matchNorm & ~maskNorm) !== 0n) {
          errors.push('Match contains bits outside Mask (match & ~mask must be 0).');
        }

        if (!hasEncoding) {
          proposedMatch = matchNorm;
          proposedMask = maskNorm;
          normalizedEncoding = matchMaskToEncoding(matchNorm, maskNorm);
        } else if (proposedMatch != null && proposedMask != null) {
          const derivedMatchNorm = proposedMatch & BIT_MASK_32;
          const derivedMaskNorm = proposedMask & BIT_MASK_32;
          if (derivedMatchNorm !== matchNorm || derivedMaskNorm !== maskNorm) {
            errors.push('Encoding does not match the provided Match/Mask.');
          }
        }
      }
    }

    if (proposedMatch == null || proposedMask == null) {
      setEncoderValidatorResult({ errors, proposed: null, conflicts: [] });
      return;
    }

    const matchNorm = (proposedMatch ?? 0n) & BIT_MASK_32;
    const maskNorm = (proposedMask ?? 0n) & BIT_MASK_32;

    const proposed = {
      mnemonic: proposedMnemonic,
      encoding: normalizeEncodingString(normalizedEncoding) || matchMaskToEncoding(matchNorm, maskNorm),
      match: toHex32(matchNorm),
      mask: toHex32(maskNorm),
      matchValue: matchNorm,
      maskValue: maskNorm,
    };

    const conflicts = [];
    for (const other of allInstructionPatterns) {
      const overlaps = patternsOverlap(matchNorm, maskNorm, other.match, other.mask);
      if (!overlaps) continue;

      const commonMask = (maskNorm & other.mask) & BIT_MASK_32;
      const type =
        matchNorm === other.match && maskNorm === other.mask
          ? 'identical'
          : isSubsetPattern(matchNorm, maskNorm, other.match, other.mask)
            ? 'proposed_subset_of_existing'
            : isSubsetPattern(other.match, other.mask, matchNorm, maskNorm)
              ? 'existing_subset_of_proposed'
              : 'partial_overlap';

      let why = 'Overlapping decode space (there exist instruction words that satisfy both patterns).';
      if (type === 'identical') {
        why = 'Exact same match/mask pattern.';
      } else if (type === 'proposed_subset_of_existing') {
        why =
          'Your proposed pattern is more specific, but every word it matches also matches the existing instruction.';
      } else if (type === 'existing_subset_of_proposed') {
        why =
          'Your proposed pattern is more general, and it would also match words intended for the existing instruction.';
      }

      const exampleWord = overlapExampleWord(matchNorm, maskNorm, other.match, other.mask);
      conflicts.push({
        other,
        type,
        why,
        commonMask: toHex32(commonMask),
        exampleWord: toHex32(exampleWord),
      });
    }

    conflicts.sort((a, b) => {
      const order = {
        identical: 0,
        proposed_subset_of_existing: 1,
        existing_subset_of_proposed: 2,
        partial_overlap: 3,
      };
      return (order[a.type] ?? 99) - (order[b.type] ?? 99);
    });

    setEncoderValidatorResult({ errors, proposed, conflicts });
  }, [allInstructionPatterns, encoderValidatorInput]);

  const isHighlightedByProfile = (id) => {
    if (!activeProfile) return false;
    return profiles[activeProfile].includes(id);
  };

  const isHighlightedByVolume = (id) => {
    if (!activeVolume) return false;
    return volumeMembership[activeVolume]?.has(id) ?? false;
  };

  const extensionSearchIndexById = React.useMemo(() => {
    const index = new Map();
    const allExts = Object.values(extensions).flat().filter(Boolean);

    for (const ext of allExts) {
      const parts = [];

      for (const field of [ext.id, ext.name, ext.desc, ext.use]) {
        if (field) parts.push(String(field));
      }

      const mnemonicList = Object.keys(ext.instructions || {});
      if (mnemonicList.length) {
        parts.push(mnemonicList.join(' '));
      }
      const csrList = extensionCsrs[ext.id];
      if (Array.isArray(csrList) && csrList.length) {
        parts.push(csrList.join(' '));
      }

      const instructions = ext.instructions;
      if (instructions && typeof instructions === 'object') {
        for (const [mnemonic, details] of Object.entries(instructions)) {
          parts.push(mnemonic);

          if (!details || typeof details !== 'object') {
            if (details != null) parts.push(String(details));
            continue;
          }

          if (details.encoding) parts.push(String(details.encoding));
          if (details.match) parts.push(String(details.match));
          if (details.mask) parts.push(String(details.mask));

          if (Array.isArray(details.variable_fields)) {
            parts.push(details.variable_fields.join(' '));
          }
          if (Array.isArray(details.extension)) {
            parts.push(details.extension.join(' '));
          }
        }
      }

      index.set(ext.id, parts.join(' ').toLowerCase());
    }

    return index;
  }, []);

  const isHighlighted = (id) => {
    return isHighlightedByProfile(id) || isHighlightedByVolume(id);
  };

  const isDimmed = (id) => {
    if (activeVolume) return false;
    if (!activeProfile) return false;
    return !profiles[activeProfile].includes(id);
  };

  const ExtensionBlock = ({ data, colorClass, searchQuery }) => {
    const q = searchQuery.trim().toLowerCase();
    const searchIndex = extensionSearchIndexById.get(data.id) || '';
    const matchesSearch = q.length ? searchIndex.includes(q) : false;

    const isDiscontinued = data.discontinued === 1;
    const isSelected = selectedExt?.id === data.id;
    const highlighted = isHighlighted(data.id) || matchesSearch || isSelected;
    const dimmed = isDimmed(data.id) && !matchesSearch && !isSelected;
    const inWorkspace = workspaceIds.has(data.id);

    return (
      <div
        id={`ext-${data.id}`}
        onClick={() =>
          setSelectedExt((current) => {
            const next = current?.id === data.id ? null : data;
            setSelectedInstruction(null);
            setSearchMatches(null);
            return next;
          })
        }
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
          // Amber glow ring when in workspace
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
            className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider"
            style={{
              background: 'rgba(255,77,107,0.12)',
              color: '#ff7a8a',
              border: '1px solid rgba(255,77,107,0.25)',
            }}
          >
            EOL
          </span>
        )}

        {/* ── ISA Workspace badge — only while the builder is switched on ── */}
        {builderMode && !isDiscontinued && (() => {
          const isLocked = inWorkspace && lockedExtensions.has(data.id);
          const lockedBy = isLocked ? lockedExtensions.get(data.id) : [];

          // The unselected "+" is the call to action, so it carries the accent
          // colour rather than the grey it used to have. Selected tiles keep the
          // filled amber check; locked ones are dimmed to read as unavailable.
          const accent = '#f5c542';
          return (
            <button
              type="button"
              data-in-workspace={inWorkspace ? 'true' : 'false'}
              onClick={(e) => {
                e.stopPropagation();
                // addWorkspaceIdsSmart handles the lock rejection/toast internally for clicks
                addWorkspaceIdsSmart(data.id, true);
              }}
              className="workspace-tile-btn absolute top-1.5 right-1.5"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18,
                borderRadius: 5,
                border: `1px solid ${isLocked ? 'rgba(245,197,66,0.3)' : 'rgba(245,197,66,0.6)'}`,
                background: inWorkspace
                  ? (isLocked ? 'rgba(245,197,66,0.08)' : 'rgba(245,197,66,0.22)')
                  : 'rgba(245,197,66,0.14)',
                backdropFilter: 'blur(4px)',
                boxShadow: inWorkspace || isLocked ? 'none' : '0 0 0 2px rgba(245,197,66,0.12)',
                color: isLocked ? 'rgba(245,197,66,0.5)' : accent,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                padding: 0,
              }}
              title={isLocked ? `Required by ${lockedBy.join(', ')} — remove dependent first` : (inWorkspace ? `Remove ${data.id} from Custom ISA Configuration Builder` : `Add ${data.id} to Custom ISA Configuration Builder`)}
            >
              {inWorkspace
                ? (
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#f5c542" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )
                : <Plus size={9} />
              }
            </button>
          );
        })()}

        <div className="flex items-start justify-between mb-1">
          <span
            className="font-mono font-semibold text-[11px] leading-tight"
            style={{ letterSpacing: '0.02em' }}
          >
            {data.name}
          </span>
        </div>
        <div
          className="text-[10px] leading-snug line-clamp-2"
          style={{ color: 'var(--riscv-text-2)' }}
        >
          {data.desc}
        </div>
      </div>
    );
  };




  // Scroll to extension tile when search matches an extension ID or instruction mnemonic,
  // and automatically open the Selected Details panel. Use a ref to avoid re-scrolling
  // on every render while the query stays the same.
  React.useEffect(() => {
    const q = searchQuery.trim().toLowerCase();

    if (!q) {
      // Reset tracking when query is cleared
      lastScrolledKeyRef.current = null;
      setSearchMatches(null);
      return;
    }

    const allExts = Object.values(extensions).flat();
    let matchedMnemonic = null;
    let matchedDetails = null;

    // First, try an exact extension ID match
    let targetExt = allExts.find((ext) => ext.id.toLowerCase() === q);

    // If no exact extension ID match, try to match an instruction mnemonic
    if (!targetExt) {
      for (const ext of allExts) {
        const mnemonics = Object.keys(ext.instructions || {});
        const found = mnemonics.find((m) => m.toLowerCase() === q);
        if (found) {
          targetExt = ext;
          matchedMnemonic = found;
          matchedDetails = ext.instructions[found] || null;
          break;
        }
      }
    }

    // If still no match, try a deep search against indexed extension+instruction details
    if (!targetExt) {
      targetExt =
        allExts.find((ext) => (extensionSearchIndexById.get(ext.id) || '').includes(q)) ||
        null;
    }

    if (targetExt) {
      const hits = [];
      if (targetExt.instructions && typeof targetExt.instructions === 'object') {
        for (const [mnemonic, details] of Object.entries(targetExt.instructions)) {
          if (instructionMatchesQuery(mnemonic, details, q)) {
            hits.push(mnemonic);
          }
        }
      }

      if (matchedMnemonic && !hits.includes(matchedMnemonic)) hits.unshift(matchedMnemonic);
      if (!matchedMnemonic && hits.length) matchedMnemonic = hits[0];
      matchedDetails = matchedMnemonic ? targetExt?.instructions?.[matchedMnemonic] : null;

      // Always open/update the Selected Details panel for the matched extension
      setSelectedExt(targetExt);
      setSearchMatches(hits.length ? { extId: targetExt.id, query: q, mnemonics: hits, index: 0 } : null);
      setSelectedInstruction(matchedMnemonic && matchedDetails ? { mnemonic: matchedMnemonic, ...matchedDetails } : null);

      const key = `${targetExt.id}:${q}`;

      // Only auto-scroll once per unique (extension, query) pair
      if (lastScrolledKeyRef.current !== key) {
        const el = document.getElementById(`ext-${targetExt.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        lastScrolledKeyRef.current = key;
      }
    }
  }, [searchQuery, extensionSearchIndexById]);

  // Compute stat bar numbers from loaded JSON
  const totalExtensions = React.useMemo(() => Object.values(extensions).flat().filter(Boolean).length, []);
  const totalInstructions = React.useMemo(() => {
    let c = 0;
    for (const ext of Object.values(extensions).flat().filter(Boolean)) {
      c += Object.keys(ext.instructions || {}).length;
    }
    return c;
  }, []);

  return (
    <div className="min-h-screen text-slate-50" style={{ background: 'var(--riscv-bg)' }}>
      {/* Gradient top border */}
      <div className="riscv-top-border" />
      <div className="px-3 md:px-6 py-4 md:py-6 max-w-[1700px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── Header ───────────────────────────────────────────────────── */}
          <div className="lg:col-span-12 pb-5 mb-2" style={{ borderBottom: '1px solid var(--riscv-border)' }}>
            {/* Title row */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <CircuitBoard size={22} style={{ color: 'var(--riscv-gold)' }} />
                  <h1
                    className="text-2xl md:text-3xl font-black tracking-tight"
                    style={{
                      background: 'linear-gradient(90deg, #f5c542 0%, #fde68a 50%, #f5c542 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    RISC-V Extension Landscape
                  </h1>
                </div>
                <p className="text-xs ml-9 whitespace-nowrap" style={{ color: 'var(--riscv-text-2)' }}>
                  Authoritative reference for extensions, profiles &amp; per-instruction encoding.
                </p>
                {/* Stat bar */}
                <div className="flex items-center gap-4 mt-3 ml-9">
                  {[
                    { label: 'Extensions', value: totalExtensions },
                    { label: 'Profiles', value: Object.keys(profiles).length },
                    { label: 'Instructions', value: `${(totalInstructions / 1000).toFixed(1)}k+` },
                    { label: 'Volumes', value: 2 },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-baseline gap-1.5">
                      <span className="text-base font-black" style={{ color: 'var(--riscv-gold)' }}>{value}</span>
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--riscv-text-3)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Controls - Single Row Design 1 */}
              <div className="flex flex-wrap xl:flex-nowrap items-center justify-start lg:justify-end gap-x-3 gap-y-3 shrink-0">
                {/* Grouped Filters Container */}
                <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl border shadow-lg backdrop-blur-md" style={{ background: 'rgba(15,23,42,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  
                  {/* Profiles */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--riscv-text-3)' }}>Profile</span>
                    <div className="flex gap-1.5">
                      {Object.keys(profiles).map((profile) => (
                        <button
                          key={profile}
                          onClick={() =>
                            setActiveProfile((current) => {
                              setSelectedExt(null);
                              setSelectedInstruction(null);
                              setSearchMatches(null);
                              return current === profile ? null : profile;
                            })
                          }
                          className={[
                            'px-3 py-1.5 text-[11px] rounded-lg transition-all duration-200 font-medium',
                            activeProfile === profile 
                              ? 'bg-slate-700/80 text-white shadow-inner border border-slate-500/50' 
                              : 'text-slate-300 hover:text-white hover:bg-slate-700/40 border border-transparent hover:border-slate-600/30',
                          ].join(' ')}
                        >
                          {profile}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="h-5 w-px bg-slate-700/60 mx-1" />

                  {/* Volumes */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--riscv-text-3)' }}>Volume</span>
                    <div className="flex gap-1.5">
                      {['I', 'II'].map((vol) => (
                        <button
                          key={vol}
                          onClick={() =>
                            setActiveVolume((current) => {
                              setSelectedExt(null);
                              setSelectedInstruction(null);
                              setSearchMatches(null);
                              return current === vol ? null : vol;
                            })
                          }
                          className={[
                            'px-3 py-1.5 text-[11px] rounded-lg transition-all duration-200 font-medium',
                            activeVolume === vol 
                              ? 'bg-slate-700/80 text-white shadow-inner border border-slate-500/50' 
                              : 'text-slate-300 hover:text-white hover:bg-slate-700/40 border border-transparent hover:border-slate-600/30',
                          ].join(' ')}
                        >
                          Vol {vol}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Encoder Validator - Sleek Outline Button */}
                <button
                  type="button"
                  onClick={() => {
                    setEncoderValidatorOpen(true);
                    setEncoderValidatorResult(null);
                    setEncoderValidatorCopyStatus(null);
                  }}
                  className="group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-300 whitespace-nowrap border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/15 hover:border-indigo-400 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                  title="Validate a proposed instruction encoding against the existing instruction set"
                >
                  <ScanSearch size={14} className="text-indigo-400/80 group-hover:text-indigo-300 transition-colors" />
                  <span className="whitespace-nowrap">Encoder Validator</span>
                </button>

                {/* Custom ISA Configuration Builder — fused action group */}
                <div className="relative inline-flex items-stretch rounded-xl">

                  {/* Active glow ring */}
                  {builderMode && (
                    <span className="absolute -inset-px rounded-xl animate-pulse bg-amber-400/20 pointer-events-none z-0" />
                  )}

                  {/* Main body — switches builder mode on and off.
                      It deliberately does NOT open the panel: the panel is a
                      full-screen overlay, so opening it on activation would
                      immediately cover the tiles the user is meant to click. */}
                  <button
                    type="button"
                    aria-pressed={builderMode}
                    onClick={() => setBuilderMode(v => !v)}
                    className={[
                      'relative z-10 inline-flex items-center gap-2 pl-3.5 pr-3 py-2 text-xs font-bold transition-all duration-300 whitespace-nowrap',
                      builderMode
                        ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-slate-900 hover:from-amber-300 hover:to-amber-400 rounded-l-xl'
                        : 'bg-slate-800/80 text-amber-300/90 border border-amber-400/30 hover:bg-slate-700/80 hover:text-amber-200 rounded-xl',
                    ].join(' ')}
                    style={{ boxShadow: builderMode ? '0 4px 18px rgba(251,191,36,0.4)' : '0 2px 10px rgba(0,0,0,0.2)' }}
                    title={
                      builderMode
                        ? 'Custom ISA Builder is ON — click any extension’s + to add it. Click here to turn off.'
                        : 'Turn on the Custom ISA Builder to start picking extensions'
                    }
                  >
                    <Cpu size={14} className="opacity-80 flex-shrink-0" />
                    <span className="whitespace-nowrap">Custom ISA Builder</span>
                    <span
                      className={[
                        'inline-flex items-center justify-center px-1.5 h-[16px] rounded-full text-[9px] font-black tracking-wide',
                        builderMode ? 'bg-slate-900/75 text-amber-400' : 'bg-slate-900/60 text-slate-400',
                      ].join(' ')}
                    >
                      {builderMode ? 'ON' : 'OFF'}
                    </span>
                    {workspaceIds.size > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] px-1 h-[18px] rounded-full text-[9px] font-black bg-slate-900/75 text-amber-400">
                        {workspaceIds.size}
                      </span>
                    )}
                  </button>

                  {/* Fused action icons — available while the builder is on */}
                  {builderMode && (<>
                    {/* Hairline divider */}
                    <div className="relative z-10 w-px self-stretch bg-amber-600/60" />

                    {/* Open the full panel */}
                    <button
                      type="button"
                      title="Open the builder panel (-march string, export, conflicts)"
                      onClick={() => setWorkspacePanelOpen(true)}
                      className="group relative z-10 inline-flex items-center justify-center px-3 bg-gradient-to-b from-amber-400 to-amber-500 text-slate-800 hover:from-amber-300 hover:to-amber-400 transition-all duration-300 z-20"
                    >
                      <Maximize2 size={13} className="transition-transform group-hover:scale-110" />
                    </button>

                    {/* Hairline divider */}
                    <div className="relative z-10 w-px self-stretch bg-amber-600/60" />

                    {/* Start from a profile.
                        A configuration can begin two ways: pick a base ISA tile
                        and build up (what the tiles below afford), or start from
                        a ratified profile and adjust. Only the first was
                        reachable before. While the workspace is empty this
                        carries a text label, because that is exactly when the
                        user needs to know the second option exists. */}
                    <div className="relative z-10 flex">
                      <button
                        type="button"
                        onClick={() => setProfileMenuOpen(v => !v)}
                        title="Start the configuration from a ratified profile"
                        className={[
                          'group inline-flex items-center gap-1.5 justify-center px-3 transition-all duration-300 z-20 whitespace-nowrap',
                          workspaceIds.size === 0 ? 'rounded-r-xl' : '',
                          profileMenuOpen
                            ? 'bg-indigo-500 text-white shadow-inner'
                            : 'bg-gradient-to-b from-amber-400 to-amber-500 text-slate-800 hover:from-indigo-500 hover:to-indigo-600 hover:text-white',
                        ].join(' ')}
                      >
                        <Layers size={13} className="transition-transform group-hover:scale-110" />
                        {workspaceIds.size === 0 && (
                          <span className="text-[11px] font-bold">Start from profile</span>
                        )}
                      </button>

                      {profileMenuOpen && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                          zIndex: 50, display: 'flex', flexDirection: 'column',
                          borderRadius: 10,
                          background: 'linear-gradient(145deg, #1a1f2e 0%, #141824 100%)',
                          border: '1px solid rgba(245,197,66,0.25)',
                          boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
                          minWidth: 300, overflow: 'hidden',
                        }}>
                          <div style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(245,197,66,0.04)',
                            fontSize: 11, color: '#f1f5f9', fontWeight: 700,
                          }}>
                            Start from a ratified profile
                          </div>

                          {Object.entries(profiles).map(([name, list]) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                // Replace rather than merge: "start from" means
                                // this profile is the starting point, and mixing
                                // it into an existing pick would silently produce
                                // a configuration matching neither.
                                setWorkspaceIds(new Set());
                                addWorkspaceIdsSmart(list);
                                setProfileMenuOpen(false);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 12, padding: '10px 14px', textAlign: 'left',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                background: 'transparent', cursor: 'pointer',
                              }}
                              className="hover:bg-amber-400/10 transition-colors"
                            >
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--riscv-gold)' }}>{name}</span>
                              <span style={{ fontSize: 10, color: 'var(--riscv-text-2)' }}>
                                {list.length} extensions
                              </span>
                            </button>
                          ))}

                          <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--riscv-text-3)', lineHeight: 1.5 }}>
                            Replaces the current selection. Dependencies are resolved
                            automatically, so the result may include more than the
                            profile lists.
                          </div>
                        </div>
                      )}
                    </div>
                  </>)}

                  {/* Clear and export — only meaningful once something is picked */}
                  {builderMode && workspaceIds.size > 0 && (<>
                    {/* Hairline divider */}
                    <div className="relative z-10 w-px self-stretch bg-amber-600/60" />

                    {/* Clear */}
                    <button
                      type="button"
                      title="Clear all extensions"
                      onClick={() => setWorkspaceIds(new Set())}
                      className="group relative z-10 inline-flex items-center justify-center px-3 bg-gradient-to-b from-amber-400 to-amber-500 text-slate-800 hover:from-rose-500 hover:to-rose-600 hover:text-white transition-all duration-300 hover:shadow-[0_0_14px_rgba(225,29,72,0.5)] z-20"
                    >
                      <Trash2 size={13} className="transition-transform group-hover:scale-110" />
                    </button>

                    {/* Hairline divider */}
                    <div className="relative z-10 w-px self-stretch bg-amber-600/60" />

                    {/* Export */}
                    <div className="relative z-10 flex">
                      <button
                        type="button"
                        title="Export configuration YAML"
                        onClick={() => setQuickExportOpen(v => !v)}
                        className={`group inline-flex items-center justify-center px-3 rounded-r-xl transition-all duration-300 z-20 ${
                          quickExportOpen 
                            ? 'bg-emerald-500 text-white shadow-inner' 
                            : 'bg-gradient-to-b from-amber-400 to-amber-500 text-slate-800 hover:from-emerald-500 hover:to-emerald-600 hover:text-white hover:shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                        }`}
                      >
                        <Download size={13} className="transition-transform group-hover:scale-110" />
                      </button>

                      {quickExportOpen && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                          zIndex: 50,
                          display: 'flex', flexDirection: 'column', gap: 0,
                          borderRadius: 10,
                          background: 'linear-gradient(145deg, #1a1f2e 0%, #141824 100%)',
                          border: '1px solid rgba(245,197,66,0.25)',
                          boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset',
                          minWidth: 280, overflow: 'hidden',
                        }}>
                          {/* Header strip */}
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(245,197,66,0.04)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <Package size={12} style={{ color: 'var(--riscv-gold)', opacity: 0.85 }} />
                              <span style={{ fontSize: 11, color: '#f1f5f9', fontWeight: 700, letterSpacing: '0.01em' }}>
                                Export Configuration YAML
                              </span>
                            </div>
                            <button
                              onClick={() => setQuickExportOpen(false)}
                              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, lineHeight: 0, borderRadius: 4 }}
                              onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                              onMouseLeave={e => e.currentTarget.style.color = '#475569'}
                            ><X size={13} /></button>
                          </div>

                          {/* Toggle card */}
                          <div style={{ padding: '12px 14px' }}>
                            <div
                              onClick={() => setQuickExportIncludeInstr(v => !v)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                background: quickExportIncludeInstr ? 'rgba(245,197,66,0.07)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${quickExportIncludeInstr ? 'rgba(245,197,66,0.2)' : 'rgba(255,255,255,0.07)'}`,
                                transition: 'all 0.2s',
                                userSelect: 'none',
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <span style={{
                                  fontSize: 11.5, fontWeight: 600,
                                  color: quickExportIncludeInstr ? '#f1f5f9' : '#94a3b8',
                                  display: 'block', lineHeight: 1.35, transition: 'color 0.2s',
                                }}>
                                  Include instruction catalog
                                </span>
                                <span style={{
                                  fontSize: 10, marginTop: 2, display: 'block',
                                  color: workspaceTotalInstr > 100 ? '#f59e0b' : '#64748b',
                                  fontVariantNumeric: 'tabular-nums',
                                }}>
                                  {workspaceTotalInstr.toLocaleString()} instructions{workspaceTotalInstr > 100 ? ' · large export' : ''}
                                </span>
                              </div>

                              {/* Premium toggle track */}
                              <div style={{
                                width: 38, height: 21, borderRadius: 11, flexShrink: 0,
                                background: quickExportIncludeInstr
                                  ? 'linear-gradient(135deg, #f5c542 0%, #fde68a 100%)'
                                  : 'rgba(255,255,255,0.08)',
                                boxShadow: quickExportIncludeInstr ? '0 0 8px rgba(245,197,66,0.4)' : 'none',
                                position: 'relative', transition: 'all 0.25s',
                                border: `1px solid ${quickExportIncludeInstr ? 'rgba(245,197,66,0.7)' : 'rgba(255,255,255,0.12)'}`,
                              }}>
                                <div style={{
                                  width: 15, height: 15, borderRadius: '50%',
                                  background: quickExportIncludeInstr ? '#1a1206' : '#475569',
                              position: 'absolute', top: 2,
                                  left: quickExportIncludeInstr ? 19 : 2,
                                  transition: 'all 0.25s',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                }} />
                              </div>
                            </div>
                          </div>

                          {/* Download button */}
                          <div style={{ padding: '0 14px 13px' }}>
                            <button
                              onClick={() => {
                                const { yaml } = buildIsaConfigYaml(Array.from(workspaceIds), allExtsList, quickExportIncludeInstr);
                                const blob = new Blob([yaml], { type: 'text/yaml' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                const marchRes = buildMarchString(Array.from(workspaceIds), allExtsList);
                                const base = marchRes.march ? marchRes.march.split('_')[0] : 'core';
                                a.download = `riscv_${base}_config.yaml`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                                setQuickExportOpen(false);
                              }}
                              style={{
                                width: '100%', padding: '9px 14px', borderRadius: 7,
                                background: 'linear-gradient(135deg, rgba(245,197,66,0.22) 0%, rgba(245,197,66,0.12) 100%)',
                                color: 'var(--riscv-gold)',
                                border: '1px solid rgba(245,197,66,0.4)',
                                fontSize: 11.5, fontWeight: 700,
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
                  </>)}
                </div>
              </div>
            </div>
          </div>
          {/* ─── Main Grid ───────────────────────────────────────────────── */}
          <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-min">
            {/* Search Bar */}
            <div className="col-span-full mb-2">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--riscv-text-3)' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search extensions, instructions, encodings…"
                  className="riscv-input w-full pl-10 pr-24 py-2.5 text-sm"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="p-0.5 rounded hover:opacity-80"
                      style={{ color: 'var(--riscv-text-3)' }}
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                  <kbd
                    className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
                    style={{ background: 'var(--riscv-muted)', color: 'var(--riscv-text-3)', border: '1px solid var(--riscv-border-2)' }}
                  >
                    <span className="text-[9px]">⌘</span>K
                  </kbd>
                </div>
              </div>
            </div>

            {/* 1. Base ISA */}
            <div className="space-y-2.5 col-span-full">
              <div className="flex items-center gap-2">
                <CircuitBoard size={13} style={{ color: '#60a5fa' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#60a5fa' }}>Base ISA</h3>
                <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.base.length} isa</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {extensions.base.map((item) => (
                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="border-blue-900/60 bg-blue-950/40 text-blue-100"
                  />
                ))}
              </div>
            </div>

            {/* 2. Single-Letter Extensions */}
            <div className="space-y-2.5 col-span-full">
              <div className="flex items-center gap-2">
                <Braces size={13} style={{ color: '#34d399' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#34d399' }}>Single-Letter Extensions</h3>
                <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.standard.length} ext</span>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {extensions.standard.map((item) => (
                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="border-emerald-900/60 bg-emerald-950/40 text-emerald-100"
                  />
                ))}
              </div>
            </div>

            {/* 3. Z-Extensions */}
            <div
              className="col-span-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-5"
              style={{ borderTop: '1px solid var(--riscv-border)' }}
            >
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Binary size={12} style={{ color: '#a78bfa' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#a78bfa' }}>Bit Manipulation (Zb*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_bit.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_bit.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-purple-900/60 bg-purple-950/30 text-purple-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Shuffle size={12} style={{ color: '#fbbf24' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#fbbf24' }}>Atomics (Za/Zic*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_atomics.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_atomics.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-amber-900/60 bg-amber-950/30 text-amber-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Layers size={12} style={{ color: '#818cf8' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#818cf8' }}>Compressed (Zc*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_compress.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_compress.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-indigo-900/60 bg-indigo-950/30 text-indigo-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <FlaskConical size={12} style={{ color: '#f472b6' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#f472b6' }}>Float & Numerics (Zf*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_float.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_float.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-pink-900/60 bg-pink-950/30 text-pink-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Database size={12} style={{ color: '#38bdf8' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#38bdf8' }}>Load / Store</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_load_store.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_load_store.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-sky-900/60 bg-sky-950/30 text-sky-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Activity size={12} style={{ color: '#e879f9' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#e879f9' }}>Integer</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_integer.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_integer.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-fuchsia-900/60 bg-fuchsia-950/30 text-fuchsia-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Zap size={12} style={{ color: '#2dd4bf' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#2dd4bf' }}>Vector Subsets (Zv/Zve)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_vector.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_vector.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-teal-900/60 bg-teal-950/30 text-teal-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Shield size={12} style={{ color: '#f87171' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#f87171' }}>Security & CFI (Zi*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_security.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_security.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-red-900/60 bg-red-950/30 text-red-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <KeyRound size={12} style={{ color: '#94a3b8' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Cryptography (Zk*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_crypto.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_crypto.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-[var(--riscv-border-2)] bg-[var(--riscv-surface-2)] text-slate-300"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Lock size={12} style={{ color: '#c4b5fd' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#c4b5fd' }}>Vector Cryptography (Zvk*)</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_vector_crypto.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_vector_crypto.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-violet-900/60 bg-violet-950/30 text-violet-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Settings2 size={12} style={{ color: '#fb923c' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#fb923c' }}>System</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_system.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_system.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-orange-900/60 bg-orange-950/30 text-orange-100"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <MemoryStick size={12} style={{ color: '#fdba74' }} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#fdba74' }}>Caches</h3>
                  <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.z_caches.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.z_caches.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="border-orange-900/40 bg-orange-950/20 text-orange-100"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 4. S-Extensions (Privileged) */}
            <div
              className="col-span-full pt-5"
              style={{ borderTop: '1px solid var(--riscv-border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Network size={13} style={{ color: '#22d3ee' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#22d3ee' }}>S &amp; Sv Extensions — Privileged ISA</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Layers size={11} style={{ color: 'var(--riscv-text-3)' }} />
                    <h4 className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--riscv-text-3)' }}>Memory (Sv)</h4>
                    <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.s_mem.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {extensions.s_mem.map((item) => (
                      <ExtensionBlock
                        key={item.id}
                        data={item}
                        searchQuery={searchQuery}
                        colorClass="border-cyan-900/50 bg-cyan-950/20 text-cyan-100"
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Timer size={11} style={{ color: 'var(--riscv-text-3)' }} />
                    <h4 className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--riscv-text-3)' }}>Interrupts (Sm/Ss)</h4>
                    <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.s_interrupt.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {extensions.s_interrupt.map((item) => (
                      <ExtensionBlock
                        key={item.id}
                        data={item}
                        searchQuery={searchQuery}
                        colorClass="border-cyan-900/50 bg-cyan-950/20 text-cyan-100"
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <ServerCrash size={11} style={{ color: 'var(--riscv-text-3)' }} />
                    <h4 className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--riscv-text-3)' }}>Trap, Debug &amp; Hypervisor</h4>
                    <span className="text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>{extensions.s_trap.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {extensions.s_trap.map((item) => (
                      <ExtensionBlock
                        key={item.id}
                        data={item}
                        searchQuery={searchQuery}
                        colorClass="border-cyan-900/50 bg-cyan-950/20 text-cyan-100"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Sidebar ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-3 mt-6 lg:mt-0">
            <div
              className="sticky top-6 riscv-card backdrop-blur-sm min-h-[400px] max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            >
              <div className="p-4 pb-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--riscv-border)' }}>
                <Info size={14} style={{ color: 'var(--riscv-text-3)' }} />
                <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--riscv-text-3)' }}>Selected Details</h2>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-4 pt-3">
                {selectedExt ? (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="mb-6 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a
                          href={selectedExt.url || 'https://github.com/riscv/riscv-isa-manual'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1 font-black tracking-tight break-words hover:opacity-80"
                          style={{ fontSize: '1.5rem', lineHeight: 1.2, color: 'var(--riscv-gold)' }}
                          title="Open reference link"
                        >
                          <span>{selectedExt.name}</span>
                          <ArrowUpRight size={15} className="mt-1 shrink-0 opacity-70" />
                        </a>
                      </div>

                      {selectedExt.discontinued === 1 && (
                        <span className="shrink-0 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wide border bg-red-950/40 text-red-200 border-red-600/60">
                          Discontinued
                        </span>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--riscv-text-3)' }}>Description</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--riscv-text)' }}>{selectedExt.desc}</p>
                      </div>

                      <div className="riscv-card-2 p-3 rounded-lg">
                        <h4 className="text-[10px] uppercase tracking-widest font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--riscv-violet)' }}>
                          <ArrowRight size={10} /> Use Case
                        </h4>
                        <p className="text-sm italic" style={{ color: 'var(--riscv-text-2)' }}>{selectedExt.use}</p>
                      </div>

                      {/* Instruction list, when available */}
                      {searchMatches &&
                        searchMatches.extId === selectedExt.id &&
                        searchMatches.query === searchQuery.trim().toLowerCase() &&
                        searchMatches.mnemonics.length > 0 && (
                          <div className="bg-slate-900 p-3 rounded border border-slate-700">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[10px] uppercase tracking-wider text-yellow-300 font-bold mb-0.5">
                                  Search Hits ({searchMatches.mnemonics.length})
                                </div>
                                <div className="text-[11px] font-mono text-slate-200 truncate">
                                  {searchMatches.mnemonics[searchMatches.index] || ''}
                                  <span className="ml-2 text-slate-500">
                                    ({searchMatches.index + 1}/{searchMatches.mnemonics.length})
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[10px] font-mono text-slate-100 disabled:opacity-40"
                                  onClick={() => {
                                    setSearchMatches((current) => {
                                      if (!current || current.extId !== selectedExt.id) return current;
                                      const nextIndex =
                                        (current.index - 1 + current.mnemonics.length) % current.mnemonics.length;
                                      const mnemonic = current.mnemonics[nextIndex];
                                      selectInstructionByMnemonic(selectedExt, mnemonic);
                                      return { ...current, index: nextIndex };
                                    });
                                  }}
                                  disabled={searchMatches.mnemonics.length < 2}
                                >
                                  Prev
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[10px] font-mono text-slate-100 disabled:opacity-40"
                                  onClick={() => {
                                    setSearchMatches((current) => {
                                      if (!current || current.extId !== selectedExt.id) return current;
                                      const nextIndex = (current.index + 1) % current.mnemonics.length;
                                      const mnemonic = current.mnemonics[nextIndex];
                                      selectInstructionByMnemonic(selectedExt, mnemonic);
                                      return { ...current, index: nextIndex };
                                    });
                                  }}
                                  disabled={searchMatches.mnemonics.length < 2}
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      {Object.keys(selectedExt.instructions || {}).length > 0 && (
                        <div className="bg-slate-900 p-3 rounded border border-slate-700">
                          <h4 className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-2">
                            Instruction Set Snapshot ({Object.keys(selectedExt.instructions || {}).length})
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {Object.keys(selectedExt.instructions || {}).map((mnemonic) => {
                              const q = searchQuery.trim().toLowerCase();
                              const instructionDetails = selectedExt.instructions?.[mnemonic];
                              const isHit =
                                q.length &&
                                (mnemonic.toLowerCase().includes(q) ||
                                  instructionMatchesQuery(mnemonic, instructionDetails, q));
                              const isActive = selectedInstruction?.mnemonic === mnemonic;
                              const isClickable = Boolean(instructionDetails);
                              const isDeprecated = Boolean(instructionDetails?.deprecated);
                              return (
                                <button
                                  key={mnemonic}
                                  type="button"
                                  onClick={() => {
                                    if (!isClickable) return;
                                    setSelectedInstruction(
                                      isActive ? null : { mnemonic, ...instructionDetails }
                                    );
                                    setSearchMatches((current) => {
                                      if (
                                        !current ||
                                        current.extId !== selectedExt.id ||
                                        current.query !== searchQuery.trim().toLowerCase()
                                      ) {
                                        return current;
                                      }
                                      const idx = current.mnemonics.indexOf(mnemonic);
                                      if (idx === -1) return current;
                                      return { ...current, index: idx };
                                    });
                                  }}
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-mono tracking-tight ${isActive
                                    ? isDeprecated
                                      ? 'border-red-400 bg-red-500/10 text-red-200'
                                      : 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                                    : isHit
                                      ? 'border-yellow-400 bg-yellow-500/10 text-yellow-200'
                                      : isDeprecated
                                        ? 'border-red-500/60 bg-red-500/5 text-red-200'
                                        : 'border-slate-700 bg-slate-800/70'
                                    }`}
                                  title={
                                    isClickable
                                      ? `View details for ${mnemonic}`
                                      : `${mnemonic} (no details yet)`
                                  }
                                  disabled={!isClickable}
                                >
                                  {mnemonic}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {extensionCsrs[selectedExt.id] && (
                        <div className="bg-slate-900 p-3 rounded border border-slate-700">
                          <h4 className="text-[10px] uppercase tracking-wider text-sky-300 font-bold mb-2">
                            {(extensionCsrLabels[selectedExt.id] || 'CSRs')}{' '}
                            ({extensionCsrs[selectedExt.id].length})
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {extensionCsrs[selectedExt.id].map((csr) => (
                              <span
                                key={csr}
                                className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/70 text-[10px] font-mono text-slate-200"
                              >
                                {csr}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedInstruction && (
                        <div className="bg-slate-900 p-3 rounded border border-slate-700">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h4 className="text-[10px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1">
                              <ArrowRight size={10} /> Instruction Details
                            </h4>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[10px] font-mono text-slate-100 hover:border-slate-500"
                                onClick={async () => {
                                  const text = formatInstructionForClipboard(selectedExt, selectedInstruction);
                                  const ok = await copyTextToClipboard(text);
                                  setCopyStatus(ok ? 'copied' : 'failed');
                                  window.setTimeout(() => setCopyStatus(null), 1500);
                                }}
                                title="Copy extension + instruction details"
                              >
                                <Copy size={12} />
                                {copyStatus === 'copied'
                                  ? 'Copied'
                                  : copyStatus === 'failed'
                                    ? 'Copy failed'
                                    : 'Copy'}
                              </button>
                              <button
                                type="button"
                                className="text-[10px] font-mono text-slate-500 hover:text-slate-300"
                                onClick={() => setSelectedInstruction(null)}
                              >
                                Close
                              </button>
                            </div>
                          </div>

                          <div className="mb-3 flex items-start justify-between gap-2">
                            <div className="text-white font-black tracking-tight text-xl">
                              {selectedInstruction.mnemonic}
                            </div>
                            {selectedInstruction.deprecated && (
                              <span className="shrink-0 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wide border bg-red-950/40 text-red-200 border-red-600/60">
                                Discontinued
                              </span>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                Encoding
                              </div>
                              <EncodingDiagram encoding={selectedInstruction.encoding} />
                              <div className="mt-1 text-[10px] text-slate-500">
                                Fixed bits are <span className="font-mono">0/1</span>, variable bits are{' '}
                                <span className="font-mono">x</span>.
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                Variable Fields
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(selectedInstruction.variable_fields || []).map((field) => (
                                  <span
                                    key={field}
                                    className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/70 text-[10px] font-mono text-slate-200"
                                  >
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                  Match
                                </div>
                                <div
                                  className={`font-mono text-[11px] text-slate-100 bg-slate-800/70 border rounded px-2 py-1 ${searchQuery.trim().length &&
                                    String(selectedInstruction.match || '')
                                      .toLowerCase()
                                      .includes(searchQuery.trim().toLowerCase())
                                    ? 'border-yellow-400 bg-yellow-500/10'
                                    : 'border-slate-700'
                                    }`}
                                >
                                  {selectedInstruction.match}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                  Mask
                                </div>
                                <div
                                  className={`font-mono text-[11px] text-slate-100 bg-slate-800/70 border rounded px-2 py-1 ${searchQuery.trim().length &&
                                    String(selectedInstruction.mask || '')
                                      .toLowerCase()
                                      .includes(searchQuery.trim().toLowerCase())
                                    ? 'border-yellow-400 bg-yellow-500/10'
                                    : 'border-slate-700'
                                    }`}
                                >
                                  {selectedInstruction.mask}
                                </div>
                              </div>
                            </div>

                            {compressedMapping && (
                              <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
                                <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-2">
                                  Compressed Mapping
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Compressed
                                    </div>
                                    <div className="font-mono text-[11px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1">
                                      {compressedMapping.compressed}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Standard Equivalent
                                    </div>
                                    {hasStandardEquivalent ? (
                                      <button
                                        type="button"
                                        className="w-full text-left font-mono text-[11px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1 hover:border-cyan-400/60"
                                        onClick={() => selectStandardEquivalent(standardEquivalentMnemonic)}
                                        title="Open standard instruction details"
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          {compressedMapping.standard}
                                          <ArrowUpRight size={12} className="opacity-70" />
                                        </span>
                                      </button>
                                    ) : (
                                      <div className="font-mono text-[11px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1">
                                        {compressedMapping.standard}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Equivalent Instruction
                                    </div>
                                    {standardEquivalentMnemonic ? (
                                      hasStandardEquivalent ? (
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-200 hover:text-cyan-100 underline"
                                          onClick={() => selectStandardEquivalent(standardEquivalentMnemonic)}
                                          title="Open standard instruction details"
                                        >
                                          {standardEquivalentMnemonic}
                                          <ArrowUpRight size={12} className="opacity-70" />
                                        </button>
                                      ) : (
                                        <div className="text-[11px] text-slate-500 font-mono">
                                          {standardEquivalentMnemonic}
                                        </div>
                                      )
                                    ) : (
                                      <div className="text-[11px] text-slate-500">Unavailable</div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Description
                                    </div>
                                    <div className="text-[11px] text-slate-200">{compressedMapping.description}</div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {compressedEquivalents.length > 0 && (
                              <div className="rounded border border-slate-700 bg-slate-950/40 p-3">
                                <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold mb-2">
                                  Compressed Equivalents
                                </div>
                                <div className="space-y-2">
                                  {compressedEquivalents.map((entry) => (
                                    <button
                                      key={entry.mnemonic}
                                      type="button"
                                      className="w-full text-left rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 hover:border-emerald-400/60"
                                      onClick={() => selectCompressedEquivalent(entry.mnemonic)}
                                      title={`Open ${entry.mnemonic} details`}
                                    >
                                      <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-200">
                                        {normalizeMnemonicKey(entry.mnemonic)}
                                        <ArrowUpRight size={12} className="opacity-70" />
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400">{entry.compressed}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                          </div>
                        </div>
                      )}

                      {activeProfile && (
                        <div
                          className={`
                      mt-4 p-3 rounded text-xs flex items-center gap-2 border
                      ${isHighlighted(selectedExt.id)
                              ? 'bg-yellow-900/20 border-yellow-700/30 text-yellow-200'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                            }
                    `}
                        >
                          {isHighlighted(selectedExt.id) ? (
                            <>
                              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                              Required in <strong>{activeProfile}</strong>
                            </>
                          ) : (
                            <>
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                              Not required in {activeProfile}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-center space-y-3" style={{ color: 'var(--riscv-text-3)' }}>
                    <div className="p-4 rounded-full" style={{ background: 'var(--riscv-surface-2)', border: '1px solid var(--riscv-border-2)' }}>
                      <CircuitBoard size={28} style={{ color: 'var(--riscv-muted)' }} />
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--riscv-text-2)' }}>No Extension Selected</p>
                      <p className="text-[11px] max-w-[160px] mx-auto" style={{ color: 'var(--riscv-text-3)' }}>
                        Click any tile to explore specifications, encodings &amp; profiles.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <footer
          className="mt-10 pb-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]"
          style={{ borderTop: '1px solid var(--riscv-border)', paddingTop: '1.5rem', color: 'var(--riscv-text-3)' }}
        >
          <div className="flex items-center gap-2">
            <CircuitBoard size={14} style={{ color: 'var(--riscv-gold)' }} />
            <span className="font-semibold" style={{ color: 'var(--riscv-text-2)' }}>RISC-V Extension Landscape</span>
            <span style={{ color: 'var(--riscv-border-2)' }}>·</span>
            <span>Data sourced from <a href="https://github.com/riscv/riscv-isa-manual" target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--riscv-violet)' }}>riscv/riscv-isa-manual</a></span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/riscv/riscv-isa-manual"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
              style={{ color: 'var(--riscv-text-2)' }}
              title="View on GitHub"
            >
              <BookOpen size={14} />
            </a>
          </div>
        </footer>
      </div>

      {encoderValidatorOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(7,7,14,0.85)', backdropFilter: 'blur(4px)' }}
            onClick={() => setEncoderValidatorOpen(false)}
            role="presentation"
          />

          <div className="absolute inset-0 p-3 md:p-8 flex items-start justify-center overflow-y-auto">
            <div className="animate-scale-in w-full max-w-3xl riscv-card overflow-hidden" style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,124,248,0.15)' }}>
              <div className="p-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--riscv-border)' }}>
                <div className="min-w-0">
                  <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--riscv-text)', fontSize: '14px' }}>
                    <ScanSearch size={15} style={{ color: 'var(--riscv-violet)' }} />
                    <span>Encoder Validator</span>
                  </h3>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--riscv-text-3)' }}>
                    Enter a 32-bit encoding (0/1/-) or Match+Mask (hex). Detects overlaps against the full ISA database.
                  </p>
                </div>

                <button
                  type="button"
                  className="riscv-btn p-1.5"
                  onClick={() => setEncoderValidatorOpen(false)}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--riscv-text-3)' }}>Proposed Mnemonic <span style={{ fontWeight: 400 }}>(optional)</span></div>
                    <input
                      type="text"
                      value={encoderValidatorInput.mnemonic}
                      onChange={(e) =>
                        setEncoderValidatorInput((prev) => ({ ...prev, mnemonic: e.target.value }))
                      }
                      placeholder="e.g. MYOP"
                      className="riscv-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--riscv-text-3)' }}>Encoding <span style={{ fontWeight: 400 }}>(required if no match/mask)</span></div>
                    <input
                      type="text"
                      value={encoderValidatorInput.encoding}
                      onChange={(e) =>
                        setEncoderValidatorInput((prev) => ({ ...prev, encoding: e.target.value }))
                      }
                      placeholder="-----------------000-----1100111"
                      className="riscv-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--riscv-text-3)' }}>Match (hex)</div>
                      <input
                        type="text"
                        value={encoderValidatorInput.match}
                        onChange={(e) =>
                          setEncoderValidatorInput((prev) => ({ ...prev, match: e.target.value }))
                        }
                        placeholder="0x67"
                        className="riscv-input w-full px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--riscv-text-3)' }}>Mask (hex)</div>
                      <input
                        type="text"
                        value={encoderValidatorInput.mask}
                        onChange={(e) =>
                          setEncoderValidatorInput((prev) => ({ ...prev, mask: e.target.value }))
                        }
                        placeholder="0x707f"
                        className="riscv-input w-full px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={runEncoderValidation}
                      className="riscv-btn riscv-btn-violet inline-flex items-center gap-2 px-4 py-2 text-[11px]"
                    >
                      <ScanSearch size={14} />
                      Validate
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEncoderValidatorInput({ mnemonic: '', encoding: '', match: '', mask: '' });
                        setEncoderValidatorResult(null);
                        setEncoderValidatorCopyStatus(null);
                      }}
                      className="riscv-btn px-3 py-2 text-[11px]"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--riscv-text-3)' }}>Results</div>
                    <button
                      type="button"
                      disabled={!encoderValidatorResult?.proposed}
                      onClick={async () => {
                        if (!encoderValidatorResult?.proposed) return;
                        const report = formatEncoderValidatorReport(
                          encoderValidatorResult.proposed,
                          encoderValidatorResult
                        );
                        const ok = await copyTextToClipboard(report);
                        setEncoderValidatorCopyStatus(ok ? 'copied' : 'failed');
                        window.setTimeout(() => setEncoderValidatorCopyStatus(null), 1500);
                      }}
                      className="riscv-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-30"
                      title="Copy validation report"
                    >
                      <Copy size={12} />
                      {encoderValidatorCopyStatus === 'copied'
                        ? 'Copied!'
                        : encoderValidatorCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy report'}
                    </button>
                  </div>

                  {!encoderValidatorResult ? (
                    <div
                      className="text-[11px] rounded-lg p-3"
                      style={{ background: 'var(--riscv-surface-2)', border: '1px solid var(--riscv-border-2)', color: 'var(--riscv-text-3)' }}
                    >
                      Enter a proposed encoding and click Validate.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {encoderValidatorResult.errors.length > 0 && (
                        <div className="border border-red-800/40 bg-red-950/30 rounded p-3">
                          <div className="text-[10px] uppercase tracking-wider text-red-200 font-bold mb-2">
                            Errors
                          </div>
                          <ul className="text-xs text-red-100 space-y-1 list-disc pl-4">
                            {encoderValidatorResult.errors.map((err) => (
                              <li key={err}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {encoderValidatorResult.proposed && (
                        <div className="border border-slate-700 rounded p-3 bg-slate-800/50">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                            Normalized Proposal
                          </div>
                          <div className="space-y-2">
                            <div className="font-mono text-[11px] text-slate-200 break-all">
                              Encoding: {encoderValidatorResult.proposed.encoding}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="font-mono text-[11px] text-slate-200">Match: {encoderValidatorResult.proposed.match}</div>
                              <div className="font-mono text-[11px] text-slate-200">Mask: {encoderValidatorResult.proposed.mask}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {encoderValidatorResult.proposed && (
                        <div className="rounded-lg p-3" style={{ border: '1px solid var(--riscv-border-2)', background: 'var(--riscv-surface-2)' }}>
                          <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--riscv-text-3)' }}>Conflicts ({encoderValidatorResult.conflicts.length})</div>
                          {encoderValidatorResult.conflicts.length === 0 ? (
                            <div className="conflict-none rounded-lg p-3 flex items-center gap-2 border">
                              <CheckCircle2 size={15} style={{ color: 'var(--riscv-success)', flexShrink: 0 }} />
                              <span className="text-[12px] font-medium" style={{ color: 'var(--riscv-success)' }}>No overlaps found in ISA database — safe to use.</span>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[340px] overflow-y-auto overscroll-contain pr-1">
                              {encoderValidatorResult.conflicts.map((conflict) => {
                                const severityCls =
                                  conflict.type === 'identical' ? 'conflict-identical' :
                                    conflict.type === 'proposed_subset_of_existing' ? 'conflict-subset-in' :
                                      conflict.type === 'existing_subset_of_proposed' ? 'conflict-subset-out' :
                                        'conflict-partial';
                                const SeverityIcon =
                                  conflict.type === 'identical' ? XCircle :
                                    conflict.type === 'partial_overlap' ? AlertCircle : AlertTriangle;
                                return (
                                  <div
                                    key={`${conflict.other.extId}:${conflict.other.mnemonic}:${conflict.type}`}
                                    className={`rounded-lg p-2.5 border ${severityCls}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex items-start gap-1.5">
                                        <SeverityIcon size={13} className="mt-0.5 shrink-0 opacity-80" />
                                        <div>
                                          <div className="font-mono text-[11px] font-medium break-words" style={{ color: 'var(--riscv-text)' }}>
                                            {conflict.other.mnemonic}{' '}
                                            <span style={{ color: 'var(--riscv-text-3)' }}>({conflict.other.extId})</span>
                                          </div>
                                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--riscv-text-3)' }}>{conflict.other.extName}</div>
                                        </div>
                                      </div>
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border"
                                        style={{ background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                                      >
                                        {conflict.type.replace(/_/g, ' ')}
                                      </span>
                                    </div>

                                    <div className="mt-1.5 text-[11px]" style={{ color: 'var(--riscv-text-2)' }}>{conflict.why}</div>
                                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                                      <div className="font-mono text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>mask: {conflict.commonMask}</div>
                                      <div className="font-mono text-[10px]" style={{ color: 'var(--riscv-text-3)' }}>example: {conflict.exampleWord}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ISA Workspace Panel ────────────────────────────────────────── */}
      <WorkspacePanel
        open={workspacePanelOpen}
        onClose={() => setWorkspacePanelOpen(false)}
        workspaceIds={workspaceIds}
        lockedExtensions={lockedExtensions}
        allExts={allExtsList}
        onAddId={(id) => addWorkspaceIdsSmart(id)}
        onRemoveId={(id) =>
          setWorkspaceIds((prev) => {
            const next = new Set(prev);
            // Lock check inside panel removal as well
            const currentLocked = new Map();
            for (const ext of Array.from(prev)) {
              const deps = SMART_DEPENDENCIES[ext] || [];
              for (const dep of deps) {
                if (prev.has(dep)) {
                  if (!currentLocked.has(dep)) currentLocked.set(dep, []);
                  currentLocked.get(dep).push(ext);
                }
              }
            }
            if (currentLocked.has(id)) {
              setWorkspaceNotice(`Cannot remove ${id}: required by ${currentLocked.get(id).join(', ')}`);
              setTimeout(() => setWorkspaceNotice(null), 4500);
              return next;
            }
            next.delete(id);
            return next;
          })
        }
        onClear={() => setWorkspaceIds(new Set())}
        onLoadIds={(ids) => {
          setWorkspaceIds(new Set()); // clear
          addWorkspaceIdsSmart(ids);  // smartly add all
        }}
        onSelectInstruction={({ extId, mnemonic, encoding, variable_fields, match, mask }) => {
          // Navigate the main view to the specified extension + instruction
          const targetExt = allExtsList.find((e) => e.id === extId);
          if (targetExt) {
            setSelectedExt(targetExt);
            setSelectedInstruction({ mnemonic, encoding, variable_fields, match, mask });
            setWorkspacePanelOpen(false); // close panel to reveal main view
            // Scroll tile into view
            requestAnimationFrame(() => {
              const el = document.getElementById(`ext-${extId}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }
        }}
      />

      {/* ── Workspace Notices Toast ── */}
      <div
        style={{
          position: 'fixed',
          bottom: workspaceNotice ? '32px' : '-100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--riscv-surface-2)',
          border: '1px solid var(--riscv-border-2)',
          color: 'var(--riscv-text)',
          padding: '10px 16px',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          opacity: workspaceNotice ? 1 : 0,
          pointerEvents: workspaceNotice ? 'auto' : 'none',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Info size={16} style={{ color: '#6366f1' }} />
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{workspaceNotice}</span>
      </div>
    </div>
  );
};

export default RISCVExplorer;
