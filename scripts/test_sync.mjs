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
function isValidHex(value) {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

function isValidEncoding(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}
assert.strictEqual(
  isValidEncoding(
    '0000000 rs2 rs1 000 rd 0110011'
  ),
  true
);

assert.strictEqual(
  isValidEncoding(''),
  false
);

assert.strictEqual(
  isValidHex('0x33'),
  true
);

assert.strictEqual(
  isValidHex('0xfe00707f'),
  true
);

assert.strictEqual(
  isValidHex('33'),
  false
);

console.log('All synchronization tooling tests passed.');