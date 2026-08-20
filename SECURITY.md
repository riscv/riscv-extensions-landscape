# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than in a public issue.

Use GitHub's [private vulnerability reporting][ghsa] on this repository, or
email **rsene@linuxfoundation.org**.

[ghsa]: https://github.com/rpsene/riscv-extensions-landscape/security/advisories/new

Please include what you found, how to reproduce it, and what an attacker could
do with it. You will get an acknowledgement within a few working days, and an
assessment once the report has been reviewed. If the report is valid, you will
be credited in the fix unless you prefer otherwise.

## Scope

This project is a static, client-side web application. It has no server, no
database, no accounts, and no user data: everything runs in the browser and
nothing is transmitted anywhere. That rules out most of the vulnerability
classes people look for, and it is worth saying so plainly rather than implying
a larger attack surface than exists.

In scope:

- Cross-site scripting or any other client-side code execution
- A supply-chain problem in the build or in a dependency we ship
- Anything in the GitHub Actions workflows that could be used to compromise the
  repository or the published site
- Content-integrity issues: a way to make the deployed site serve data that did
  not come from this repository

Out of scope:

- Incorrect ISA data. That is a correctness bug rather than a vulnerability, and
  it belongs in a normal issue where it can be discussed openly against the
  specification.
- Missing hardening headers on GitHub Pages, which we do not control.
- Automated scanner output with no demonstrated impact.

## Supported versions

The deployed site tracks `main`. Fixes land there and deploy automatically;
there are no maintained release branches to backport to.
