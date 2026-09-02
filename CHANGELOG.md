# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the catalogue in `src/riscv_extensions.json` is the product, a release
that changes what the catalogue *contains* is treated as a minor bump even when
no code changed. An entry that disappears takes any saved selection or `-march`
string referencing it with it, and that is the change most likely to affect
someone silently. Each release below records its catalogue size.

## [Unreleased]

### Changed

- The header and footer now carry the official RISC-V wordmark in place of the
  generic circuit icon and the words "RISC-V", so the title reads as the mark
  followed by "ISA Explorer". Geometry and colours come from the RISC-V brand
  kit's primary horizontal logo: the Color variant on light, White / Yellow on
  dark, each used verbatim rather than one tinted to imitate the other
- "ISA Explorer" in the header is now a flat Berkeley Blue on light and
  California Gold on dark, the two UC Berkeley colours, in place of the previous
  gold gradient. The wordmark beside it is sized so the words never stand taller
  than the mark

## [1.4.0] - 2026-09-01

Data release. Catalogue **228 → 219 entries**, 17 → 18 groups.

### Removed

Nine entries that appeared in no specification, were naming prefixes, or were
mistaken spellings (#254, and see #250 for the full research):

`K` · `Sscntrcfg` · `Sshpmcfg` · `Ssptead` · `Zcmlsd` · `Zicntrpmf` ·
`Zilsm*` · `Zilsm<x>b` · `Zitagelide`

`Zilsm*` and `Zilsm<x>b` carried those literal ids, glob characters and all.

### Added

- `Ziccid`, replacing `Zccid` (#253). This is a rename, not a new extension, and
  it is the only entry-id change outside #254.

### Changed

- Every extension now has a researched description and a use case, written
  against riscv-unified-db, the ISA manuals and the individual specifications
  rather than paraphrased from the name (#249)
- Misfiled extensions regrouped (#251, #252)
- Every privileged group classified as Volume II (#253)
- Extension data synced from riscv-unified-db (#257)

### Fixed

- **YAML export**: the `Sd*` and `Su*` privileged families now appear under
  `privilege_extensions:` instead of falling through to the general
  `extensions:` list. `isPrivilegeTag` matched only `Sv`/`Sm`/`Ss`. Anything
  parsing the export should expect the corrected placement (#259)

### Notes

Twelve catalogue entries flagged in #250 remain open, pending a source-or-remove
decision: six phantom names, five naming prefixes (#256), and `Smdid`, which
`riscv-smmtt` spells `Smsdid`.

## [1.3.0] - 2026-08-30

Catalogue 228 entries.

### Added

- Full-screen ISA builder studio, with persistence and profile conformance (#244)
- kapa.ai assistant on the page (#241), upgraded to a draggable branded widget (#245)
- A profile's mandatory set is held in place, and the tool states what it is for (#237)

### Changed

- **Renamed to RISC-V ISA Explorer** (#238), with every link repointed at the
  `riscv-isa-explorer` slug (#239) and the rename finished in proposal and
  workflow step names (#240)

### Fixed

- Atomics extensions moved out of the System group (#246)

## [1.2.0] - 2026-08-26

Catalogue 228 entries.

### Added

- Comparison mission-control dock and enhanced diff matrix (#223)
- Expanded full-screen instruction details modal (#222)
- UDB architecture configuration export for riscv-arch-test (#221)
- A configuration can choose its `oneOf` parameters (#235)
- A profile's optional extensions are offered in the builder (#234)
- UDB extension version captured during sync (#219), and versions synced (#220)
- `AGENTS.md` for AI agent contributors (#227)

### Fixed

- Profile menu kept inside the viewport (#233)
- Profile filter named for what it does (#231)
- Export popover made readable on light theme (#224)
- Light-theme classes the expand modal left paired (#228)
- UDB sync bot commits now pass the DCO gate (#229)

## [1.1.1] - 2026-08-25

Catalogue 228 entries.

### Added

- Skip link, focus trapping and the missing ARIA state (#204)
- Tests for the synchronisation tooling (#203)

### Fixed

- `SCTRCLR` attributed to `Smctr` as well as `Ssctr` (#207)
- Remaining workspace toasts held in a cleared timer (#202)

## [1.1.0] - 2026-08-25

Catalogue 227 → 228 entries.

### Added

- Side-by-side comparison of extensions, instructions and profiles (#191)
- Encoding-space map (#184), made readable (#186) and scaled against a
  meaningful interval (#187)
- Extension data synced from riscv-unified-db (#190)

### Changed

- riscv-opcodes drift is reported weekly rather than synced (#185)

### Fixed

- `RV128I` no longer claims `RV64I`'s ratification and instruction set (#193)
- `Sv32`'s level count, `Zvknhb`'s chapter link, and stale doc claims (#196)
- The E bases labelled ratified, and the badge no longer names a source it
  cannot vouch for (#195)
- Missing `Sm` extension added, `Zvfofp8min` labelled a draft (#199)
- `clang` declared in the graph provenance, `Zk` pointed at its chapter (#200)
- The sync-internal `tags` key is no longer shown as an extension attribute (#192)
- Comparison dialog made usable on a phone (#194)
- `graph:check` names the UDB branch it compared against (#198)
- `0x5b` corrected to `custom-2`, allocation separated from dataset (#188)

## [1.0.0] - 2026-08-20

First tagged release. Catalogue 227 entries.

### Added

- Ratification status shown, so a proposal cannot pass for a standard (#182)
- Shareable permalinks to an extension (#180)
- Pseudo-instructions carried for extensions with no new opcodes (#179)
- `.editorconfig` and a prettier config matching the code (#181)

### Changed

- URLs pointed at the `riscv` organisation ahead of the transfer (#183)

### Fixed

- Ratification dates that are not a year-month are rejected (#182)

[1.4.0]: https://github.com/riscv/riscv-isa-explorer/releases/tag/v1.4.0
[1.3.0]: https://github.com/riscv/riscv-isa-explorer/releases/tag/v1.3.0
[1.2.0]: https://github.com/riscv/riscv-isa-explorer/releases/tag/v1.2.0
[1.1.1]: https://github.com/riscv/riscv-isa-explorer/releases/tag/v1.1.1
[1.1.0]: https://github.com/riscv/riscv-isa-explorer/releases/tag/v1.1.0
[1.0.0]: https://github.com/riscv/riscv-isa-explorer/releases/tag/v1.0.0
