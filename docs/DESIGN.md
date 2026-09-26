# DESIGN.md — "PAPER & INK" (Olive Ink)

**In plain words:** Our screen design rules: the Paper and Ink colours, fonts and spacing.

The viewer's locked design system. Light mode is **"The Workshop"**, dark mode is
**"The Night Shift"**, and both are first-class — neither is a tinted afterthought
of the other.

## Why this file exists, and what it is not

Three source files have cited `DESIGN.md` as their authority since the design was
locked — `packages/ui/src/tokens.css:2`, `apps/viewer/src/main.tsx:2` and
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
| `--line` | 0.18 | Panel borders and dividers |

**`--line-control` is not a motif ink, and it is deliberately not near-invisible.** At 0.55
alpha it is the edge that identifies a control — the outline button and the form fields —
and WCAG 1.4.11 asks 3:1 for exactly that. `--line` measured 1.43:1 light / 1.68:1 dark
there (audit CO-02, 2026-09-11). 0.55 is the value both `prefers-contrast: more` blocks
already raise `--line` to, so the system gained a role, not a new number: 3.48–3.77:1 light
and 4.10–5.13:1 dark across `--bg`, `--surface`, `--wash` and `--raised`.

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
- Both surfaces have the switch, in the menu bar (the site since 2026-09). The choice is
  remembered per host (the site and the viewer are two origins), written only when the
  visitor presses it, and applied before the first paint by a two-line inline script on each.

---

## 3. Type

Two families plus a system mono stack. Loaded via `@fontsource`, self-hosted — no
font CDN, which is also a CSP consideration.

| Token | Stack |
|---|---|
| `--font-display` / `--font-body` | `'Archivo Variable', 'Archivo', system-ui, sans-serif` |
| `--font-serif` | `'Instrument Serif', Georgia, serif` |
| `--font-mono` | `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, …` |

### The marketing site adds three metric-matched fallback faces

`apps/cms/src/app/(frontend)/site.css` declares `Archivo Fallback`,
`Archivo Display Fallback` and `Instrument Serif Fallback`, and inserts each into the
stack above between the real face and the generic one. They are `local()` only, so they
download nothing.

They exist because the home page failed Cumulative Layout Shift at **0.1533** against a
0.1 limit, measured **0.0000** with the webfonts removed — both faces load with
`font-display: swap`, so the page painted in a fallback and re-flowed every line when the
real font arrived. Preloading was measured and does not fix it (see the comment at the top
of `apps/cms/src/app/(frontend)/layout.tsx`).

Every adjustment is computed from the font files, with the variable font instanced at the
axis values the CSS asks for. The display face needs its own numbers: at
`font-stretch: 122%` and `font-weight: 860` in uppercase, Archivo is **28% wider** than
Arial Bold, while lowercase body text at 400 is **1.4% narrower** than Arial.

⚠️ **This is the one place the two surfaces' type differs, and deliberately.** The viewer
measured CLS 0.000 and does not have the problem, and `tokens.css` / `base.css` ship inside
its stylesheet budget. The site overrides the three tokens in its own sheet rather than
changing the shared ones.

**One headline has faces of its own (PF-03, 2026-09-11).** "Every garment, turnable." on
`/products` is only 8px wider than its 1052px column in the real fonts, so the shared faces'
1.7% shortfall set it on one line until Archivo arrived, and everything under it dropped: CLS
**0.404** at 1350px on the live page. `/products` now uses `Archivo Display Fallback Products`
(130.15%) and `Instrument Serif Fallback Products` (81.94%), that headline's own values from
`apps/cms/scripts/calibrate-fallback.mjs`, switched on by the `.hero-products` class through the
stacks' custom properties. The shared faces are unchanged: the other two hero headlines measure
correct in them, and every other piece of display text uses them too.
`apps/cms/e2e/fontSwap.spec.ts` blocks and delivers the webfonts at four widths in three engines
and fails on any hero headline that breaks differently; `apps/cms/src/fallbackMetrics.test.ts`
fails when a headline is reworded without re-running the script.

**Machines with no Arial and no Georgia get Liberation (2026-09-11).** A Linux desktop, and CI's
Playwright image, has neither, so every face above errored there and PR #10's font tests failed
in CI while passing on a Mac. Liberation Sans has Arial's advance widths exactly (computed from
both files), so it is one more `local()` source in the sans faces at their values. Liberation
Serif is shaped like Times, not Georgia, so the serif has two more faces:
`Instrument Serif Fallback Liberation` (89.40%, the Georgia face's value carried over by the
ratio of the two fonts' average widths) and `Instrument Serif Fallback Products Liberation`
(92.34%, `calibrate-fallback.mjs --linux` inside that image). Each lists the full font name and
then the family name, because Chromium and Firefox match only the first and WebKit only the
second. Android has neither family and still uses its own system font.

**Archivo is imported from its `wdth` build** (`@fontsource-variable/archivo/wdth.css`),
which carries both the weight axis (100–900) and the width axis (62–125%). The
display style needs `font-stretch: 122%`, so the plain weight-only build will not
do — swapping the import silently flattens every headline back to normal width.

### Display

```
.display          Archivo · weight 860 · font-stretch 122% · UPPERCASE
                  line-height 0.92 · colour --headline · text-wrap balance
.display--hero    clamp(34px, 5.4vw, 72px) · --tracking-display-lg
.display--section clamp(26px, 4vw, 46px)  · --tracking-display-sm
.footer-q         clamp(27px, 4.3vw, 52px) · --tracking-display-sm · the site footer's question
```

These ranges, and the two narrower variants below, are the only `clamp()` font sizes the
stylesheets may use: `apps/viewer/src/styles/tokens.test.ts` (TY-03) lists each one by
selector and fails on a sixth, or on one of these five that this file stops naming.

**The marketing site lowers the hero floor on the narrowest phones (owner decision
2026-09-11).** Its `.site-hero .display--hero` is `clamp(min(34px, 9.6vw), 5.4vw, 72px)`:
30.72px at 320px, 32.64px at 340px, and unchanged from 355px up. (9.6, not the 9.8 first
measured on macOS: CI's Linux Chromium draws "production." 280.38px wide at 31.36px, and it
split there.) At the 34px floor "PRODUCTION." is
302.8px wide and the `/contact` column 280px, so `overflow-wrap: anywhere` split it as
"PRODUCTIO / N." in all three engines. The viewer's product title keeps the shared clamp.
`apps/cms/e2e/composition.spec.ts` fails if any heading on the site splits a word.

**Tracking follows the optical size — changed 2026-08-15 by owner decision.**

It was a flat `-0.02em` at every size, so one value did two jobs across a 2x
clamp: cramped at 34px on a phone, loose at 72px on a desktop. Large display type
wants tighter tracking and small type wants looser; that relationship is what
optical sizing IS, and it matters more here than usual because Archivo is pushed
to `font-stretch: 122%`, which narrows the counters.

Measured at the ends after the change: **320px viewport → -0.015em**,
**1440px → -0.030em**. The old flat value sat in the middle, so this is looser
where it was tight and tighter where it was loose.

The wordmark (`.notch__wordmark`, `.footer__brand`) keeps a fixed `-0.02em`: it
is display type at a FIXED size, so it has no optical range to follow — and the
two must agree with each other, which they did not until 2026-08-14.

⚠️ **THE RULE IS SIZE-SPECIFIC TRACKING, NOT "hero is the tighter class", and the
two stop coinciding above 1100px.** `apps/viewer/src/styles/page.css` re-sizes
`.product-info--aside .display--hero` in `cqi` for the ~360px column the product
name moves into and re-tracks it with `--tracking-wordmark`, because the
viewport-derived `--tracking-display-lg` resolves to its tightest `-2.16px` on any
desktop — tracking drawn for a 69px headline, applied to a 34px one. Measured on
the viewer, 2026-09-07:

| | 360px viewport | 1440px viewport |
|---|---|---|
| `.display--hero` | 34.0px · -0.0169em | **34.2px · -0.0200em** |
| `.display--section` | 26.0px · -0.0138em | **46.0px · -0.0300em** |

So at 1440 the hero is the *smaller* of the two and correctly the *looser*. What
holds at both widths is the sentence above — larger rendered size, tighter
tracking — and that is what `apps/viewer/e2e/audit-guards.spec.ts` asserts for
FA-C-54. A guard written as "hero is bigger and tighter than section" fails
against a page that is right; one was, before it was measured.

### The serif accent

One Instrument Serif italic word per headline, set by `headingWithAccent()` in
`SerifAccent.tsx`.

**WHICH word is the caller's choice — changed 2026-08-15 by owner decision.** It
took the **last** word unconditionally, and that is still the default and still
right for a sentence, where the last word is the one the line lands on: *"This
reference is no longer **live**"*, *"Develop this garment with **us**"*.

It is wrong for a PRODUCT NAME. Every product in this catalogue ends in its
garment type, so the accent landed on *skinsuit*, *jacket*, *tee* — every time,
on the least distinctive word available — while the model name sat in plain
uppercase beside it. `<ProductPanel>` therefore passes `'first'`, which puts the
accent on the model name.

Neither position is correct everywhere, which is why it is a parameter and not a
replacement rule.

```
.serif-accent   Instrument Serif · italic · 400 · lowercase
                letter-spacing inherit · font-size 1.07em · colour --serif-accent
```

**Budget: 1–2 accents per headline, always lowercase.** More than two and the
device stops reading as an accent and starts reading as a second typeface.

### Mono

| Class | Size | Tracking | Use |
|---|---|---|---|
| `.mono` | 11px | 0.11em | `[ BRACKETED ]` labels, `№0X` section numbers, specs |
| `.label` | 10px | 0.12em | Tag chips, 4/8px padding, 6px radius |
| `.section-number` | 10px | 0.14em | Section numbering, `--muted` |

### Body

`17px / 1.55`. **Paragraphs and list items are capped at `60ch`** — a measure limit,
enforced globally in `base.css`, not per-component.

### The size scale

| Token | Value | In px, and where it is used |
|---|---|---|
| `--text-body` | 1.0625rem | 17px at the 16px default |
| `--text-sm` | 0.9375rem | 15px |
| `--text-xs` | 0.8125rem | 13px |
| `--text-mono` | 0.6875rem | 11px |
| `--text-mono-sm` | 0.625rem | 10px |
| `--text-wordmark-sm` | 1rem | 16px — the bar's `.notch__wordmark`, `.footer__brand` |
| `--text-note` | 0.875rem | 14px — `.stage__error`, `.notice`, `.contact__micro` |
| `--text-mono-lg` | 0.75rem | 12px — tracked caps one step above `--text-mono`; since 2026-09-11 also `.btn` and the site's `.nav-link` (audit TY-07) |
| `--text-card-title` | 1.125rem | 18px — the marketing site's `.product-card__name`; the wordmark's size in a different role |
| `--text-footer-mark` | 12vw | first paint only — the site's cropped footer wordmark, refitted to the slab's width by `FooterWordmark.tsx` once fonts load |

⚠️ **rem since 2026-09-04, and the unit is the accessibility feature.** Every size
here was px and `html` declares no font-size, so a visitor who set their browser's
default text size to Large got no change anywhere on the page. Page zoom worked and
is tested to 400%, but zoom enlarges the 3D garment and the whole layout; the
text-size setting enlarges only the words, and it is the one older buyers use.

The pixel values are unchanged at the 16px default, so nothing moves for a visitor
who has changed nothing. **Spacing deliberately stays in px** — `tokens.test.ts`
enforces a twelve-step px allowlist for padding, margin and gap, and converting
layout too is a far larger blast radius. The consequence is that text grows inside
boxes that do not, which is bounded and guarded: `motion-and-layout.spec.ts` asserts
no horizontal overflow and the colourway rail's clearance at a **20px root**, not
just at the default.

**Added 2026-08-14, documenting what already shipped — it did not move a pixel.**
This is the same move §6 made for spacing, and it was made for the same reason: an
audit found this block declared four font **families** and zero font **sizes**, so
every size in the viewer was a raw literal — 17, 18, 16, 15, 14, 13, 12, 11, 10 —
with nothing to stop a tenth.

The two mono sizes are not interchangeable and the distinction is load-bearing:
`--text-mono` (11px) is for **content labels** — the `.mono` register, a spec's
name. `--text-mono-sm` (10px) is for **chips** — `.label`, `.section-number`. An
audit finding (VIS-10) is that the spec list's `<dt>` uses the chip size for
content, which is why the garment's own facts read one step quieter than the
decorative section numbering above them.

Display sizes stay as `clamp()` expressions rather than tokens, because they are
ranges rather than values; see `.display--hero` and `.display--section` above.
`.serif-accent`'s `1.07em` is likewise not a scale step — it is a ratio against
whatever it sits inside, which is the point of the accent.

**The last four landed 2026-09-05, and the paragraph above is why they had to.**
That block tokenised five of the nine shipped sizes and named its own gap —
"nothing to stop a tenth". Seventeen raw declarations were still in `page.css` and
`base.css`: seven already equalled a token and were simply not using it, and ten
were the four sizes now above. They are named by **register**, not by a t-shirt
step, because the evens interleave the odds — 18·17·16·15·14·13·12·11·10 — so a
`--text-md` sitting between `--text-sm` and `--text-xs` would advertise a scale
this system does not have.

### Tracking

Display tracking is in *Display* above. Everything else is uppercase micro-type,
and it shipped as 21 literals until 2026-09-05.

| Token | Value | Use |
|---|---|---|
| `--tracking-caps-tight` | 0.1em | `.btn`, `.step__num`, `.step__title`, `.stage__hint`, `.colourway-tab`, `.callout`, `.preloader__status` |
| `--tracking-caps` | 0.12em | `.label`, `.camera-btn`, `.spec-list dt`, `.stage__ar`, `.stage__loading`, `.stage-block__name` |
| `--tracking-caps-wide` | 0.14em | `.section-number`, `.footer__line`; the site's `.footer-clock__time small` |
| `--tracking-caps-compact` | 0.06em | the colourway rail below its 500px container; the site's `.footer-clock__time` |
| `--tracking-mono` | 0.11em | `.mono` — see the warning below |
| `--tracking-wordmark` | -0.02em | the bar's `.notch__wordmark`, `.footer__brand`, and the aside heading that borrows it |
| `--tracking-card-title` | -0.02em | the site's `.product-card__name` |
| `--tracking-caps-snug` | 0.08em | the marketing site: `.nav-link`, `.product-card__img` alt text, `.product-card__placeholder` |
| `--tracking-caps-spaced` | 0.16em | the site footer's facts headings, `.footer-block h3`, and the open light `.footer-status` |
| `--tracking-instrument` | 0.17em | the site footer's instrument captions: the `.site-footer__tab` label and the `.footer-dim` dimension line |
| `--tracking-clock-caption` | 0.18em | `.footer-clock__city` — "SIALKOT · HQ & WORKS" |
| `--tracking-eyebrow` | 0.2em | `.footer-eyebrow` — the mono eyebrow over the footer's question |
| `--tracking-legal` | 0.13em | `.footer-legal` — the © line and its two links |
| `--tracking-link-mono` | 0.055em | `.footer-block a` — the email and WhatsApp rows |
| `--tracking-footer-mark` | -0.045em | `.footer-mark__layer` — the cropped outline wordmark at 122% stretch |

**The eight site rows landed 2026-09-06, the day the two branches merged.** The
marketing site (`apps/cms`) reads the same token file, and this branch's
`tokens.test.ts` deliberately scans its stylesheet, so the three gates above reached
21 values the navbar and footer had shipped as literals. They are named by **role**
rather than by scale step because three of them — 0.16, 0.17 and 0.18em — are a
tenth of a pixel apart at the 10px chip size, and no step name could tell them apart
honestly. They were kept exact by owner decision ("the site keeps looking exactly as
approved") rather than folded into one; folding would have been the tidier table and
the wrong reason, exactly as the `--tracking-mono` warning below says.

⚠️ **`--tracking-mono` is 0.11em and must not be folded into `--tracking-caps`.**
The Mono table above states 11px/0.11em and 10px/0.12em as separate rows, and they
are separate on purpose: they render **1.21px and 1.20px**, the same optical
tracking reached from two different sizes. The 0.01px gap is evidence they agree,
not evidence one is a typo — collapsing them would move `.mono` to 1.32px, a real
change made to tidy a table.

**`--tracking-wordmark` is the one with a history.** *Display* above records that
`.notch__wordmark` and `.footer__brand` "must agree with each other, which they
did not until 2026-08-14". They agreed as two literals for a year; a token is what
stops the third divergence.

---

## 4. Components

Components here are hand-written against the tokens below — there is no component
library and no Tailwind, decided 2026-08-15 in
[`DECISION-UI-LIBRARIES.md`](DECISION-UI-LIBRARIES.md). Behaviour-heavy primitives
(dialog, popover, select) come from `base-ui` when a screen ever needs them, because
it ships no CSS and leaves this system intact.

### Buttons

44px minimum height — a touch target, and this product is opened by scanning a QR
code with a phone, so it is the common case rather than the edge case.

```
.btn           mono 12px (--text-mono-lg) UPPERCASE · tracking 0.1em · padding 14/22px
               radius --radius-button (10px) · min-height 44px
.btn--primary  --btn-primary-bg fill, 1.4px border of the same
               hover: translateY(-2px)
.btn--ghost    transparent, 1.4px --line-control border (3:1, see §1)
               hover: INVERTS to --text bg with --bg text
```

**12px since 2026-09-11 (audit TY-07).** A button's words, and the site's PRODUCTS and
CONTACT links, are how a visitor gets anywhere, so they moved one step up the scale to
`--text-mono-lg`. The mono labels, chips and section numbers keep their 10–11px register —
that scale is this system's own and was not the finding.

### Panels

`--surface` background, `1px solid var(--line)`, `--radius-panel` (18px).

### Motifs

- `.blueprint` — two 1px `--grid` gradients at `26px 26px`, i.e. graph paper.
- `.grain` — fixed full-viewport SVG `feTurbulence` at **opacity 0.05**,
  `mix-blend-mode: overlay`, dark mode only. Inline data-URI, so no extra request
  and nothing for the CSP to allow.

### Radii

`--radius-panel` 18px · `--radius-card` 12px · `--radius-button` 10px ·
`--radius-chip` 6px · `--radius-pill` 999px.

**`--radius-card` and `--radius-chip` were added 2026-08-14 and were MEASURED, not
chosen.** An audit found eight raw `border-radius` values against three tokens:
`12px` appeared three separate times (the loading poster, the stage error notice,
the colourway preview) and `6px`/`8px` formed an unnamed chip scale. Naming them
moved no pixel. The rule they now satisfy is §8's third: never a raw value in a
component.

### Targets

`--target-min` **44px**. A touch target, and this product is opened by scanning a
QR code with a phone, so it is the common case rather than the edge case.

⚠️ **The token is necessary and not sufficient.** This file stated the 44px floor
in two places and the CSS encoded it nowhere, which is how `.theme-toggle` shipped
at **2.0px wide on a 320px viewport** and 21.1px at 360px — under WCAG 2.5.8's
24×24 minimum on the commonest Android width. The cause is that `width: 44px` on a
flex child with the browser-default `flex-shrink: 1` is a **maximum**. Cite the
token *and* set `flex-shrink: 0`. Measured on the live page 2026-08-14.

### The menu bar

One bar on the public site and the 3D viewer since 2026-09 (owner decisions: 2026-09-11, a
menu button on phones; 2026-09-17, "Same menu bars everywhere. The one I prefer is at
wear-run.help"; 2026-09-23, the Speed Lines icon). Its stylesheet is
[`packages/ui/src/notch.css`](../packages/ui/src/notch.css); its links and names are
[`packages/shared/src/siteBar.ts`](../packages/shared/src/siteBar.ts); each app writes the
same markup in its own framework, held together by `apps/cms/src/auditGuards.test.ts` and the
two `e2e/siteBar.spec.ts` suites.

| Width at the reader's text size | The bar |
|---|---|
| under 720px, or too narrow for the inline row (`184px + 14.9rem`) | the name and the Speed Lines button; the menu drops below the bar |
| under `114px + 7.25rem` (very large text on a narrow phone) | the button moves to a second row under the name |
| otherwise | the name, the links and the light/dark switch in one row |

The menu is the browser's own popover: it opens and closes with scripting off, Escape and a
tap outside close it, and the browser reports its state to assistive technology. The site's
bar is fixed and condenses as the page scrolls; the viewer's is in the page flow and does not,
so `--header-h` still measures where its 3D stage starts.

### Elevation

`--shadow-raised` — one token, because this system has exactly one elevated
surface: **the desktop contact rail** (`.contact-rail`), the floating
EMAIL / WHATSAPP pill in the bottom-right corner.

⚠️ **It named the floating colourway preview until 2026-08-17, and that element
had been DELETED on 2026-08-15** — so for two days this section documented an
elevation token whose only stated consumer did not exist, and the token was
genuinely unused. That is the drift this file's own header warns about ("if the
two disagree, the CSS is right and this file is stale"); it is recorded rather
than quietly corrected because a *reader* had no way to tell. The token itself
was never the problem — `tokens.css` kept it deliberately "for the next elevated
surface", and this is that surface.

The rule it encodes is unchanged: a surface that floats OVER scrolling content
needs to read as above it, and there is exactly one such surface at a time. If a
second one ever appears, that is the moment to ask whether it should exist rather
than to add a second shadow.

Declared with `light-dark()` like every other surface value. Added 2026-08-14: the
system had **no shadow token at all**, and its one drop shadow was a raw
`rgba(0, 0, 0, 0.12)` — forbidden by the rule above, and invisible over the dark
`--bg` (#1c1f18), so the preview lost its only separation from the rail behind it.
Pure black is wrong in both halves of this system for the same reason `--ink` is
`#1d1f1a` and never `#000`.

### Layering

Seven stacking contexts in the viewer, in reading order from the canvas upward, and
three more that only the marketing site uses. Added as tokens 2026-09-05 (the
viewer's) and 2026-09-06 (the site's); the numbers are exactly what shipped, so
nothing moved — with one stated exception below.

| Token | Value | Layer |
|---|---|---|
| `--z-hero-grid` | -1 | the site's `.site-hero__grid` — the blueprint grid behind the hero copy |
| `--z-stage-control` | 1 | `.stage__ar` — inside the stage, above the canvas |
| `--z-footer-tab` | 2 | the site's `.site-footer__tab` — seated on the footer slab's top edge |
| `--z-footer-glow` | 6 | the site's `.footer-glow` — the light, blended over the slab's content |
| `--z-header` | 40 | the bar; both hosts' `.notch-shell` share it since 2026-09-24 |
| `--z-action-bar` | 50 | the persistent contact bar |
| `--z-grain` | 60 | the full-page grain overlay |
| `--z-cursor` | 70 | `.cursor-ring`, pointer devices only |
| `--z-preloader` | 80 | the opening curtain |
| `--z-skip-link` | 100 | must beat everything, the preloader included |

The exception: the site's notch bar shipped at a raw `20` and now reads `--z-header`
(40). Its stylesheet declares no other stacking value between the two, and the
shared cursor and skip link sit at 70 and 100 either way, so the order a visitor
sees is unchanged — measured by grep of `site.css` and `base.css`, not assumed.

**The open phone menu is in the browser's TOP LAYER, above every z-index here — the skip link
and the cursor included.** It opens under the bar, so it never covers the skip link, which
appears at the top-left; the cursor ring (fine pointers only) passes under it.

**A z-index only means something against the others**, and until this table existed
the only way to learn the stack was to grep two stylesheets and sort the results.
The gaps are deliberate: 10 between neighbours leaves room to insert a layer
without renumbering, which is the edit that silently reorders a stack.

`--z-skip-link` above `--z-preloader` is not decoration. The skip link is the
keyboard user's first control, and the preloader covers the whole viewport; if the
curtain won, tabbing during load would focus a control nobody can see. That is the
same class of defect as the 1.00:1 skip link `tokens.test.ts` was written for.

---

## 5. Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--instant` | 120ms |
| `--fast` | 200ms |
| `--ui` | 220ms |
| `--settle` | 500ms |
| `--slow` | 800ms |
| `--reveal-y` | 24px |

Both curves are **ease-out**: fast departure, slow arrival. Enter animations use
them as-is; nothing in this system uses an ease-in for an entrance.

### The scale is SPLIT, not lowered — owner decision 2026-08-14

`--instant` and `--ui` were added because every duration in this system had been
tuned for an **entrance**, and the same tokens were then reused for controls — so
pressing a button also took 500ms.

This is the resolution of a standing argument. `apps/viewer/CLAUDE.md` records that
three vendored animation skills demand "sub-300ms on UI, or it is a finding", which
would file findings against `--settle` and `--slow` on sight, and that **this file
outranks them**. Both positions were right about different things: entrances here
are deliberately unhurried, and a control a finger is waiting on is not an entrance.

So the lock holds and the scale grows:

| Use | Token |
|---|---|
| Focus response, press feedback | `--instant` |
| Controls — hover, press, a state change the user is waiting on | `--ui` |
| Entrances, cross-fades, accordions | `--settle` |
| Wipes, scroll reveals | `--slow` |
| Retargeted progress fills | `--fast` (see `page.css`'s note — a fill retargeted several times a second visibly trails the number beside it at anything slower) |

**Do not "simplify" this by collapsing `--fast` and `--ui`.** They are 20ms apart
and mean different things: `--fast` is for a value that keeps changing, `--ui` is
for a state that changed once.

### Reduced motion is a hard stop, not a slowdown

`prefers-reduced-motion: reduce` collapses every transition and animation to
`0.01ms` and forces `scroll-behavior: auto`.

**Scroll-reveal is opt-*in* to motion, not opt-out.** `[data-reveal]` only gets its
`opacity: 0` starting state inside `@media (prefers-reduced-motion: no-preference)`.
Written the other way round — hide by default, un-hide for motion users — a
reduced-motion visitor is left staring at permanently invisible content. That
inversion is the single most load-bearing line in the motion layer.

Lenis smooth scroll is loaded lazily and applies its classes to `<html>`. ⚠️ **They are
STATE classes, not a flag, and this paragraph said otherwise until 2026-09-07**
(audit FA-F-11). `lenis` stays for the session; `lenis-smooth` is present only while a
smooth scroll is actually running — verified in lenis 1.3.26, `dist/lenis.mjs:1041`, which
adds it only while `isScrolling === 'smooth'`, and on the live page at rest
`document.documentElement.className` is `lenis has-custom-cursor`.

So `.lenis.lenis-smooth { scroll-behavior: auto }` guards the moment the two scroll
systems could fight, not the whole session — which is enough, because nothing here sets
`scroll-behavior: smooth`. Do not read it as a session-wide override, and do not "simplify"
it to `.lenis` on the assumption that it is one.
`.lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain }` is likewise
active only mid-scroll. `packages/ui/src/base.css`'s own comment was already accurate; it
was this document that implied permanence.

---

## 6. Spacing

Twelve steps, in pixels:

| | | | | | | | | | | | |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 22 | 24 | 64 |

Plus `0`, `auto`, negative hairlines (`-1px`), and the one fluid gutter
(`clamp(32px, 5vw, 64px)`). `padding: 0.75rem 1.25rem` on `.skip-link` is the
sole rem-based holdout.

**This section was written on 2026-08-13 and it documents what was already
there — it did not change a pixel.** An audit found spacing was the one
dimension of this system with no tokens, no documentation and no gate: 22
distinct values chosen ad hoc, and nothing to stop a 23rd. The list above is
enforced by `apps/viewer/src/styles/tokens.test.ts`, so adding a step is now a
decision someone makes here rather than a value that slips in.

**It is a 2px grid, not a 4px one, and that is worth knowing before you tidy it.**
Snapping 6, 10, 14, 18 and 22 onto 4/8/16/24 would move real layout by up to 2px
per edge. That may well be the right call — this file is the place to make it —
but it is a design change to a locked system, so it belongs to the owner and not
to a passing refactor. Tightening the list is one edit here and one in the test,
and the CSS it then rejects is exactly the work involved.

## 7. Accessibility

- `:focus-visible` — `2px solid var(--focus-ring)`, `2px` offset, `--radius-chip` (6px)
  radius, applied globally. `--focus-ring` is volt-deep in light and volt in dark, so it
  clears contrast in both — except on the site's dark surfaces, which take volt in both
  themes: the footer's links and, since 2026-09, everything in the menu bar (volt-deep
  measured 3.16:1 on the bar's ink).
- `.visually-hidden` for screen-reader-only text.
- Touch targets ≥ 44px.
- 60ch measure cap.
- Enforced by `apps/viewer/e2e/a11y.spec.ts` (axe) and the Lighthouse
  accessibility assertion in `lighthouserc.json`.

---

## 8. Changing this system

1. Change `tokens.css` first. It is the source of truth.
2. Update this file in the same commit.
3. Never introduce a raw hex value in a component — add a semantic token instead.
4. If a change affects contrast or focus, run
   `pnpm --filter @run-apparel/viewer test:e2e`, which includes the axe pass.
