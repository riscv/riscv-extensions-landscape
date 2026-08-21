#!/usr/bin/env node
/**
 * Reports when riscv-opcodes has ratified encodings we do not carry.
 *
 * Reads only. It never writes src/instr_dict.json, and that restraint is the
 * whole design rather than caution for its own sake.
 *
 * src/instr_dict.json is hand-maintained, deliberately. It currently holds 300
 * mnemonics upstream does not: the 56 vlseg segment loads, which riscv-opcodes
 * does not express at all, and the 48 MOP and C.MOP encodings expanded from
 * upstream's three `_n` templates. Regenerating from upstream would delete
 * every one. So this reports drift and leaves the decision to a person, rather
 * than opening a PR that silently loses data.
 *
 * The comparison is on mnemonics, not encodings. A newly ratified extension
 * arrives as new mnemonics, which is the signal worth acting on. Comparing
 * match and mask would additionally flag every place we knowingly differ, every
 * week, which is how a check earns its way into being ignored.
 *
 * Two categories are excluded, each for a reason:
 *
 *   $pseudo_op    Assembler aliases. `mv` is `addi rd, rs, 0`; `nop` is
 *                 `addi x0, x0, 0`. Upstream defines 172. They are spellings of
 *                 encodings we already carry, so counting them as missing
 *                 reported 93 phantom gaps when this was first measured.
 *
 *   unratified/   Drafts, 32 files including rv_zvabd and rv_p. Reporting these
 *                 as missing would invite publishing unratified encodings as
 *                 though they were settled, the exact failure the withdrawn
 *                 bitmanip cleanup addressed. Counted and named, never flagged.
 *
 * Usage:
 *   node scripts/check-opcodes-drift.mjs [path-to-riscv-opcodes] [--json]
 *
 * Exits 0 when in sync, 1 when upstream has ratified encodings we lack. That
 * exit code is for the weekly workflow, not for CI on pull requests: upstream
 * moving is news, not a regression in the branch under review.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const opcodesDir = args.find((a) => !a.startsWith('--')) ?? '../riscv-opcodes';

const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.join(here, '..');

/**
 * Encodings we deliberately do not carry under upstream's name.
 *
 * Upstream writes MOP as three parameterised templates. We store the expansions
 * instead, because a template cannot be searched for, validated against, or
 * placed on the encoding map. Verify with:
 *   node -e "const d=require('./src/instr_dict.json'); \
 *            console.log(Object.keys(d).filter(k=>/^mop_r_/.test(k)).length)"
 * which prints 32, the expansion of mop_r_n.
 */
const EXPANDED_TEMPLATES = new Map([
  ['mop_r_n', 'expanded to MOP.R.0 through MOP.R.31'],
  ['mop_rr_n', 'expanded to MOP.RR.0 through MOP.RR.7'],
  ['c_mop_n', 'expanded to C.MOP.1 through C.MOP.15, odd values only'],
]);

/** Upstream mnemonic to our instr_dict key: lowercase, dots become underscores. */
const normalise = (mnemonic) => mnemonic.toLowerCase().replace(/\./g, '_');

/**
 * Pull the real encodings out of one riscv-opcodes extension file.
 *
 * One instruction per line, mnemonic first, then field and bit-range
 * assignments:
 *   andn  rd rs1 rs2 31..25=32 14..12=7 6..2=0x0C 1..0=3
 * with `#` comments, `$import other::inst` re-exports, and `$pseudo_op`.
 */
function parseExtensionFile(contents) {
  const real = [];
  const pseudo = [];
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('$pseudo_op')) {
      // $pseudo_op rv_i::addi mv rd rs1 31..20=0
      const name = line.split(/\s+/)[2];
      if (name) pseudo.push(normalise(name));
      continue;
    }
    // $import re-exports an instruction defined elsewhere, so its definition is
    // already counted in its own file. Skipping avoids double counting.
    if (line.startsWith('$')) continue;
    const name = line.split(/\s+/)[0];
    if (name) real.push(normalise(name));
  }
  return { real, pseudo };
}

/** Parse every file directly inside `dir`, ignoring subdirectories. */
function collect(dir) {
  const encodings = new Map(); // mnemonic -> Set of files defining it
  const pseudoOps = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = parseExtensionFile(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
    for (const m of parsed.real) {
      if (!encodings.has(m)) encodings.set(m, new Set());
      encodings.get(m).add(entry.name);
    }
    for (const m of parsed.pseudo) pseudoOps.add(m);
  }
  return { encodings, pseudoOps };
}

const extensionsDir = path.join(opcodesDir, 'extensions');
if (!fs.existsSync(extensionsDir)) {
  console.error(`Could not find ${extensionsDir}`);
  console.error('Clone it first:');
  console.error('  git clone --depth 1 https://github.com/riscv/riscv-opcodes.git ../riscv-opcodes');
  process.exit(2);
}

// Top level is ratified; the unratified/ subdirectory is counted separately and
// never treated as a gap.
const ratified = collect(extensionsDir);
const unratifiedDir = path.join(extensionsDir, 'unratified');
const unratified = fs.existsSync(unratifiedDir)
  ? collect(unratifiedDir)
  : { encodings: new Map(), pseudoOps: new Set() };

const ours = new Set(
  Object.keys(JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'instr_dict.json'), 'utf8')))
    .map(normalise),
);

const missing = [];
const templates = [];
for (const [mnemonic, files] of ratified.encodings) {
  if (ours.has(mnemonic)) continue;
  const reason = EXPANDED_TEMPLATES.get(mnemonic);
  if (reason) templates.push({ mnemonic, reason });
  else missing.push({ mnemonic, files: [...files].sort() });
}
missing.sort((a, b) => a.mnemonic.localeCompare(b.mnemonic));

// Reported as information, never as an error: mostly vlseg and MOP expansions.
const oursOnly = [...ours].filter(
  (m) => !ratified.encodings.has(m) && !unratified.encodings.has(m) && !ratified.pseudoOps.has(m),
);

const byFile = new Map();
for (const { mnemonic, files } of missing) {
  for (const f of files) {
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(mnemonic);
  }
}

if (asJson) {
  console.log(JSON.stringify({
    inSync: missing.length === 0,
    upstreamRatifiedEncodings: ratified.encodings.size,
    upstreamPseudoOps: ratified.pseudoOps.size,
    upstreamUnratifiedEncodings: unratified.encodings.size,
    ourEncodings: ours.size,
    ourEncodingsNotUpstream: oursOnly.length,
    expandedTemplates: templates,
    missing,
    missingByFile: Object.fromEntries(byFile),
  }, null, 2));
} else {
  console.log(`upstream ratified encodings : ${ratified.encodings.size}`);
  console.log(`upstream pseudo-ops         : ${ratified.pseudoOps.size} (aliases, excluded by design)`);
  console.log(`upstream unratified         : ${unratified.encodings.size} (drafts, not published)`);
  console.log(`ours                        : ${ours.size}`);
  console.log(`ours but not upstream       : ${oursOnly.length} (vlseg and MOP expansions)`);
  console.log('');
  for (const { mnemonic, reason } of templates) {
    console.log(`template  ${mnemonic} — ${reason}`);
  }
  if (templates.length) console.log('');

  if (missing.length === 0) {
    console.log('In sync. Upstream has no ratified encoding we do not carry.');
  } else {
    console.log(`${missing.length} ratified encoding(s) upstream that we do not carry:`);
    for (const [file, mnemonics] of [...byFile].sort()) {
      console.log(`  ${file.padEnd(22)} ${mnemonics.join(' ')}`);
    }
    console.log('');
    console.log('Not added automatically: src/instr_dict.json is hand-maintained and');
    console.log('carries entries upstream does not, which a regenerate would delete.');
  }
}

process.exit(missing.length === 0 ? 0 : 1);
