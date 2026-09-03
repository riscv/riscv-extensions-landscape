/**
 * The exported configuration file.
 *
 * A real export was 5,974 lines, 97% of it a derived instruction catalogue; its
 * isa_string omitted 14 extensions that march carried while claiming to hold
 * them all; and a timestamp made two exports of one configuration differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIsaConfigYaml } from '../src/exportUtils.js';
import { COMPILER_COMPAT_NOTES } from '../src/marchUtils.js';
import { resolveSelection } from '../src/isaGraph.js';
import { PROFILES } from '../src/profiles.js';

const ALL = (() => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'riscv_extensions.json');
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).flat().filter(Boolean);
})();
const IDS = new Set(ALL.map((e) => e.id));
const resolve = (sel) => resolveSelection({ selected: sel, base: 'RV64I' }).resolved.filter((i) => IDS.has(i));
const RVA23 = resolve(PROFILES.RVA23);

test('the instruction catalogue is opt-in', () => {
  const lean = buildIsaConfigYaml(RVA23, ALL).yaml;
  const full = buildIsaConfigYaml(RVA23, ALL, { includeInstructions: true }).yaml;
  // The export that prompted this was 5,974 lines. The ceiling is deliberately
  // loose: what matters is that the derived catalogue is gone, not an exact count.
  assert.ok(lean.split('\n').length < 500, `default export is ${lean.split('\n').length} lines`);
  assert.ok(full.split('\n').length > 1000, 'opting in should bring the catalogue back');
  assert.ok(!lean.includes('mnemonic:'), 'the default must not carry instructions');
});

test('the same selection exports byte-identically', () => {
  // No timestamp: two exports of one configuration differing on a date defeats
  // diffing and version control, which is what a config file is for.
  assert.equal(buildIsaConfigYaml(RVA23, ALL).yaml, buildIsaConfigYaml(RVA23, ALL).yaml);
  assert.ok(!/Generated:/.test(buildIsaConfigYaml(RVA23, ALL).yaml));
});

test('isa_string holds everything march does', () => {
  const { yaml } = buildIsaConfigYaml(RVA23, ALL);
  const isa = yaml.match(/^isa_string: (\S+)/m)[1].toLowerCase().split('_').slice(1);
  const march = yaml.match(/^march: (\S+)/m)[1].split('_').slice(1);
  const missing = march.filter((t) => !isa.includes(t));
  assert.deepEqual(missing, [], 'isa_string must not omit extensions march carries');
});

test('the file says where its facts came from', () => {
  const { yaml } = buildIsaConfigYaml(RVA23, ALL);
  assert.match(yaml, /riscv-unified-db [0-9a-f]{7,}/, 'no UDB commit recorded');
  assert.match(yaml, /riscv-opcodes/);
});

test('inferred fields are labelled as inferred', () => {
  const { yaml } = buildIsaConfigYaml(RVA23, ALL);
  for (const field of ['user_spec_version', 'privilege_spec_version']) {
    const line = yaml.split('\n').find((l) => l.startsWith(field));
    assert.match(line, /# inferred/, `${field} is a guess and should say so`);
  }
});

test('the riscv-config format carries its required fields', () => {
  // Its schema requires exactly these five per hart, plus Vendor and Device.
  const { yaml } = buildIsaConfigYaml(RVA23, ALL, { format: 'riscv-config' });
  for (const field of ['ISA:', 'User_Spec_Version:', 'Privilege_Spec_Version:', 'supported_xlen:', 'physical_addr_sz:']) {
    assert.ok(yaml.includes(field), `riscv-config requires ${field}`);
  }
  assert.ok(yaml.includes('Vendor:') && yaml.includes('Device:'));
  assert.ok(yaml.includes('hart0:'));
});

test('the riscv-config ISA string follows their spelling, not ours', () => {
  const { yaml } = buildIsaConfigYaml(resolve(['RV64I', 'M', 'A', 'F', 'D', 'C']), ALL, { format: 'riscv-config' });
  const isa = yaml.match(/^ {2}ISA: (\S+)/m)[1];
  // First sub-extension attaches directly; theirs is not an underscore-led list.
  assert.match(isa, /^RV64I[A-Z]*Z[a-z]/, `first sub-extension must attach directly: ${isa}`);
  assert.ok(!/^RV64[A-Z]+_/.test(isa), 'no underscore before the first sub-extension');
});

test('V absorbs its vector members in the riscv-config format', () => {
  // riscv-config: "V and Zve* cannot exist together". clang tolerates the
  // redundant form, so only this format has to fold them in.
  const { yaml } = buildIsaConfigYaml(resolve(['RV64I', 'V']), ALL, { format: 'riscv-config' });
  const isa = yaml.match(/^ {2}ISA: (\S+)/m)[1];
  assert.ok(!/Zve|Zvl/i.test(isa), `V should absorb the vector sub-extensions: ${isa}`);
  assert.match(yaml, /folded into V/, 'the omission should be stated in the file');
});

test('the UDB format pins every extension to a version', () => {
  const { yaml } = buildIsaConfigYaml(resolve(['RV32I', 'M', 'C', 'Zba']), ALL, { format: 'udb' });
  // The whole point of the format: arch-test writes `version: "= 1.0.0"`, and
  // a name without one does not validate.
  assert.match(yaml, /kind: architecture configuration/);
  assert.match(yaml, /- \{ name: Zba, version: "= \d+\.\d+(\.\d+)?" \}/);
  for (const line of yaml.split('\n').filter((l) => l.trim().startsWith('- { name:'))) {
    assert.match(line, /version: "= \d/, `unpinned extension: ${line}`);
  }
});

test('the UDB format separates what it knows from what it cannot', () => {
  const { yaml, warnings } = buildIsaConfigYaml(resolve(['RV32I', 'M']), ALL, { format: 'udb' });
  // Someone hand-writing one of these cannot tell which params their extension
  // picks already forced. Losing that split makes the export a liability: it
  // would look complete while being roughly half a config.
  assert.match(yaml, /# GENERATED/, 'derived content should be labelled');
  assert.match(yaml, /# TODO — implementation choices/, 'undecidable content should be labelled');
  assert.match(yaml, /THIS FILE IS NOT COMPLETE/, 'the file must not read as ready to run');
  assert.ok(
    warnings.some((w) => /must be filled from your design document/.test(w)),
    'the caller should be warned, not only the file'
  );
});

test('the UDB format reports constraints with the extension that forced them', () => {
  const { yaml } = buildIsaConfigYaml(resolve(['RV64I', 'V', 'Zvl256b']), ALL, { format: 'udb' });
  // A bare "VLEN: 256" invites someone to lower it. Naming Zvl256b makes the
  // contradiction visible at the point of editing.
  assert.match(yaml, /# CONSTRAINED/);
  assert.match(yaml, /VLEN: 256.*required by .*Zvl256b/);
});

test('the UDB format flags unratified pins rather than hiding them', () => {
  // A ratified extension pins to a settled number; an unratified one pins to a
  // moving target. Both are legitimate, but only one is safe to forget about.
  const draft = ALL.find((e) => e.version && e.state && e.state !== 'ratified');
  if (!draft) return;
  const { yaml, warnings } = buildIsaConfigYaml(resolve(['RV64I', draft.id]), ALL, { format: 'udb' });
  if (!yaml.includes(`name: ${draft.id},`)) return;
  assert.match(yaml, new RegExp(`name: ${draft.id},.*version may still change`));
  assert.ok(warnings.some((w) => /not ratified/.test(w)));
});

test('the UDB export is reproducible', () => {
  const a = buildIsaConfigYaml(resolve(['RV64I', 'M', 'A']), ALL, { format: 'udb' }).yaml;
  const b = buildIsaConfigYaml(resolve(['RV64I', 'M', 'A']), ALL, { format: 'udb' }).yaml;
  assert.equal(a, b);
  assert.ok(!/Generated:/.test(a), 'no timestamp');
});

/**
 * A regression test that cannot go red is not a regression test.
 *
 * The first attempt at this assertion matched `^  - Sdext$` against the whole
 * document. Privileged extensions are emitted in the general `extensions:` list
 * as well, so the match landed there and the test passed even when nothing had
 * reached `privilege_extensions:` at all. Scope every assertion to the block it
 * is actually about.
 */
const section = (yaml, key) => {
  const lines = yaml.split('\n');
  const start = lines.indexOf(`${key}:`);
  if (start === -1) return null;
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z_]/.test(lines[i])) break; // next top-level key ends the block
    const m = /^ {2}- (\S+)$/.exec(lines[i]);
    if (m) items.push(m[1]);
  }
  return items;
};

test('every S-mode privileged family reaches privilege_extensions', () => {
  // One representative per S-family. Sd* and Su* were classified as ordinary
  // multi-letter extensions and silently fell through to `extensions:`.
  const families = ['Sdext', 'Sdtrig', 'Sddbltrp', 'Supm', 'Smepmp', 'Sv39'];
  const { yaml } = buildIsaConfigYaml(resolve(['RV64I', ...families]), ALL);
  const priv = section(yaml, 'privilege_extensions');

  assert.ok(priv, 'the export must contain a privilege_extensions block');
  for (const ext of families) {
    assert.ok(
      priv.includes(ext),
      `${ext} must appear under privilege_extensions; that block holds [${priv.join(', ')}]`,
    );
  }
});

test('shorthand bundles (Zkn, Zks, Zk) absorb their member subsets in the riscv-config format', () => {
  // riscv-config: "In presence of Zkn the subsets must be ignored in the ISA string".
  // clang tolerates the redundant form, but riscv-config rejects it outright.
  // Same absorption rule as V folding its Zve* and Zvl* vector members.
  const { yaml } = buildIsaConfigYaml(resolve(['RV64I', 'Zkn']), ALL, { format: 'riscv-config' });
  const isa = yaml.match(/^ {2}ISA: (\S+)/m)[1];
  assert.ok(isa.includes('Zkn'), `Zkn should be present in ISA string: ${isa}`);
  for (const member of ['Zbkb', 'Zbkc', 'Zbkx', 'Zknd', 'Zkne', 'Zknh']) {
    assert.ok(!isa.includes(member), `Zkn should absorb ${member} in riscv-config format: ${isa}`);
  }
  assert.match(yaml, /folded into Zkn/, 'the shorthand absorption should be stated in the file');
});

test('mutually exclusive base letters (I and E) are not emitted as extensions in export', () => {
  const { yaml, warnings } = buildIsaConfigYaml(['RV32E', 'I', 'M'], ALL, { format: 'landscape' });
  const isa = yaml.match(/^isa_string: (\S+)/m)[1];
  assert.ok(!/rv32ei/i.test(isa), `mutually exclusive base letters must not be combined: ${isa}`);
  assert.match(isa, /^RV32EM/);
  assert.ok(warnings.some((w) => /mutually exclusive/i.test(w)));
});

test('the compiler compatibility comment is emitted from marchUtils, not a local copy', () => {
  // The same prose lived in three hand-maintained places and drifted: the
  // export header claimed the vector-crypto family included Zvkg, the comment
  // written into every export omitted it, and marchUtils listed a fuller set.
  // Reading it from one export is what stops that recurring, so assert the
  // emitted block really is that export rather than a copy that matches today.
  const { yaml } = buildIsaConfigYaml(resolve(['RV64I', 'M', 'C']), ALL, { format: 'landscape' });
  assert.ok(COMPILER_COMPAT_NOTES.length > 0, 'the notes should not be empty');
  for (const note of COMPILER_COMPAT_NOTES) {
    assert.ok(
      yaml.includes(`#   ${note}`),
      `export must carry the note verbatim from marchUtils: ${note}`,
    );
  }

  // Carrying the text is not the same as reading it from one place: a local
  // copy that happens to match today would satisfy the loop above and then
  // drift, which is the exact failure this change exists to end. So also
  // assert exportUtils.js keeps no copy of its own.
  const exportSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'exportUtils.js'),
    'utf8',
  );
  for (const note of COMPILER_COMPAT_NOTES) {
    assert.ok(
      !exportSrc.includes(note),
      `exportUtils.js must not hold its own copy of: ${note}`,
    );
  }
});

test('the vector crypto note names its family by prefix, not by enumeration', () => {
  // Naming four of the 21 Zvk* entries in riscv_extensions.json is what went
  // stale. A prefix cannot.
  const note = COMPILER_COMPAT_NOTES.find((n) => /vector crypto/i.test(n));
  assert.ok(note, 'a vector crypto note should exist');
  assert.match(note, /Zvk\*/, 'name the family by prefix so it cannot drift as members are added');
});
