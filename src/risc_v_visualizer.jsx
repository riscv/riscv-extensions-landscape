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
} from 'lucide-react';
import extensions from './riscv_extensions.json';

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
      <div className="font-mono text-[11px] text-slate-100 bg-slate-800/70 border border-slate-700 rounded px-2 py-1 break-all">
        {encoding}
      </div>
    );
  }

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
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          <span>Bits</span>
          {canScroll && (
            <span className="inline-flex items-center gap-1 text-yellow-200/80 font-mono normal-case tracking-normal">
              scroll <ArrowRight size={12} />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1 rounded border border-slate-600 bg-slate-800 text-slate-100 disabled:opacity-30"
            onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            disabled={!canScroll || atLeft}
            title="Scroll left"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="p-1 rounded border border-slate-600 bg-slate-800 text-slate-100 disabled:opacity-30"
            onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            disabled={!canScroll || atRight}
            title="Scroll right"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <div className="inline-block pr-2">
          <div className="inline-grid grid-flow-col auto-cols-[18px] rounded border border-slate-700 bg-slate-900/40">
            {normalized.split('').map((bit, i) => {
              const isVar = bit === '-';
              const isGroupEnd = (i + 1) % 4 === 0 && i !== 31;
              const value = isVar ? 'x' : bit;
              return (
                <div
                  key={`${i}-${bit}`}
                  className={[
                    'h-7 flex items-center justify-center font-mono text-[11px]',
                    i === 0 ? 'rounded-l' : '',
                    i === 31 ? 'rounded-r' : '',
                    isVar
                      ? 'bg-slate-800/60 text-purple-100'
                      : 'bg-slate-700/40 text-slate-100',
                    i === 31
                      ? ''
                      : isGroupEnd
                          ? 'border-r-2 border-slate-600'
                          : 'border-r border-slate-700',
                  ].join(' ')}
                  title={`bit ${31 - i}`}
                >
                  {value}
                </div>
              );
            })}
          </div>

          <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
            <span>31</span>
            <span>0</span>
          </div>
        </div>
      </div>

      {canScroll && (
        <div
          className="mt-2 h-2 rounded bg-purple-300/15 border border-purple-300/20 relative cursor-pointer"
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
            className="absolute top-0 bottom-0 rounded bg-purple-200/40 border border-purple-200/30 cursor-grab active:cursor-grabbing"
            style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
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
  const lastScrolledKeyRef = React.useRef(null);

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

  // ---------------------------------------------------------------------------
  // Profile Definitions – mandatory sets (U64+S64) for RVA20/22/23/RVB23
  // ---------------------------------------------------------------------------
  const profiles = {
    // RVA20U64 + RVA20S64 – baseline “RV64GC-like” profile
    RVA20: [
      'RV64I',
      'M',
      'A',
      'F',
      'D',
      'C',
      'Zicsr',
      'Zicntr',
      'Ziccif',
      'Ziccrse',
      'Ziccamoa',
      'Za128rs',
      'Zicclsm',
      'Zifencei',
      'Ss1p11',
      'Svbare',
      'Sv39',
      'Svade',
      'Ssccptr',
      'Sstvecd',
      'Sstvala',
    ],

    // RVA22U64 + RVA22S64 – as referenced by RVA23 spec
    RVA22: [
      'RV64I',
      'M',
      'A',
      'F',
      'D',
      'C',
      'Zicsr',
      'Zicntr',
      'Zihpm',
      'Ziccif',
      'Ziccrse',
      'Ziccamoa',
      'Zicclsm',
      'Za64rs',
      'Zihintpause',
      'Zba',
      'Zbb',
      'Zbs',
      'Zic64b',
      'Zicbom',
      'Zicbop',
      'Zicboz',
      'Zfhmin',
      'Zkt',
      'Zifencei',
      'Ss1p12',
      'Svbare',
      'Sv39',
      'Svade',
      'Ssccptr',
      'Sstvecd',
      'Sstvala',
      'Sscounterenw',
      'Svpbmt',
      'Svinval',
    ],

    // RVA23U64 + RVA23S64 – full mandatory set
    RVA23: [
      'RV64I',
      'M',
      'A',
      'F',
      'D',
      'C',
      'Zicsr',
      'Zicntr',
      'Zihpm',
      'Ziccif',
      'Ziccrse',
      'Ziccamoa',
      'Zicclsm',
      'Za64rs',
      'Zihintpause',
      'Zba',
      'Zbb',
      'Zbs',
      'Zic64b',
      'Zicbom',
      'Zicbop',
      'Zicboz',
      'Zfhmin',
      'Zkt',

      // New mandatory in RVA23U64
      'V',
      'Zvfhmin',
      'Zvbb',
      'Zvkt',
      'Zihintntl',
      'Zicond',
      'Zimop',
      'Zcmop',
      'Zcb',
      'Zfa',
      'Zawrs',
      'Supm',

      // S-profile extras
      'Zifencei',
      'Ss1p13',
      'Svbare',
      'Sv39',
      'Svade',
      'Ssccptr',
      'Sstvecd',
      'Sstvala',
      'Sscounterenw',
      'Svpbmt',
      'Svinval',
      'Svnapot',
      'Sstc',
      'Sscofpmf',
      'Ssnpm',
      'Ssu64xl',

      // Hypervisor bundle
      'Sha',
      'H',
    ],

    // RVB23U64 + RVB23S64 – embedded-leaning profile
    RVB23: [
      'RV64I',
      'M',
      'A',
      'F',
      'D',
      'C',
      'Zicsr',
      'Zicntr',
      'Zihpm',
      'Ziccif',
      'Ziccrse',
      'Ziccamoa',
      'Zicclsm',
      'Za64rs',
      'Zihintpause',
      'Zic64b',
      'Zicbom',
      'Zicbop',
      'Zicboz',
      'Zkt',

      // RVA23-style unprivileged add-ons (minus V/Zfhmin/Supm mandates)
      'Zihintntl',
      'Zicond',
      'Zimop',
      'Zcmop',
      'Zcb',
      'Zfa',
      'Zawrs',

      'Zifencei',

      'Ss1p13',
      'Svnapot',
      'Svbare',
      'Sv39',
      'Svade',
      'Ssccptr',
      'Sstvecd',
      'Sstvala',
      'Sscounterenw',
      'Svpbmt',
      'Svinval',
      'Sstc',
      'Sscofpmf',
      'Ssu64xl',
    ],
  };

  // ---------------------------------------------------------------------------
  // Instruction lists per extension (used in the details sidebar)
  // ---------------------------------------------------------------------------
  const extensionInstructions = {
    RV32I: [
      'LUI', 'AUIPC',
      'JAL', 'JALR',
      'BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU',
      'LB', 'LH', 'LW', 'LBU', 'LHU',
      'SB', 'SH', 'SW',
      'ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI',
      'SLLI', 'SRLI', 'SRAI',
      'ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND',
      'FENCE', 'FENCE.I',
      'ECALL', 'EBREAK',
      'CSRRW', 'CSRRS', 'CSRRC', 'CSRRWI', 'CSRRSI', 'CSRRCI',
    ],
    RV32E: [
      'LUI', 'AUIPC',
      'JAL', 'JALR',
      'BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU',
      'LB', 'LH', 'LW', 'LBU', 'LHU',
      'SB', 'SH', 'SW',
      'ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI',
      'SLLI', 'SRLI', 'SRAI',
      'ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND',
      'FENCE', 'FENCE.I',
      'ECALL', 'EBREAK',
      'CSRRW', 'CSRRS', 'CSRRC', 'CSRRWI', 'CSRRSI', 'CSRRCI',
    ],
    RV64I: [
      'LUI', 'AUIPC',
      'JAL', 'JALR',
      'BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU',
      'LB', 'LH', 'LW', 'LBU', 'LHU', 'LWU', 'LD',
      'SB', 'SH', 'SW', 'SD',
      'ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI',
      'SLLI', 'SRLI', 'SRAI',
      'ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND',
      'ADDIW', 'SLLIW', 'SRLIW', 'SRAIW',
      'ADDW', 'SUBW', 'SLLW', 'SRLW', 'SRAW',
      'FENCE', 'FENCE.I',
      'ECALL', 'EBREAK',
      'CSRRW', 'CSRRS', 'CSRRC', 'CSRRWI', 'CSRRSI', 'CSRRCI',
    ],
    RV64E: [
      'LUI', 'AUIPC',
      'JAL', 'JALR',
      'BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU',
      'LB', 'LH', 'LW', 'LBU', 'LHU', 'LWU', 'LD',
      'SB', 'SH', 'SW', 'SD',
      'ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI',
      'SLLI', 'SRLI', 'SRAI',
      'ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND',
      'ADDIW', 'SLLIW', 'SRLIW', 'SRAIW',
      'ADDW', 'SUBW', 'SLLW', 'SRLW', 'SRAW',
      'FENCE', 'FENCE.I',
      'ECALL', 'EBREAK',
      'CSRRW', 'CSRRS', 'CSRRC', 'CSRRWI', 'CSRRSI', 'CSRRCI',
    ],
    RV128I: [
      'LUI', 'AUIPC',
      'JAL', 'JALR',
      'BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU',
      'LB', 'LH', 'LW', 'LBU', 'LHU', 'LWU', 'LD',
      'SB', 'SH', 'SW', 'SD',
      'ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI',
      'SLLI', 'SRLI', 'SRAI',
      'ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND',
      'ADDIW', 'SLLIW', 'SRLIW', 'SRAIW',
      'ADDW', 'SUBW', 'SLLW', 'SRLW', 'SRAW',
      'FENCE', 'FENCE.I',
      'ECALL', 'EBREAK',
      'CSRRW', 'CSRRS', 'CSRRC', 'CSRRWI', 'CSRRSI', 'CSRRCI',
    ],
    M: [
      // Multiply
      'MUL', 'MULH', 'MULHSU', 'MULHU',
      // Divide
      'DIV', 'DIVU', 'REM', 'REMU',
      // RV64 word variants
      'MULW', 'DIVW', 'DIVUW', 'REMW', 'REMUW',
    ],
    A: [
      // Load-Reserved / Store-Conditional
      'LR.W', 'SC.W',
      // RV64 LR/SC
      'LR.D', 'SC.D',
      // Word AMO operations
      'AMOSWAP.W', 'AMOADD.W', 'AMOXOR.W', 'AMOOR.W', 'AMOAND.W',
      'AMOMIN.W', 'AMOMAX.W', 'AMOMINU.W', 'AMOMAXU.W',
      // RV64 Doubleword AMO operations
      'AMOSWAP.D', 'AMOADD.D', 'AMOXOR.D', 'AMOOR.D', 'AMOAND.D',
      'AMOMIN.D', 'AMOMAX.D', 'AMOMINU.D', 'AMOMAXU.D',
    ],
    Zaamo: [
      // Atomic Memory Operations (AMO only, no LR/SC)
      // Word AMOs
      'AMOSWAP.W', 'AMOADD.W', 'AMOXOR.W', 'AMOOR.W', 'AMOAND.W',
      'AMOMIN.W', 'AMOMAX.W', 'AMOMINU.W', 'AMOMAXU.W',
      // RV64 Doubleword AMOs
      'AMOSWAP.D', 'AMOADD.D', 'AMOXOR.D', 'AMOOR.D', 'AMOAND.D',
      'AMOMIN.D', 'AMOMAX.D', 'AMOMINU.D', 'AMOMAXU.D',
    ],
    Zalrsc: [
      // Load-Reserved / Store-Conditional
      'LR.W', 'SC.W',
      // RV64
      'LR.D', 'SC.D',
    ],
    Zacas: [
      // Atomic Compare-and-Swap
      'AMOCAS.W', 'AMOCAS.D',
      // RV64 quadword
      'AMOCAS.Q',
      // With Zabha (byte/halfword)
      'AMOCAS.B', 'AMOCAS.H',
    ],
    Zabha: [
      // Byte AMO operations
      'AMOSWAP.B', 'AMOADD.B', 'AMOXOR.B', 'AMOOR.B', 'AMOAND.B',
      'AMOMIN.B', 'AMOMAX.B', 'AMOMINU.B', 'AMOMAXU.B',
      // Halfword AMO operations
      'AMOSWAP.H', 'AMOADD.H', 'AMOXOR.H', 'AMOOR.H', 'AMOAND.H',
      'AMOMIN.H', 'AMOMAX.H', 'AMOMINU.H', 'AMOMAXU.H',
    ],
    Zawrs: [
      // Wait-on-Reservation-Set
      'WRS.NTO', 'WRS.STO',
    ],
    Zalasr: [
      // Load-Acquire
      'LB.AQ', 'LH.AQ', 'LW.AQ', 'LD.AQ',
      // Store-Release
      'SB.RL', 'SH.RL', 'SW.RL', 'SD.RL',
    ],
    Zicsr: [
      // CSR read-write
      'CSRRW', 'CSRRS', 'CSRRC',
      // CSR immediate
      'CSRRWI', 'CSRRSI', 'CSRRCI',
    ],
    Zicond: [
      // Conditional zero
      'CZERO.EQZ', 'CZERO.NEZ',
    ],
    Zifencei: [
      // Instruction-fetch fence
      'FENCE.I',
    ],
    Zicbom: [
      // Cache-block management
      'CBO.CLEAN', 'CBO.FLUSH', 'CBO.INVAL',
    ],
    Zicboz: [
      // Cache-block zero
      'CBO.ZERO',
    ],
    Zicfiss: [
      // Shadow stack atomic swap
      'SSAMOSWAP.W', 'SSAMOSWAP.D',
    ],
    Zimop: [
      // May-be operations (reserved NOPs)
      // Note: MOP.R.N, MOP.RR.N have encoding but naming mismatch in dictionary
    ],
    F: [
      // Load/Store
      'FLW', 'FSW',
      // Fused multiply-add
      'FMADD.S', 'FMSUB.S', 'FNMADD.S', 'FNMSUB.S',
      // Arithmetic
      'FADD.S', 'FSUB.S', 'FMUL.S', 'FDIV.S', 'FSQRT.S',
      // Sign-inject
      'FSGNJ.S', 'FSGNJN.S', 'FSGNJX.S',
      // Min/Max
      'FMIN.S', 'FMAX.S',
      // Compare
      'FEQ.S', 'FLT.S', 'FLE.S',
      // Convert to/from integer (RV32)
      'FCVT.W.S', 'FCVT.WU.S', 'FCVT.S.W', 'FCVT.S.WU',
      // RV64 conversions
      'FCVT.L.S', 'FCVT.LU.S', 'FCVT.S.L', 'FCVT.S.LU',
      // Move
      'FMV.X.W', 'FMV.W.X',
      // Classify
      'FCLASS.S',
    ],
    D: [
      // Load/Store
      'FLD', 'FSD',
      // Fused multiply-add
      'FMADD.D', 'FMSUB.D', 'FNMADD.D', 'FNMSUB.D',
      // Arithmetic
      'FADD.D', 'FSUB.D', 'FMUL.D', 'FDIV.D', 'FSQRT.D',
      // Sign-inject
      'FSGNJ.D', 'FSGNJN.D', 'FSGNJX.D',
      // Min/Max
      'FMIN.D', 'FMAX.D',
      // Compare
      'FEQ.D', 'FLT.D', 'FLE.D',
      // Convert to/from integer (RV32)
      'FCVT.W.D', 'FCVT.WU.D', 'FCVT.D.W', 'FCVT.D.WU',
      // RV64 conversions
      'FCVT.L.D', 'FCVT.LU.D', 'FCVT.D.L', 'FCVT.D.LU',
      // Convert to/from single
      'FCVT.S.D', 'FCVT.D.S',
      // Move (RV64)
      'FMV.X.D', 'FMV.D.X',
      // Classify
      'FCLASS.D',
    ],
    Q: [
      // Load/Store
      'FLQ', 'FSQ',
      // Fused multiply-add
      'FMADD.Q', 'FMSUB.Q', 'FNMADD.Q', 'FNMSUB.Q',
      // Arithmetic
      'FADD.Q', 'FSUB.Q', 'FMUL.Q', 'FDIV.Q', 'FSQRT.Q',
      // Sign-inject
      'FSGNJ.Q', 'FSGNJN.Q', 'FSGNJX.Q',
      // Min/Max
      'FMIN.Q', 'FMAX.Q',
      // Compare
      'FEQ.Q', 'FLT.Q', 'FLE.Q',
      // Convert to/from integer
      'FCVT.W.Q', 'FCVT.WU.Q', 'FCVT.Q.W', 'FCVT.Q.WU',
      // RV64 conversions
      'FCVT.L.Q', 'FCVT.LU.Q', 'FCVT.Q.L', 'FCVT.Q.LU',
      // Convert to/from other FP formats
      'FCVT.S.Q', 'FCVT.Q.S', 'FCVT.D.Q', 'FCVT.Q.D',
      // Move
      'FMV.X.Q', 'FMV.Q.X',
      // Classify
      'FCLASS.Q',
    ],
    Zfh: [
      // Half-precision floating-point
      // Load/Store
      'FLH', 'FSH',
      // Fused multiply-add
      'FMADD.H', 'FMSUB.H', 'FNMADD.H', 'FNMSUB.H',
      // Arithmetic
      'FADD.H', 'FSUB.H', 'FMUL.H', 'FDIV.H', 'FSQRT.H',
      // Sign-inject
      'FSGNJ.H', 'FSGNJN.H', 'FSGNJX.H',
      // Min/Max
      'FMIN.H', 'FMAX.H',
      // Compare
      'FEQ.H', 'FLT.H', 'FLE.H',
      // Convert to/from integer
      'FCVT.W.H', 'FCVT.WU.H', 'FCVT.H.W', 'FCVT.H.WU',
      // RV64 conversions
      'FCVT.L.H', 'FCVT.LU.H', 'FCVT.H.L', 'FCVT.H.LU',
      // Convert to/from single
      'FCVT.S.H', 'FCVT.H.S',
      // Convert to/from double
      'FCVT.D.H', 'FCVT.H.D',
      // Convert to/from quad
      'FCVT.Q.H', 'FCVT.H.Q',
      // Move
      'FMV.X.H', 'FMV.H.X',
      // Classify
      'FCLASS.H',
    ],
    Zfhmin: [
      // Minimal half-precision (conversions only)
      'FCVT.S.H', 'FCVT.H.S',
    ],
    Zfa: [
      // Additional FP instructions
      // Load immediate
      'FLI.S', 'FLI.D', 'FLI.H', 'FLI.Q',
      // Min/Max magnitude
      'FMINM.S', 'FMAXM.S', 'FMINM.D', 'FMAXM.D',
      'FMINM.H', 'FMAXM.H', 'FMINM.Q', 'FMAXM.Q',
      // Quiet compare
      'FLEQ.S', 'FLTQ.S', 'FLEQ.D', 'FLTQ.D',
      'FLEQ.H', 'FLTQ.H', 'FLEQ.Q', 'FLTQ.Q',
      // Round to integer
      'FROUND.S', 'FROUNDNX.S', 'FROUND.D', 'FROUNDNX.D',
      'FROUND.H', 'FROUNDNX.H', 'FROUND.Q', 'FROUNDNX.Q',
      // Modular conversion (D only)
      'FCVTMOD.W.D',
      // High/pair move (RV32 with D)
      'FMVH.X.D', 'FMVP.D.X',
      // High/pair move (RV32/64 with Q)
      'FMVH.X.Q', 'FMVP.Q.X',
    ],
    Zfbfmin: [
      // BF16 conversions
      'FCVT.BF16.S', 'FCVT.S.BF16',
    ],
    Zfinx: [
      // Single-precision FP in integer registers
      // Same operations as F but use x registers
      'FADD.S', 'FSUB.S', 'FMUL.S', 'FDIV.S', 'FSQRT.S',
      'FMADD.S', 'FMSUB.S', 'FNMADD.S', 'FNMSUB.S',
      'FSGNJ.S', 'FSGNJN.S', 'FSGNJX.S',
      'FMIN.S', 'FMAX.S',
      'FEQ.S', 'FLT.S', 'FLE.S',
      'FCVT.W.S', 'FCVT.WU.S', 'FCVT.S.W', 'FCVT.S.WU',
      'FCLASS.S',
    ],
    Zdinx: [
      // Double-precision FP in integer registers
      'FADD.D', 'FSUB.D', 'FMUL.D', 'FDIV.D', 'FSQRT.D',
      'FMADD.D', 'FMSUB.D', 'FNMADD.D', 'FNMSUB.D',
      'FSGNJ.D', 'FSGNJN.D', 'FSGNJX.D',
      'FMIN.D', 'FMAX.D',
      'FEQ.D', 'FLT.D', 'FLE.D',
      'FCVT.W.D', 'FCVT.WU.D', 'FCVT.D.W', 'FCVT.D.WU',
      'FCVT.S.D', 'FCVT.D.S',
      'FCLASS.D',
    ],
    Zhinx: [
      // Half-precision FP in integer registers
      'FADD.H', 'FSUB.H', 'FMUL.H', 'FDIV.H', 'FSQRT.H',
      'FMADD.H', 'FMSUB.H', 'FNMADD.H', 'FNMSUB.H',
      'FSGNJ.H', 'FSGNJN.H', 'FSGNJX.H',
      'FMIN.H', 'FMAX.H',
      'FEQ.H', 'FLT.H', 'FLE.H',
      'FCVT.W.H', 'FCVT.WU.H', 'FCVT.H.W', 'FCVT.H.WU',
      'FCVT.S.H', 'FCVT.H.S',
      'FCLASS.H',
    ],
    Zhinxmin: [
      // Minimal half-precision in integer registers
      'FCVT.S.H', 'FCVT.H.S',
    ],
    Zmmul: [
      // Multiply-only (no division)
      'MUL', 'MULH', 'MULHSU', 'MULHU',
      // RV64
      'MULW',
    ],
    C: [
      // Integer compressed (base)
      'C.ADDI4SPN', 'C.LW', 'C.SW',
      'C.NOP', 'C.ADDI', 'C.LI',
      'C.ADDI16SP', 'C.LUI',
      'C.SRLI', 'C.SRAI', 'C.ANDI',
      'C.SUB', 'C.XOR', 'C.OR', 'C.AND', 'C.ADD',
      'C.J', 'C.BEQZ', 'C.BNEZ',
      'C.SLLI', 'C.LWSP', 'C.SWSP',
      'C.JR', 'C.MV', 'C.EBREAK', 'C.JALR',
      // RV32 only
      'C.JAL',
      // RV64 only
      'C.LD', 'C.SD', 'C.LDSP', 'C.SDSP',
      'C.ADDIW', 'C.ADDW', 'C.SUBW',
      // FP compressed (Zcf - RV32 with F)
      'C.FLW', 'C.FSW', 'C.FLWSP', 'C.FSWSP',
      // FP compressed (Zcd - with D)
      'C.FLD', 'C.FSD', 'C.FLDSP', 'C.FSDSP',
    ],
    Zca: [
      // Base compressed integer (no FP)
      'C.ADDI4SPN', 'C.LW', 'C.SW',
      'C.NOP', 'C.ADDI', 'C.LI',
      'C.ADDI16SP', 'C.LUI',
      'C.SRLI', 'C.SRAI', 'C.ANDI',
      'C.SUB', 'C.XOR', 'C.OR', 'C.AND', 'C.ADD',
      'C.J', 'C.BEQZ', 'C.BNEZ',
      'C.SLLI', 'C.LWSP', 'C.SWSP',
      'C.JR', 'C.MV', 'C.EBREAK', 'C.JALR',
      // RV32 only
      'C.JAL',
      // RV64 only
      'C.LD', 'C.SD', 'C.LDSP', 'C.SDSP',
      'C.ADDIW', 'C.ADDW', 'C.SUBW',
    ],
    Zcb: [
      // Byte/halfword load/store
      'C.LBU', 'C.LH', 'C.LHU', 'C.SB', 'C.SH',
      // Zero/sign extension
      'C.ZEXT.B', 'C.ZEXT.H', 'C.ZEXT.W',
      'C.SEXT.B', 'C.SEXT.H',
      // Logical/arithmetic
      'C.NOT', 'C.MUL',
    ],
    Zcf: [
      // Compressed single-precision float (RV32 with F)
      'C.FLW', 'C.FSW', 'C.FLWSP', 'C.FSWSP',
    ],
    Zcd: [
      // Compressed double-precision float (with D)
      'C.FLD', 'C.FSD', 'C.FLDSP', 'C.FSDSP',
    ],
    Zcmp: [
      // Push/pop
      'CM.PUSH', 'CM.POP', 'CM.POPRET', 'CM.POPRETZ',
      // Register move
      'CM.MVA01S', 'CM.MVSA01',
    ],
    Zcmt: [
      // Table jump
      'CM.JALT',
    ],
    Zcmop: [
      // May-be-operations (reserved NOPs)
      // Note: C.MOP.N has encoding but naming mismatch in dictionary
    ],
    B: [
      // Aggregates Zba + Zbb + Zbc + Zbs

      // Zba: Address-generation helpers
      'SH1ADD', 'SH2ADD', 'SH3ADD',
      'ADD.UW', 'SLLI.UW',
      'SH1ADD.UW', 'SH2ADD.UW', 'SH3ADD.UW',

      // Zbb: Logical operations
      'ANDN', 'ORN', 'XNOR',
      // Zbb: Deprecated logical operations
      'SLO', 'SLOI', 'SRO', 'SROI',
      // Zbb: Count leading/trailing zeros and population count
      'CLZ', 'CTZ', 'CPOP',
      'CLZW', 'CTZW', 'CPOPW',
      // Zbb: Min/Max
      'MIN', 'MINU', 'MAX', 'MAXU',
      // Zbb: Sign/zero extension
      'SEXT.B', 'SEXT.H', 'ZEXT.H',
      // Zbb: Rotate
      'ROL', 'ROR', 'RORI',
      'ROLW', 'RORW', 'RORIW',

      // Zbc: Carry-less multiply
      'CLMUL', 'CLMULH', 'CLMULR',

      // Zbs: Single-bit operations
      'BSET', 'BSETI',
      'BCLR', 'BCLRI',
      'BINV', 'BINVI',
      'BEXT', 'BEXTI',
    ],
    Zba: [
      // Address-generation helpers
      'SH1ADD', 'SH2ADD', 'SH3ADD',
      // RV64 only
      'ADD.UW', 'SLLI.UW',
      'SH1ADD.UW', 'SH2ADD.UW', 'SH3ADD.UW',
    ],
    Zbb: [
      // Logical operations
      'ANDN', 'ORN', 'XNOR',
      // Deprecated logical operations
      'SLO', 'SLOI', 'SRO', 'SROI',
      // Zbb: Count leading/trailing zeros and population count
      'CLZ', 'CTZ', 'CPOP',
      // RV64 word variants
      'CLZW', 'CTZW', 'CPOPW',
      // Min/Max
      'MIN', 'MINU', 'MAX', 'MAXU',
      // Sign/zero extension
      'SEXT.B', 'SEXT.H', 'ZEXT.H',
      // Rotate
      'ROL', 'ROR', 'RORI',
      // RV64 rotate variants
      'ROLW', 'RORW', 'RORIW',
    ],
    Zbc: [
      // Carry-less multiply
      'CLMUL', 'CLMULH', 'CLMULR',
    ],
    Zbs: [
      // Single-bit set
      'BSET', 'BSETI',
      // Single-bit clear
      'BCLR', 'BCLRI',
      // Single-bit invert
      'BINV', 'BINVI',
      // Single-bit extract
      'BEXT', 'BEXTI',
    ],
    V: [
      // Configuration
      'VSETVL', 'VSETVLI', 'VSETIVLI',

      // Unit-stride loads
      'VLE8.V', 'VLE16.V', 'VLE32.V', 'VLE64.V',
      'VLM.V',
      // Unit-stride stores
      'VSE8.V', 'VSE16.V', 'VSE32.V', 'VSE64.V',
      'VSM.V',
      // Strided loads/stores
      'VLSE8.V', 'VLSE16.V', 'VLSE32.V', 'VLSE64.V',
      'VSSE8.V', 'VSSE16.V', 'VSSE32.V', 'VSSE64.V',
      // Indexed loads/stores
      'VLUXEI8.V', 'VLUXEI16.V', 'VLUXEI32.V', 'VLUXEI64.V',
      'VLOXEI8.V', 'VLOXEI16.V', 'VLOXEI32.V', 'VLOXEI64.V',
      'VSUXEI8.V', 'VSUXEI16.V', 'VSUXEI32.V', 'VSUXEI64.V',
      'VSOXEI8.V', 'VSOXEI16.V', 'VSOXEI32.V', 'VSOXEI64.V',
      // Whole register loads/stores
      'VL1RE8.V', 'VL1RE16.V', 'VL1RE32.V', 'VL1RE64.V',
      'VL2RE8.V', 'VL2RE16.V', 'VL2RE32.V', 'VL2RE64.V',
      'VL4RE8.V', 'VL4RE16.V', 'VL4RE32.V', 'VL4RE64.V',
      'VL8RE8.V', 'VL8RE16.V', 'VL8RE32.V', 'VL8RE64.V',
      'VS1R.V', 'VS2R.V', 'VS4R.V', 'VS8R.V',

      // Integer arithmetic
      'VADD.VV', 'VADD.VX', 'VADD.VI',
      'VSUB.VV', 'VSUB.VX',
      'VRSUB.VX', 'VRSUB.VI',
      'VWADDU.VV', 'VWADDU.VX', 'VWSUBU.VV', 'VWSUBU.VX',
      'VWADD.VV', 'VWADD.VX', 'VWSUB.VV', 'VWSUB.VX',
      'VADC.VVM', 'VADC.VXM', 'VADC.VIM',
      'VMADC.VVM', 'VMADC.VXM', 'VMADC.VIM',
      'VSBC.VVM', 'VSBC.VXM',
      'VMSBC.VVM', 'VMSBC.VXM',
      // Bitwise
      'VAND.VV', 'VAND.VX', 'VAND.VI',
      'VOR.VV', 'VOR.VX', 'VOR.VI',
      'VXOR.VV', 'VXOR.VX', 'VXOR.VI',
      // Shifts
      'VSLL.VV', 'VSLL.VX', 'VSLL.VI',
      'VSRL.VV', 'VSRL.VX', 'VSRL.VI',
      'VSRA.VV', 'VSRA.VX', 'VSRA.VI',
      'VNSRL.WV', 'VNSRL.WX', 'VNSRL.WI',
      'VNSRA.WV', 'VNSRA.WX', 'VNSRA.WI',
      // Comparisons
      'VMSEQ.VV', 'VMSEQ.VX', 'VMSEQ.VI',
      'VMSNE.VV', 'VMSNE.VX', 'VMSNE.VI',
      'VMSLTU.VV', 'VMSLTU.VX', 'VMSLT.VV', 'VMSLT.VX',
      'VMSLEU.VV', 'VMSLEU.VX', 'VMSLEU.VI',
      'VMSLE.VV', 'VMSLE.VX', 'VMSLE.VI',
      'VMSGTU.VX', 'VMSGTU.VI', 'VMSGT.VX', 'VMSGT.VI',
      // Min/Max
      'VMINU.VV', 'VMINU.VX', 'VMIN.VV', 'VMIN.VX',
      'VMAXU.VV', 'VMAXU.VX', 'VMAX.VV', 'VMAX.VX',
      // Multiply
      'VMUL.VV', 'VMUL.VX',
      'VMULH.VV', 'VMULH.VX', 'VMULHU.VV', 'VMULHU.VX', 'VMULHSU.VV', 'VMULHSU.VX',
      'VWMUL.VV', 'VWMUL.VX', 'VWMULU.VV', 'VWMULU.VX', 'VWMULSU.VV', 'VWMULSU.VX',
      // Divide
      'VDIVU.VV', 'VDIVU.VX', 'VDIV.VV', 'VDIV.VX',
      'VREMU.VV', 'VREMU.VX', 'VREM.VV', 'VREM.VX',
      // Multiply-accumulate
      'VMACC.VV', 'VMACC.VX', 'VNMSAC.VV', 'VNMSAC.VX',
      'VMADD.VV', 'VMADD.VX', 'VNMSUB.VV', 'VNMSUB.VX',
      'VWMACCU.VV', 'VWMACCU.VX', 'VWMACC.VV', 'VWMACC.VX',
      'VWMACCSU.VV', 'VWMACCSU.VX', 'VWMACCUS.VX',
      // Merge/Move
      'VMERGE.VVM', 'VMERGE.VXM', 'VMERGE.VIM',
      'VMV.V.V', 'VMV.V.X', 'VMV.V.I',
      // Fixed-point
      'VSADDU.VV', 'VSADDU.VX', 'VSADDU.VI',
      'VSADD.VV', 'VSADD.VX', 'VSADD.VI',
      'VSSUBU.VV', 'VSSUBU.VX', 'VSSUB.VV', 'VSSUB.VX',
      'VSMUL.VV', 'VSMUL.VX',
      'VSSRL.VV', 'VSSRL.VX', 'VSSRL.VI',
      'VSSRA.VV', 'VSSRA.VX', 'VSSRA.VI',
      'VNCLIPU.WV', 'VNCLIPU.WX', 'VNCLIPU.WI',
      'VNCLIP.WV', 'VNCLIP.WX', 'VNCLIP.WI',

      // FP arithmetic
      'VFADD.VV', 'VFADD.VF', 'VFSUB.VV', 'VFSUB.VF', 'VFRSUB.VF',
      'VFWADD.VV', 'VFWADD.VF', 'VFWSUB.VV', 'VFWSUB.VF',
      'VFWADD.WV', 'VFWADD.WF', 'VFWSUB.WV', 'VFWSUB.WF',
      'VFMUL.VV', 'VFMUL.VF', 'VFDIV.VV', 'VFDIV.VF', 'VFRDIV.VF',
      'VFWMUL.VV', 'VFWMUL.VF',
      'VFMACC.VV', 'VFMACC.VF', 'VFNMACC.VV', 'VFNMACC.VF',
      'VFMSAC.VV', 'VFMSAC.VF', 'VFNMSAC.VV', 'VFNMSAC.VF',
      'VFMADD.VV', 'VFMADD.VF', 'VFNMADD.VV', 'VFNMADD.VF',
      'VFMSUB.VV', 'VFMSUB.VF', 'VFNMSUB.VV', 'VFNMSUB.VF',
      'VFWMACC.VV', 'VFWMACC.VF', 'VFWNMACC.VV', 'VFWNMACC.VF',
      'VFWMSAC.VV', 'VFWMSAC.VF', 'VFWNMSAC.VV', 'VFWNMSAC.VF',
      'VFSQRT.V', 'VFRSQRT7.V', 'VFREC7.V',
      'VFMIN.VV', 'VFMIN.VF', 'VFMAX.VV', 'VFMAX.VF',
      'VFSGNJ.VV', 'VFSGNJ.VF', 'VFSGNJN.VV', 'VFSGNJN.VF', 'VFSGNJX.VV', 'VFSGNJX.VF',
      // FP compare
      'VMFEQ.VV', 'VMFEQ.VF', 'VMFNE.VV', 'VMFNE.VF',
      'VMFLT.VV', 'VMFLT.VF', 'VMFLE.VV', 'VMFLE.VF',
      'VMFGT.VF', 'VMFGE.VF',
      'VFCLASS.V',
      'VFMERGE.VFM', 'VFMV.V.F',
      // FP conversions
      'VFCVT.XU.F.V', 'VFCVT.X.F.V', 'VFCVT.RTZ.XU.F.V', 'VFCVT.RTZ.X.F.V',
      'VFCVT.F.XU.V', 'VFCVT.F.X.V',
      'VFWCVT.XU.F.V', 'VFWCVT.X.F.V', 'VFWCVT.RTZ.XU.F.V', 'VFWCVT.RTZ.X.F.V',
      'VFWCVT.F.XU.V', 'VFWCVT.F.X.V', 'VFWCVT.F.F.V',
      'VFNCVT.XU.F.W', 'VFNCVT.X.F.W', 'VFNCVT.RTZ.XU.F.W', 'VFNCVT.RTZ.X.F.W',
      'VFNCVT.F.XU.W', 'VFNCVT.F.X.W', 'VFNCVT.F.F.W', 'VFNCVT.ROD.F.F.W',

      // Reductions
      'VREDSUM.VS', 'VREDMAXU.VS', 'VREDMAX.VS', 'VREDMINU.VS', 'VREDMIN.VS',
      'VREDAND.VS', 'VREDOR.VS', 'VREDXOR.VS',
      'VWREDSUMU.VS', 'VWREDSUM.VS',
      'VFREDUSUM.VS', 'VFREDOSUM.VS', 'VFREDMAX.VS', 'VFREDMIN.VS',
      'VFWREDUSUM.VS', 'VFWREDOSUM.VS',

      // Mask operations
      'VMAND.MM', 'VMNAND.MM', 'VMANDN.MM',
      'VMXOR.MM', 'VMOR.MM', 'VMNOR.MM', 'VMORN.MM', 'VMXNOR.MM',
      'VCPOP.M', 'VFIRST.M',
      'VMSBF.M', 'VMSIF.M', 'VMSOF.M',
      'VIOTA.M', 'VID.V',

      // Permutation
      'VMV.X.S', 'VMV.S.X', 'VFMV.F.S', 'VFMV.S.F',
      'VSLIDEUP.VX', 'VSLIDEUP.VI', 'VSLIDEDOWN.VX', 'VSLIDEDOWN.VI',
      'VSLIDE1UP.VX', 'VFSLIDE1UP.VF', 'VSLIDE1DOWN.VX', 'VFSLIDE1DOWN.VF',
      'VRGATHER.VV', 'VRGATHER.VX', 'VRGATHER.VI', 'VRGATHEREI16.VV',
      'VCOMPRESS.VM',
      // Whole register move
      'VMV1R.V', 'VMV2R.V', 'VMV4R.V', 'VMV8R.V',
    ],
    Zvfh: [
      // Vector half-precision FP
      'VFADD.VV', 'VFADD.VF', 'VFSUB.VV', 'VFSUB.VF',
      'VFMUL.VV', 'VFMUL.VF', 'VFDIV.VV', 'VFDIV.VF',
      'VFMACC.VV', 'VFMACC.VF', 'VFNMACC.VV', 'VFNMACC.VF',
      'VFMSAC.VV', 'VFMSAC.VF', 'VFNMSAC.VV', 'VFNMSAC.VF',
      'VFSQRT.V', 'VFMIN.VV', 'VFMAX.VV',
      'VMFEQ.VV', 'VMFNE.VV', 'VMFLT.VV', 'VMFLE.VV',
    ],
    Zvfhmin: [
      // Vector half-precision minimal (conversions)
      'VFWCVT.F.F.V', 'VFNCVT.F.F.W',
    ],
    Zvfbfmin: [
      // Vector BF16 conversions
      'VFNCVTBF16.F.F.W', 'VFWCVTBF16.F.F.V',
    ],
    Zvfbfwma: [
      // Vector BF16 widening multiply-accumulate
      'VFWMACCBF16.VV', 'VFWMACCBF16.VF',
    ],
    Zvbb: [
      // Vector bitmanip base
      'VANDN.VV', 'VANDN.VX',
      'VBREV.V', 'VBREV8.V', 'VREV8.V',
      'VCLZ.V', 'VCTZ.V', 'VCPOP.V',
      'VROL.VV', 'VROL.VX', 'VROR.VV', 'VROR.VX', 'VROR.VI',
      'VWSLL.VV', 'VWSLL.VX', 'VWSLL.VI',
    ],
    Zvbc: [
      // Vector carryless multiply
      'VCLMUL.VV', 'VCLMUL.VX',
      'VCLMULH.VV', 'VCLMULH.VX',
    ],
    Zvkg: [
      // Vector GCM/GMAC
      'VGHSH.VV', 'VGMUL.VV',
    ],
    Zvkned: [
      // Vector AES
      'VAESDF.VV', 'VAESDF.VS',
      'VAESDM.VV', 'VAESDM.VS',
      'VAESEF.VV', 'VAESEF.VS',
      'VAESEM.VV', 'VAESEM.VS',
      'VAESKF1.VI', 'VAESKF2.VI',
      'VAESZ.VS',
    ],
    Zvknha: [
      // Vector SHA-256
      'VSHA2MS.VV', 'VSHA2CH.VV', 'VSHA2CL.VV',
    ],
    Zvknhb: [
      // Vector SHA-256/512
      'VSHA2MS.VV', 'VSHA2CH.VV', 'VSHA2CL.VV',
    ],
    Zvksed: [
      // Vector SM4
      'VSM4K.VI', 'VSM4R.VV', 'VSM4R.VS',
    ],
    Zvksh: [
      // Vector SM3
      'VSM3C.VI', 'VSM3ME.VV',
    ],

    // Scalar Cryptography Extensions
    Zbkb: [
      // Crypto bitmanip (byte operations)
      'PACK', 'PACKH',
      // RV64
      'PACKW',
      // Also includes from Zbb
      'ROL', 'ROR', 'RORI',
      'ANDN', 'ORN', 'XNOR',
      // RV64
      'ROLW', 'RORW', 'RORIW',
      // Note: REV8, BREV8, ZIP, UNZIP not in dictionary
    ],
    Zbkc: [
      // Crypto carryless multiply
      'CLMUL', 'CLMULH',
    ],
    Zbkx: [
      // Crypto crossbar permutation
      'XPERM4', 'XPERM8',
    ],
    Zknd: [
      // AES decryption
      // RV32
      'AES32DSI', 'AES32DSMI',
      // RV64
      'AES64DS', 'AES64DSM', 'AES64IM',
      'AES64KS1I', 'AES64KS2',
    ],
    Zkne: [
      // AES encryption
      // RV32
      'AES32ESI', 'AES32ESMI',
      // RV64
      'AES64ES', 'AES64ESM',
      'AES64KS1I', 'AES64KS2',
    ],
    Zknh: [
      // SHA-2 hash
      // SHA-256
      'SHA256SIG0', 'SHA256SIG1', 'SHA256SUM0', 'SHA256SUM1',
      // SHA-512 (RV32)
      'SHA512SIG0H', 'SHA512SIG0L', 'SHA512SIG1H', 'SHA512SIG1L',
      'SHA512SUM0R', 'SHA512SUM1R',
      // SHA-512 (RV64)
      'SHA512SIG0', 'SHA512SIG1', 'SHA512SUM0', 'SHA512SUM1',
    ],
    Zksed: [
      // SM4 block cipher
      'SM4ED', 'SM4KS',
    ],
    Zksh: [
      // SM3 hash
      'SM3P0', 'SM3P1',
    ],
    Zkr: [
      // Entropy source (CSR access, no new instructions)
      // Uses SEED CSR via CSRRW/CSRRS
    ],
    Zkn: [
      // NIST crypto suite (combines Zbkb + Zbkc + Zbkx + Zkne + Zknd + Zknh)
      // Zbkb
      'PACK', 'PACKH', 'PACKW',
      'ROL', 'ROR', 'RORI', 'ROLW', 'RORW', 'RORIW',
      'ANDN', 'ORN', 'XNOR',
      // Zbkc
      'CLMUL', 'CLMULH',
      // Zbkx
      'XPERM4', 'XPERM8',
      // Zkne
      'AES32ESI', 'AES32ESMI', 'AES64ES', 'AES64ESM',
      'AES64KS1I', 'AES64KS2',
      // Zknd
      'AES32DSI', 'AES32DSMI', 'AES64DS', 'AES64DSM', 'AES64IM',
      // Zknh
      'SHA256SIG0', 'SHA256SIG1', 'SHA256SUM0', 'SHA256SUM1',
      'SHA512SIG0H', 'SHA512SIG0L', 'SHA512SIG1H', 'SHA512SIG1L',
      'SHA512SUM0R', 'SHA512SUM1R',
      'SHA512SIG0', 'SHA512SIG1', 'SHA512SUM0', 'SHA512SUM1',
    ],
    Zks: [
      // ShangMi crypto suite (combines Zbkb + Zbkc + Zbkx + Zksed + Zksh)
      // Zbkb
      'PACK', 'PACKH', 'PACKW',
      'ROL', 'ROR', 'RORI', 'ROLW', 'RORW', 'RORIW',
      'ANDN', 'ORN', 'XNOR',
      // Zbkc
      'CLMUL', 'CLMULH',
      // Zbkx
      'XPERM4', 'XPERM8',
      // Zksed
      'SM4ED', 'SM4KS',
      // Zksh
      'SM3P0', 'SM3P1',
    ],
    Zk: [
      // Scalar crypto base (combines Zkn + Zkr + Zkt)
      // All Zkn instructions
      'PACK', 'PACKH', 'PACKW',
      'ROL', 'ROR', 'RORI', 'ROLW', 'RORW', 'RORIW',
      'ANDN', 'ORN', 'XNOR',
      'CLMUL', 'CLMULH',
      'XPERM4', 'XPERM8',
      'AES32ESI', 'AES32ESMI', 'AES64ES', 'AES64ESM',
      'AES64KS1I', 'AES64KS2',
      'AES32DSI', 'AES32DSMI', 'AES64DS', 'AES64DSM', 'AES64IM',
      'SHA256SIG0', 'SHA256SIG1', 'SHA256SUM0', 'SHA256SUM1',
      'SHA512SIG0H', 'SHA512SIG0L', 'SHA512SIG1H', 'SHA512SIG1L',
      'SHA512SUM0R', 'SHA512SUM1R',
      'SHA512SIG0', 'SHA512SIG1', 'SHA512SUM0', 'SHA512SUM1',
    ],

    H: [
      // Hypervisor control & fences
      'HFENCE.VVMA', 'HFENCE.GVMA',
      'HINVAL.VVMA', 'HINVAL.GVMA',

      // Hypervisor guest memory access loads
      'HLV.B', 'HLV.BU',
      'HLV.H', 'HLV.HU',
      'HLV.W', 'HLV.WU',
      'HLV.D',

      // Hypervisor guest memory access stores
      'HSV.B',
      'HSV.H',
      'HSV.W',
      'HSV.D',

      // Hypervisor execute-from-guest helpers
      'HLVX.HU', 'HLVX.WU',

      // Hypervisor return
      'HRET',
    ],

    K: [
      // AES round / mixcolumn (representative NIST scalar crypto ops)
      'AES32ESMI', 'AES32ESI',
      'AES32DSMI', 'AES32DSI',
      'AES64ES', 'AES64ESM',
      'AES64DS', 'AES64DSM',
      'AES64IM',

      // SHA-2 helpers (scalar)
      'SHA256SIG0', 'SHA256SIG1',
      'SHA256SUM0', 'SHA256SUM1',
      'SHA512SIG0', 'SHA512SIG1',
      'SHA512SUM0', 'SHA512SUM1',

      // Entropy / random source (representative)
      'CSRRAND', 'CSRRAND64',
    ],
    S: [
      // Supervisor return and fences
      'SRET',
      'SFENCE.VMA',
      'WFI',
    ],
    U: [
      // User-level environment instructions (Volume II)
      // Note: U-mode mostly reuses unprivileged ISA, so only traps/syscalls are distinct
      'URET',
      'ECALL',
      'EBREAK',
    ],
  };

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

      const mnemonicList = extensionInstructions[ext.id];
      if (Array.isArray(mnemonicList) && mnemonicList.length) {
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
    const baseColor = isDiscontinued
      ? 'bg-slate-700 border-slate-500 text-slate-200'
      : colorClass;

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
	        className={`
	          relative p-2 rounded border cursor-pointer transition-all duration-200
	          ${
            highlighted
              ? 'ring-2 ring-yellow-400 bg-slate-800 scale-105 shadow-lg shadow-yellow-900/20'
              : ''
          }
          ${
            isDimmed(data.id) && !matchesSearch && !isSelected
              ? 'opacity-20 grayscale'
              : `${baseColor} hover:brightness-110`
          }
          ${isSelected ? 'z-20 shadow-xl shadow-yellow-900/40' : 'z-10'}
	        `}
	      >
	        {isDiscontinued && (
	          <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded border border-red-600/60 bg-red-950/40 text-[8px] font-mono uppercase tracking-tight text-red-200">
	            Discontinued
	          </span>
	        )}
	        <div className="flex items-center justify-between mb-0.5">
	          <span className="font-bold text-xs">{data.name}</span>
	        </div>
        <div className="text-[9px] leading-tight opacity-80 truncate">
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
	      const matchEntry = Object.entries(extensionInstructions).find(([, mnemonics]) =>
	        mnemonics.some((m) => m.toLowerCase() === q)
	      );

	      if (matchEntry) {
	        const [extId, mnemonics] = matchEntry;
	        targetExt = allExts.find((ext) => ext.id === extId) || null;
	        matchedMnemonic = mnemonics.find((m) => m.toLowerCase() === q) || null;
	        matchedDetails = targetExt?.instructions?.[matchedMnemonic] || null;
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 p-2 md:p-6 font-sans">
	      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
	        {/* Header */}
	        <div className="lg:col-span-12 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-700 pb-4 mb-2">
	          <div>
            <h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500">
              RISC-V Extension Landscape
            </h1>
            <p className="text-slate-500 text-xs md:text-sm mt-1">
              Interactive breakdown of RISC-V Extensions.
            </p>
          </div>

	          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 md:mt-0">
	            <div className="flex items-center gap-2">
	              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
	                Profiles
	              </span>
	              <div className="flex gap-2">
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
	                    className={`
	                      px-3 py-1 rounded text-xs font-bold border transition-all
	                      ${
		                        activeProfile === profile
		                          ? 'bg-yellow-500/20 border-yellow-500 text-yellow-200'
		                          : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-slate-500'
	                      }
	                    `}
	                  >
	                    {profile}
	                  </button>
	                ))}
	              </div>
	            </div>

	            <div className="hidden md:block h-7 w-px bg-slate-800" />

		            <div className="flex items-center gap-2">
		              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
		                Volumes
		              </span>
	              <div className="flex gap-2">
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
	                    className={`
	                      px-3 py-1 rounded text-xs font-bold border transition-all
	                      ${
		                        activeVolume === vol
		                          ? 'bg-yellow-500/20 border-yellow-500 text-yellow-200'
		                          : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-slate-500'
	                      }
	                    `}
	                  >
	                    Vol {vol}
	                  </button>
	                ))}
		              </div>
		            </div>

		            <div className="hidden md:block h-7 w-px bg-slate-700" />

		            <button
		              type="button"
		              onClick={() => {
		                setEncoderValidatorOpen(true);
		                setEncoderValidatorResult(null);
		                setEncoderValidatorCopyStatus(null);
		              }}
		              className="inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-bold border transition-all bg-slate-800 border-slate-600 text-slate-100 hover:border-slate-500"
		              title="Validate a proposed instruction encoding against existing instructions"
		            >
		              <ScanSearch size={16} />
		              Encoder Validator
		            </button>
		          </div>
		        </div>

	        {/* Main Grid */}
	        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-min">
	          {/* Search Bar – centered, before Base Architectures */}
		          <div className="col-span-full flex justify-center mb-3 -mt-1">
		            <div className="w-full max-w-lg">
		              <input
		                type="text"
		                value={searchQuery}
		                onChange={(e) => setSearchQuery(e.target.value)}
		                placeholder="Search extensions by ID, name, or description..."
		                className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-yellow-200/40 text-sm text-slate-100 placeholder-slate-400 shadow-sm shadow-yellow-900/10 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-300"
		              />
		              <p className="mt-1 text-[10px] text-center text-slate-500">
		                Typing here will highlight matching tiles in yellow (case-insensitive).
		              </p>
		            </div>
		          </div>

          {/* 1. Base */}
          <div className="space-y-2 col-span-full">
            <h3 className="text-blue-400 text-xs font-bold uppercase flex items-center gap-2">
              Base ISA
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {extensions.base.map((item) => (
                <ExtensionBlock
                  key={item.id}
                  data={item}
                  searchQuery={searchQuery}
                  colorClass="bg-blue-950 border-blue-800 text-blue-100"
                />
              ))}
            </div>
          </div>

	          {/* 2. Single-Letter Extensions */}
	          <div className="space-y-2 col-span-full">
	            <h3 className="text-emerald-400 text-xs font-bold uppercase flex items-center gap-2">
	              Single-Letter Extensions
	            </h3>
	            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
	              {extensions.standard.map((item) => (
	                <ExtensionBlock
                  key={item.id}
                  data={item}
                  searchQuery={searchQuery}
                  colorClass="bg-emerald-950 border-emerald-800 text-emerald-100"
                />
              ))}
            </div>
          </div>

          {/* 3. Z-Extensions (User Mode) */}
	          <div className="col-span-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-4 border-t border-slate-700">
	            <div className="space-y-2">
	              <h3 className="text-purple-400 text-xs font-bold uppercase flex items-center gap-2">
	                Bit Manipulation (Zb)
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_bit.map((item) => (
	                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="bg-purple-950/50 border-purple-800/50 text-purple-100"
                  />
                ))}
	              </div>
	            </div>

	            <div className="space-y-2">
	              <h3 className="text-amber-400 text-xs font-bold uppercase flex items-center gap-2">
	                Atomics (Za/Zic*)
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_atomics.map((item) => (
	                  <ExtensionBlock
	                    key={item.id}
	                    data={item}
	                    searchQuery={searchQuery}
	                    colorClass="bg-amber-950/40 border-amber-800/50 text-amber-100"
	                  />
	                ))}
	              </div>
	            </div>

		            <div className="space-y-2">
		              <h3 className="text-indigo-400 text-xs font-bold uppercase flex items-center gap-2">
		                Compressed Instructions (Zc)
		              </h3>
		              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_compress.map((item) => (
	                  <ExtensionBlock
	                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="bg-indigo-950/50 border-indigo-800/50 text-indigo-100"
                  />
                ))}
	              </div>
	            </div>

	            <div className="space-y-2">
	              <h3 className="text-pink-400 text-xs font-bold uppercase flex items-center gap-2">
	                Float & Numerics (Zf/Za)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {extensions.z_float.map((item) => (
                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="bg-pink-950/50 border-pink-800/50 text-pink-100"
                  />
                ))}
	              </div>
	            </div>

		            <div className="space-y-2">
		              <h3 className="text-sky-400 text-xs font-bold uppercase flex items-center gap-2">
		                Load/Store
		              </h3>
		              <div className="grid grid-cols-2 gap-2">
		                {extensions.z_load_store.map((item) => (
		                  <ExtensionBlock
		                    key={item.id}
		                    data={item}
		                    searchQuery={searchQuery}
		                    colorClass="bg-sky-950/40 border-sky-800/40 text-sky-100"
		                  />
		                ))}
		              </div>
		            </div>

		            <div className="space-y-2">
		              <h3 className="text-fuchsia-300 text-xs font-bold uppercase flex items-center gap-2">
		                Integer
		              </h3>
		              <div className="grid grid-cols-2 gap-2">
		                {extensions.z_integer.map((item) => (
		                  <ExtensionBlock
		                    key={item.id}
		                    data={item}
		                    searchQuery={searchQuery}
		                    colorClass="bg-fuchsia-950/40 border-fuchsia-800/40 text-fuchsia-100"
		                  />
		                ))}
		              </div>
		            </div>

	            <div className="space-y-2">
	              <h3 className="text-teal-400 text-xs font-bold uppercase flex items-center gap-2">
	                Vector Subsets (Zv/Zve)
	              </h3>
              <div className="grid grid-cols-2 gap-2">
                {extensions.z_vector.map((item) => (
                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="bg-teal-950/50 border-teal-800/50 text-teal-100"
                  />
                ))}
              </div>
            </div>

	            <div className="space-y-2">
	              <h3 className="text-red-400 text-xs font-bold uppercase flex items-center gap-2">
	                Security (Zi)
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_security.map((item) => (
	                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="bg-red-950/50 border-red-800/50 text-red-100"
                  />
                ))}
              </div>
            </div>

	            <div className="space-y-2">
	              <h3 className="text-slate-400 text-xs font-bold uppercase flex items-center gap-2">
	                Cryptography (Zk)
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_crypto.map((item) => (
	                  <ExtensionBlock
                    key={item.id}
                    data={item}
                    searchQuery={searchQuery}
                    colorClass="bg-slate-800 border-slate-600 text-slate-300"
                  />
                ))}
	              </div>
	            </div>

	            <div className="space-y-2">
	              <h3 className="text-violet-300 text-xs font-bold uppercase flex items-center gap-2">
	                Vector Cryptography (Zvk)
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_vector_crypto.map((item) => (
	                  <ExtensionBlock
	                    key={item.id}
	                    data={item}
	                    searchQuery={searchQuery}
	                    colorClass="bg-violet-950/40 border-violet-800/40 text-violet-100"
	                  />
	                ))}
	              </div>
	            </div>

	            <div className="space-y-2">
	              <h3 className="text-orange-400 text-xs font-bold uppercase flex items-center gap-2">
	                System
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_system.map((item) => (
	                  <ExtensionBlock
	                    key={item.id}
	                    data={item}
	                    searchQuery={searchQuery}
	                    colorClass="bg-orange-950/50 border-orange-800/50 text-orange-100"
	                  />
	                ))}
	              </div>
	            </div>

	            <div className="space-y-2">
	              <h3 className="text-orange-200 text-xs font-bold uppercase flex items-center gap-2">
	                Caches
	              </h3>
	              <div className="grid grid-cols-2 gap-2">
	                {extensions.z_caches.map((item) => (
	                  <ExtensionBlock
	                    key={item.id}
	                    data={item}
	                    searchQuery={searchQuery}
	                    colorClass="bg-orange-950/30 border-orange-700/30 text-orange-100"
	                  />
	                ))}
	              </div>
	            </div>
	          </div>

          {/* 4. S-Extensions (Privileged) */}
	          <div className="col-span-full pt-4 border-t border-slate-700">
            <h3 className="text-cyan-400 text-xs font-bold uppercase flex items-center gap-2 mb-3">
              S & Sv Extensions (Privileged)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-slate-500 font-bold">Memory (Sv)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.s_mem.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="bg-cyan-950/30 border-cyan-800/30 text-cyan-100"
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-slate-500 font-bold">Interrupts (Sm/Ss)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.s_interrupt.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="bg-cyan-950/30 border-cyan-800/30 text-cyan-100"
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-slate-500 font-bold">
                  Trap, Debug & Hypervisor Aux
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {extensions.s_trap.map((item) => (
                    <ExtensionBlock
                      key={item.id}
                      data={item}
                      searchQuery={searchQuery}
                      colorClass="bg-cyan-950/30 border-cyan-800/30 text-cyan-100"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

	        {/* Sidebar Info Panel */}
		        <div className="lg:col-span-3 mt-6 lg:mt-0">
		          <div className="sticky top-6 bg-slate-800/80 border border-slate-700 backdrop-blur-sm rounded-xl shadow-2xl min-h-[400px] max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden">
		            <div className="p-4 pb-3 border-b border-slate-700/60">
	              <h2 className="text-sm font-bold text-slate-400 flex items-center gap-2 uppercase tracking-wide">
	                <Info size={16} /> Selected Details
	              </h2>
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
	                      className="inline-flex items-start gap-1 text-3xl font-black text-white tracking-tight break-words hover:text-purple-300"
	                      title="Open reference link"
	                    >
	                      <span>{selectedExt.name}</span>
	                      <ArrowUpRight size={18} className="mt-1 shrink-0 opacity-80" />
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
                    <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                      Description
                    </h4>
                    <p className="text-slate-200 leading-snug">{selectedExt.desc}</p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded border border-slate-700">
                    <h4 className="text-[10px] uppercase tracking-wider text-blue-400 font-bold mb-2 flex items-center gap-1">
                      <ArrowRight size={10} /> Use Case
                    </h4>
                    <p className="text-slate-400 text-sm italic">{selectedExt.use}</p>
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

	                  {extensionInstructions[selectedExt.id] && (
	                    <div className="bg-slate-900 p-3 rounded border border-slate-700">
	                      <h4 className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-2">
	                        Instruction Set Snapshot ({extensionInstructions[selectedExt.id].length})
	                      </h4>
	                      <div className="flex flex-wrap gap-1">
		                        {extensionInstructions[selectedExt.id].map((mnemonic) => {
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
	                              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono tracking-tight ${
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
		                              className={`font-mono text-[11px] text-slate-100 bg-slate-800/70 border rounded px-2 py-1 ${
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
		                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
		                              Mask
		                            </div>
		                            <div
		                              className={`font-mono text-[11px] text-slate-100 bg-slate-800/70 border rounded px-2 py-1 ${
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
	                <div className="h-[300px] flex flex-col items-center justify-center text-slate-600 text-center space-y-4">
	                  <LayoutGrid size={32} className="opacity-50" />
	                  <p className="text-xs max-w-[150px]">
	                    Click any block on the left to view technical specifications and use cases.
	                  </p>
	                </div>
	              )}
	            </div>
		          </div>
		        </div>
	      </div>

	      {encoderValidatorOpen && (
	        <div className="fixed inset-0 z-50">
	          <div
	            className="absolute inset-0 bg-black/60"
	            onClick={() => setEncoderValidatorOpen(false)}
	            role="presentation"
	          />

	          <div className="absolute inset-0 p-3 md:p-8 flex items-start justify-center overflow-y-auto">
	            <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
	              <div className="p-4 border-b border-slate-700 flex items-start justify-between gap-3">
	                <div className="min-w-0">
	                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
	                    <ScanSearch size={16} /> Encoder Validator
	                  </h3>
	                  <p className="text-xs text-slate-500 mt-1">
	                    Provide either a 32-bit Encoding pattern (0/1/-), or Match+Mask (hex). The validator lists any
	                    existing instructions that overlap.
	                  </p>
	                </div>

	                <button
	                  type="button"
	                  className="p-2 rounded border border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500"
	                  onClick={() => setEncoderValidatorOpen(false)}
	                  title="Close"
	                >
	                  <X size={16} />
	                </button>
	              </div>

	              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
	                <div className="space-y-3">
	                  <div>
	                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
	                      Proposed mnemonic (optional)
	                    </div>
	                    <input
	                      type="text"
	                      value={encoderValidatorInput.mnemonic}
	                      onChange={(e) =>
	                        setEncoderValidatorInput((prev) => ({ ...prev, mnemonic: e.target.value }))
	                      }
	                      placeholder="e.g. MYOP"
	                      className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-300"
	                    />
	                  </div>

	                  <div>
	                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
	                      Encoding (required if no match/mask)
	                    </div>
	                    <input
	                      type="text"
	                      value={encoderValidatorInput.encoding}
	                      onChange={(e) =>
	                        setEncoderValidatorInput((prev) => ({ ...prev, encoding: e.target.value }))
	                      }
	                      placeholder="-----------------000-----1100111"
	                      className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-300"
	                    />
	                  </div>

	                  <div className="grid grid-cols-2 gap-3">
	                    <div>
	                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
	                        Match (hex)
	                      </div>
	                      <input
	                        type="text"
	                        value={encoderValidatorInput.match}
	                        onChange={(e) =>
	                          setEncoderValidatorInput((prev) => ({ ...prev, match: e.target.value }))
	                        }
	                        placeholder="0x67"
	                        className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-300"
	                      />
	                    </div>
	                    <div>
	                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
	                        Mask (hex)
	                      </div>
	                      <input
	                        type="text"
	                        value={encoderValidatorInput.mask}
	                        onChange={(e) =>
	                          setEncoderValidatorInput((prev) => ({ ...prev, mask: e.target.value }))
	                        }
	                        placeholder="0x707f"
	                        className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-300"
	                      />
	                    </div>
	                  </div>

	                  <div className="flex items-center gap-2 pt-1">
	                    <button
	                      type="button"
	                      onClick={runEncoderValidation}
	                      className="inline-flex items-center gap-2 px-3 py-2 rounded border border-yellow-500/50 bg-yellow-500/10 text-yellow-200 text-xs font-bold hover:border-yellow-400"
	                    >
	                      <ScanSearch size={16} />
	                      Validate
	                    </button>

	                    <button
	                      type="button"
	                      onClick={() => {
	                        setEncoderValidatorInput({ mnemonic: '', encoding: '', match: '', mask: '' });
	                        setEncoderValidatorResult(null);
	                        setEncoderValidatorCopyStatus(null);
	                      }}
	                      className="px-3 py-2 rounded border border-slate-600 bg-slate-800 text-xs font-bold text-slate-100 hover:border-slate-500"
	                    >
	                      Reset
	                    </button>
	                  </div>
	                </div>

	                <div className="space-y-3">
	                  <div className="flex items-center justify-between gap-2">
	                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
	                      Results
	                    </div>
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
	                      className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-600 bg-slate-800 text-xs font-bold text-slate-100 hover:border-slate-500 disabled:opacity-30"
	                      title="Copy validation report"
	                    >
	                      <Copy size={14} />
	                      {encoderValidatorCopyStatus === 'copied'
	                        ? 'Copied'
	                        : encoderValidatorCopyStatus === 'failed'
	                          ? 'Copy failed'
	                          : 'Copy report'}
	                    </button>
	                  </div>

	                  {!encoderValidatorResult ? (
	                    <div className="text-xs text-slate-400 border border-slate-700 rounded p-3 bg-slate-800/50">
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
	                        <div className="border border-slate-700 rounded p-3 bg-slate-800/50">
	                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
	                            Conflicts ({encoderValidatorResult.conflicts.length})
	                          </div>
	                          {encoderValidatorResult.conflicts.length === 0 ? (
	                            <div className="text-xs text-emerald-200">
	                              No overlaps found within the current instruction set database.
	                            </div>
	                          ) : (
	                            <div className="space-y-2 max-h-[340px] overflow-y-auto overscroll-contain pr-1">
	                              {encoderValidatorResult.conflicts.map((conflict) => (
	                                <div
	                                  key={`${conflict.other.extId}:${conflict.other.mnemonic}:${conflict.type}`}
	                                  className="border border-slate-700 rounded p-2 bg-slate-900/50"
	                                >
	                                  <div className="flex items-start justify-between gap-2">
	                                    <div className="min-w-0">
	                                      <div className="font-mono text-xs text-slate-200 break-words">
	                                        {conflict.other.mnemonic}{' '}
	                                        <span className="text-slate-500">({conflict.other.extId})</span>
	                                      </div>
	                                      <div className="text-[11px] text-slate-500">{conflict.other.extName}</div>
	                                    </div>
	                                    <span className="shrink-0 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide border bg-slate-800 text-slate-100 border-slate-600">
	                                      {conflict.type}
	                                    </span>
	                                  </div>

	                                  <div className="mt-2 text-xs text-slate-300">{conflict.why}</div>
	                                  <div className="mt-2 grid grid-cols-2 gap-2">
	                                    <div className="font-mono text-[10px] text-slate-400">
	                                      Common mask: {conflict.commonMask}
	                                    </div>
	                                    <div className="font-mono text-[10px] text-slate-400">
	                                      Example word: {conflict.exampleWord}
	                                    </div>
	                                  </div>
	                                </div>
	                              ))}
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
	    </div>
	  );
	};

export default RISCVExplorer;
