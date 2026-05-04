# Contributing to RISC-V Extensions Landscape

Thank you for contributing! This guide covers the contributor workflow.
For local setup, data model, and step-by-step data changes, see [README.md](./README.md).

## 1) Fork and branch

Fork the repo, then create a focused branch:

\```bash
git checkout -b type/short-description
\```

Branch name examples:
- `fix/sc-w-encoding`
- `feat/zfoo-extension`
- `docs/update-readme`

## 2) Commit message format

This project uses Conventional Commits:

\```
type: short description
\```

Common types:
- `feat` — new extension or instruction mapping
- `fix` — correcting an encoding or data error
- `perf` — performance improvement
- `docs` — documentation only
- `chore` — tooling or config

## 3) PR checklist

Before opening a PR:

- [ ] Build passes (`npm run build`)
- [ ] Sync ran if data changed (`node scripts/sync_instructions.mjs`)
- [ ] Only intended files are changed
- [ ] No unrelated formatting changes
- [ ] PR description explains what changed and why

## 4) PR scope

Keep PRs small and focused. One fix or addition per PR.
Avoid mixing unrelated changes — for example, don't combine an encoding fix with a UI change in the same PR.

## 5) Review expectations

- Maintainers may request changes — this is normal
- Be ready to update your branch if asked
- PRs with passing build and clean scope get reviewed faster