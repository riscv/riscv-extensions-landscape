# Extension Tag Reconciliation Analysis

## Executive Summary
The RISC-V Extensions Landscape catalog currently lists **220 extensions**. Automated synchronization with upstream `riscv-opcodes` is blocked by naming mismatches. This analysis identified **98 reconcilable tags**, **8 tags requiring manual review**, and **8 unmatched tags**.

## Methodology
1. **Semantic Normalization**: Strip `rv_` / `rv32_` / `rv64_` prefixes and lowercase for comparison.
2. **Alias Resolution**: Expand `G = I + M + A + F + D + Zicsr + Zifencei`.
3. **Fuzzy Matching**: Levenshtein similarity for near-matches (threshold: `0.8`).
4. **Confidence Scoring**: exact=1.0, normalized=0.95, fuzzy=0.7-0.9.

## Key Findings

### Fully Reconciled (Confidence >= 0.95)
| riscv-opcodes Tag | Catalog Name | Confidence | Reason |
|---|---|---:|---|
| `rv32_c` | `C` | 0.95 | normalized match |
| `rv32_c_f` | `C` | 0.95 | normalized match |
| `rv32_d_zfa` | `D` | 0.95 | normalized match |
| `rv32_zk` | `Zk` | 0.95 | normalized match |
| `rv32_zkn` | `Zkn` | 0.95 | normalized match |
| `rv32_zknd` | `Zknd` | 0.95 | normalized match |
| `rv32_zkne` | `Zkne` | 0.95 | normalized match |
| `rv32_zknh` | `Zknh` | 0.95 | normalized match |
| `rv64_a` | `A` | 0.95 | normalized match |
| `rv64_c` | `C` | 0.95 | normalized match |
| `rv64_d` | `D` | 0.95 | normalized match |
| `rv64_f` | `F` | 0.95 | normalized match |
| `rv64_h` | `H` | 0.95 | normalized match |
| `rv64_m` | `M` | 0.95 | normalized match |
| `rv64_q` | `Q` | 0.95 | normalized match |
| `rv64_q_zfa` | `Q` | 0.95 | normalized match |
| `rv64_zacas` | `Zacas` | 0.95 | normalized match |
| `rv64_zba` | `Zba` | 0.95 | normalized match |
| `rv64_zbb` | `Zbb` | 0.95 | normalized match |
| `rv64_zbkb` | `Zbkb` | 0.95 | normalized match |
| `rv64_zbs` | `Zbs` | 0.95 | normalized match |
| `rv64_zcb` | `Zcb` | 0.95 | normalized match |
| `rv64_zfh` | `Zfh` | 0.95 | normalized match |
| `rv64_zk` | `Zk` | 0.95 | normalized match |
| `rv64_zkn` | `Zkn` | 0.95 | normalized match |
| `rv64_zknd` | `Zknd` | 0.95 | normalized match |
| `rv64_zkne` | `Zkne` | 0.95 | normalized match |
| `rv64_zknh` | `Zknh` | 0.95 | normalized match |
| `rv64_zkr` | `Zkr` | 0.95 | normalized match |
| `rv64_zks` | `Zks` | 0.95 | normalized match |
| `rv_a` | `A` | 0.95 | normalized match |
| `rv_c` | `C` | 0.95 | normalized match |
| `rv_c_d` | `C` | 0.95 | normalized match |
| `rv_d` | `D` | 0.95 | normalized match |
| `rv_d_zfa` | `D` | 0.95 | normalized match |
| `rv_d_zfhmin` | `D` | 0.95 | normalized match |
| `rv_f` | `F` | 0.95 | normalized match |
| `rv_f_zfa` | `F` | 0.95 | normalized match |
| `rv_h` | `H` | 0.95 | normalized match |
| `rv_m` | `M` | 0.95 | normalized match |
| `rv_q` | `Q` | 0.95 | normalized match |
| `rv_q_zfa` | `Q` | 0.95 | normalized match |
| `rv_q_zfhmin` | `Q` | 0.95 | normalized match |
| `rv_s` | `S` | 0.95 | normalized match |
| `rv_sdext` | `Sdext` | 0.95 | normalized match |
| `rv_smrnmi` | `Smrnmi` | 0.95 | normalized match |
| `rv_ssctr` | `Ssctr` | 0.95 | normalized match |
| `rv_svinval` | `Svinval` | 0.95 | normalized match |
| `rv_svinval_h` | `H` | 0.95 | normalized match |
| `rv_u` | `U` | 0.95 | normalized match |
| `rv_v` | `V` | 0.95 | normalized match |
| `rv_zabha` | `Zabha` | 0.95 | normalized match |
| `rv_zabha_zacas` | `Zabha` | 0.95 | normalized match |
| `rv_zacas` | `Zacas` | 0.95 | normalized match |
| `rv_zalasr` | `Zalasr` | 0.95 | normalized match |
| `rv_zawrs` | `Zawrs` | 0.95 | normalized match |
| `rv_zba` | `Zba` | 0.95 | normalized match |
| `rv_zbb` | `Zbb` | 0.95 | normalized match |
| `rv_zbc` | `Zbc` | 0.95 | normalized match |
| `rv_zbkb` | `Zbkb` | 0.95 | normalized match |
| `rv_zbkc` | `Zbkc` | 0.95 | normalized match |
| `rv_zbkx` | `Zbkx` | 0.95 | normalized match |
| `rv_zbs` | `Zbs` | 0.95 | normalized match |
| `rv_zcb` | `Zcb` | 0.95 | normalized match |
| `rv_zcmop` | `Zcmop` | 0.95 | normalized match |
| `rv_zcmp` | `Zcmp` | 0.95 | normalized match |
| `rv_zcmt` | `Zcmt` | 0.95 | normalized match |
| `rv_zfbfmin` | `Zfbfmin` | 0.95 | normalized match |
| `rv_zfh` | `Zfh` | 0.95 | normalized match |
| `rv_zfh_zfa` | `Zfa` | 0.95 | normalized match |
| `rv_zfhmin` | `Zfhmin` | 0.95 | normalized match |
| `rv_zibi` | `Zibi` | 0.95 | normalized match |
| `rv_zicfiss` | `Zicfiss` | 0.95 | normalized match |
| `rv_zicond` | `Zicond` | 0.95 | normalized match |
| `rv_zicsr` | `Zicsr` | 0.95 | normalized match |
| `rv_zifencei` | `Zifencei` | 0.95 | normalized match |
| `rv_zimop` | `Zimop` | 0.95 | normalized match |
| `rv_zk` | `Zk` | 0.95 | normalized match |
| `rv_zkn` | `Zkn` | 0.95 | normalized match |
| `rv_zknh` | `Zknh` | 0.95 | normalized match |
| `rv_zkr` | `Zkr` | 0.95 | normalized match |
| `rv_zks` | `Zks` | 0.95 | normalized match |
| `rv_zksed` | `Zksed` | 0.95 | normalized match |
| `rv_zksh` | `Zksh` | 0.95 | normalized match |
| `rv_zvabd` | `Zvabd` | 0.95 | normalized match |
| `rv_zvbb` | `Zvbb` | 0.95 | normalized match |
| `rv_zvbc` | `Zvbc` | 0.95 | normalized match |
| `rv_zvfbfmin` | `Zvfbfmin` | 0.95 | normalized match |
| `rv_zvfbfwma` | `Zvfbfwma` | 0.95 | normalized match |
| `rv_zvfofp8min` | `Zvfofp8min` | 0.95 | normalized match |
| `rv_zvkg` | `Zvkg` | 0.95 | normalized match |
| `rv_zvkn` | `Zvkn` | 0.95 | normalized match |
| `rv_zvkned` | `Zvkned` | 0.95 | normalized match |
| `rv_zvknha` | `Zvknha` | 0.95 | normalized match |
| `rv_zvknhb` | `Zvknhb` | 0.95 | normalized match |
| `rv_zvks` | `Zvks` | 0.95 | normalized match |
| `rv_zvksed` | `Zvksed` | 0.95 | normalized match |
| `rv_zvksh` | `Zvksh` | 0.95 | normalized match |

### Needs Manual Review (0.7 <= Confidence < 0.95)
| riscv-opcodes Tag | Suggested Catalog | Confidence | Reason |
|---|---|---:|---|
| `rv64_zbp` | `Zba` | 0.833 | fuzzy match |
| `rv_zbp` | `Zba` | 0.833 | fuzzy match |
| `rv_zicbo` | `Zicbom` | 0.867 | fuzzy match |
| `rv_zvfbdot32f` | `Zvbdota` | 0.820 | fuzzy match |
| `rv_zvfofp4min` | `Zvfofp8min` | 0.880 | fuzzy match |
| `rv_zvfqbdot8f` | `Zvbdota` | 0.820 | fuzzy match |
| `rv_zvqbdot8i` | `Zvbdota` | 0.833 | fuzzy match |
| `rv_zvqdotq` | `Zvbdota` | 0.843 | fuzzy match |

### Unmatched (Confidence < 0.7)
| riscv-opcodes Tag | Issue |
|---|---|
| `rv64_i` | base ISA alias requires explicit RV32I/RV64I policy mapping |
| `rv_i` | base ISA alias requires explicit RV32I/RV64I policy mapping |
| `rv_system` | umbrella/system meta-tag has no direct catalog extension |
| `rv_zvfqldot8f` | no confident catalog equivalent after normalization/fuzzy matching |
| `rv_zvfwbdot16bf` | no confident catalog equivalent after normalization/fuzzy matching |
| `rv_zvfwldot16bf` | no confident catalog equivalent after normalization/fuzzy matching |
| `rv_zvqldot8i` | no confident catalog equivalent after normalization/fuzzy matching |
| `rv_zvzip` | no confident catalog equivalent after normalization/fuzzy matching |

## Impact Assessment
Current catalog coverage in this repository snapshot is **71/220 (32.27%)**. Implementing the **98 fully reconciled mappings** is projected to unblock instruction data for approximately **12 additional currently-unmapped extensions**, raising mapped extension coverage to about **83/220 (37.73%)**.

## Recommended Next Steps
1. Add normalization layer to `scripts/sync_instructions.mjs`.
2. Add a manual override map for the **8 review-needed tags**.
3. Define policy for meta-tags and custom/vendor tags (`X*`, umbrella tags, profile aliases).

## Appendix: Raw Data
See [results.json](./results.json) for machine-readable reconciliation data.
