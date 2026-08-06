# DESIGN.md — "PAPER & INK" (Olive Ink)

The viewer's locked design system. Light mode is **"The Workshop"**, dark mode is
**"The Night Shift"**, and both are first-class — neither is a tinted afterthought
of the other.

## Why this file exists, and what it is not

Three source files have cited `DESIGN.md` as their authority since the design was
locked — `apps/viewer/src/styles/tokens.css:2`, `apps/viewer/src/main.tsx:2` and
`apps/viewer/src/components/SerifAccent.tsx:5` — and **the file did not exist**.
Written 2026-08-06 to close that gap.

It was **reconstructed from the code**, not from memory or intent. Every value
below was read out of `tokens.css`, `base.css` and `page.css`; nothing here is a
preference someone recalled. That direction matters and must not reverse: this
repo has twice been bitten by a derived document drifting from the thing it
describes (`docs/RAW-UPLOAD-PIPELINE.md` contradicted `CLAUDE.md` the same day it
was written and was deleted; `scripts/index-ai.mjs` records the same lesson).

**So: `tokens.css` is the source of truth. This file is its prose index.** If the
two disagree, the CSS is right and this file is stale. Change a token here only by
changing it there first.

---

## 1. Colour

### The constants — the signal

Three fixed values that never flip between modes. `--volt` is the brand's single
loud colour; everything else in the system is quiet so that it reads.

| Token | Value | Role |
|---|---|---|
| `--volt` | `#cdf345` | The signal. Highlights, dark-mode headlines, dark-mode primary fill. |
| `--volt-deep` | `#5f7414` | Light-mode serif accents and dimension lines — volt is illegible on paper-white. |
| `--ink` | `#1d1f1a` | Near-black with an olive cast. Never `#000`. |

### Surfaces and text

Declared with CSS `light-dark()`, so one token carries both modes.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#f1efea` | `#1c1f18` |
| `--surface` | `#faf9f6` | `#23271f` |
| `--wash` | `#e4e1d8` | `#2c3126` |
| `--raised` | `#ffffff` | `#363c2f` |
| `--text` | `#1d1f1a` | `#ecebe4` |
| `--muted` | `#63665b` | `#a2a695` |

**Dark-mode text is off-white (`#ecebe4`), never `#ffffff`.** The token file says
so inline. Pure white on a near-black olive ground buzzes; the off-white sits.

### Mode-flip components

These deliberately *invert* between modes rather than shading. This is the part of
the system most likely to be got wrong by eye, because "make it work in dark mode"
usually means darkening — here it means swapping.

| Component | Light | Dark |
|---|---|---|
| Tag `[ LABEL ]` | volt block, ink text | transparent, volt text |
| Primary button | ink fill, volt text | volt fill, ink text |
| Display headline | ink | volt |
| Serif accent / dimension line | volt-deep | volt |

### Motif inks

Low-alpha derivations of ink (light) or off-white (dark). They are *structure*, not
decoration, and must stay near-invisible.

| Token | Alpha | Used by |
|---|---|---|
| `--grid` | 0.05 | `.blueprint` 26 px graph-paper grid |
| `--contour` | 0.07 | Contour line-work |
| `--line` | 0.18 | Panel and ghost-button borders |

`--glow` and `--grain-color` are **dark-mode-only garnish and resolve to
`transparent` in light**, which is how `.grain` is suppressed without a second
rule — plus explicit `display: none` fallbacks for `[data-theme='light']`.

### The rule components must follow

> Components read ONLY these semantic custom properties — never raw hex.
> — `tokens.css:4`

---

## 2. Theme switching

- `color-scheme: light dark` on `:root`; the default follows `prefers-color-scheme`.
- `data-theme` on `<html>` overrides it (`'light'` / `'dark'`).
- Theme changes cross-fade through the **View Transitions API**.
- The reduced-motion block has to disable `::view-transition-old/new(root)`
  explicitly — the universal `*` selector does not reach view-transition pseudos.
  That is a real gap in the cascade, not belt-and-braces.

---

## 3. Type

Two families plus a system mono stack. Loaded via `@fontsource`, self-hosted — no
font CDN, which is also a CSP consideration.

| Token | Stack |
|---|---|
| `--font-display` / `--font-body` | `'Archivo Variable', 'Archivo', system-ui, sans-serif` |
| `--font-serif` | `'Instrument Serif', Georgia, serif` |
| `--font-mono` | `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, …` |

**Archivo is imported from its `wdth` build** (`@fontsource-variable/archivo/wdth.css`),
which carries both the weight axis (100–900) and the width axis (62–125%). The
display style needs `font-stretch: 122%`, so the plain weight-only build will not
do — swapping the import silently flattens every headline back to normal width.

### Display

```
.display          Archivo · weight 860 · font-stretch 122% · UPPERCASE
                  letter-spacing -0.02em · line-height 0.92 · colour --headline
.display--hero    clamp(34px, 5.4vw, 72px)
.display--section clamp(26px, 4vw, 46px)
```

### The serif accent

One Instrument Serif italic word per headline, set by `headingWithAccent()` in
`SerifAccent.tsx`, which takes the **last** word of a dynamic heading.

```
.serif-accent   Instrument Serif · italic · 400 · lowercase
                letter-spacing 0 · font-size 1.07em · colour --serif-accent
```

**Budget: 1–2 accents per headline, always lowercase.** More than two and the
device stops reading as an accent and starts reading as a second typeface.

### Mono

| Class | Size | Tracking | Use |
|---|---|---|---|
| `.mono` | 11px | 0.11em | `[ BRACKETED ]` labels, N°00X, specs |
| `.label` | 10px | 0.12em | Tag chips, 4/8px padding, 6px radius |
| `.section-number` | 10px | 0.14em | Section numbering, `--muted` |

### Body

`17px / 1.55`. **Paragraphs and list items are capped at `60ch`** — a measure limit,
enforced globally in `base.css`, not per-component.

---

## 4. Components

### Buttons

44px minimum height — a touch target, and this product is opened by scanning a QR
code with a phone, so it is the common case rather than the edge case.

```
.btn           mono 11px UPPERCASE · tracking 0.1em · padding 14/22px
               radius --radius-button (10px) · min-height 44px
.btn--primary  --btn-primary-bg fill, 1.4px border of the same
               hover: translateY(-2px)
.btn--ghost    transparent, 1.4px --line border
               hover: INVERTS to --text bg with --bg text
```

### Panels

`--surface` background, `1px solid var(--line)`, `--radius-panel` (18px).

### Motifs

- `.blueprint` — two 1px `--grid` gradients at `26px 26px`, i.e. graph paper.
- `.grain` — fixed full-viewport SVG `feTurbulence` at **opacity 0.05**,
  `mix-blend-mode: overlay`, dark mode only. Inline data-URI, so no extra request
  and nothing for the CSP to allow.

### Radii

`--radius-panel` 18px · `--radius-button` 10px · `--radius-pill` 999px.

---

## 5. Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--fast` | 200ms |
| `--settle` | 500ms |
| `--slow` | 800ms |
| `--stagger` | 60ms |
| `--reveal-y` | 24px |

Both curves are **ease-out**: fast departure, slow arrival. Enter animations use
them as-is; nothing in this system uses an ease-in for an entrance.

### Reduced motion is a hard stop, not a slowdown

`prefers-reduced-motion: reduce` collapses every transition and animation to
`0.01ms` and forces `scroll-behavior: auto`.

**Scroll-reveal is opt-*in* to motion, not opt-out.** `[data-reveal]` only gets its
`opacity: 0` starting state inside `@media (prefers-reduced-motion: no-preference)`.
Written the other way round — hide by default, un-hide for motion users — a
reduced-motion visitor is left staring at permanently invisible content. That
inversion is the single most load-bearing line in the motion layer.

Lenis smooth scroll is loaded lazily and applies its classes to `<html>`;
`.lenis-smooth` deliberately forces `scroll-behavior: auto` so the two scroll
systems do not fight.

---

## 6. Accessibility

- `:focus-visible` — `2px solid var(--focus-ring)`, `2px` offset, `4px` radius,
  applied globally. `--focus-ring` is volt-deep in light and volt in dark, so it
  clears contrast in both.
- `.visually-hidden` for screen-reader-only text.
- Touch targets ≥ 44px.
- 60ch measure cap.
- Enforced by `apps/viewer/e2e/a11y.spec.ts` (axe) and the Lighthouse
  accessibility assertion in `lighthouserc.json`.

---

## 7. Changing this system

1. Change `tokens.css` first. It is the source of truth.
2. Update this file in the same commit.
3. Never introduce a raw hex value in a component — add a semantic token instead.
4. If a change affects contrast or focus, run
   `pnpm --filter @run-apparel/viewer test:e2e`, which includes the axe pass.
