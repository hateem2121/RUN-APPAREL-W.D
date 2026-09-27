---
paths:
  - "apps/viewer/vite.config.ts"
  - "apps/viewer/src/main.tsx"
  - "apps/viewer/src/polish/**"
  - "scripts/check-bundle-budget.mjs"
---

# The viewer's bundle: what reaches the critical path

Moved from `apps/viewer/CLAUDE.md` on 2026-09-26, word for word, so these load only when you
open the files they govern (`docs/CLAUDE-MD-MAINTENANCE.md` explains the mechanism).

## Traps

- **A STATIC IMPORT OF ONE 700-BYTE HELPER DRAGGED 287 KB OF THREE.JS ONTO THE
  CRITICAL PATH, and every deferral mechanism in the repo was powerless against
  it.** Found 2026-08-19. `__vitePreload` — Vite's own runtime function for
  loading a dynamic chunk — had been placed by rolldown *inside* the
  🟢 **model-viewer** chunk. The entry and the polish layer each imported that one
  function from there, and a static ES import of ANY symbol forces the browser to
  fetch and evaluate the WHOLE chunk. So the entry could not execute until
  1,024,060 bytes (**286,496 gzip**) had arrived, and the live waterfall showed
  `model-viewer-*.js` requested in the same burst as `index-*.js`.
  This defeated three separate deliberate mechanisms at once: `Stage.tsx`'s
  `await import('@google/model-viewer')`, `canRender3D()`'s refusal to run 3D
  under `saveData`, and the `modulePreload` filter in `vite.config.ts` — the last
  of which removes a `<link rel=modulepreload>` HINT and was never what fetched
  this. Fixed with a `preload-helper` group at `priority: 200` in
  `advancedChunks`. **Total bytes on disk did not change**, so
  `check-bundle-budget.mjs` cannot see this either way; the only signal is the
  entry chunk's own import statements. Pinned, with a verified negative control,
  by `e2e/motion-and-layout.spec.ts` -> "the 3D renderer is not a static
  dependency of the entry chunk".

- **🟢 `manualChunks` does not govern rolldown's CommonJS wrapper modules; use
  `advancedChunks`.** Instrumented 2026-08-19, `manualChunks` returned `'react'`
  for `react/jsx-runtime.js` and `react/cjs/react-jsx-runtime.production.js`
  correctly — and rolldown duplicated them into the motion chunk anyway
  (`react.transitional.element` greps in BOTH chunks of one build), so the entry
  bound to the copy and every phone fetched 48 KB gzip of Motion for a cursor
  that never mounts on touch. Four `manualChunks` repairs failed, one made it
  worse (Motion folded into the react chunk, 181 -> 310 KB). Swapping the whole
  block to rolldown's native `advancedChunks` fixed it outright. Details and all
  four dead ends are in `vite.config.ts`.
