# DECISION — UI libraries, and why we are not on Tailwind

**In plain words:** Which building blocks we use for screens, and why not Tailwind.

**Decided 2026-08-15.** Short version:

> **Behaviour comes from `base-ui`. Appearance stays hand-written in
> `packages/ui/src/tokens.css`. We do not adopt Tailwind, shadcn/ui or MUI.**

This file exists because the question *"shouldn't we just use Tailwind/shadcn like
everyone else?"* is reasonable, recurs, and costs an afternoon each time it is asked
from scratch. The answer below is the reasoning, not just the verdict, so a future
session can check whether the reasoning still holds instead of re-deriving it.

The operational lookup — *which* library for toasts, charts, drag-and-drop, etc. —
lives in [`.agents/skills/pick-ui-library/SKILL.md`](../.agents/skills/pick-ui-library/SKILL.md)
and already names `base-ui`. That skill is `disable-model-invocation: true`, so it
only loads when someone explicitly invokes it; this note is the discoverable copy.

## The decision, in three parts

**1. The design system is hand-written. No component library, no CSS framework.**

⚠️ **UPDATED 2026-09-04 — the tokens no longer live in `apps/viewer`.** `tokens.css`
and `base.css` moved to [`packages/ui/src/`](../packages/ui/src/tokens.css) so the
public marketing site (`apps/cms`) renders from the SAME system rather than a second
copy of it; `apps/viewer/src/styles/page.css` stays in the viewer because it is
product-page-specific. The move was a pure `git mv` — the built stylesheet is
byte-identical, verified against `scripts/check-bundle-budget.mjs` before and after —
and `apps/viewer/src/styles/tokens.test.ts` now scans all three consumers, so the
rules below still reach every stylesheet. The decision itself is unchanged.

The original reasoning, which still holds: it was one page. Measured 2026-08-15, the stylesheets already use 16 × `clamp()`,
4 × `dvh`, `@media (pointer: coarse)` and `@media (hover: hover) and (pointer: fine)`,
and the suite tests an `iPhone 13` profile
([`apps/viewer/playwright.config.ts:88`](../apps/viewer/playwright.config.ts)) plus an
explicit 375×812 viewport
([`apps/viewer/e2e/motion-and-layout.spec.ts:412`](../apps/viewer/e2e/motion-and-layout.spec.ts)).
The responsive work is done. A framework would replace working CSS with different
working CSS and add weight to a page already gated by
[`scripts/check-bundle-budget.mjs`](../scripts/check-bundle-budget.mjs) and already
shipping a ~27 MB GLB.

**2. New screens (a catalogue, a dashboard, CMS-side UI) use `base-ui`.** Dialogs,
popovers, menus, selects, comboboxes — anything whose correctness is invisible.
A dialog is not finished when it looks right; it is finished when Escape closes it,
focus cannot leave it, and a screen reader announces it. That is the half worth
importing.

**3. Nothing else gets added alongside it.** One primitive library, not three. Mixing
`base-ui` with Hero UI or MUI means three sets of conventions and three dependency
trees for one product.

## Why `base-ui` specifically

Verified 2026-08-15 against current sources, not from memory:

- **It ships no CSS.** Behaviour, keyboard interaction and ARIA only; styling is
  yours. This is the whole reason it fits — every other mainstream option
  (shadcn/ui, Hero UI) requires Tailwind, which would mean migrating
  `tokens.css`. `base-ui` does not.
- **v1.0 stable landed 2025-12-11**, 35 components, built by people who previously
  built Radix, Floating UI and MUI.
- **shadcn/ui switched its own default to `base-ui` in July 2026.**
- **It is tree-shakeable**, so the bundle budget only pays for imported components.

## The first exception: the phone menu is the browser's own popover (2026-09)

Rule 2 above says popovers come from `base-ui`. The phone menu does not, and the reason is a
constraint the owner set when asking for it (2026-09-11): **its links must be reachable with
JavaScript switched off and before the page hydrates.** A `base-ui` Popover is React state, so
it cannot open before hydration; this repo already deleted one React-state menu for exactly
that (0 of 2 links reachable with scripting off, measured 2026-09-05). The HTML Popover API —
`<button popovertarget>` and `popover="auto"` — is declared in the server's HTML and was
measured opening, closing on Escape and on a tap outside, and navigating with scripting off in
Chromium, WebKit and Firefox (2026-09-23). It also needs no dependency.

The rule stands for anything whose correctness still lives in script: a dialog that traps
focus, a select, a combobox.

## What was rejected, and why

| Option | Why not |
|---|---|
| **Tailwind + shadcn/ui** | Would require migrating `tokens.css`, which already works and is the source of truth per [`docs/DESIGN.md`](DESIGN.md) §8. Buys nothing the customer can see. |
| **MUI** | ~100–200 KB gzipped and carries Material Design's look, which would fight "PAPER & INK" rather than serve it. |
| **Radix** | Acquired by WorkOS; development slowed. `base-ui` is where its authors went. |
| **A migration of existing viewer CSS** | Pure churn. Nothing is broken. |

⚠️ **The dependency-shape argument matters more here than in most repos.** This
codebase has lost time three separate times to dependency changes that passed every
local gate — the `@cloudflare/workers-types` hold, the second lockfile under
`tools/asset-pipeline/`, and the Next 16 / TypeScript 7 pin (all in
[`CLAUDE.md`](../CLAUDE.md)). Prefer libraries whose failure mode is small: a
tree-shakeable primitive layer, or copy-in source, over a framework that owns the
build.

## When to re-open this

Re-open **only** if new screens with real form/table/dialog density arrive — a
catalogue, an order dashboard, a settings area. At that point the question is *"is
one primitive library still enough?"*, not *"should we adopt Tailwind?"*.

Do **not** re-open it because a newer library is popular. That is the failure this
file exists to prevent.
