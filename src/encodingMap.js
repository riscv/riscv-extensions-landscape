/**
 * The RISC-V opcode map, computed from the catalogue.
 *
 * Answers a question the extension list cannot: where the 32-bit encoding space
 * is actually used, and what is still free. 23 of the 32 base opcode slots are
 * occupied, so the map is about 72% full, and OP-V alone holds roughly a third
 * of all distinct instructions.
 *
 * Laid out as the ISA manual lays it out: rows are inst[4:2], columns are
 * inst[6:5], and every cell implies inst[1:0] = 11. Compressed instructions sit
 * outside that grid, in the three quadrants where inst[1:0] != 11.
 *
 * Pure functions in a .js file rather than inside the component, so the
 * arithmetic is testable without a DOM. Same reason tileMemo.js is separate:
 * node's test runner cannot import .jsx.
 */

/** Canonical names from the ISA manual's opcode map, keyed by inst[6:0]. */
export const OPCODE_NAMES = {
  0x03: 'LOAD',
  0x07: 'LOAD-FP',
  0x0b: 'custom-0',
  0x0f: 'MISC-MEM',
  0x13: 'OP-IMM',
  0x17: 'AUIPC',
  0x1b: 'OP-IMM-32',
  0x1f: '48b',
  0x23: 'STORE',
  0x27: 'STORE-FP',
  0x2b: 'custom-1',
  0x2f: 'AMO',
  0x33: 'OP',
  0x37: 'LUI',
  0x3b: 'OP-32',
  0x3f: '64b',
  0x43: 'MADD',
  0x47: 'MSUB',
  0x4b: 'NMSUB',
  0x4f: 'NMADD',
  0x53: 'OP-FP',
  0x57: 'OP-V',
  0x5b: 'OP-P',
  0x5f: '48b',
  0x63: 'BRANCH',
  0x67: 'JALR',
  0x6b: 'reserved',
  0x6f: 'JAL',
  0x73: 'SYSTEM',
  0x77: 'OP-VE',
  0x7b: 'custom-3',
  0x7f: '80b+',
};

/**
 * Collapse the catalogue to distinct instructions.
 *
 * A mnemonic appears under several extensions (ADD is in RV32I and in every
 * umbrella that includes it), so counting catalogue entries would inflate the
 * occupancy figures. Keyed by mnemonic, first definition wins, and every
 * extension offering it is recorded.
 */
export function distinctInstructions(catalog) {
  const entries = [];
  (function walk(node) {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (node.id && node.desc) entries.push(node);
      Object.values(node).forEach(walk);
    }
  })(catalog);

  const byMnemonic = new Map();
  for (const ext of entries) {
    for (const [mnemonic, details] of Object.entries(ext.instructions || {})) {
      if (!details || !details.match || !details.mask) continue;
      const existing = byMnemonic.get(mnemonic);
      if (existing) {
        if (!existing.extensions.includes(ext.id)) existing.extensions.push(ext.id);
        continue;
      }
      byMnemonic.set(mnemonic, {
        mnemonic,
        match: BigInt(details.match),
        mask: BigInt(details.mask),
        extensions: [ext.id],
      });
    }
  }
  return [...byMnemonic.values()];
}

/**
 * Is this a 32-bit instruction?
 *
 * inst[1:0] == 11 means 32-bit; anything else is a 16-bit compressed
 * instruction in quadrant 0, 1 or 2.
 *
 * Do NOT infer the width from the mask. An I-type mask of 0x707f is
 * numerically below 0xffff, so a "mask fits in 16 bits" test files ordinary
 * 32-bit instructions as compressed. That mistake put 47 of them into
 * quadrant 3, which does not exist.
 */
export function isThirtyTwoBit(match) {
  return Number(match & 0x3n) === 3;
}

/** Build the 32-slot opcode map plus the three compressed quadrants. */
export function buildEncodingMap(catalog) {
  const instructions = distinctInstructions(catalog);

  const slots = new Map(); // inst[6:0] -> instructions
  const quadrants = new Map([
    [0, []],
    [1, []],
    [2, []],
  ]);

  for (const instruction of instructions) {
    if (isThirtyTwoBit(instruction.match)) {
      const opcode = Number(instruction.match & 0x7fn);
      if (!slots.has(opcode)) slots.set(opcode, []);
      slots.get(opcode).push(instruction);
    } else {
      const quadrant = Number(instruction.match & 0x3n);
      quadrants.get(quadrant)?.push(instruction);
    }
  }

  // Every valid 32-bit opcode, occupied or not. The empty ones are the point:
  // they are what remains of the base encoding space.
  const cells = [];
  for (let col = 0; col < 4; col++) {
    // inst[6:5]
    for (let row = 0; row < 8; row++) {
      // inst[4:2]
      const opcode = (col << 5) | (row << 2) | 0x3;
      const held = (slots.get(opcode) || [])
        .slice()
        .sort((a, b) => a.mnemonic.localeCompare(b.mnemonic));
      cells.push({
        opcode,
        row,
        col,
        name: OPCODE_NAMES[opcode] || 'unassigned',
        count: held.length,
        instructions: held,
        extensions: [...new Set(held.flatMap((i) => i.extensions))].sort(),
      });
    }
  }

  const occupiedSlots = cells.filter((c) => c.count > 0).length;
  return {
    cells,
    quadrants: [0, 1, 2].map((q) => ({
      quadrant: q,
      count: quadrants.get(q).length,
      instructions: quadrants
        .get(q)
        .slice()
        .sort((a, b) => a.mnemonic.localeCompare(b.mnemonic)),
    })),
    totals: {
      distinct: instructions.length,
      thirtyTwoBit: instructions.filter((i) => isThirtyTwoBit(i.match)).length,
      compressed: instructions.filter((i) => !isThirtyTwoBit(i.match)).length,
      occupiedSlots,
      totalSlots: cells.length,
      busiest: cells.reduce((a, b) => (b.count > a.count ? b : a), cells[0]),
    },
  };
}
