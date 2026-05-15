import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();

const catalogPath = path.join(
  workspaceRoot,
  'src',
  'riscv_extensions.json'
);

const catalog = JSON.parse(
  fs.readFileSync(catalogPath, 'utf8')
);

let totalExtensions = 0;
let mappedExtensions = 0;

const missingInstructionExtensions = [];

for (const [category, entries] of Object.entries(catalog)) {
  if (!Array.isArray(entries)) continue;

  for (const entry of entries) {
    totalExtensions += 1;

    const instructions = entry.instructions || {};

    const instructionCount = Object.keys(instructions).length;

    if (instructionCount > 0) {
      mappedExtensions += 1;
    } else {
      missingInstructionExtensions.push({
        id: entry.id,
        category
      });
    }
  }
}

const unmappedExtensions =
  totalExtensions - mappedExtensions;

const coverage =
  ((mappedExtensions / totalExtensions) * 100).toFixed(2);

console.log('\n=== RISC-V Extension Coverage Report ===\n');

console.log(`Total Extensions: ${totalExtensions}`);
console.log(`Mapped Extensions: ${mappedExtensions}`);
console.log(`Unmapped Extensions: ${unmappedExtensions}`);
console.log(`Coverage: ${coverage}%`);

console.log('\n=== Extensions Missing Instruction Data ===\n');

for (const ext of missingInstructionExtensions) {
  console.log(`- ${ext.id} (${ext.category})`);
}

console.log('\nCoverage report generation completed.\n');