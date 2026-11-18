# ADR-0010: Game title is "Apocalypse Run"; storage keys keep the old prefix

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 3 (SPEC §9), during review
- **Resolves:** SPEC §10 open question 1 (game title)

## Context
"Neon Wasteland" was a working name (SPEC §10, question 1). During the Phase 3 review the user asked to rename the game to "Apocalypse Run". The request was spelled "Apocolypse Run"; we use the standard spelling "Apocalypse", and the user was told so they can change it. The old name was also in the `localStorage` key `neonWasteland.highScore` (SPEC §4, ADR-0008) and the planned `neonWasteland.settings`.

## Decision
- Everything a player or developer reads is now **Apocalypse Run**: the page `<title>`, the menu heading (APOCALYPSE / RUN), the SPEC and CLAUDE.md titles, the project skills, and the debug console prefix.
- **The storage keys don't change.** They stay `neonWasteland.highScore` and `neonWasteland.settings`. They're internal identifiers that players never see, and renaming them would silently reset everyone's saved high score.

## Alternatives considered
- **Rename the keys too, and migrate old values on load:** more code and a migration test, all for a name nobody sees.
- **Rename the keys without migrating:** loses saved high scores. Rejected.

## Consequences
- A comment on `HIGH_SCORE_KEY` explains the old prefix, so nobody "fixes" it later.
- Words like "wasteland" that describe the setting (SPEC §5, the Phase 5 title) stay. They describe the world, not the product name.
