/**
 * The cross-host token contract — ONCE, for the public site and the 3D viewer (XS-04).
 *
 * Both apps import `packages/ui/src/tokens.css` and `packages/ui/src/base.css`
 * verbatim (root CLAUDE.md: "The site's look is the shared design system"), so this
 * is not two implementations that could drift the way the header markup can
 * (`siteBar.ts`'s own docblock explains why THAT is two implementations reading one
 * shared word list). Tokens are the opposite case: one stylesheet, two consumers —
 * so the contract here is a fixed, literal expectation each host's own browser test
 * reads its OWN computed styles against, following `siteBar.ts`'s precedent of a
 * shared constant with no markup in it.
 *
 * VALUES ARE THE RAW, UNRESOLVED CUSTOM-PROPERTY STRINGS `getComputedStyle(...)
 * .getPropertyValue()` returns for a plain custom property — browsers return the
 * specified text, not a `light-dark()`-resolved colour, so these are stable
 * regardless of which colour scheme a test runs under. Only the focus ring's own
 * colour resolves through `light-dark()`, which is why that one entry is measured
 * under a pinned `color-scheme: light` (see the two `tokenParity.spec.ts` files) and
 * recorded here as the LIGHT value the token itself defines: `--focus-ring` is
 * `light-dark(var(--volt-deep), var(--volt))`, and light-mode `--volt-deep` is
 * `#5f7414`.
 *
 * ⚠️ NO `ms`/`s` DURATION TOKENS HERE, MEASURED NOT ASSUMED. `--fast: 200ms` was
 * tried first and read back as `.2s` in EVERY engine, chromium included — a
 * `<time>` custom property is renormalised to a shortest-serialisation form by
 * `getComputedStyle`, unlike colour hex codes and `px` lengths, which every engine
 * returned literally. So this contract is colour/radius/size tokens only; a motion
 * token would need the comparison to parse both sides to a common unit instead of
 * comparing strings, which is more machinery than this contract needs today.
 *
 * Values are copied from `packages/ui/src/tokens.css` and `base.css` as they stand
 * today. A deliberate token change updates this file in the SAME commit — that is
 * the point: a change nobody meant to make on only one host fails here instead of
 * shipping quietly.
 */
export const TOKEN_CONTRACT: Readonly<Record<string, string>> = Object.freeze({
  '--volt': '#cdf345',
  '--ink': '#1d1f1a',
  '--paper': '#f1efea',
  '--radius-button': '10px',
  '--radius-panel': '18px',
  '--radius-chip': '6px',
  '--target-min': '44px',
})

/**
 * `:focus-visible`'s outline on a `.nav-link` inside the shared header
 * (`packages/ui/src/notch.css`) — the ONE header component Phase 1b-B unified
 * across both hosts, which is exactly what XS-04 is about. `outlineWidth` and
 * `outlineStyle` come from the general `base.css` rule (never `light-dark()`, so
 * stable under any colour scheme); `outlineColorLight` is `.notch :focus-visible`'s
 * own OVERRIDE — `outline-color: var(--volt)`, a flat colour, not the general
 * rule's `light-dark()`-based `--focus-ring` — measured directly, not assumed: the
 * first version of this contract used `--focus-ring` and failed on the site's own
 * `.nav-link` with the exact value below, which is `--volt` (`#cdf345`), not
 * `--focus-ring`'s light resolution.
 */
export const FOCUS_RING_CONTRACT = Object.freeze({
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColorLight: 'rgb(205, 243, 69)', // --volt: #cdf345, the .notch override
})
