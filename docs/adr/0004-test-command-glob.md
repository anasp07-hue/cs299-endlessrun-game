# ADR-0004: Run tests with `node --test 'tests/*.test.js'`

- **Status:** Accepted (amends the test command written in ADR-0001 and ADR-0002; the rest of both still stands)
- **Date:** 2026-11-17
- **Phase:** 0 (applies to all phases)

## Context
ADR-0001, ADR-0002, CLAUDE.md, SPEC.md, and the skills all said to run tests with `node --test tests/`. On this machine (Node v24.14.0), that command **fails**: newer Node versions (21+) treat positional arguments to `--test` as file paths or glob patterns, not directories. The result was `Error: Cannot find module '.../tests'` and 1 failing "test".

## Decision
- The test command is now **`node --test 'tests/*.test.js'`**. The quotes are there so Node expands the glob itself, which behaves the same in zsh, bash, and fish.
- All docs that mention the command (CLAUDE.md, SPEC.md, `docs/handoffs/README.md`, the `test-review` and `game-systems` skills) were updated to match. ADR-0001 and ADR-0002 were left unchanged, as accepted ADRs, and this ADR records the correction.
- This requires Node 21 or newer, up from the "Node 18+" in ADR-0002.

## Alternatives considered
- **`node --test` with no arguments:** this also works today, since Node's default pattern finds `**/*.test.js`. But it would pick up test files anywhere in the tree, including `libs/` if a vendored file ever matched. An explicit path is clearer.
- **Add a `package.json` script:** goes against the "no npm" spirit of SPEC §1 for very little benefit.

## Consequences
- The documented command works as written on the dev machine.
- Anyone on Node 18/20 needs `node --test tests/` instead. That's an acceptable cost, since this is a dev-only tool.
