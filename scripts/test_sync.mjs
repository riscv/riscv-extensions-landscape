import assert from 'node:assert';

function mnemonicToInstrDictKey(mnemonic) {
  return String(mnemonic)
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');
}

function normalizeExtensionId(extId, aliases) {
  return aliases[extId] || extId;
}

function isDryRun(args) {
  return args.includes('--dry-run');
}

console.log('Running synchronization tooling tests...');

assert.strictEqual(
  mnemonicToInstrDictKey('ADD'),
  'add'
);

assert.strictEqual(
  mnemonicToInstrDictKey('V-ADD'),
  'v_add'
);

assert.strictEqual(
  normalizeExtensionId(
    'zicntr',
    { zicntr: 'Zicntr' }
  ),
  'Zicntr'
);

assert.strictEqual(
  normalizeExtensionId(
    'rv32i',
    {}
  ),
  'rv32i'
);

assert.strictEqual(
  isDryRun(['--dry-run']),
  true
);

assert.strictEqual(
  isDryRun([]),
  false
);

console.log('All synchronization tooling tests passed.');