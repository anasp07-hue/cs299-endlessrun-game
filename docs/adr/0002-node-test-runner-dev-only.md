# ADR-0002: Use Node's built-in test runner as a dev-only tool

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 0 (applies to all phases)

## Context
Tests have to run after every stage. SPEC §1 rules out build tools and npm packages for the game. The question is whether Node can be used at all.

## Decision
- Use **Node's built-in `node:test` and `node:assert`** (Node 18+; this machine has v24) to run `tests/*.test.js` with `node --test tests/`.
- No `package.json` dependencies, no `node_modules`, no test frameworks.
- Node is **only a developer tool**. The game still ships as static files and runs offline in a browser with no Node installed.

## Alternatives considered
- **Jest/Vitest:** need npm packages, which go against SPEC §1.
- **Browser-only test page:** works without Node but can't be scripted from the command line. Kept as a fallback in case Node isn't available.

## Consequences
- Tests are fast and scriptable with nothing to install.
- Tests can only import DOM-free modules, which reinforces ADR-0001.
