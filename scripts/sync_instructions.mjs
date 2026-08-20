/**
 * Populates `instructions` in src/riscv_extensions.json using src/instr_dict.json.
 * 
 * Routing hierarchy:
 * 1. UMBRELLA  - Resolves topologically via the `members` array.
 * 2. EXPLICIT  - Uses SPLIT_RULES for fine-grained subsets.
 * 3. TAG-BASED - Maps upstream tags to extensions.
 */

import fs from 'node:fs';
import path from 'node:path';

let validationErrors = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    validationErrors++;
  }
}

// Explicit routing for extensions that share upstream tags but require subsets.
const SPLIT_RULES = {
  // RV32/64 AMO and LR/SC separation
  Zaamo: [
    'AMOSWAP.W', 'AMOADD.W', 'AMOXOR.W', 'AMOAND.W', 'AMOOR.W', 'AMOMIN.W', 'AMOMINU.W', 'AMOMAX.W', 'AMOMAXU.W',
    'AMOSWAP.D', 'AMOADD.D', 'AMOXOR.D', 'AMOAND.D', 'AMOOR.D', 'AMOMIN.D', 'AMOMINU.D', 'AMOMAX.D', 'AMOMAXU.D',
  ],
  Zalrsc: ['LR.W', 'SC.W', 'LR.D', 'SC.D'],

  // Cache-block management subsets
  Zicbom: ['CBO.CLEAN', 'CBO.FLUSH', 'CBO.INVAL'],
  Zicboz: ['CBO.ZERO'],

  // Multiply-only subset of M
  Zmmul: ['MUL', 'MULH', 'MULHSU', 'MULHU', 'MULW'],

  // Integer-only compressed instructions (excludes FP-compressed ops)
  Zca: [
    'C.ADDI4SPN', 'C.LW', 'C.SW', 'C.NOP', 'C.ADDI', 'C.LI', 'C.ADDI16SP', 'C.LUI', 'C.ANDI', 'C.SUB', 'C.XOR',
    'C.OR', 'C.AND', 'C.ADD', 'C.J', 'C.BEQZ', 'C.BNEZ', 'C.LWSP', 'C.SWSP', 'C.JR', 'C.MV', 'C.EBREAK', 'C.JALR',
    'C.JAL', 'C.LD', 'C.SD', 'C.LDSP', 'C.SDSP', 'C.ADDIW', 'C.ADDW', 'C.SUBW', 'C.SLLI', 'C.SRLI', 'C.SRAI',
  ],

  // Vector FP subsets
  Zvfhmin: ['VFWCVT.F.F.V', 'VFNCVT.F.F.W'],
  Zvfh: [
    'VFADD.VV', 'VFADD.VF', 'VFSUB.VV', 'VFSUB.VF', 'VFMUL.VV', 'VFMUL.VF', 'VFDIV.VV', 'VFDIV.VF',
    'VFMACC.VV', 'VFMACC.VF', 'VFNMACC.VV', 'VFNMACC.VF', 'VFMSAC.VV', 'VFMSAC.VF', 'VFNMSAC.VV', 'VFNMSAC.VF',
    'VFMADD.VV', 'VFMADD.VF', 'VFNMADD.VV', 'VFNMADD.VF', 'VFMSUB.VV', 'VFMSUB.VF', 'VFNMSUB.VV', 'VFNMSUB.VF',
    'VFSQRT.V', 'VFMIN.VV', 'VFMIN.VF', 'VFMAX.VV', 'VFMAX.VF', 'VFSGNJ.VV', 'VFSGNJ.VF', 'VFSGNJN.VV', 'VFSGNJN.VF',
    'VFSGNJX.VV', 'VFSGNJX.VF', 'VMFEQ.VV', 'VMFEQ.VF', 'VMFNE.VV', 'VMFNE.VF', 'VMFLT.VV', 'VMFLT.VF', 'VMFLE.VV', 'VMFLE.VF',
    'VMFGT.VF', 'VMFGE.VF', 'VFCVT.X.F.V', 'VFCVT.XU.F.V', 'VFCVT.F.X.V', 'VFCVT.F.XU.V', 'VFCVT.RTZ.X.F.V', 'VFCVT.RTZ.XU.F.V',
    'VFWCVT.X.F.V', 'VFWCVT.XU.F.V', 'VFWCVT.F.X.V', 'VFWCVT.F.XU.V', 'VFWCVT.F.F.V', 'VFWCVT.RTZ.X.F.V', 'VFWCVT.RTZ.XU.F.V',
    'VFNCVT.X.F.W', 'VFNCVT.XU.F.W', 'VFNCVT.F.X.W', 'VFNCVT.F.XU.W', 'VFNCVT.F.F.W', 'VFNCVT.ROD.F.F.W',
    'VFNCVT.RTZ.X.F.W', 'VFNCVT.RTZ.XU.F.W', 'VFREDUSUM.VS', 'VFREDOSUM.VS', 'VFREDMAX.VS', 'VFREDMIN.VS',
    'VFWREDUSUM.VS', 'VFWREDOSUM.VS', 'VFMV.V.F', 'VFMV.F.S', 'VFMV.S.F', 'VFMERGE.VFM', 'VFSLIDE1UP.VF', 'VFSLIDE1DOWN.VF',
    'VFREC7.V', 'VFRSQRT7.V', 'VFCLASS.V', 'VFRSUB.VF', 'VFRDIV.VF', 'VFWADD.VV', 'VFWADD.VF', 'VFWADD.WV', 'VFWADD.WF',
    'VFWSUB.VV', 'VFWSUB.VF', 'VFWSUB.WV', 'VFWSUB.WF', 'VFWMUL.VV', 'VFWMUL.VF', 'VFWMACC.VV', 'VFWMACC.VF', 'VFWNMACC.VV', 'VFWNMACC.VF',
    'VFWMSAC.VV', 'VFWMSAC.VF', 'VFWNMSAC.VV', 'VFWNMSAC.VF',
  ],

  // In-register FP families (strictly excludes FP-register transfers: FLW/FSW/FMV.*)
  Zfinx: [
    'FMADD.S', 'FMSUB.S', 'FNMADD.S', 'FNMSUB.S', 'FADD.S', 'FSUB.S', 'FMUL.S', 'FDIV.S', 'FSQRT.S',
    'FSGNJ.S', 'FSGNJN.S', 'FSGNJX.S', 'FMIN.S', 'FMAX.S', 'FEQ.S', 'FLT.S', 'FLE.S', 'FCLASS.S',
    'FCVT.W.S', 'FCVT.WU.S', 'FCVT.S.W', 'FCVT.S.WU', 'FCVT.L.S', 'FCVT.LU.S', 'FCVT.S.L', 'FCVT.S.LU',
  ],
  Zdinx: [
    'FMADD.D', 'FMSUB.D', 'FNMADD.D', 'FNMSUB.D', 'FADD.D', 'FSUB.D', 'FMUL.D', 'FDIV.D', 'FSQRT.D',
    'FSGNJ.D', 'FSGNJN.D', 'FSGNJX.D', 'FMIN.D', 'FMAX.D', 'FEQ.D', 'FLT.D', 'FLE.D', 'FCLASS.D',
    'FCVT.W.D', 'FCVT.WU.D', 'FCVT.D.W', 'FCVT.D.WU', 'FCVT.S.D', 'FCVT.D.S', 'FCVT.L.D', 'FCVT.LU.D', 'FCVT.D.L', 'FCVT.D.LU',
  ],
  Zhinx: [
    'FMADD.H', 'FMSUB.H', 'FNMADD.H', 'FNMSUB.H', 'FADD.H', 'FSUB.H', 'FMUL.H', 'FDIV.H', 'FSQRT.H',
    'FSGNJ.H', 'FSGNJN.H', 'FSGNJX.H', 'FMIN.H', 'FMAX.H', 'FEQ.H', 'FLT.H', 'FLE.H', 'FCLASS.H',
    'FCVT.W.H', 'FCVT.WU.H', 'FCVT.H.W', 'FCVT.H.WU', 'FCVT.S.H', 'FCVT.H.S', 'FCVT.L.H', 'FCVT.LU.H', 'FCVT.H.L', 'FCVT.H.LU',
  ],
  Zhinxmin: ['FCVT.S.H', 'FCVT.H.S'],
};

function mnemonicToKey(mnemonic, keyMap) {
  const norm = String(mnemonic).trim().toLowerCase().replaceAll('.', '_');
  return keyMap.get(norm) ?? norm;
}

function applyInstructions(entry, mnemonics, instrDict, keyMap, missingLog) {
  for (const mnemonic of mnemonics) {
    const key = mnemonicToKey(mnemonic, keyMap);
    const details = instrDict[key];
    if (!details) {
      const list = missingLog.get(entry.id) ?? [];
      list.push(mnemonic);
      missingLog.set(entry.id, list);
      continue;
    }
    entry.instructions[mnemonic] = JSON.parse(JSON.stringify(details));
  }
}

// Initialization
const workspaceRoot = process.cwd();
const instrDictPath = path.join(workspaceRoot, 'src', 'instr_dict.json');
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');

if (!fs.existsSync(instrDictPath)) {
  console.error(`ERROR: instr_dict.json not found at ${instrDictPath}`);
  process.exit(1);
}
if (!fs.existsSync(catalogPath)) {
  console.error(`ERROR: riscv_extensions.json not found at ${catalogPath}`);
  process.exit(1);
}

const instrDict = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
const extensionsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const tagToMnemonics = new Map();
const keyMap = new Map();

for (const [rawKey, details] of Object.entries(instrDict)) {
  const normKey = rawKey.toLowerCase();
  keyMap.set(normKey, rawKey);

  const mnemonic = rawKey.toUpperCase().replaceAll('_', '.');
  for (let tag of (details.extension ?? [])) {
    tag = tag.toLowerCase();
    if (!tagToMnemonics.has(tag)) tagToMnemonics.set(tag, []);
    tagToMnemonics.get(tag).push(mnemonic);
  }
}

const extEntries = [];
const extMap = new Map();

for (const entries of Object.values(extensionsCatalog)) {
  if (!Array.isArray(entries)) continue;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !entry.id) continue;
    if (extMap.has(entry.id)) {
      console.error(`ERROR: Duplicate extension ID "${entry.id}" found in catalog.`);
      process.exit(1);
    }
    extEntries.push(entry);
    extMap.set(entry.id, entry);
  }
}

const missingLog = new Map();
let totalExts = extEntries.length;
let tagsPopulated = 0;
let splitRulePopulated = 0;
let umbrellaPopulated = 0;
let instructionsWritten = 0;

// Pass 1: Tag-Based & Explicit Routing
for (const entry of extEntries) {
  entry.instructions = {};

  if (entry.id in SPLIT_RULES) {
    applyInstructions(entry, SPLIT_RULES[entry.id], instrDict, keyMap, missingLog);
    if (Object.keys(entry.instructions).length > 0) splitRulePopulated++;
    continue;
  }

  if (entry.members?.length > 0) continue;

  let populated = false;
  for (let tag of (entry.tags ?? [])) {
    tag = tag.toLowerCase();
    const mnemonics = tagToMnemonics.get(tag);
    if (mnemonics?.length) {
      applyInstructions(entry, mnemonics, instrDict, keyMap, missingLog);
      populated = true;
    }
  }
  if (populated) tagsPopulated++;
}

// Pass 1b: RV32 Shift Mask Injection (ISA Vol I §2.6)
const RV32_BASE_IDS = new Set(['RV32I', 'RV32E']);
const RV32_SHIFTS = {
  SLLI: { encoding: '0000000----------001-----0010011', variable_fields: ['rd', 'rs1', 'shamt'], extension: ['rv_i'], match: '0x1013', mask: '0xfe00707f' },
  SRLI: { encoding: '0000000----------101-----0010011', variable_fields: ['rd', 'rs1', 'shamt'], extension: ['rv_i'], match: '0x5013', mask: '0xfe00707f' },
  SRAI: { encoding: '0100000----------101-----0010011', variable_fields: ['rd', 'rs1', 'shamt'], extension: ['rv_i'], match: '0x40005013', mask: '0xfe00707f' },
};

for (const entry of extEntries) {
  if (!RV32_BASE_IDS.has(entry.id)) continue;
  for (const [mnemonic, details] of Object.entries(RV32_SHIFTS)) {
    assert(!(mnemonic in entry.instructions), `Upstream instr_dict now provides ${mnemonic} for ${entry.id}. Remove this injection.`);
    entry.instructions[mnemonic] = JSON.parse(JSON.stringify(details));
  }
}

// Pass 2: Umbrella Topological Resolution
const umbrellaEntries = extEntries.filter(e => e.members?.length > 0);
const MAX_UMBRELLA_PASSES = 10;

for (let pass = 0; pass < MAX_UMBRELLA_PASSES; pass++) {
  let anyChanged = false;

  for (const entry of umbrellaEntries) {
    const unionMap = new Map();
    let allMembersReady = true;

    for (const memberId of entry.members) {
      const memberExt = extMap.get(memberId);
      if (!memberExt) {
        assert(false, `Umbrella ${entry.id} lists member "${memberId}" not in catalog.`);
        continue;
      }
      const memberCount = Object.keys(memberExt.instructions).length;
      if (memberExt.members?.length > 0 && memberCount === 0) {
        allMembersReady = false;
      }
      for (const [mnemonic, details] of Object.entries(memberExt.instructions)) {
        unionMap.set(mnemonic, details);
      }
    }

    if (!allMembersReady) continue;

    const prevCount = Object.keys(entry.instructions).length;
    entry.instructions = {};
    for (const [mnemonic, details] of unionMap) {
      entry.instructions[mnemonic] = JSON.parse(JSON.stringify(details));
    }
    const newCount = Object.keys(entry.instructions).length;

    if (newCount !== prevCount) anyChanged = true;
  }

  if (!anyChanged) break;
}

for (const entry of umbrellaEntries) {
  if (Object.keys(entry.instructions).length > 0) umbrellaPopulated++;
}

for (const entry of extEntries) {
  instructionsWritten += Object.keys(entry.instructions).length;
}

// Validation
if (missingLog.size > 0) {
  const missingSorted = [...missingLog.entries()].sort(([a], [b]) => a.localeCompare(b));
  console.warn('\n  Missing from instr_dict.json (SPLIT_RULES mnemonics not found upstream):');
  for (const [extId, list] of missingSorted) {
    console.warn(`    ${extId}: ${list.join(', ')}`);
  }
}

function assertExtension(id, { count, mustInclude = [], mustExclude = [] } = {}) {
  const ext = extMap.get(id);
  assert(!!ext, `${id} extension entry must exist in catalog`);
  if (!ext) return;

  if (count !== undefined) {
    assert(Object.keys(ext.instructions).length === count, `${id}: expected ${count} instructions, found ${Object.keys(ext.instructions).length}`);
  }
  for (const m of mustInclude) {
    assert(m in ext.instructions, `${id} must contain ${m}`);
  }
  for (const m of mustExclude) {
    assert(!(m in ext.instructions), `${id} must not contain ${m}`);
  }
}

// Validations
Object.keys(SPLIT_RULES).forEach(id => assertExtension(id, { count: SPLIT_RULES[id].length }));

if (process.argv.includes('--strict') && missingLog.size > 0) {
  assert(false, `Strict mode: ${missingLog.size} extension(s) have unresolved SPLIT_RULES mnemonics.`);
}

assertExtension('Zaamo', { mustExclude: ['LR.W', 'SC.W', 'LR.D', 'SC.D'] });
assertExtension('Zalrsc', { mustInclude: ['LR.W', 'SC.W', 'LR.D', 'SC.D'] });
assertExtension('Zmmul', { mustInclude: ['MUL'], mustExclude: ['DIV', 'DIVU', 'REM', 'REMU', 'DIVW', 'DIVUW', 'REMW', 'REMUW'] });
assertExtension('Zicbom', { mustExclude: ['CBO.ZERO'] });
assertExtension('Zicboz', { mustInclude: ['CBO.ZERO'], mustExclude: ['CBO.CLEAN'] });

const rv32iExt = extMap.get('RV32I');
assert(!!rv32iExt, 'RV32I extension entry must exist in catalog');
if (rv32iExt) {
  for (const mnemonic of ['SLLI', 'SRLI', 'SRAI']) {
    const instr = rv32iExt.instructions[mnemonic];
    assert(!!instr, `RV32I must contain ${mnemonic}`);
    if (instr) assert(instr.mask === '0xfe00707f', `RV32I ${mnemonic} mask must be 0xfe00707f (5-bit shamt)`);
  }
}

assertExtension('Zfinx', { mustExclude: ['FLW', 'FSW', 'FMV.X.W', 'FMV.W.X'] });
assertExtension('Zdinx', { mustExclude: ['FLD', 'FSD', 'FMV.X.D', 'FMV.D.X'] });
assertExtension('Zhinx', { mustExclude: ['FLH', 'FSH'] });

for (const entry of umbrellaEntries) {
  assert(Object.keys(entry.instructions).length > 0, `Umbrella ${entry.id} failed to converge.`);
  for (const memberId of entry.members) {
    const memberExt = extMap.get(memberId);
    if (memberExt) {
      assert(memberId === 'Zkt' || Object.keys(memberExt.instructions).length > 0, `Umbrella ${entry.id} relies on ${memberId}, which is empty.`);
    }
  }
}

// These counts rose when the ratified bitmanip instructions were added. Zbb
// gained ORC.B and REV8 (+2), and Zbkb gained BREV8, ZIP, UNZIP and REV8.RV32,
// which carries +4 into every umbrella that includes Zbkb.
// B then fell from 44 to 40 when SLO, SRO, SLOI and SROI were removed. Those are
// draft bitmanip shift-ones operations, dropped before ratification, which our
// vendored instr_dict still tagged rv_zbb and rv64_zbb, so they surfaced inside
// a ratified extension.
assertExtension('B', { count: 40 });
// Pinned explicitly because this is the count that was wrong: ratified Zbb has
// 24 instructions across RV32 and RV64, and the four draft ops made it read 28.
assertExtension('Zbb', { count: 24 });
assertExtension('Zk', { count: 51 }); // Zkn(45) ∪ Zks(24) minus shared Zbkb/Zbkc/Zbkx = 51 unique

const zkExt = extMap.get('Zk');
assert(zkExt?.members?.includes('Zkt'), 'Zk umbrella must include Zkt.');
assert(!extMap.get('B')?.members?.includes('Zbc'), 'B must not include Zbc.');

for (const entry of extEntries) {
  assert(!(entry.id in SPLIT_RULES && entry.members?.length > 0), `${entry.id} has both SPLIT_RULES and members.`);
}

assertExtension('Zca', { mustExclude: ['C.FLW', 'C.FSW', 'C.FLWSP', 'C.FSWSP'] });
assertExtension('Zvfh', { mustExclude: ['VFIRST.M'] });
assertExtension('Zvfhmin');
assertExtension('Zhinxmin');

const KNOWN_POPULATED_TAG_EXTS = ['RV32I', 'RV64I', 'M', 'A', 'F', 'D', 'C', 'V'];
for (const id of KNOWN_POPULATED_TAG_EXTS) {
  const ext = extMap.get(id);
  if (ext) assert(Object.keys(ext.instructions).length > 0, `Core extension ${id} is unexpectedly empty.`);
}

assertExtension('Zkn', { count: 45 });
assertExtension('Zks', { count: 24 });

const rv64iExt = extMap.get('RV64I');
assert(!!rv64iExt, 'RV64I extension entry must exist in catalog');
if (rv64iExt) {
  for (const mnemonic of ['SLLI', 'SRLI', 'SRAI']) {
    const instr = rv64iExt.instructions[mnemonic];
    assert(!!instr, `RV64I must contain ${mnemonic}`);
    if (instr) assert(instr.mask === '0xfc00707f', `RV64I ${mnemonic} mask must be 0xfc00707f (6-bit shamt)`);
  }
}

if (validationErrors > 0) {
  console.error(`\nValidation failed with ${validationErrors} error(s). riscv_extensions.json was NOT modified.`);
  process.exit(1);
}
console.log('  All validation checks passed.\n');

// Atomic Write & Report
//
// --dry-run stops here rather than earlier on purpose: everything above,
// including the validation gate, has already run, so the summary below
// describes exactly what a real run would produce.
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  const next = JSON.stringify(extensionsCatalog, null, 2) + '\n';
  const current = fs.readFileSync(catalogPath, 'utf8');
  console.log('  DRY RUN: no files were modified.');
  console.log(current === next
    ? '  riscv_extensions.json is already up to date.\n'
    : `  riscv_extensions.json would change (${current.length} -> ${next.length} bytes).\n`);
} else {
  const tmpPath = catalogPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(extensionsCatalog, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, catalogPath);
}

const totalPopulated = tagsPopulated + splitRulePopulated + umbrellaPopulated;
const emptyExts = totalExts - totalPopulated;
const coverage = ((totalPopulated / totalExts) * 100).toFixed(1);

console.log('\nSync Complete');
console.log(`  Source: ${path.relative(workspaceRoot, instrDictPath)}`);
console.log(`  Target: ${path.relative(workspaceRoot, catalogPath)}\n`);
console.log(`  Total extensions:        ${totalExts}`);
console.log(`  Populated via tags:      ${tagsPopulated}`);
console.log(`  Populated via split:     ${splitRulePopulated}`);
console.log(`  Populated via umbrella:  ${umbrellaPopulated}`);
console.log(`  Still empty:             ${emptyExts}`);
console.log(`  Coverage:                ${totalPopulated} / ${totalExts} (${coverage}%)`);
console.log(`  Instructions written:    ${instructionsWritten}\n`);
