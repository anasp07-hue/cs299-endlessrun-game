# Handoffs

Write a handoff at the end of each phase, when a session ends with work unfinished, or when context is getting long.
Name it `YYYY-MM-DD-phaseN-short-topic.md`. Read the newest one at the start of each session.

## Template

```markdown
# Handoff: Phase N, <topic> (YYYY-MM-DD)

## Done this session
- …

## Current state
- Playable? What works in the browser right now?
- Files touched: …

## Tests
- `node --test tests/` → X passed / Y failed (paste the summary line)
- Smoke test (test-review skill): done / not done, with results

## Decisions made
- ADRs written: …
- SPEC.md changes: …

## Open problems / known bugs
- …

## Next steps (in order)
1. …
```
