---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.mjs"
  - "**/*.spec.ts"
  - "**/e2e/**"
  - "**/playwright.config.ts"
  - "**/vitest.config.ts"
  - "vitest.coverage.mjs"
  - "scripts/check-coverage.mjs"
---

# Tests, fixtures and coverage

Moved from the root `CLAUDE.md` on 2026-09-26, word for word. The root keeps a two-line
summary of the first section, because it applies to every change.

## The one pattern that keeps causing incidents

**Three production bugs in three consecutive sessions were invisible for the same
reason: the test fixtures could not exhibit the failure.**

- Seeded placeholders had no geometry compression → *no production model could
  render at all*, and 177 tests were green.
- Same gap → *every* production garment tripped a CSP violation on load.
- Seeded placeholders had no textures and no UVs → the entire artwork path was
  untested.

**If production compresses, seed compressed. If production prints, seed a
print.**

🟡 **A NEGATIVE CONTROL MUST RUN BOTH WAYS.** 2026-08-29: three GPU harnesses each
reported clean while measuring nothing — a WebGL buffer read after compositing (needs
`preserveDrawingBuffer`), a sample box on the wrong part of the garment, and
`drawImage` on model-viewer's non-preserved canvas returning a stale frame (tell:
identical counts across five colourways). Prove the harness sees a defect you
INTRODUCE, not just that it passes a good case. Before adding a test, ask what would have to break for it to fail. If
the answer is "nothing that happens in production", it is not a test.

## Coverage floors are MEASURED, not chosen

(`vitest.coverage.mjs`, a `thresholds:` block per package, `scripts/check-coverage.mjs`
for the repo.)
🟡 **Never lower one to go green.** `apps/viewer` is deliberately the lowest at 42%
— do NOT "fix" it by excluding `App.tsx`/`Stage.tsx`; most of its uncovered
lines are in those two, so dropping them reports a far higher number while
testing identically. (`RenderPage.tsx` was the third until it was deleted on
2026-08-17 with the poster-capture job; the floor was deliberately NOT raised
to match — a threshold is a measurement, and a number a deletion happened to
produce is one nobody measured.) They are covered by `apps/viewer/e2e/` in a
real browser, because
`<model-viewer>` under jsdom asserts against a stub. Every `include` is explicit
on purpose: v8 without one omits untested files entirely, so coverage *rises*
when you add untested code.

## Browser tests

🟢 **`e2e` gates the deploy (`deploy.needs`).** Slowest gate in CI (7m45s), fastest
locally (**about 45s**, four engines) — run it before pushing a viewer change. Two CI
round trips were spent learning that.

🟡 **Playwright's browsers are NOT installed here, and a missing one fails at 0ms.**
Found 2026-08-27: `test:e2e` reported four engines failing with `(0ms)`, which reads
as broken code and is a browser that never launched. Install once —
`npx --yes pnpm@12.6.0 --filter @run-apparel/viewer exec playwright install chromium webkit firefox`.
`tools/asset-pipeline`'s render harness needs chromium too. With all four present:
**355 passed, 6 skipped, 41.8s** (measured 2026-08-27).
