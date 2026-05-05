import assert from 'node:assert/strict';

import { generateCoverageReport, formatMarkdownReport } from '../coverage_reporter.mjs';

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}

const sampleExtensions = {
  z_bit: [
    { id: 'Zba', name: 'Zba', instructions: { SH1ADD: { match: '0x0', mask: '0x0' } } },
    { id: 'Zbb', name: 'Zbb', instructions: {} },
  ],
  s_mem: [
    { id: 'Sv39', name: 'Sv39', instructions: {} },
  ],
};

const sampleInstrDict = {
  sh1add: { extension: ['rv_zba'] },
  andn: { extension: ['rv_zbb'] },
  sfence_vma: { extension: ['rv_s'] },
};

runTest('generateCoverageReport returns summary and categories', () => {
  const stats = generateCoverageReport(sampleExtensions, sampleInstrDict);
  assert.equal(stats.summary.total_extensions, 3);
  assert.equal(stats.summary.mapped, 1);
  assert.equal(stats.summary.unmapped, 2);
  assert.ok(stats.categories.bit_manipulation);
  assert.ok(stats.categories.supervisor);
});

runTest('generateCoverageReport marks expected unmapped entries', () => {
  const stats = generateCoverageReport(sampleExtensions, sampleInstrDict);
  const zbb = stats.extensions.find((item) => item.id === 'Zbb');
  assert.ok(zbb);
  assert.equal(zbb.status, 'UNMAPPED');
});

runTest('formatMarkdownReport outputs required sections and tables', () => {
  const stats = generateCoverageReport(sampleExtensions, sampleInstrDict);
  const md = formatMarkdownReport(stats);
  assert.match(md, /# RISC-V Coverage Report/);
  assert.match(md, /## Category Coverage/);
  assert.match(md, /\| Category \| Total \| Mapped/);
  assert.match(md, /\| Group \| Total \| Mapped/);
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error('coverage_reporter tests failed.');
}
