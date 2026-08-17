#!/usr/bin/env node
/**
 * Emit a matrix of -march strings for toolchain validation.
 *
 * Prints one "<target-triple>\t<march-string>" pair per line. CI feeds each to
 * clang, which is the only check that validates our generated strings against a
 * real toolchain rather than against our own model of the specification.
 *
 * RV128I is deliberately excluded: clang has no riscv128 target, so the string
 * cannot be validated this way. That is a limitation of the checker, not a
 * statement about the string's correctness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMarchString } from '../src/marchUtils.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '..', 'src', 'riscv_extensions.json'), 'utf8'));
const ALL = Object.values(catalog).flat();

/** Representative selections, chosen to cover distinct code paths. */
const SELECTIONS = [
  { name: 'base only',            exts: [] },
  { name: 'imac',                 exts: ['M', 'A', 'C'] },
  { name: 'gc equivalent',        exts: ['M', 'A', 'F', 'D', 'C', 'Zicsr', 'Zifencei'] },
  { name: 'bitmanip',             exts: ['M', 'Zba', 'Zbb', 'Zbs'] },
  { name: 'float + csr',          exts: ['F', 'Zicsr'] },
  { name: 'double',               exts: ['M', 'A', 'F', 'D', 'Zicsr'] },
  { name: 'compressed only',      exts: ['C'] },
  { name: 'counters',             exts: ['Zicsr', 'Zicntr', 'Zihpm'] },
];

// RV128I omitted: no clang riscv128 target.
const BASES = ['RV32I', 'RV64I', 'RV32E', 'RV64E'];

const seen = new Set();
for (const base of BASES) {
  for (const sel of SELECTIONS) {
    const { march } = buildMarchString([base, ...sel.exts], ALL);
    if (!march || seen.has(march)) continue;
    seen.add(march);
    const triple = march.startsWith('rv32') ? 'riscv32-unknown-elf' : 'riscv64-unknown-elf';
    process.stdout.write(`${triple}\t${march}\n`);
  }
}
