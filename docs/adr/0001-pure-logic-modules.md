# ADR-0001: Keep game rules in pure, testable logic modules

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 0 (applies to all phases)

## Context
SPEC §2 originally put everything in a single `game.js` and planned to split it into modules only after it passed about 1,500 lines. The project requires tests after every stage. Rules like spawn fairness, collision, and scoring are the parts most likely to break quietly, but code that depends on the DOM or three.js can't be tested in Node.

## Decision
- Game rules live in **ES modules under `js/logic/`**, with no access to `window`, `document`, `localStorage`, or `THREE`. Examples: `rng.js`, `config.js`, `collision.js`, `spawner.js`, `difficulty.js`, `scoring.js`, `physics.js`, `highscore.js`.
- Functions take plain values and return plain values. Randomness comes from an injected seeded RNG.
- Browser-only code (rendering, input, UI, audio, `localStorage` access) stays in `game.js`, or later in `js/*.js` view modules, and calls into `js/logic/`.
- Browsers load these modules natively through `<script type="module">`, so no build step is needed.

## Alternatives considered
- **Single `game.js` and split later:** simpler at first, but logic can't be tested until the refactor, and that refactor is risky to do once the code is large.
- **Tests in the browser only (`tests/index.html`):** no Node needed, but the tests can't run from the command line after every stage.

## Consequences
- Logic can be tested with `node --test tests/` from Phase 0 onward.
- Open question SPEC §10 #2 is partly answered: logic is modular from the start. Whether the view code gets split is still decided later.
- Each module adds an import, which is a small cost.
