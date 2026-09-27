# CLAUDE.md — apps/viewer

🔴 = stops here, do not proceed. 🟡 = read before acting. 🟢 = context.

Split out of the root `CLAUDE.md` on 2026-08-10 by `/doctor` (the root had reached 39,674
chars). This file loads for any file under `apps/viewer/`; since 2026-09-26 its traps load
even more narrowly, from the path rules below.

Root `CLAUDE.md` still holds the cross-cutting traps — read it first.

## Where the viewer's traps live

The 34 traps that were here moved on 2026-09-26, word for word, into path rules that load
only when you open the files they govern. This file keeps what applies to every viewer
session. **Working through Bash? `cat` the rule for the files you are about to change.**

| Rule in `.claude/rules/` | Traps | Loads when you open |
|---|---|---|
| `viewer-model-viewer.md` | 10 | `Stage.tsx`, `stageConfig.ts`, `src/lib/`, `webgl.spec.ts`, the review server |
| `viewer-layout.md` | 16 | `src/styles/`, `src/components/`, `App.tsx`, `src/polish/`, `e2e/`, `packages/ui/` |
| `viewer-headers.md` | 6 | `worker/`, `scripts/`, `public/` |
| `viewer-bundling.md` | 2 | `vite.config.ts`, `main.tsx`, `src/polish/`, the bundle budget |

## Whose animation advice wins

**`docs/DESIGN.md` outranks the three vendored motion skills** (`review-animations`,
`emil-design-eng`, `motion`). It is the viewer's *locked* design system, and
`packages/ui/src/tokens.css:2` cites it as their authority.

Not a precaution, arithmetic: `review-animations` standard 4 is *"sub-300ms on UI, or
it is a finding"* while `docs/DESIGN.md` §5 locks `--settle` at **500ms** and `--slow`
at **800ms**, so an agent applying that skill files two findings against the locked
system. The three agree on mechanics — **expect the collision on duration and easing,
not technique.** Full rulings in `.claude/skills/README.md`.

## No Tailwind here, and the skills will suggest it anyway

🟡 **No Tailwind, no shadcn/ui, no component library. Do not add one.** Appearance is
hand-written in `packages/ui/src/tokens.css`; behaviour, when a screen ever
needs it, comes from `base-ui`, which ships no CSS. Reasoning and reject list:
`docs/DECISION-UI-LIBRARIES.md`.

Several vendored design skills default to a Tailwind/shadcn idiom. Measured
2026-08-15: this repo has **zero** matches for `tailwindcss`, `@tailwind`,
`components.json` or `@radix-ui`, so such a suggestion compiles to nothing and
silently ships an unstyled element. **The tell is a `className` carrying utility
strings**; the fix is a semantic token, per `docs/DESIGN.md` §8.

## Running what these traps describe

```bash
npx --yes pnpm@12.6.0 --filter @run-apparel/viewer test:e2e
```

The e2e suite is the only thing that exercises `<model-viewer>` for real — under jsdom
it asserts against a stub, which is why this package's coverage floor is the repo's
lowest at 42% and why the floor must not be "fixed" by excluding `App.tsx`/`Stage.tsx`.
If it dies with `Timed out waiting 120000ms from config.webServer`, confirm `pnpm`
resolved (bare `pnpm` exits 127 inside the child process) **before reading any code** —
it has caused that exact timeout here.

**A SECOND cause of that same timeout: a stray fixture server.** `e2e/serve.mjs`
started by hand to drive the simulator holds 4173, so Playwright's own `webServer`
cannot bind and the suite reads as a code failure. `pkill -f e2e/serve.mjs` first.

**`--grep` does NOT survive the pnpm passthrough.**
`pnpm --filter @run-apparel/viewer test:e2e -- --grep "x"` runs the WHOLE suite and
silently ignores the filter — measured 2026-08-20, 252 tests where 20 were asked for.
Run `npx playwright test --grep "x"` from `apps/viewer/` instead (~2 s against ~40 s).

**Driving the built app by hand needs `VITE_API_BASE_URL=''`.** A plain
`pnpm build` bakes in the production API, so `localhost:4173/n001/wine` renders
"REFERENCE UNAVAILABLE" — `n001` 404s in production (the live slug is `rxps`).
`e2e/prepare.mjs` sets it; anything driven by hand must too.

## Measuring on a phone: what each tool cannot see

- **The Browser pane cannot measure anything time-based.** It reports
  `document.visibilityState === "hidden"`, so rAF is throttled and CSS transitions
  freeze part-way — a paused `[data-reveal]` fade was reported as a stuck-opacity
  bug on 2026-08-19 before the check. `getBoundingClientRect()` is unaffected, so
  layout numbers from it are sound; frame rates are not obtainable at all.
- **🟡 Synthetic `PointerEvent`s do nothing to model-viewer.** A scripted pinch on the
  live page produced **0** `camera-change` events and moved neither camera nor FOV,
  and the resulting "0 m drift" was meaningless. Assert the control *responded*
  before believing any gesture measurement. Real touch comes only from the iOS
  simulator — `tap` / `swipe` / `touch_path` / `touch2_path`.
- **iOS 26.5 is the only runtime installed, and it is the floor of what is
  testable.** Probed 2026-08-19 on Xcode 26.6: iOS 15.5 is not downloadable, 16.4
  is (6.18 GB) — and 16.4's Safari already supports `svh`, so **no pre-15.4 browser
  is reachable on this machine.** `page.css`'s `@supports` fallback is unverifiable
  here by construction; say so rather than implying it was tested.
- **🟡 Biome rejects the duplicate-property CSS fallback idiom**
  (`lint/suspicious/noDuplicateProperties`). That is why `page.css` uses
  `@supports (height: 1svh)` blocks instead of two `height:` declarations — do not
  "simplify" them back.

- **🟡 A gitignored `apps/viewer/.env.local` fails the suite LOCALLY while CI stays
  green.** Found 2026-08-25: it sets `VITE_API_BASE_URL=http://localhost:3000`, and
  Vite loads `.env.local` in test mode too, so `src/lib/telemetry.test.ts` asserts
  the production endpoint and receives localhost. CI has no such file, so this is
  invisible there. It cost a stash-to-baseline bisect to rule out as a code fault.
  Move it aside to test what CI tests; do not delete it, it is the local dev pointer.
