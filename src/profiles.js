/**
 * profiles.js — ratified RISC-V profile definitions.
 *
 * Extracted from risc_v_visualizer.jsx so that scripts and tests can reach it.
 * While it was a local const inside the component, nothing outside the UI could
 * validate it — which is how all four profiles came to generate a -march string
 * clang rejects (they mandate Sv39, and `sv39` is a satp translation mode rather
 * than an -march token). scripts/emit-march-matrix.mjs now emits a string per
 * profile so CI checks them against a real toolchain on every commit.
 *
 * Each entry lists the MANDATORY extensions of the profile's U64+S64 pair, by
 * catalog id. Dependencies are deliberately NOT expanded here: the graph does
 * that, so this stays a faithful transcription of the specification.
 */

// ---------------------------------------------------------------------------
// Profile Definitions – mandatory sets (U64+S64) for RVA20/22/23/RVB23
// ---------------------------------------------------------------------------
export const PROFILES = {
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
