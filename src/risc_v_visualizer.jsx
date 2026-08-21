import React, { useState } from 'react';
import {
  Info,
  ScanSearch,
  X,
  ArrowRight,
  ArrowUpRight,
  Copy,
  Grid3x3,
  Link2,
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
  Trash2,
  Download,
  Maximize2,
  Sun,
  Moon,
} from 'lucide-react';
import extensions from './riscv_extensions.json';
import EncodingMap from './EncodingMap.jsx';
import WorkspacePanel from './WorkspacePanel.jsx';
import ExtensionTile from './ExtensionTile.jsx';
// INCOMPATIBLE_WITH is no longer imported here: conflicts now come back from
// resolveSelection(), which checks them over the resolved closure rather than
// only over what the user clicked.
import {
  BASE_ISA_IDS,
  SMART_DEPENDENCIES,
  buildMarchString,
  buildCombinedCatalog,
} from './marchUtils.js';
import { resolveSelection } from './isaGraph.js';
import { PROFILES } from './profiles.js';
import { buildIsaConfigYaml } from './exportUtils.js';

// Ids the catalog can actually render. The dependency graph carries a few nodes
// the catalog does not (UDB's S requires Sm, for which we have no entry), and
// adding one of those to the workspace would show a row with nothing behind it.
const CATALOG_IDS = new Set(
  Object.values(extensions)
    .flat()
    .filter(Boolean)
    .map((e) => e.id),
);

const BIT_WIDTH = 32n;
const BIT_MASK_32 = (1n << BIT_WIDTH) - 1n;

/* ─── Permalinks ────────────────────────────────────────────────────────────
 * A link to a specific extension, so the tool can be cited in a discussion or
 * a spec review rather than described. Originally proposed in #94 by
 * @Veekshitha11; that branch could not be rebased, so this reimplements it.
 *
 * A query parameter rather than a path, deliberately. The site is served as
 * static files from GitHub Pages with no router, so /extensions/Zba would 404
 * on a hard refresh unless the host were configured to fall back to
 * index.html. ?ext=Zba needs no server cooperation at all.
 */
const PERMALINK_PARAM = 'ext';

const allExtensionsFlat = Object.values(extensions).flat().filter(Boolean);

const findExtensionById = (id) => {
  const wanted = String(id ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) return null;
  // Case-insensitive: people type ?ext=zba as readily as ?ext=Zba.
  return allExtensionsFlat.find((ext) => ext.id.toLowerCase() === wanted) ?? null;
};

const extensionFromUrl = () => {
  if (typeof window === 'undefined') return null;
  return findExtensionById(new URLSearchParams(window.location.search).get(PERMALINK_PARAM));
};

const permalinkFor = (extId) => {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set(PERMALINK_PARAM, extId);
  url.hash = '';
  return url.toString();
};

const normalizeMnemonicKey = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .split(/\s+/)[0];

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
    notes: 'Operands restricted to x8-x15.',
  },
  {
    mnemonic: 'C.OR',
    compressed: "C.OR rd', rs2'",
    standard: "or rd', rd', rs2'",
    description: 'OR Register',
    notes: 'Operands restricted to x8-x15.',
  },
  {
    mnemonic: 'C.XOR',
    compressed: "C.XOR rd', rs2'",
    standard: "xor rd', rd', rs2'",
    description: 'XOR Register',
    notes: 'Operands restricted to x8-x15.',
  },
  {
    mnemonic: 'C.SUB',
    compressed: "C.SUB rd', rs2'",
    standard: "sub rd', rd', rs2'",
    description: 'Subtract Register',
    notes: 'Operands restricted to x8-x15.',
  },
  {
    mnemonic: 'C.SUBW',
    compressed: "C.SUBW rd', rs2'",
    standard: "subw rd', rd', rs2'",
    description: 'Subtract Word',
    notes: 'RV64/128 Only. Operands restricted to x8-x15.',
  },
  {
    mnemonic: 'C.ADDW',
    compressed: "C.ADDW rd', rs2'",
    standard: "addw rd', rd', rs2'",
    description: 'Add Word',
    notes: 'RV64/128 Only. Operands restricted to x8-x15.',
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
    return {
      match: null,
      mask: null,
      error: `Encoding must be 32 characters (got ${normalized.length}).`,
    };
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
  const commonMask = aMask & bMask & BIT_MASK_32;
  const diff = (aMatch ^ bMatch) & commonMask & BIT_MASK_32;
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
      <div
        className="font-mono text-[12px] bg-[var(--riscv-surface-2)] border border-[var(--riscv-border-2)] rounded px-2 py-1 break-all"
        style={{ color: 'var(--riscv-text-2)' }}
      >
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
        <div
          className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--riscv-text-3)' }}
        >
          <Binary size={11} />
          <span>Bit Fields</span>
          {canScroll && (
            <span
              className="inline-flex items-center gap-1 normal-case tracking-normal"
              style={{ color: 'var(--riscv-gold)' }}
            >
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
            data-tooltip="Scroll left"
            aria-label="Scroll left"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            className="riscv-btn p-1 disabled:opacity-30"
            onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            disabled={!canScroll || atRight}
            data-tooltip="Scroll right"
            aria-label="Scroll right"
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
                    'h-7 flex items-center justify-center font-mono text-[12px] font-medium border-r',
                    fieldCls,
                    i === 31 ? 'border-r-0' : isGroupEnd ? 'border-r-2' : '',
                  ].join(' ')}
                  data-tooltip={`bit[${31 - i}] — ${fieldName}`}
                >
                  {value}
                </div>
              );
            })}
          </div>

          {/* Bit number labels */}
          <div
            className="mt-1 flex justify-between text-[10px] font-mono px-0.5"
            style={{ color: 'var(--riscv-text-3)' }}
          >
            <span>31</span>
            <span>0</span>
          </div>

          {/* Field legend row */}
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {FIELD_LABELS.map(({ name, cls }) => (
              <span
                key={name}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${cls}`}
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
          data-tooltip="Click to scroll"
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

const extensionCsrLabels = {
  S: 'Supervisor CSRs',
  U: 'User CSRs',
};

const RISCVExplorer = () => {
  const [activeProfile, setActiveProfile] = useState(null);
  const [activeVolume, setActiveVolume] = useState(null);
  // Lazy initialiser, so ?ext=Zba is honoured on first paint rather than
  // selecting nothing and then correcting itself.
  const [selectedExt, setSelectedExt] = useState(extensionFromUrl);
  const [permalinkCopied, setPermalinkCopied] = useState(false);
  const [selectedInstruction, setSelectedInstruction] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState(null);
  const [encoderValidatorOpen, setEncoderValidatorOpen] = useState(false);
  const [encodingMapOpen, setEncodingMapOpen] = useState(false);
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
  const toastTimerRef = React.useRef(null);
  const showToast = React.useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setWorkspaceNotice(msg);
    toastTimerRef.current = setTimeout(() => setWorkspaceNotice(null), 3500);
  }, []);
  // Builder mode. The per-tile "+" affordances only exist while this is on.
  // Previously they were always rendered, in a low-contrast grey, with nothing
  // explaining what they did — a permanent control for a mode the user had not
  // asked to be in. Turning the builder on is now a deliberate act.
  // Theme. Defaults to whatever the OS asks for, then remembers the choice.
  // Applied to documentElement rather than a wrapper so the CSS variables
  // cascade to everything, including the fixed-position panel.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem('riscv-landscape-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* storage unavailable — fall through to the system preference */
    }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('riscv-landscape-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const [builderMode, setBuilderMode] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
    setWorkspaceIds((prev) => {
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
            setWorkspaceNotice(
              `Cannot remove ${id}: required by ${currentLocked.get(id).join(', ')}`,
            );
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
        setWorkspaceNotice(
          `Architecturally Invalid: ${c.with} is incompatible with ${c.ext}${via}`,
        );
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
  const allExtsList = React.useMemo(() => Object.values(extensions).flat().filter(Boolean), []);

  const workspaceTotalInstr = React.useMemo(() => {
    if (workspaceIds.size === 0) return 0;
    return buildCombinedCatalog(Array.from(workspaceIds), allExtsList).length;
  }, [workspaceIds, allExtsList]);

  React.useEffect(() => {
    setQuickExportIncludeInstr(workspaceTotalInstr <= 100);
  }, [workspaceTotalInstr]);
  // --------------------------------------------------------------------------
  const lastScrolledKeyRef = React.useRef(null);
  // Whether the open Selected Details panel was opened by the search rather than
  // by a click. Only a search-driven selection may be cleared when the query
  // stops matching; a deliberate click must survive.
  const searchDrivenSelectionRef = React.useRef(false);
  // Encoder Validator dialog: the panel itself, and the control that opened it,
  // so focus can be handed back on close.
  const encoderDialogRef = React.useRef(null);
  const encoderTriggerRef = React.useRef(null);

  // "Copied" badges reset themselves on a timer. Holding the handles lets a
  // second copy replace the first rather than race it, and lets unmount cancel
  // a pending reset instead of leaving it to fire into a dead component.
  const copyStatusTimerRef = React.useRef(null);
  const encoderCopyTimerRef = React.useRef(null);
  // Pending auto-scroll from the search effect, so a later keystroke can cancel
  // one that has not fired yet.
  const scrollTimerRef = React.useRef(null);
  const permalinkTimerRef = React.useRef(null);

  React.useEffect(
    () => () => {
      if (copyStatusTimerRef.current) window.clearTimeout(copyStatusTimerRef.current);
      if (encoderCopyTimerRef.current) window.clearTimeout(encoderCopyTimerRef.current);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      if (permalinkTimerRef.current) window.clearTimeout(permalinkTimerRef.current);
    },
    [],
  );
  const searchInputRef = React.useRef(null);

  // Encoder Validator dialog keyboard behaviour.
  //
  // A dialog that can only be dismissed with the mouse is a trap for anyone
  // navigating by keyboard, and without a focus trap Tab walks out of the modal
  // and onto the 227 tiles behind it while the backdrop still blocks the mouse.
  React.useEffect(() => {
    if (!encoderValidatorOpen) return undefined;

    // Prefer the trigger element itself over document.activeElement: a mouse
    // click does not focus a button in every browser, so activeElement can be
    // <body> here and focus would be dropped on the floor when the dialog closes.
    const opener = document.activeElement;
    const fallbackOpener =
      opener instanceof HTMLElement && opener !== document.body ? opener : null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = () => {
      const root = encoderDialogRef.current;
      if (!root) return [];
      return [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );
    };

    // Start inside the dialog, on the first field rather than the close button.
    const first = focusable();
    (first.find((el) => el.tagName === 'INPUT') ?? first[0])?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEncoderValidatorOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back in if it has escaped already.
      if (e.shiftKey && (active === firstEl || !encoderDialogRef.current?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (
        !e.shiftKey &&
        (active === lastEl || !encoderDialogRef.current?.contains(active))
      ) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Hand focus back to the trigger, so keyboard users resume where they left
      // off instead of at the top of the document.
      (encoderTriggerRef.current ?? fallbackOpener)?.focus?.();
    };
  }, [encoderValidatorOpen]);

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

  // Profile definitions live in ./profiles.js so scripts and tests can reach
  // them; see that file for why.
  const profiles = PROFILES;

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------
  const volumeMembership = React.useMemo(() => {
    const allIds = new Set(
      Object.values(extensions)
        .flat()
        .filter(Boolean)
        .map((ext) => ext.id),
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
    const needle = String(q || '')
      .trim()
      .toLowerCase();
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
    [instructionIndex, selectedExt],
  );

  const selectStandardEquivalent = React.useCallback(
    (mnemonic) => selectInstructionByMnemonicKey(mnemonic, STANDARD_EQUIVALENT_PRIORITY),
    [selectInstructionByMnemonicKey],
  );

  const selectCompressedEquivalent = React.useCallback(
    (mnemonic) => selectInstructionByMnemonicKey(mnemonic, ['C']),
    [selectInstructionByMnemonicKey],
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
    ? (COMPRESSED_BY_STANDARD[normalizeMnemonicKey(selectedInstruction.mnemonic)] || []).filter(
        (entry) => instructionIndex.has(normalizeMnemonicKey(entry.mnemonic)),
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

      // Reject oversized input before anything truncates it. Everything below
      // masks with BIT_MASK_32, so 0x11800202f silently became 0x1800202f and
      // reported a conflict against SC.W that the user never typed. The check
      // lives here rather than in parseHexToBigInt because that helper also
      // parses catalogue match/mask values, which are trusted and already 32-bit.
      if (matchParsed != null && matchParsed > BIT_MASK_32) {
        errors.push('Match exceeds 32 bits.');
      }
      if (maskParsed != null && maskParsed > BIT_MASK_32) {
        errors.push('Mask exceeds 32 bits.');
      }

      if (
        matchParsed != null &&
        maskParsed != null &&
        matchParsed <= BIT_MASK_32 &&
        maskParsed <= BIT_MASK_32
      ) {
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
      encoding:
        normalizeEncodingString(normalizedEncoding) || matchMaskToEncoding(matchNorm, maskNorm),
      match: toHex32(matchNorm),
      mask: toHex32(maskNorm),
      matchValue: matchNorm,
      maskValue: maskNorm,
    };

    const conflicts = [];
    for (const other of allInstructionPatterns) {
      const overlaps = patternsOverlap(matchNorm, maskNorm, other.match, other.mask);
      if (!overlaps) continue;

      const commonMask = maskNorm & other.mask & BIT_MASK_32;
      const type =
        matchNorm === other.match && maskNorm === other.mask
          ? 'identical'
          : isSubsetPattern(matchNorm, maskNorm, other.match, other.mask)
            ? 'proposed_subset_of_existing'
            : isSubsetPattern(other.match, other.mask, matchNorm, maskNorm)
              ? 'existing_subset_of_proposed'
              : 'partial_overlap';

      let why =
        'Overlapping decode space (there exist instruction words that satisfy both patterns).';
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

  const isHighlightedByProfile = React.useCallback(
    (id) => {
      if (!activeProfile) return false;
      return profiles[activeProfile].includes(id);
    },
    [activeProfile],
  );

  const isHighlightedByVolume = React.useCallback(
    (id) => {
      if (!activeVolume) return false;
      return volumeMembership[activeVolume]?.has(id) ?? false;
    },
    [activeVolume, volumeMembership],
  );

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
      // CSRs now come from the catalogue entry, populated from
      // riscv-unified-db, rather than a hand-written table covering S and U.
      // Names and descriptions are both indexed, so 'mstatus' and 'machine
      // status' both find their extension.
      if (ext.csrs && typeof ext.csrs === 'object') {
        const names = Object.keys(ext.csrs);
        if (names.length) {
          parts.push(names.join(' '));
          parts.push(
            names
              .map((n) => ext.csrs[n]?.desc)
              .filter(Boolean)
              .join(' '),
          );
        }
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

  // Stable identities on purpose: these ride in tileProps, and a fresh function
  // each render would make every tile re-render even when nothing it shows moved.
  const isHighlighted = React.useCallback(
    (id) => isHighlightedByProfile(id) || isHighlightedByVolume(id),
    [isHighlightedByProfile, isHighlightedByVolume],
  );

  // Dim whatever the active filter excludes. The two filters are mutually
  // exclusive (selecting one clears the other), so at most one branch applies.
  // This used to return false as soon as a volume was set, which meant picking
  // a volume while a profile was active un-dimmed the entire grid while both
  // filters still highlighted, and nothing showed which one was responsible.
  const isDimmed = React.useCallback(
    (id) => {
      if (activeVolume) return !(volumeMembership[activeVolume]?.has(id) ?? false);
      if (activeProfile) return !profiles[activeProfile].includes(id);
      return false;
    },
    [activeVolume, activeProfile, volumeMembership],
  );

  // The tile lives in ./ExtensionTile.jsx. It used to be defined here, inside
  // the render body, which meant a new component type on every render and a
  // full unmount/remount of all 227 tiles for every click and keystroke.
  //
  // These props are memoised so the tile's comparator can do its job: stable
  // identities for everything shared, and the tile itself asks only whether ITS
  // own id changed membership.
  // Keep the address bar in step with the selection, so copying the URL from
  // the browser works without touching the Share button, and a reload or a
  // bookmark returns to the same extension.
  //
  // replaceState rather than pushState on purpose: clicking through twenty
  // tiles should not bury the previous page under twenty history entries that
  // Back has to walk through one at a time.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get(PERMALINK_PARAM);
    const next = selectedExt?.id ?? null;
    if (current === next) return;
    if (next) url.searchParams.set(PERMALINK_PARAM, next);
    else url.searchParams.delete(PERMALINK_PARAM);
    window.history.replaceState(null, '', url.toString());
  }, [selectedExt]);

  // A fresh selection invalidates the "Copied" confirmation.
  React.useEffect(() => {
    setPermalinkCopied(false);
  }, [selectedExt]);

  const copyPermalink = React.useCallback(async () => {
    if (!selectedExt) return;
    const ok = await copyTextToClipboard(permalinkFor(selectedExt.id));
    setPermalinkCopied(ok);
    if (ok) showToast(`Link to ${selectedExt.id} copied`);
    if (permalinkTimerRef.current) window.clearTimeout(permalinkTimerRef.current);
    permalinkTimerRef.current = window.setTimeout(() => {
      permalinkTimerRef.current = null;
      setPermalinkCopied(false);
    }, 1500);
  }, [selectedExt, copyTextToClipboard, showToast]);

  const handleSelectExt = React.useCallback((data) => {
    // A deliberate click owns the panel from here on, so a later non-matching
    // query must not clear it out from under the user.
    searchDrivenSelectionRef.current = false;
    setSelectedExt((current) => {
      const next = current?.id === data.id ? null : data;
      setSelectedInstruction(null);
      setSearchMatches(null);
      return next;
    });
  }, []);

  const handleToggleWorkspace = React.useCallback(
    (id) => {
      addWorkspaceIdsSmart(id, true);
    },
    [addWorkspaceIdsSmart],
  );

  // Setting a VLEN floor is not the same as adding an extension. The Zvl*b
  // chain is nested — Zvl1024b already implies Zvl128b — so clicking a lower
  // value while a higher one is selected has to REMOVE the higher ones, or
  // nothing visible happens. That was the original bug: the button only added,
  // so lowering VLEN silently did nothing.
  //
  // Passing null clears the floor entirely.
  //
  // The result is re-resolved afterwards, so anything genuinely required puts
  // itself back: asking for 32 while Zve64x is selected leaves you at 64,
  // because Zve64x requires Zvl64b. The panel then shows the real floor rather
  // than the one that was asked for.
  const handleSetVlen = React.useCallback((bits) => {
    const WIDTHS = [32, 64, 128, 256, 512, 1024];
    setWorkspaceIds((prev) => {
      const desired = new Set(prev);
      for (const w of WIDTHS) {
        if (bits === null || w > bits) desired.delete(`Zvl${w}b`);
      }
      if (bits !== null) desired.add(`Zvl${bits}b`);

      const base = [...desired].find((x) => BASE_ISA_IDS.has(x)) ?? null;
      const { resolved } = resolveSelection({ selected: [...desired], base });
      return new Set(resolved.filter((id) => CATALOG_IDS.has(id)));
    });
  }, []);

  const tileProps = React.useMemo(
    () => ({
      searchQuery,
      selectedExtId: selectedExt?.id ?? null,
      workspaceIds,
      lockedExtensions,
      builderMode,
      isHighlighted,
      isDimmed,
      onSelect: handleSelectExt,
      onToggleWorkspace: handleToggleWorkspace,
    }),
    [
      searchQuery,
      selectedExt,
      workspaceIds,
      lockedExtensions,
      builderMode,
      isHighlighted,
      isDimmed,
      handleSelectExt,
      handleToggleWorkspace,
    ],
  );

  // Calculate if search has any matching extensions
  const hasSearchMatches = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return allExtsList.some((ext) => {
      const indexStr = extensionSearchIndexById.get(ext.id) || '';
      return indexStr.includes(q);
    });
  }, [searchQuery, allExtsList, extensionSearchIndexById]);

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
        allExts.find((ext) => (extensionSearchIndexById.get(ext.id) || '').includes(q)) || null;
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
      searchDrivenSelectionRef.current = true;
      setSelectedExt(targetExt);
      setSearchMatches(
        hits.length ? { extId: targetExt.id, query: q, mnemonics: hits, index: 0 } : null,
      );
      setSelectedInstruction(
        matchedMnemonic && matchedDetails ? { mnemonic: matchedMnemonic, ...matchedDetails } : null,
      );

      const key = targetExt.id;

      // Auto-scroll is deferred; matching, highlighting and the details panel
      // are not. Otherwise typing fires one smooth scroll per keystroke and
      // each new one interrupts the last: "zicboz" chased B, C, Ziccrse,
      // Zicbom and Zicboz in turn, and "addi" scrolled four times for only two
      // distinct targets. Debouncing the whole search instead, as the issue
      // originally proposed, would have delayed the highlight as well, trading
      // visible jank for visible lag. This settles on the final target once
      // typing pauses and leaves every other response immediate.
      //
      // The key is the extension id alone. It used to include the query, so a
      // target that had not actually moved was scrolled to again on every
      // keystroke.
      if (lastScrolledKeyRef.current !== key) {
        if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = window.setTimeout(() => {
          scrollTimerRef.current = null;
          document
            .getElementById(`ext-${targetExt.id}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          lastScrolledKeyRef.current = key;
        }, 180);
      }
    } else if (searchDrivenSelectionRef.current) {
      // The query is non-empty and matched nothing. Without this branch the
      // panel kept showing whatever the previous query opened, which read as
      // though the new query had matched it. Only clear what the search itself
      // opened; a clicked selection is left alone.
      searchDrivenSelectionRef.current = false;
      lastScrolledKeyRef.current = null;
      setSelectedExt(null);
      setSelectedInstruction(null);
      setSearchMatches(null);
    }
  }, [searchQuery, extensionSearchIndexById]);

  // Compute stat bar numbers from loaded JSON
  const totalExtensions = React.useMemo(
    () => Object.values(extensions).flat().filter(Boolean).length,
    [],
  );
  const totalInstructions = React.useMemo(() => {
    let c = 0;
    for (const ext of Object.values(extensions).flat().filter(Boolean)) {
      c += Object.keys(ext.instructions || {}).length;
    }
    return c;
  }, []);

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: 'var(--riscv-bg)', color: 'var(--riscv-text)' }}
    >
      {/* Gradient top border */}
      <div className="riscv-top-border" />
      <div className="px-3 md:px-6 py-4 md:py-6 max-w-[1700px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── Header ───────────────────────────────────────────────────── */}
          <div
            className="lg:col-span-12 pb-5 mb-2"
            style={{ borderBottom: '1px solid var(--riscv-border)' }}
          >
            {/* Title row */}
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <CircuitBoard size={22} style={{ color: 'var(--riscv-gold)' }} />
                  <h1
                    className="text-2xl md:text-3xl font-black tracking-tight"
                    style={{
                      background:
                        'linear-gradient(90deg, var(--riscv-title-a) 0%, var(--riscv-title-b) 50%, var(--riscv-title-a) 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    RISC-V Extension Landscape
                  </h1>
                </div>
                {/* nowrap only once there is room for it: on a phone it pushed the
                    line past the viewport, and the root clips overflow. */}
                <p
                  className="text-xs ml-9 sm:whitespace-nowrap"
                  style={{ color: 'var(--riscv-text-2)' }}
                >
                  Reference for extensions, profiles &amp; per-instruction encoding.
                </p>
                {/* Stat bar */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 ml-9">
                  {[
                    { label: 'Extensions', value: totalExtensions },
                    { label: 'Profiles', value: Object.keys(profiles).length },
                    { label: 'Instructions', value: `${(totalInstructions / 1000).toFixed(1)}k+` },
                    { label: 'Volumes', value: 2 },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-baseline gap-1.5">
                      <span className="text-base font-black" style={{ color: 'var(--riscv-gold)' }}>
                        {value}
                      </span>
                      <span
                        className="text-[11px] uppercase tracking-wider"
                        style={{ color: 'var(--riscv-text-3)' }}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Controls Area.
                  items-end right-aligns children, so a child wider than this
                  column is pushed off the LEFT edge rather than overflowing the
                  right. At 390px that put the controls at left:-179 inside an
                  overflow-x-hidden root, which clips rather than scrolls, so the
                  profile buttons and the builder toggle could not be reached at
                  all. Stretch until there is room to right-align.
                  min-w-0 because a flex item defaults to min-width:auto and
                  refuses to shrink below its content. */}
              <div className="flex flex-col items-stretch xl:items-end gap-3 min-w-0 xl:shrink-0">
                {/* Controls - Row 1 */}
                <div className="flex flex-wrap items-center justify-start xl:justify-end gap-x-3 gap-y-3">
                  {/* Grouped Filters Container. Wraps on narrow screens; without
                      it this row stays one 557px line that cannot shrink. */}
                  <div
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2 rounded-xl border shadow-lg backdrop-blur-md"
                    style={{
                      background: 'var(--riscv-plate)',
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    {/* Profiles. Wraps at 320px, where the label plus four buttons
                      measured 338px and ran past the edge. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-[11px] uppercase tracking-widest font-semibold"
                        style={{ color: 'var(--riscv-text-3)' }}
                      >
                        Profile
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(profiles).map((profile) => (
                          <button
                            key={profile}
                            onClick={() =>
                              setActiveProfile((current) => {
                                // Profile and volume are mutually exclusive. With
                                // both live, highlight matched either one while
                                // dimming followed only the volume, so the grid
                                // gave no clue which filter was acting.
                                setActiveVolume(null);
                                setSelectedInstruction(null);
                                setSearchMatches(null);
                                return current === profile ? null : profile;
                              })
                            }
                            className={[
                              'px-3 py-1.5 text-[12px] rounded-lg transition-all duration-200 font-medium',
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
                      <span
                        className="text-[11px] uppercase tracking-widest font-semibold"
                        style={{ color: 'var(--riscv-text-3)' }}
                      >
                        Volume
                      </span>
                      <div className="flex gap-1.5">
                        {['I', 'II'].map((vol) => (
                          <button
                            key={vol}
                            onClick={() =>
                              setActiveVolume((current) => {
                                setActiveProfile(null);
                                setSelectedInstruction(null);
                                setSearchMatches(null);
                                return current === vol ? null : vol;
                              })
                            }
                            className={[
                              'px-3 py-1.5 text-[12px] rounded-lg transition-all duration-200 font-medium',
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
                    ref={encoderTriggerRef}
                    aria-haspopup="dialog"
                    aria-expanded={encoderValidatorOpen}
                    className="group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-300 whitespace-nowrap border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/15 hover:border-indigo-400 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                    data-tooltip="Validate a proposed instruction encoding against the existing instruction set"
                  >
                    <ScanSearch
                      size={14}
                      className="text-indigo-400/80 group-hover:text-indigo-300 transition-colors"
                    />
                    <span className="whitespace-nowrap">Encoder Validator</span>
                  </button>

                  {/* Beside the validator because they answer neighbouring
                      questions: one checks a proposed encoding, the other
                      shows where the space it would occupy already is. */}
                  <button
                    type="button"
                    onClick={() => setEncodingMapOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={encodingMapOpen}
                    className="group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-300 whitespace-nowrap border hover:opacity-90"
                    // Tokens, not Tailwind amber: text-amber-300 has no light-theme
                    // remapping and measured 1.33:1 on the pastel ground.
                    style={{ color: 'var(--riscv-gold)', borderColor: 'var(--riscv-gold-glow)', background: 'var(--riscv-gold-dim)' }}
                    data-tooltip="See how the 32-bit opcode space is allocated"
                    title="See how the 32-bit opcode space is allocated"
                  >
                    <Grid3x3 size={14} className="opacity-80" />
                    <span className="whitespace-nowrap">Encoding Map</span>
                  </button>

                  {/* Theme toggle relocated to header */}

                  {/* ISA Configuration Builder — fused action group */}
                  <div className="relative inline-flex items-stretch rounded-xl">
                    {/* Active glow ring */}
                    {builderMode && (
                      <span className="absolute -inset-px rounded-xl animate-pulse bg-amber-400/20 pointer-events-none z-0" />
                    )}

                    {/* Main body — switches builder mode on and off.
                      It deliberately does NOT open the panel: the panel is a
                      full-screen overlay, so opening it on activation would
                      immediately cover the tiles the user is meant to click. */}
                    <div className="relative flex flex-col">
                      <button
                        type="button"
                        aria-pressed={builderMode}
                        onClick={() => setBuilderMode((v) => !v)}
                        className={[
                          'relative z-10 inline-flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all duration-300 whitespace-nowrap',
                          builderMode
                            ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-slate-900 hover:from-amber-300 hover:to-amber-400 rounded-xl'
                            : 'builder-btn-off bg-slate-800/80 text-amber-300/90 border border-amber-400/30 hover:bg-slate-700/80 hover:text-amber-200 rounded-xl',
                        ].join(' ')}
                        style={{
                          boxShadow: builderMode
                            ? '0 4px 18px rgba(251,191,36,0.4)'
                            : '0 2px 10px rgba(0,0,0,0.2)',
                        }}
                        data-tooltip={
                          builderMode
                            ? 'ISA Configuration Builder is ON — click any extension’s + to add it. Click here to turn off.'
                            : 'Turn on the ISA Configuration Builder to start picking extensions'
                        }
                      >
                        <Cpu size={14} className="opacity-80 flex-shrink-0" />
                        <span className="whitespace-nowrap hidden sm:inline">
                          ISA Configuration Builder
                        </span>
                        <span className="whitespace-nowrap sm:hidden">ISA Builder</span>
                        <span
                          className={[
                            'inline-flex items-center justify-center px-1.5 h-[16px] rounded-full text-[10px] font-black tracking-wide',
                            builderMode
                              ? 'builder-badge-on bg-slate-900/75 text-amber-400'
                              : 'builder-badge-off bg-slate-900/60 text-slate-400',
                          ].join(' ')}
                        >
                          {builderMode ? 'ON' : 'OFF'}
                        </span>
                        {workspaceIds.size > 0 && (
                          <span className="builder-badge-on inline-flex items-center justify-center min-w-[18px] px-1 h-[18px] rounded-full text-[10px] font-black bg-slate-900/75 text-amber-400">
                            {workspaceIds.size}
                          </span>
                        )}
                      </button>

                      {/* Builder Contextual Actions Toolbar.
                        Hidden while the full panel is open: this toolbar belongs to the
                        header, but it sits at z-50 against the panel's z-40, so leaving it
                        mounted floats it on top of the modal. Its actions are redundant
                        there too, one of them being "open the panel". */}
                      {builderMode && !workspacePanelOpen && (
                        <div className="builder-toolbar absolute top-[calc(100%+6px)] left-0 right-0 flex items-center justify-between p-1 bg-slate-800/90 border border-amber-500/40 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl z-50 animate-fade-in-up gap-1">
                          {/* Open the full panel */}
                          <button
                            type="button"
                            data-tooltip="Open the builder panel (-march string, export, conflicts)"
                            aria-label="Open the builder panel"
                            onClick={() => setWorkspacePanelOpen(true)}
                            className={`builder-action-amber ${workspaceIds.size === 0 ? 'flex-none px-4' : 'flex-1'} flex items-center justify-center py-1.5 text-amber-300 hover:bg-amber-500/30 hover:text-amber-100 transition-all duration-300 rounded-lg hover:shadow-[0_0_12px_rgba(251,191,36,0.3)]`}
                          >
                            <Maximize2 size={14} className="transition-transform hover:scale-110" />
                          </button>

                          {/* Profile Menu */}
                          <div className="relative flex-1 flex">
                            <button
                              type="button"
                              onClick={() => setProfileMenuOpen((v) => !v)}
                              data-tooltip="Start the configuration from a ratified profile"
                              className={`builder-action-indigo w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-all duration-300 rounded-lg ${
                                profileMenuOpen
                                  ? 'bg-indigo-500 text-white shadow-inner'
                                  : 'text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-100 hover:shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                              }`}
                            >
                              <Layers size={14} className="transition-transform hover:scale-110" />
                              {workspaceIds.size === 0 && (
                                <span className="whitespace-nowrap">Start from profile</span>
                              )}
                            </button>

                            {profileMenuOpen && (
                              <div
                                className="builder-menu"
                                style={{
                                  position: 'absolute',
                                  top: 'calc(100% + 8px)',
                                  right: 0,
                                  zIndex: 50,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  borderRadius: 10,
                                  minWidth: 300,
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    padding: '10px 14px',
                                    borderBottom: '1px solid var(--riscv-tint-3)',
                                    background: 'rgba(245,197,66,0.04)',
                                    fontSize: 12,
                                    color: 'var(--riscv-text)',
                                    fontWeight: 700,
                                  }}
                                >
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
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 12,
                                      padding: '10px 14px',
                                      textAlign: 'left',
                                      borderBottom: '1px solid var(--riscv-tint-2)',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                    }}
                                    className="hover:bg-amber-400/10 transition-colors"
                                  >
                                    <span
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: 'var(--riscv-gold)',
                                      }}
                                    >
                                      {name}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--riscv-text-2)' }}>
                                      {list.length} extensions
                                    </span>
                                  </button>
                                ))}

                                <div
                                  style={{
                                    padding: '8px 14px',
                                    fontSize: 11,
                                    color: 'var(--riscv-text-3)',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  Replaces the current selection. Dependencies are resolved
                                  automatically, so the result may include more than the profile
                                  lists.
                                </div>
                              </div>
                            )}
                          </div>

                          {workspaceIds.size > 0 && (
                            <>
                              <button
                                type="button"
                                data-tooltip="Clear all extensions"
                                aria-label="Clear all extensions"
                                onClick={() => setWorkspaceIds(new Set())}
                                className="builder-action-rose flex-1 flex items-center justify-center py-1.5 text-rose-300 hover:bg-rose-500/30 hover:text-rose-100 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)] transition-all duration-300 rounded-lg"
                              >
                                <Trash2
                                  size={14}
                                  className="transition-transform hover:scale-110"
                                />
                              </button>

                              <div className="relative flex-1 flex">
                                <button
                                  type="button"
                                  data-tooltip="Export configuration YAML"
                                  aria-label="Export configuration YAML"
                                  onClick={() => setQuickExportOpen((v) => !v)}
                                  className={`builder-action-emerald w-full flex items-center justify-center py-1.5 transition-all duration-300 rounded-lg ${
                                    quickExportOpen
                                      ? 'bg-emerald-500 text-white shadow-inner'
                                      : 'text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-100 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                  }`}
                                >
                                  <Download
                                    size={14}
                                    className="transition-transform hover:scale-110"
                                  />
                                </button>

                                {quickExportOpen && (
                                  <div
                                    className="builder-menu"
                                    style={{
                                      position: 'absolute',
                                      top: 'calc(100% + 8px)',
                                      right: 0,
                                      zIndex: 50,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 0,
                                      borderRadius: 10,
                                      minWidth: 280,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {/* Header strip */}
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 14px',
                                        borderBottom: '1px solid var(--riscv-tint-3)',
                                        background: 'rgba(245,197,66,0.04)',
                                      }}
                                    >
                                      <div
                                        style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                                      >
                                        <Package
                                          size={12}
                                          style={{ color: 'var(--riscv-gold)', opacity: 0.85 }}
                                        />
                                        <span
                                          style={{
                                            fontSize: 12,
                                            color: 'var(--riscv-text)',
                                            fontWeight: 700,
                                            letterSpacing: '0.01em',
                                          }}
                                        >
                                          Export Configuration YAML
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => setQuickExportOpen(false)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#6f7f95',
                                          cursor: 'pointer',
                                          padding: 2,
                                          lineHeight: 0,
                                          borderRadius: 4,
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.color = '#94a3b8')
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.color = '#6f7f95')
                                        }
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>

                                    {/* Toggle card */}
                                    <div style={{ padding: '12px 14px' }}>
                                      <div
                                        onClick={() => setQuickExportIncludeInstr((v) => !v)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 12,
                                          padding: '10px 12px',
                                          borderRadius: 8,
                                          cursor: 'pointer',
                                          background: quickExportIncludeInstr
                                            ? 'rgba(245,197,66,0.07)'
                                            : 'var(--riscv-tint-2)',
                                          border: `1px solid ${quickExportIncludeInstr ? 'rgba(245,197,66,0.2)' : 'var(--riscv-tint-3)'}`,
                                          transition: 'all 0.2s',
                                          userSelect: 'none',
                                        }}
                                      >
                                        <div style={{ flex: 1 }}>
                                          <span
                                            style={{
                                              fontSize: 12.5,
                                              fontWeight: 600,
                                              color: quickExportIncludeInstr
                                                ? 'var(--riscv-text)'
                                                : '#94a3b8',
                                              display: 'block',
                                              lineHeight: 1.35,
                                              transition: 'color 0.2s',
                                            }}
                                          >
                                            Include instruction catalog
                                          </span>
                                          <span
                                            style={{
                                              fontSize: 11,
                                              marginTop: 2,
                                              display: 'block',
                                              color:
                                                workspaceTotalInstr > 100 ? '#f59e0b' : '#64748b',
                                              fontVariantNumeric: 'tabular-nums',
                                            }}
                                          >
                                            {workspaceTotalInstr.toLocaleString()} instructions
                                            {workspaceTotalInstr > 100 ? ' · large export' : ''}
                                          </span>
                                        </div>

                                        {/* Premium toggle track */}
                                        <div
                                          style={{
                                            width: 38,
                                            height: 21,
                                            borderRadius: 11,
                                            flexShrink: 0,
                                            background: quickExportIncludeInstr
                                              ? 'linear-gradient(135deg, #f5c542 0%, #fde68a 100%)'
                                              : 'rgba(255,255,255,0.08)',
                                            boxShadow: quickExportIncludeInstr
                                              ? '0 0 8px rgba(245,197,66,0.4)'
                                              : 'none',
                                            position: 'relative',
                                            transition: 'all 0.25s',
                                            border: `1px solid ${quickExportIncludeInstr ? 'rgba(245,197,66,0.7)' : 'var(--riscv-tint-4)'}`,
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: 15,
                                              height: 15,
                                              borderRadius: '50%',
                                              background: quickExportIncludeInstr
                                                ? '#1a1206'
                                                : '#6f7f95',
                                              position: 'absolute',
                                              top: 2,
                                              left: quickExportIncludeInstr ? 19 : 2,
                                              transition: 'all 0.25s',
                                              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Download button */}
                                    <div style={{ padding: '0 14px 13px' }}>
                                      <button
                                        onClick={() => {
                                          const { yaml } = buildIsaConfigYaml(
                                            Array.from(workspaceIds),
                                            allExtsList,
                                            quickExportIncludeInstr,
                                          );
                                          const blob = new Blob([yaml], { type: 'text/yaml' });
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          const marchRes = buildMarchString(
                                            Array.from(workspaceIds),
                                            allExtsList,
                                          );
                                          const base = marchRes.march
                                            ? marchRes.march.split('_')[0]
                                            : 'core';
                                          a.download = `riscv_${base}_config.yaml`;
                                          document.body.appendChild(a);
                                          a.click();
                                          document.body.removeChild(a);
                                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                                          setQuickExportOpen(false);
                                          showToast('Exported YAML configuration!');
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '9px 14px',
                                          borderRadius: 7,
                                          background:
                                            'linear-gradient(135deg, rgba(245,197,66,0.22) 0%, rgba(245,197,66,0.12) 100%)',
                                          color: 'var(--riscv-gold)',
                                          border: '1px solid rgba(245,197,66,0.4)',
                                          fontSize: 12.5,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          transition: 'all 0.18s',
                                          letterSpacing: '0.02em',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 6,
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background =
                                            'linear-gradient(135deg, rgba(245,197,66,0.35) 0%, rgba(245,197,66,0.22) 100%)';
                                          e.currentTarget.style.boxShadow =
                                            '0 0 12px rgba(245,197,66,0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background =
                                            'linear-gradient(135deg, rgba(245,197,66,0.22) 0%, rgba(245,197,66,0.12) 100%)';
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
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* ─── Main Grid ───────────────────────────────────────────────── */}
          <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-min">
            {/* Search Bar */}
            <div className="col-span-full mb-2 flex items-center gap-3">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--riscv-text-3)' }}
                />
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
                      data-tooltip="Clear search"
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                  <kbd
                    className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      background: 'var(--riscv-surface)',
                      color: 'var(--riscv-text-3)',
                      border: '1px solid var(--riscv-border-2)',
                    }}
                  >
                    <span className="text-[10px]">⌘</span> K
                  </kbd>
                </div>
              </div>

              {/* Theme Toggle - Perfectly positioned next to Search for max visibility */}
              <button
                type="button"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                data-tooltip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="group flex items-center justify-center rounded-xl transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 border flex-shrink-0"
                style={{
                  width: 42,
                  height: 42,
                  background: 'var(--riscv-plate)',
                  borderColor: 'rgba(128,128,128,0.2)',
                  color: 'var(--riscv-text-2)',
                }}
              >
                {theme === 'dark' ? (
                  <Sun size={18} className="group-hover:text-amber-400 transition-colors" />
                ) : (
                  <Moon size={18} className="group-hover:text-indigo-500 transition-colors" />
                )}
              </button>
            </div>

            {hasSearchMatches ? (
              <>
                {/* 1. Base ISA */}
                <div className="space-y-2.5 col-span-full">
                  <div className="flex items-center gap-2">
                    <CircuitBoard size={13} style={{ color: '#60a5fa' }} />
                    <h3
                      className="text-[12px] font-semibold uppercase tracking-widest"
                      style={{ color: '#60a5fa' }}
                    >
                      Base ISA
                    </h3>
                    <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                      {extensions.base.length} isa
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {extensions.base.map((item) => (
                      <ExtensionTile
                        key={item.id}
                        data={item}
                        searchIndex={extensionSearchIndexById.get(item.id)}
                        {...tileProps}
                        colorClass="border-blue-900/60 bg-blue-950/40 text-blue-100"
                      />
                    ))}
                  </div>
                </div>

                {/* 2. Single-Letter Extensions */}
                <div className="space-y-2.5 col-span-full">
                  <div className="flex items-center gap-2">
                    <Braces size={13} style={{ color: '#34d399' }} />
                    <h3
                      className="text-[12px] font-semibold uppercase tracking-widest"
                      style={{ color: '#34d399' }}
                    >
                      Single-Letter Extensions
                    </h3>
                    <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                      {extensions.standard.length} ext
                    </span>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {extensions.standard.map((item) => (
                      <ExtensionTile
                        key={item.id}
                        data={item}
                        searchIndex={extensionSearchIndexById.get(item.id)}
                        {...tileProps}
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
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#a78bfa' }}
                      >
                        Bit Manipulation (Zb*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_bit.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_bit.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-purple-900/60 bg-purple-950/30 text-purple-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Shuffle size={12} style={{ color: '#fbbf24' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#fbbf24' }}
                      >
                        Atomics (Za/Zic*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_atomics.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_atomics.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-amber-900/60 bg-amber-950/30 text-amber-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Layers size={12} style={{ color: '#818cf8' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#818cf8' }}
                      >
                        Compressed (Zc*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_compress.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_compress.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-indigo-900/60 bg-indigo-950/30 text-indigo-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <FlaskConical size={12} style={{ color: '#f472b6' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#f472b6' }}
                      >
                        Float & Numerics (Zf*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_float.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_float.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-pink-900/60 bg-pink-950/30 text-pink-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Database size={12} style={{ color: '#38bdf8' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#38bdf8' }}
                      >
                        Load / Store
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_load_store.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_load_store.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-sky-900/60 bg-sky-950/30 text-sky-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Activity size={12} style={{ color: '#e879f9' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#e879f9' }}
                      >
                        Integer
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_integer.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_integer.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-fuchsia-900/60 bg-fuchsia-950/30 text-fuchsia-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Zap size={12} style={{ color: '#2dd4bf' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#2dd4bf' }}
                      >
                        Vector Subsets (Zv/Zve)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_vector.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_vector.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-teal-900/60 bg-teal-950/30 text-teal-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Shield size={12} style={{ color: '#f87171' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#f87171' }}
                      >
                        Security & CFI (Zi*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_security.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_security.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-red-900/60 bg-red-950/30 text-red-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <KeyRound size={12} style={{ color: '#94a3b8' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#94a3b8' }}
                      >
                        Cryptography (Zk*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_crypto.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_crypto.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-[var(--riscv-border-2)] bg-[var(--riscv-surface-2)] text-slate-300"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Lock size={12} style={{ color: '#c4b5fd' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#c4b5fd' }}
                      >
                        Vector Cryptography (Zvk*)
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_vector_crypto.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_vector_crypto.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-violet-900/60 bg-violet-950/30 text-violet-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Settings2 size={12} style={{ color: '#fb923c' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#fb923c' }}
                      >
                        System
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_system.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_system.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
                          colorClass="border-orange-900/60 bg-orange-950/30 text-orange-100"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <MemoryStick size={12} style={{ color: '#fdba74' }} />
                      <h3
                        className="text-[12px] font-semibold uppercase tracking-widest"
                        style={{ color: '#fdba74' }}
                      >
                        Caches
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                        {extensions.z_caches.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {extensions.z_caches.map((item) => (
                        <ExtensionTile
                          key={item.id}
                          data={item}
                          searchIndex={extensionSearchIndexById.get(item.id)}
                          {...tileProps}
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
                    <h3
                      className="text-[12px] font-semibold uppercase tracking-widest"
                      style={{ color: '#22d3ee' }}
                    >
                      S &amp; Sv Extensions — Privileged ISA
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <Layers size={11} style={{ color: 'var(--riscv-text-3)' }} />
                        <h4
                          className="text-[11px] uppercase tracking-widest font-semibold"
                          style={{ color: 'var(--riscv-text-3)' }}
                        >
                          Memory (Sv)
                        </h4>
                        <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                          {extensions.s_mem.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {extensions.s_mem.map((item) => (
                          <ExtensionTile
                            key={item.id}
                            data={item}
                            searchIndex={extensionSearchIndexById.get(item.id)}
                            {...tileProps}
                            colorClass="border-cyan-900/50 bg-cyan-950/20 text-cyan-100"
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <Timer size={11} style={{ color: 'var(--riscv-text-3)' }} />
                        <h4
                          className="text-[11px] uppercase tracking-widest font-semibold"
                          style={{ color: 'var(--riscv-text-3)' }}
                        >
                          Interrupts (Sm/Ss)
                        </h4>
                        <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                          {extensions.s_interrupt.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {extensions.s_interrupt.map((item) => (
                          <ExtensionTile
                            key={item.id}
                            data={item}
                            searchIndex={extensionSearchIndexById.get(item.id)}
                            {...tileProps}
                            colorClass="border-cyan-900/50 bg-cyan-950/20 text-cyan-100"
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <ServerCrash size={11} style={{ color: 'var(--riscv-text-3)' }} />
                        <h4
                          className="text-[11px] uppercase tracking-widest font-semibold"
                          style={{ color: 'var(--riscv-text-3)' }}
                        >
                          Trap, Debug &amp; Hypervisor
                        </h4>
                        <span className="text-[11px]" style={{ color: 'var(--riscv-text-3)' }}>
                          {extensions.s_trap.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {extensions.s_trap.map((item) => (
                          <ExtensionTile
                            key={item.id}
                            data={item}
                            searchIndex={extensionSearchIndexById.get(item.id)}
                            {...tileProps}
                            colorClass="border-cyan-900/50 bg-cyan-950/20 text-cyan-100"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div
                className="col-span-full flex flex-col items-center justify-center py-20 text-center animate-fade-in-up"
                style={{ minHeight: '50vh' }}
              >
                <div
                  style={{
                    padding: '20px',
                    background: 'var(--riscv-surface-2)',
                    borderRadius: '50%',
                    marginBottom: '24px',
                  }}
                >
                  <Search size={40} strokeWidth={1.5} style={{ color: 'var(--riscv-text-3)' }} />
                </div>
                <h3
                  className="text-[16px] font-semibold mb-2"
                  style={{ color: 'var(--riscv-text)' }}
                >
                  No results found
                </h3>
                <p
                  className="text-[13px] max-w-sm"
                  style={{ color: 'var(--riscv-text-2)', lineHeight: 1.5 }}
                >
                  We couldn't find any extensions, instructions, or encodings matching{' '}
                  <strong style={{ color: 'var(--riscv-text)' }}>"{searchQuery}"</strong>.
                </p>
                <button onClick={() => setSearchQuery('')} className="mt-6 riscv-btn px-4 py-2">
                  Clear Search
                </button>
              </div>
            )}
          </div>

          {/* ─── Sidebar ─────────────────────────────────────────────────── */}
          <div
            id="detail-panel"
            className={`lg:col-span-3 mt-6 lg:mt-0 ${selectedExt ? 'panel-open' : ''}`}
          >
            <div
              className="sticky top-6 riscv-card backdrop-blur-sm min-h-[400px] max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            >
              <div
                className="p-4 pb-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--riscv-border)' }}
              >
                <div className="flex items-center gap-2">
                  <Info size={14} style={{ color: 'var(--riscv-text-3)' }} />
                  <h2
                    className="text-[12px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--riscv-text-3)' }}
                  >
                    Selected Details
                  </h2>
                </div>
                {/* Mobile Close Button */}
                <button
                  type="button"
                  onClick={() => setSelectedExt(null)}
                  aria-label="Close details panel"
                  className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <X size={16} />
                </button>
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
                          style={{
                            fontSize: '1.5rem',
                            lineHeight: 1.2,
                            color: 'var(--riscv-gold)',
                          }}
                          data-tooltip="Open reference link"
                        >
                          <span>{selectedExt.name}</span>
                          <ArrowUpRight size={15} className="mt-1 shrink-0 opacity-70" />
                        </a>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Ratification status. Without this, a proposal such as
                            Zvabd reads exactly as settled as Zbb, which is the
                            same hazard as publishing a withdrawn encoding: the
                            reader cannot tell what is real.

                            "Unconfirmed" rather than "unratified" is deliberate.
                            It means our sources are silent, not that we know the
                            extension was rejected. Zvabd, Zibi and Zvfofp8min are
                            absent from both riscv-unified-db and riscv-opcodes;
                            RV32E and RV64E are simply not modelled in UDB. Those
                            are different situations and neither warrants a claim
                            we cannot source. */}
                        {(() => {
                          const state = selectedExt.state;
                          const hasInstructions =
                            Object.keys(selectedExt.instructions || {}).length > 0;
                          if (!state && !hasInstructions) return null;

                          const ratified = state === 'ratified';
                          const label = ratified
                            ? `Ratified${selectedExt.ratification_date ? ` ${selectedExt.ratification_date}` : ''}`
                            : state
                              ? state.charAt(0).toUpperCase() + state.slice(1)
                              : 'Status unconfirmed';
                          const tip = ratified
                            ? 'Ratified per riscv-unified-db'
                            : state
                              ? `riscv-unified-db reports this extension as ${state}`
                              : 'Neither riscv-unified-db nor riscv-opcodes describes this extension, so its status could not be confirmed';
                          return (
                            <span
                              title={tip}
                              className="px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-wide border whitespace-nowrap"
                              style={
                                ratified
                                  ? {
                                      background: 'var(--riscv-check-fill)',
                                      color: 'var(--riscv-check)',
                                      borderColor: 'var(--riscv-check-edge)',
                                    }
                                  : {
                                      background: 'var(--riscv-gold-dim)',
                                      color: 'var(--riscv-gold)',
                                      borderColor: 'rgba(245,197,66,0.35)',
                                    }
                              }
                            >
                              {label}
                            </span>
                          );
                        })()}
                        {selectedExt.discontinued === 1 && (
                          <span className="px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-wide border bg-red-950/40 text-red-200 border-red-600/60">
                            Discontinued
                          </span>
                        )}
                        {/* The address bar already carries ?ext=<id>, but a
                            button is the discoverable route and works on mobile,
                            where copying the URL is fiddly. */}
                        <button
                          type="button"
                          onClick={copyPermalink}
                          aria-label={`Copy a link to ${selectedExt.id}`}
                          title={`Copy a link to ${selectedExt.id}`}
                          className="riscv-btn inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                        >
                          <Link2 size={12} />
                          {permalinkCopied ? 'Copied' : 'Link'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <h4
                          className="text-[11px] uppercase tracking-widest font-semibold mb-1.5"
                          style={{ color: 'var(--riscv-text-3)' }}
                        >
                          Description
                        </h4>
                        <p
                          className="text-sm leading-relaxed"
                          style={{ color: 'var(--riscv-text)' }}
                        >
                          {selectedExt.desc}
                        </p>
                      </div>

                      <div className="riscv-card-2 p-3 rounded-lg">
                        <h4
                          className="text-[11px] uppercase tracking-widest font-semibold mb-2 flex items-center gap-1"
                          style={{ color: 'var(--riscv-violet)' }}
                        >
                          <ArrowRight size={10} /> Use Case
                        </h4>
                        <p className="text-sm italic" style={{ color: 'var(--riscv-text-2)' }}>
                          {selectedExt.use}
                        </p>
                      </div>

                      {/* Instruction list, when available */}
                      {searchMatches &&
                        searchMatches.extId === selectedExt.id &&
                        searchMatches.query === searchQuery.trim().toLowerCase() &&
                        searchMatches.mnemonics.length > 0 && (
                          <div className="bg-slate-900 p-3 rounded border border-slate-700">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[11px] uppercase tracking-wider text-yellow-300 font-bold mb-0.5">
                                  Search Hits ({searchMatches.mnemonics.length})
                                </div>
                                <div className="text-[12px] font-mono text-slate-200 truncate">
                                  {searchMatches.mnemonics[searchMatches.index] || ''}
                                  <span className="ml-2 text-slate-500">
                                    ({searchMatches.index + 1}/{searchMatches.mnemonics.length})
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[11px] font-mono text-slate-100 disabled:opacity-40"
                                  onClick={() => {
                                    setSearchMatches((current) => {
                                      if (!current || current.extId !== selectedExt.id)
                                        return current;
                                      const nextIndex =
                                        (current.index - 1 + current.mnemonics.length) %
                                        current.mnemonics.length;
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
                                  className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[11px] font-mono text-slate-100 disabled:opacity-40"
                                  onClick={() => {
                                    setSearchMatches((current) => {
                                      if (!current || current.extId !== selectedExt.id)
                                        return current;
                                      const nextIndex =
                                        (current.index + 1) % current.mnemonics.length;
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
                          <h4 className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold mb-2">
                            Instruction Set Snapshot (
                            {Object.keys(selectedExt.instructions || {}).length})
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
                                      isActive ? null : { mnemonic, ...instructionDetails },
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
                                  className={`px-1.5 py-0.5 rounded border text-[11px] font-mono tracking-tight ${
                                    isActive
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

                      {selectedExt.csrs && Object.keys(selectedExt.csrs).length > 0 && (
                        <div className="bg-slate-900 p-3 rounded border border-slate-700">
                          <h4 className="text-[11px] uppercase tracking-wider text-sky-300 font-bold mb-2">
                            {extensionCsrLabels[selectedExt.id] || 'CSRs'} (
                            {Object.keys(selectedExt.csrs).length})
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {Object.keys(selectedExt.csrs)
                              .sort()
                              .map((name) => {
                                const csr = selectedExt.csrs[name] || {};
                                // Address and description are what identify a CSR;
                                // both ride along in the catalogue entry.
                                const tip = [
                                  csr.desc,
                                  csr.address,
                                  csr.priv_mode && `${csr.priv_mode}-mode`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ');
                                return (
                                  <span
                                    key={name}
                                    title={tip || undefined}
                                    className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/70 text-[11px] font-mono text-slate-200"
                                  >
                                    {name.toUpperCase()}
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {selectedInstruction && (
                        <div className="bg-slate-900 p-3 rounded border border-slate-700">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h4 className="text-[11px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1">
                              <ArrowRight size={10} /> Instruction Details
                              {/* Some extensions define no new opcode: they name a
                                  specific encoding of an existing instruction. PAUSE is
                                  a FENCE, NTL.* are ADDs, RDCYCLE is a CSRRS. Saying so
                                  explains why the encoding below looks like something
                                  else, and why the validator reports an overlap. */}
                              {selectedInstruction.alias_of && (
                                <span
                                  className="ml-1 px-1.5 py-0.5 rounded font-mono normal-case tracking-normal text-[10px]"
                                  style={{
                                    background: 'var(--riscv-tint-3)',
                                    color: 'var(--riscv-text-2)',
                                    border: '1px solid var(--riscv-tint-4)',
                                  }}
                                  title={`Defines no new opcode: this is a specific encoding of ${selectedInstruction.alias_of}`}
                                >
                                  alias of {selectedInstruction.alias_of}
                                </span>
                              )}
                            </h4>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[11px] font-mono text-slate-100 hover:border-slate-500"
                                onClick={async () => {
                                  const text = formatInstructionForClipboard(
                                    selectedExt,
                                    selectedInstruction,
                                  );
                                  const ok = await copyTextToClipboard(text);
                                  setCopyStatus(ok ? 'copied' : 'failed');
                                  if (ok) showToast('Copied instruction details!');
                                  if (copyStatusTimerRef.current)
                                    window.clearTimeout(copyStatusTimerRef.current);
                                  copyStatusTimerRef.current = window.setTimeout(() => {
                                    copyStatusTimerRef.current = null;
                                    setCopyStatus(null);
                                  }, 1500);
                                }}
                                data-tooltip="Copy extension + instruction details"
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
                                className="text-[11px] font-mono text-slate-500 hover:text-slate-300"
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
                              <span className="shrink-0 px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-wide border bg-red-950/40 text-red-200 border-red-600/60">
                                Discontinued
                              </span>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                Encoding
                              </div>
                              <EncodingDiagram encoding={selectedInstruction.encoding} />
                              <div className="mt-1 text-[11px] text-slate-500">
                                Fixed bits are <span className="font-mono">0/1</span>, variable bits
                                are <span className="font-mono">x</span>.
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                Variable Fields
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(selectedInstruction.variable_fields || []).map((field) => (
                                  <span
                                    key={field}
                                    className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/70 text-[11px] font-mono text-slate-200"
                                  >
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                  Match
                                </div>
                                <div
                                  className={`font-mono text-[12px] text-slate-100 bg-slate-800/70 border rounded px-2 py-1 ${
                                    searchQuery.trim().length &&
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
                                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                  Mask
                                </div>
                                <div
                                  className={`font-mono text-[12px] text-slate-100 bg-slate-800/70 border rounded px-2 py-1 ${
                                    searchQuery.trim().length &&
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
                                <div className="text-[11px] uppercase tracking-wider text-cyan-300 font-bold mb-2">
                                  Compressed Mapping
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Compressed
                                    </div>
                                    <div className="font-mono text-[12px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1">
                                      {compressedMapping.compressed}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Standard Equivalent
                                    </div>
                                    {hasStandardEquivalent ? (
                                      <button
                                        type="button"
                                        className="w-full text-left font-mono text-[12px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1 hover:border-cyan-400/60"
                                        onClick={() =>
                                          selectStandardEquivalent(standardEquivalentMnemonic)
                                        }
                                        data-tooltip="Open standard instruction details"
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          {compressedMapping.standard}
                                          <ArrowUpRight size={12} className="opacity-70" />
                                        </span>
                                      </button>
                                    ) : (
                                      <div className="font-mono text-[12px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1">
                                        {compressedMapping.standard}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Equivalent Instruction
                                    </div>
                                    {standardEquivalentMnemonic ? (
                                      hasStandardEquivalent ? (
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1 text-[12px] font-mono text-cyan-200 hover:text-cyan-100 underline"
                                          onClick={() =>
                                            selectStandardEquivalent(standardEquivalentMnemonic)
                                          }
                                          data-tooltip="Open standard instruction details"
                                        >
                                          {standardEquivalentMnemonic}
                                          <ArrowUpRight size={12} className="opacity-70" />
                                        </button>
                                      ) : (
                                        <div className="text-[12px] text-slate-500 font-mono">
                                          {standardEquivalentMnemonic}
                                        </div>
                                      )
                                    ) : (
                                      <div className="text-[12px] text-slate-500">Unavailable</div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                                      Description
                                    </div>
                                    <div className="text-[12px] text-slate-200">
                                      {compressedMapping.description}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {compressedEquivalents.length > 0 && (
                              <div className="rounded border border-slate-700 bg-slate-950/40 p-3">
                                <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold mb-2">
                                  Compressed Equivalents
                                </div>
                                <div className="space-y-2">
                                  {compressedEquivalents.map((entry) => (
                                    <button
                                      key={entry.mnemonic}
                                      type="button"
                                      className="w-full text-left rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 hover:border-emerald-400/60"
                                      onClick={() => selectCompressedEquivalent(entry.mnemonic)}
                                      data-tooltip={`Open ${entry.mnemonic} details`}
                                    >
                                      <div className="flex items-center gap-1 text-[12px] font-mono text-emerald-200">
                                        {normalizeMnemonicKey(entry.mnemonic)}
                                        <ArrowUpRight size={12} className="opacity-70" />
                                      </div>
                                      <div className="text-[11px] font-mono text-slate-400">
                                        {entry.compressed}
                                      </div>
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
                      ${
                        isHighlighted(selectedExt.id)
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
                  <div
                    className="h-[300px] flex flex-col items-center justify-center text-center space-y-3"
                    style={{ color: 'var(--riscv-text-3)' }}
                  >
                    <div
                      className="p-4 rounded-full"
                      style={{
                        background: 'var(--riscv-surface-2)',
                        border: '1px solid var(--riscv-border-2)',
                      }}
                    >
                      <CircuitBoard size={28} style={{ color: 'var(--riscv-muted)' }} />
                    </div>
                    <div>
                      <p
                        className="text-xs font-medium mb-1"
                        style={{ color: 'var(--riscv-text-2)' }}
                      >
                        No Extension Selected
                      </p>
                      <p
                        className="text-[12px] max-w-[160px] mx-auto"
                        style={{ color: 'var(--riscv-text-3)' }}
                      >
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
          className="mt-10 pb-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px]"
          style={{
            borderTop: '1px solid var(--riscv-border)',
            paddingTop: '1.5rem',
            color: 'var(--riscv-text-3)',
          }}
        >
          <div className="flex items-center gap-2">
            <CircuitBoard size={14} style={{ color: 'var(--riscv-gold)' }} />
            <span className="font-semibold" style={{ color: 'var(--riscv-text-2)' }}>
              RISC-V Extension Landscape
            </span>
            <span style={{ color: 'var(--riscv-border-2)' }}>·</span>
            <span>
              Data sourced from{' '}
              <a
                href="https://github.com/riscv/riscv-isa-manual"
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                style={{ color: 'var(--riscv-violet)' }}
              >
                riscv/riscv-isa-manual
              </a>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/riscv/riscv-isa-manual"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80 tooltip-align-right"
              style={{ color: 'var(--riscv-text-2)' }}
              data-tooltip="View on GitHub"
              aria-label="View on GitHub"
            >
              <BookOpen size={14} />
            </a>
          </div>
        </footer>
      </div>

      <EncodingMap
        open={encodingMapOpen}
        onClose={() => setEncodingMapOpen(false)}
        catalog={extensions}
        onSelectExtension={(id) => {
          const target = Object.values(extensions).flat().find((e) => e && e.id === id);
          if (target) handleSelectExt(target);
        }}
      />

      {encoderValidatorOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(7,7,14,0.85)', backdropFilter: 'blur(4px)' }}
            onClick={() => setEncoderValidatorOpen(false)}
            role="presentation"
          />

          <div className="absolute inset-0 p-3 md:p-8 flex items-start justify-center overflow-y-auto">
            <div
              ref={encoderDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="encoder-validator-title"
              aria-describedby="encoder-validator-desc"
              className="animate-scale-in w-full max-w-3xl riscv-card overflow-hidden"
              style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,124,248,0.15)' }}
            >
              <div
                className="p-4 flex items-start justify-between gap-3"
                style={{ borderBottom: '1px solid var(--riscv-border)' }}
              >
                <div className="min-w-0">
                  <h3
                    id="encoder-validator-title"
                    className="font-bold flex items-center gap-2"
                    style={{ color: 'var(--riscv-text)', fontSize: '14px' }}
                  >
                    <ScanSearch size={15} style={{ color: 'var(--riscv-violet)' }} />
                    <span>Encoder Validator</span>
                  </h3>
                  <p
                    id="encoder-validator-desc"
                    className="text-[12px] mt-1"
                    style={{ color: 'var(--riscv-text-3)' }}
                  >
                    Enter a 32-bit encoding (0/1/-) or Match+Mask (hex). Detects overlaps against
                    the full ISA database.
                  </p>
                </div>

                <button
                  type="button"
                  className="riscv-btn p-1.5"
                  onClick={() => setEncoderValidatorOpen(false)}
                  data-tooltip="Close"
                  aria-label="Close encoder validator"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div
                      className="text-[11px] uppercase tracking-widest font-semibold mb-1.5"
                      style={{ color: 'var(--riscv-text-3)' }}
                    >
                      Proposed Mnemonic <span style={{ fontWeight: 400 }}>(optional)</span>
                    </div>
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
                    <div
                      className="text-[11px] uppercase tracking-widest font-semibold mb-1.5"
                      style={{ color: 'var(--riscv-text-3)' }}
                    >
                      Encoding <span style={{ fontWeight: 400 }}>(required if no match/mask)</span>
                    </div>
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
                      <div
                        className="text-[11px] uppercase tracking-widest font-semibold mb-1.5"
                        style={{ color: 'var(--riscv-text-3)' }}
                      >
                        Match (hex)
                      </div>
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
                      <div
                        className="text-[11px] uppercase tracking-widest font-semibold mb-1.5"
                        style={{ color: 'var(--riscv-text-3)' }}
                      >
                        Mask (hex)
                      </div>
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
                      className="riscv-btn riscv-btn-violet inline-flex items-center gap-2 px-4 py-2 text-[12px]"
                    >
                      <ScanSearch size={14} />
                      Validate
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEncoderValidatorInput({
                          mnemonic: '',
                          encoding: '',
                          match: '',
                          mask: '',
                        });
                        setEncoderValidatorResult(null);
                        setEncoderValidatorCopyStatus(null);
                      }}
                      className="riscv-btn px-3 py-2 text-[12px]"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="text-[11px] uppercase tracking-widest font-semibold"
                      style={{ color: 'var(--riscv-text-3)' }}
                    >
                      Results
                    </div>
                    <button
                      type="button"
                      disabled={!encoderValidatorResult?.proposed}
                      onClick={async () => {
                        if (!encoderValidatorResult?.proposed) return;
                        setEncoderValidatorCopyStatus(null);
                        const report = formatEncoderValidatorReport(
                          encoderValidatorResult.proposed,
                          encoderValidatorResult,
                        );
                        const ok = await copyTextToClipboard(report);
                        setEncoderValidatorCopyStatus(ok ? 'copied' : 'failed');
                        if (ok) showToast('Copied validation report!');
                        if (encoderCopyTimerRef.current)
                          window.clearTimeout(encoderCopyTimerRef.current);
                        encoderCopyTimerRef.current = window.setTimeout(() => {
                          encoderCopyTimerRef.current = null;
                          setEncoderValidatorCopyStatus(null);
                        }, 1500);
                      }}
                      className="riscv-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-30"
                      data-tooltip="Copy validation report"
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
                      className="text-[12px] rounded-lg p-3"
                      style={{
                        background: 'var(--riscv-surface-2)',
                        border: '1px solid var(--riscv-border-2)',
                        color: 'var(--riscv-text-3)',
                      }}
                    >
                      Enter a proposed encoding and click Validate.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {encoderValidatorResult.errors.length > 0 && (
                        <div className="border border-red-800/40 bg-red-950/30 rounded p-3">
                          <div className="text-[11px] uppercase tracking-wider text-red-200 font-bold mb-2">
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
                          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                            Normalized Proposal
                          </div>
                          <div className="space-y-2">
                            <div className="font-mono text-[12px] text-slate-200 break-all">
                              Encoding: {encoderValidatorResult.proposed.encoding}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="font-mono text-[12px] text-slate-200">
                                Match: {encoderValidatorResult.proposed.match}
                              </div>
                              <div className="font-mono text-[12px] text-slate-200">
                                Mask: {encoderValidatorResult.proposed.mask}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {encoderValidatorResult.proposed && (
                        <div
                          className="rounded-lg p-3"
                          style={{
                            border: '1px solid var(--riscv-border-2)',
                            background: 'var(--riscv-surface-2)',
                          }}
                        >
                          <div
                            className="text-[11px] uppercase tracking-widest font-semibold mb-2"
                            style={{ color: 'var(--riscv-text-3)' }}
                          >
                            Conflicts ({encoderValidatorResult.conflicts.length})
                          </div>
                          {encoderValidatorResult.conflicts.length === 0 ? (
                            <div className="conflict-none rounded-lg p-3 flex items-center gap-2 border">
                              <CheckCircle2
                                size={15}
                                style={{ color: 'var(--riscv-success)', flexShrink: 0 }}
                              />
                              <span
                                className="text-[13px] font-medium"
                                style={{ color: 'var(--riscv-success)' }}
                              >
                                No overlaps found in ISA database — safe to use.
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[340px] overflow-y-auto overscroll-contain pr-1">
                              {encoderValidatorResult.conflicts.map((conflict) => {
                                const severityCls =
                                  conflict.type === 'identical'
                                    ? 'conflict-identical'
                                    : conflict.type === 'proposed_subset_of_existing'
                                      ? 'conflict-subset-in'
                                      : conflict.type === 'existing_subset_of_proposed'
                                        ? 'conflict-subset-out'
                                        : 'conflict-partial';
                                const SeverityIcon =
                                  conflict.type === 'identical'
                                    ? XCircle
                                    : conflict.type === 'partial_overlap'
                                      ? AlertCircle
                                      : AlertTriangle;
                                return (
                                  <div
                                    key={`${conflict.other.extId}:${conflict.other.mnemonic}:${conflict.type}`}
                                    className={`rounded-lg p-2.5 border ${severityCls}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex items-start gap-1.5">
                                        <SeverityIcon
                                          size={13}
                                          className="mt-0.5 shrink-0 opacity-80"
                                        />
                                        <div>
                                          <div
                                            className="font-mono text-[12px] font-medium break-words"
                                            style={{ color: 'var(--riscv-text)' }}
                                          >
                                            {conflict.other.mnemonic}{' '}
                                            <span style={{ color: 'var(--riscv-text-3)' }}>
                                              ({conflict.other.extId})
                                            </span>
                                          </div>
                                          <div
                                            className="text-[11px] mt-0.5"
                                            style={{ color: 'var(--riscv-text-3)' }}
                                          >
                                            {conflict.other.extName}
                                          </div>
                                        </div>
                                      </div>
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border"
                                        style={{ background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                                      >
                                        {conflict.type.replace(/_/g, ' ')}
                                      </span>
                                    </div>

                                    <div
                                      className="mt-1.5 text-[12px]"
                                      style={{ color: 'var(--riscv-text-2)' }}
                                    >
                                      {conflict.why}
                                    </div>
                                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                                      <div
                                        className="font-mono text-[11px]"
                                        style={{ color: 'var(--riscv-text-3)' }}
                                      >
                                        mask: {conflict.commonMask}
                                      </div>
                                      <div
                                        className="font-mono text-[11px]"
                                        style={{ color: 'var(--riscv-text-3)' }}
                                      >
                                        example: {conflict.exampleWord}
                                      </div>
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
        onSetVlen={handleSetVlen}
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
              showToast(`Cannot remove ${id}: required by ${currentLocked.get(id).join(', ')}`);
              return next;
            }
            next.delete(id);
            return next;
          })
        }
        onClear={() => setWorkspaceIds(new Set())}
        onLoadIds={(ids) => {
          setWorkspaceIds(new Set()); // clear
          addWorkspaceIdsSmart(ids); // smartly add all
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
