# ADR-0003: Vendor three.js r186.1 (ES module build) into `libs/`

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 0 (SPEC §9)

## Context
SPEC §1 requires the game to run fully offline, with three.js copied into the repo and no CDNs or npm at runtime. SPEC §2 expects `libs/three.module.js` plus `libs/three.core.js` (needed since r171). We have to pick a specific version and a way of getting the files.

## Decision
- Vendor **three.js 0.186.1** (r186, patch 1) from the official npm tarball `https://registry.npmjs.org/three/-/three-0.186.1.tgz`.
- The tarball's SHA-1 (`6d50f70c2c437f844179bbb56d6f5b774e1ca38a`) was checked against the registry's published `shasum` before extraction.
- Copy only `build/three.module.js` and `build/three.core.js` into `libs/` unchanged, plus three.js's MIT license as `libs/three.LICENSE`.
- `game.js` imports `./libs/three.module.js`, which imports `./three.core.js` by relative path. No import map is needed.
- Use the unminified builds, so stack traces stay readable while developing.

## Alternatives considered
- **0.187.0 (latest):** released 2026-10-30, under three weeks before this decision. r186.1 is a patch release that has been out since September, so it is the safer pick.
- **Older pre-r171 single-file build:** avoids the second file, but gives up a year of fixes for no real gain.
- **Minified builds (`three.module.min.js`):** about half the size. Download size doesn't matter much for a local game, and readable stack traces help more during development. We can switch in Phase 8.
- **Addons (GLTFLoader, OrbitControls):** not vendored now. SPEC §6 only needs GLTFLoader if `.glb` models get added later.

## Consequences
- `libs/` adds about 2.1 MB (three.core.js 1.46 MB + three.module.js 0.66 MB). SPEC §1 excludes three.js from the ~2 MB budget.
- Upgrading means repeating the same steps (download the tarball, check the shasum, copy the two files) and writing a new ADR.
- Avoid deprecated APIs to keep the console clean. For example, the loop uses `renderer.setAnimationLoop` and `performance.now()` timestamps rather than `THREE.Clock`.
