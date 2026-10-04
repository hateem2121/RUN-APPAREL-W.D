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
| `--volt` | `#cdf345` | The signal. Highlights, the dark-mode page title, dark-mode primary fill. |
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
| Page title (`.display--hero`, the h1): `--headline` | ink | volt |
| Every other heading (section headlines, card names, part headings): `--heading` | ink | off-white `#ecebe4` |
| Serif accent / dimension line | volt-deep | volt |

**In dark mode lime is kept for the big title and the buttons** (polish X25, the owner's answer
Q12, 2026-10-03). Until then every heading took volt, so a dark guide page showed its title, each
section headline and every small heading ("Air courier", "Sea freight") in lime, and on a long page
the lime stopped pointing at anything. Every other heading now takes the off-white of the page's
text; light mode is unchanged. The serif accent word keeps volt, the dark twin of its olive in
light mode, and so does the home page's featured figure ("100,000", `--dimension`), which is a
number, not a heading. The photo heroes, dark in both themes, re-declare `--heading` with the others
(`site.css`). `apps/cms/e2e/darkHeadings.spec.ts` and `apps/viewer/e2e/darkHeadings.spec.ts`
measure it.

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

**`--danger` is the one error colour**, shared by both apps since 2026-10-01 (it lived in the
website's stylesheet until then): `#b3261e` in light, `#f2b8b5` in dark, for a wrongly filled
field, its message and a refused send's notice. The dark value exists because the light one
measured 2.33:1 on the dark surface; each clears 6:1 on its own theme's surface (6.21:1 light,
8.90:1 dark).

**Native controls draw in the brand's ink, not the system's blue (VA-16, 2026-10-02).** `base.css`
sets `accent-color: var(--btn-primary-bg)` and `caret-color: var(--text)` once on `<html>`; both
inherit, so every text cursor and native checkbox, radio or range follows. Each clears 3:1 (WCAG
1.4.11) on all four grounds in both themes (cursor 12.71–16.63:1 light, 9.53–13.96:1 dark; accent
12.71–16.63:1 light, 8.95–13.11:1 dark). **Not `--volt` for the accent:** 1.03–1.27:1 on the light
grounds. `apps/cms/src/polishGuards.test.ts` computes the ratios from `tokens.css` and fails on
that choice.

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

Three families: Archivo, Instrument Serif, and IBM Plex Mono for the code-style labels (since
polish X5, 2026-10-04; until then the labels used each device's own monospace). Loaded via
`@fontsource`, self-hosted — no font CDN, which is also a CSP consideration.

| Token | Stack |
|---|---|
| `--font-display` / `--font-body` | `'Archivo Variable', 'Archivo', system-ui, sans-serif` |
| `--font-serif` | `'Instrument Serif', Georgia, serif` |
| `--font-mono` | `'IBM Plex Mono'`, two local stand-ins sized to it, then `ui-monospace, 'SF Mono', Menlo, …` |

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

**Four kinds of headline never swap (owner decisions 2026-10-01, and "never jump, as now" on
2026-10-04).** Stand-ins match *average* widths, and real text varies about the average, so
somewhere a line re-wraps: six of seven guide headlines broke differently at some width (the
printing guide measured CLS 0.233 at 412px live). So the site declares the same font files a second
time with `font-display: optional` — `Archivo Optional` and `Instrument Serif Optional` — and uses
them, through `.hero-guide`, for the guide headlines. The `/privacy` and `/terms` headlines joined
them through `.hero-legal`: they keep their line count in either font, but `text-wrap: balance`
moved a word between lines (CLS 0.0384 at 390px in CI). The four family pages followed through
`.hero-family` (teamwear 0.063 at 1280px, casual-wear 0.028 at 368px), and the not-found page
through `.hero-notfound` (polish X19). The home headline keeps `swap` by the owner's choice, as the
first impression. CSS Fonts 4: an optional font not ready at first paint is not used on that page,
and must never make it jump. The other headlines keep `swap` and the files they load are the same,
so from the second page on everything is Archivo at first paint. The stack after an optional face
must not name `Archivo Variable`, or a face that missed first paint falls through to the swapping one.

**Body text swaps to Archivo when it lands (polish D11, the owner's "always our font", 2026-10-03).**
From 2026-10-01 it used `Archivo Optional` too, and since every font was re-checked on each page
(fixed by polish X12) a visitor got the Arial stand-in on every page: 60 times in 60, measured live.
With the stand-in at 98.19% and the fonts held 150ms, body text swapping scored 0.000–0.017 on ten
pages at five widths, and the home page 0.022 at 768px, over `fontSwap.spec.ts`'s 0.02. Most of
that was not the letters but the boxes: a `ch` is the width of a zero in whichever font draws (MDN,
`<length>`), and the stand-in's zero is 4.6% narrower than Archivo's, so every width written in `ch`
grew when Archivo arrived — the home page's lede lost a line at 768px and its fifth category card
grew 34px taller. So the website writes its body-text widths in `em`, at the values its `ch` widths
had in Archivo: `--site-measure` 31.5em (55ch), the guides and the order steps 28.635em (50ch), the
form 35.508em (62ch), and `p, li` `max(60ch, 34.362em)`, which keeps a font with a wider zero (the
mono labels, the headline face) at its own 60ch. The same sweep then scored 0.000–0.006 on eleven
pages. `fontSwap.spec.ts` compares every capped body-text box in both fonts.

**Card titles have a stand-in of their own.** `.product-card__name` is Archivo 700 at normal width,
where the display stand-in (sized for 860 at 122%) is 28% too wide, so four guide-card titles
broke onto two lines in it and one in Archivo. `Archivo Card Fallback` is 99.16%, measured on the
22 card titles in Chromium and Firefox.

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
                  line-height 0.92 · colour --heading · text-wrap balance
.display--hero    clamp(34px, 5.4vw, 72px) · --tracking-display-lg · colour --headline
.display--section clamp(26px, 4vw, 46px)  · --tracking-display-sm
.footer-q         clamp(27px, 4.3vw, 52px) · --tracking-display-sm · the site footer's question
```

These ranges, and the narrower variants below, are the only `clamp()` font sizes the
stylesheets may use: `apps/viewer/src/styles/tokens.test.ts` (TY-03) lists each one by
selector and fails on any other, or on one of them that this file stops naming.

**The marketing site lowers the hero floor on the narrowest phones (owner decision
2026-09-11).** Its `.site-hero .display--hero` is `clamp(min(34px, 9.6vw), 5.4vw, 72px)`:
30.72px at 320px, 32.64px at 340px, and unchanged from 355px up. (9.6, not the 9.8 first
measured on macOS: CI's Linux Chromium draws "production." 280.38px wide at 31.36px, and it
split there.) At the 34px floor "PRODUCTION." is
302.8px wide and the `/contact` column 280px, so `overflow-wrap: anywhere` split it as
"PRODUCTIO / N." in all three engines. The viewer's product title keeps the shared clamp.
`apps/cms/e2e/composition.spec.ts` fails if any heading on the site splits a word.

**On a phone a garment card's name shrinks with its card rather than split a word (owner
decision 2026-10-02, the same rule).** Below 560px `.product-card__body .product-card__name`
takes a range in `cqi`, the card's body being the container: 13.3px at 320px, 16.7px at 375,
17.6px at 390 and the full 18px from about 415px (measured in Chromium). Two cards a row
(VA-42) leave a name 108px at 320px, and the catalogue's widest word, PERFORMANCE, is 140.1px
at 18px, so at a fixed 18px eight live words broke mid-word at 320px. A hyphenated word
(V-NECK) is held whole. `apps/cms/e2e/productsGrid.spec.ts` sets the catalogue's long words in
a phone card at seven widths. A garment page's "More from this category" cards (polish S6,
2026-10-04) are the same card two to a row, and `.related__body .related__name` takes the same
range: its words have 112px at 320px, and `apps/viewer/e2e/related.spec.ts` checks five widths.

**Tracking follows the optical size — changed 2026-08-15 by owner decision.**

It was a flat `-0.02em` at every size, so one value did two jobs across a 2x
clamp: cramped at 34px on a phone, loose at 72px on a desktop. Large display type
wants tighter tracking and small type wants looser; that relationship is what
optical sizing IS, and it matters more here than usual because Archivo is pushed
to `font-stretch: 122%`, which narrows the counters.

Measured at the ends after the change: **320px viewport → -0.015em**,
**1440px → -0.030em**. The old flat value sat in the middle, so this is looser
where it was tight and tighter where it was loose.

The wordmark (`.notch__wordmark`; until 2026-10-02 also the garment pages' `.footer__brand`,
retired with their old footer, VA-31) keeps a fixed `-0.02em`: it is display type at a FIXED
size, so it has no optical range to follow — and the two had to agree with each other, which
they did not until 2026-08-14.

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

### Display leading on phones

`.display` sets its lines at 0.92 of their size, a poster block for a short headline. Under 720px
a headline that runs past three lines takes **0.98** instead, through one modifier,
`.display--long` in `packages/ui/src/base.css` (visual audit VA-45, owner-approved 2026-10-02). It is
a class because a stylesheet cannot count a headline's lines. It is on the four buyer pages'
headlines and the seven guides' (36-53 characters, whole templates) and on no other: every other
headline on both apps sets on about three lines or fewer at 320-430px, by an estimate rather than a
measurement. 0.98 stays under 1 because `apps/viewer/e2e/audit-guards.spec.ts` holds every
`.display` to leading tighter than its own size. From 720px up, and for every short headline, it
stays 0.92.
`apps/viewer/src/styles/headlineLeading.test.ts` pins the rule and who carries it;
`apps/cms/e2e/headlineLeading.spec.ts` measures the lines in a browser.

### Display type and the stage past 1920px (VA-12)

Visual audit VA-12, owner-approved 2026-10-01, built 2026-10-02. Both stopped growing early: the
hero at 72px from 1333px wide, the section headline at 46px from 1150px, and a garment page's stage
at 800x980 — 21% of a 2560x1440 screen, against 43% at 1440x900 — so on a large monitor the type and
the garment looked drawn for a laptop. From 1920px, and only from there, they keep growing until
3840px (a 4K screen) and then stop.

| Window | `.display--hero` | `.display--section` | Stage measure | Canvas width |
|---|---|---|---|---|
| 1440x900 and 1919x1080 (pinned: nothing below 1920px changes) | 72px | 46px | 1200px | 800px |
| 1920x1080 | 72px | 46px | 1200px | 800px |
| 2560x1440 | 96px | 61px | 1600px | 1160px |
| 3840x2160 and above | 144px | 92px | 2400px | 1960px |

- The sizes are `max(4.5rem, min(3.75vw, 9rem))` and `max(2.875rem, min(2.3958vw, 5.75rem))`, in
  rules gated by `@media (min-width: 1920px)` in `base.css` and `site.css`. The two `clamp()` rules
  above are untouched (TY-03 pins them), and the new ones start at exactly the old ceilings, so
  nothing moves at 1920px; the rem floor keeps a reader's larger text size.
- The 144px ceiling is worked out: the page's column was 1312px of text at most and "PRODUCTION." is
  8.9em wide, so it stopped fitting at 147px; 144px left 2%. Since polish D1 (2026-10-04) the column
  is 1472px from 1920px wide, so the word fits up to 165px and 144px leaves 12%.
- Tracking scales with the type: `--tracking-display-large` is `-0.03em`, which is what the two px
  tokens give at the 1920px sizes, and it keeps large type as tight as §3 asks.
- The stage (`page.css`): measure `max(1200px, min(62.5vw, calc(100svh * 1200 / 1080), 2400px))` and
  canvas cap `max(980px, min(calc(100vw * 980 / 1920), 1960px))`, the 1920x1080 design scaled by the smaller of the window's width
  and height — so a window that is wide and only 1080px tall does not grow, because its garment is
  limited by height. The measure and the cap move together: raised alone, the garment turns
  width-limited and gains nothing.
- Not moved by VA-12: the page columns (`--site-max`, the garment pages' 1200px content), the aside's
  width, and the product's name in it (`.product-info--aside`, sized to its own column). The website's
  column moved later, with polish D1 (Page widths, below).
- The canvas widths are arithmetic. Its height is what the window leaves it, roughly 1200px at
  2560x1440 (about 38% of that screen); that was not measured here.
  `apps/viewer/src/styles/largeScreens.test.ts` computes the rules at the pinned widths, and both
  `e2e/largeScreens.spec.ts` files ask a browser.

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

**The face is IBM Plex Mono, the same on every device (polish X5 and F17, the owner's Q39).** Until
2026-10-04 the labels were each device's own monospace, and in Chrome and Firefox on a Mac that font
has no `№`, so every section number began with a squashed stand-in. Plex Mono has the sign and is
close to the old labels' width. Each app declares only the weights it draws — the website 400 and
500, the garment pages 400 and 700 — in latin, plus Plex Mono's cyrillic file for `№` alone (the
website at both weights, the garment pages at 400, the weight of their section numbers), declared
after the latin face so it is asked first (`unicode-range: U+2116`). The swap moves
nothing: every character of a monospace font is one width, so the two `local()` stand-ins in
`tokens.css` (Menlo on a Mac; Courier New, or Liberation Mono on Linux) are scaled to Plex's 0.6em
advance with its ascent and descent, and match every line exactly. The garment pages do not preload
it: their first paint on slow 3G is held to 2,400ms (`e2e/firstPaint.spec.ts`), and the labels are
not what a visitor reads first.

**Long runs of capitals are set in normal letters since 2026-10-02 (visual audit VA-44, the owner's
choice).** Capitals read slowly past a few words, and the audit counted runs of 31 to 74 characters.
So the bracket label above every page's headline, photo captions, the figures' descriptions, the
guide titles listed at the foot of each guide, the legal pages' subheads and the footer's address
are in normal letters, with the same words, typed in normal case in the source; since polish X23
(2026-10-04) every line of the footer's facts is too. Short labels keep their capitals: chips that
name a family, buttons, section numbers, the footer's headings and legal row, and the garment
pages' field labels. `e2e/composition.spec.ts` holds both halves (CR-06 and VA-44).

**A label on the website's heroes never leaves its last words alone (VA-43, 2026-10-02).**
`.site-hero .label` carries `text-wrap: balance` (in `site.css`, not on the shared `.label`, so the
garment pages' colour-name labels are untouched), so the teamwear page's label no longer wraps to
"STYLE ]" alone at 390px. On a phone (`max-width: 40rem`, which follows the reader's text size) the
home hero's label is two deliberate lines, "…SINCE 1889" and "START FROM 50 PIECES PER STYLE ]", with
the dot between them dropped; from 40rem it is one line with its dot. The words are the same.

### Body

`17px / 1.55`. **Paragraphs and list items are capped at `60ch`** — a measure limit,
enforced globally in `base.css`, not per-component. The website restates it as
`max(60ch, 34.362em)`, the same width in Archivo, because its body text swaps fonts (§3,
"Body text swaps to Archivo when it lands").

### The size scale

| Token | Value | In px, and where it is used |
|---|---|---|
| `--text-body` | 1.0625rem | 17px at the 16px default |
| `--text-sm` | 0.9375rem | 15px |
| `--text-xs` | 0.8125rem | 13px |
| `--text-mono` | 0.6875rem | 11px |
| `--text-mono-sm` | 0.625rem | 10px |
| `--text-wordmark-sm` | 1rem | 16px — the bar's `.notch__wordmark` |
| `--text-note` | 0.875rem | 14px — `.stage__error`, `.notice`, `.contact__micro` |
| `--text-mono-lg` | 0.75rem | 12px — tracked caps one step above `--text-mono`; since 2026-09-11 also `.btn` and the site's `.nav-link` (audit TY-07) |
| `--text-fine` | 0.75rem | 12px in the body face — the cookie card's sentence (owner, 2026-10-02, VA-13); the floor for read text |
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
audit finding (VIS-10) was that the spec list's `<dt>` used the chip size for
content, so the garment's own facts read one step quieter than the decorative
section numbering above them. Since polish D10 (2026-10-04) the facts' group
headings (`.spec-group__heading`) are read text at `--text-mono-lg`.

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
| `--tracking-caps-tight` | 0.1em | `.btn`, `.step__num`, `.step__title`, `.stage__hint`, `.colourway-tab`, `.preloader__status` |
| `--tracking-caps` | 0.12em | `.label`, `.camera-btn`, `.spec-group__heading`, `.stage__ar`, `.stage__loading`, `.product-info__more` |
| `--tracking-caps-wide` | 0.14em | `.section-number`; the footer's `.footer-clock__time small` |
| `--tracking-caps-compact` | 0.06em | the colourway rail below its 500px container; the garment's facts in the 3D window's corners (`.spec-groups--corners .spec-item__row`); the site's `.footer-clock__time` |
| `--tracking-mono` | 0.11em | `.mono` — see the warning below |
| `--tracking-wordmark` | -0.02em | the bar's `.notch__wordmark`, and the aside heading that borrows it |
| `--tracking-card-title` | -0.02em | the site's `.product-card__name` |
| `--tracking-caps-snug` | 0.08em | the marketing site: `.nav-link`, `.product-card__img` alt text, `.product-card__placeholder` |
| `--tracking-caps-spaced` | 0.16em | the site footer's facts headings, `.footer-block h3`, and the open light `.footer-status` |
| `--tracking-instrument` | 0.17em | the site footer's instrument captions: the `.site-footer__tab` label and the `.footer-dim` dimension line |
| `--tracking-clock-caption` | 0.18em | `.footer-clock__city` — "SIALKOT · HQ & WORKS" |
| `--tracking-eyebrow` | 0.2em | `.footer-eyebrow` — the mono eyebrow over the footer's question |
| `--tracking-legal` | 0.13em | `.footer-legal` — the © line and its two links |
| `--tracking-footer-mark` | -0.045em | `.footer-mark__layer` — the cropped outline wordmark at 122% stretch |

**The eight site rows landed 2026-09-06, the day the two branches merged** (seven since polish
X23 retired `--tracking-link-mono` with the footer's capital info lines). The
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
stops the third divergence. (`.footer__brand` went with the garment pages' old footer on
2026-10-02, VA-31.)

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
               hover: INVERTS (fill and text swap; the border keeps the old fill) and lifts 2px
.btn--ghost    transparent, 1.4px --line-control border (3:1, see §1)
               hover: INVERTS to --text bg with --bg text and lifts 2px
```

**Both buttons answer a pointer the same way since 2026-10-02 (VA-46).** The primary button used
to lift with no colour change and the outline button filled solid with no lift, while the site's
cards and chips agreed with each other. Now both invert and both lift 2px (one `.btn:hover` rule, so
they cannot drift), on a fine pointer only, from the tokens above. The text clears 4.5:1 on every
swapped fill (13.06:1 for the primary in both themes; 14.47:1 light and 13.96:1 dark for the outline
button), and the primary keeps its old fill as its border, because its swapped fill alone is
1.11:1 against the paper or 1.00:1 against the dark page. Reduced motion collapses the transition
to 0.01ms as it does for the cards: the change is instant, not absent.

**12px since 2026-09-11 (audit TY-07).** A button's words, and the site's PRODUCTS and
CONTACT links, are how a visitor gets anywhere, so they moved one step up the scale to
`--text-mono-lg`. The mono labels, chips and section numbers keep their 10–11px register —
that scale is this system's own and was not the finding.

**Two more moved to 12px on 2026-10-01 (owner decision, visual audit):** the contact form's
field labels and legend, and the colour names on a garment's colourway tabs — words a buyer
reads to act, not glances at. The chips and section numbers still keep 10–11px.

**Every text that is read is 12px since 2026-10-02 (owner's choice, visual audit VA-11).** The
footer's headings, links, address, tab and small print; photo captions; the /products filter
chips and their counts; card cues ("View the range →", "Read this guide", "Opens the 3D
viewer"), colour names on cards and the gallery's count; fact labels, timeline step names and
the "We"/"You" tags; subheads and the facts' labels; and on a garment page the camera buttons,
the HD IMAGE button, the garment's facts (their group headings everywhere, and their bullets in
the 3D window's corners), the retry button, the touch hint and the download count. They take
`--text-mono-lg`. Only the decorative register keeps 10–11px: bracket labels (`.label`, the
bracketed `.field-label`s on /contact), section numbers, the timeline's step numbers,
"[ Photo to come ]" and the arrow signs.

### Page widths

Two measures, on purpose (owner, 2026-10-01: document, do not merge):

| Surface | Content width | Why |
|---|---|---|
| The website | `--site-max` **1180px**, **1440px** from a 1280px screen, **1600px** from 1920px | polish D1 (2026-10-04): at 1440 wide the 1180px page left 194px empty each side, and its words used the left half of what was left. The room goes to the heading beside its words and to the card grids; prose stays at `--site-measure` (31.5em, 55ch of Archivo). In `tokens.css` since 2026-10-02 (VA-31) |
| A garment page | **1200px** (`page.css`) | tied to the stage: the canvas is 800px in the two-column layout, and its drawing buffer is sized from that. `.page` sets `--site-max` and `--site-gutter` to this column and `.content` is drawn from them, so the shared footer, which reads the same two, lines up with it (D1; it had missed by 26px at 1440). The website's width steps live in `site.css`, so a garment page never downloads them |

### A section's head: the heading beside its words

From 900px (polish D1), a section's label and heading take the left three fifths of the column and
its paragraph, with any buttons, the right two (`.section-head`, site.css): a paragraph alone sits
on the heading's last line, and words with buttons start level with the heading so the buttons run
on below it. Three fifths, not half, because a heading's last two words are joined
by a no-break space (TY-12) and in half a column at 1024px "YOU'RE MAKING." no longer fit. A list
under a heading takes halves, the heading at the top of the left one and the entries in the right,
where running text needs the room (`.spread`: the category pages' lists and the guides' sections).
The markup keeps its order (label, heading, words, buttons), so a screen reader and the Tab key
meet them as before; below 900px they stack as they always did.

### Long pages name their parts: privacy and terms

Since polish X4 (2026-10-04) each part of the privacy notice and the terms is a real `h2` in the
card title's type (`.prose__heading`), not the small code-style label it was, smaller than the
words under it. "On this page" (`OnThisPage.tsx`) lists them as plain links to each heading: from
900px beside the text, in the same 3:2 split as a section's head, and sticky below the bar, so the
right half of a computer's page is no longer empty; on a phone above the text, its links in a
wrapping row. It works with no script and does not mark the part in view, which in October 2026
still needs a script to tell a screen reader. `e2e/legalPages.spec.ts` holds the headings, the
list and both layouts.

### Breakpoints

Content-led, not a framework's set: each width is where a measured layout stopped fitting.
Listed from the stylesheets on 2026-10-01 (the visual audit had called the set
undocumented). A new one needs the same: the layout it rescues, measured.

| Query | Where | What changes |
|---|---|---|
| `max-height: 500px` | `base.css`, `notch.css`, `page.css` | sideways phones: the cookie card goes to one row, the bar rests at its condensed 52px; on a garment page the phone action bar is hidden |
| `max-width: 359.98px` | `page.css` | narrower padding on the phone action bar's two buttons |
| `max-width: 430px` | `site.css` | the hero's buttons go full width, one per row |
| `560px` | `site.css` | facts and the inquiry form's paired fields go to two columns; below it the product families are one column |
| `max-width: 559px` | `site.css` | on a phone the product cards have a square picture, 12px of text padding and narrower colour dots, and `/products`' filter is one row that scrolls sideways (VA-42) |
| `720px`, and `184px + 14.9rem` | `notch.css`, `footer.css`, `footer-prompt.css` | the bar's links come inline (both must hold, so large text keeps the menu button); the footer's tab and facts change shape |
| `768px` | `footer.css`, `site.css` | the footer slab's columns; the contact page's address and globe sit side by side |
| `900px` | `site.css`, `page.css` | the site's two-column sections (about, proof, timeline), and each section's heading beside its words (`.section-head`, `.spread`, polish D1); "On this page" beside the privacy and terms text (`.legal`, polish X4); facts go to three columns; the garment page's two-column stage when the screen is sideways (`orientation: landscape`, polish F11), and the phone action bar is hidden with it |
| `700px` and `min-aspect-ratio: 3 / 2` | `page.css` | a landscape phone also gets the two-column stage, so the controls sit beside the garment |
| `700px` and `orientation: portrait` | `page.css` | an upright tablet keeps the phone's one column, its garment window half the screen tall so the name under it is on the first screen (polish F11) |
| `1024px` and `min-height: 620px`, sideways | `useIdentityInAside.ts`, `page.css` | the product's name and description move beside the garment on every computer and sideways iPad, the description at three lines with "Read more"; 620px is measured so the contact buttons stay on screen with the longest copy (polish D8; a script query, kept a strict subset of the CSS one). The garment's facts follow the same query into the 3D window's four corners, unless the 3D cannot run (polish D10; `specsInCorners` in `App.tsx` decides, so they are drawn once) |
| `1024px` and `min-height: 656px`, sideways, and container `colourrail` `350px` | `page.css` | beside the garment, each colour's name under its dot, three to a row (polish D8) |
| `1180px` | `site.css` | the product families go to five columns |
| `1280px` | `site.css`, `footer.css` | the website's column widens to 1440px (polish D1; it was 1180px until 1600px); the footer's facts go to five columns (polish X23) |
| `max-width: 899px`, `900px`, `1440px`, `1920px` | `site.css` | the product grid is two columns, three from 900px, four from 1440px (the owner's call of 2026-10-02; D4 had four from 1600px) and five from 1920px (polish D1), each with its own rule against a lone last card (VA-42) |
| `1920px` | `base.css`, `site.css`, `page.css` | the display headlines and the garment pages' stage keep growing, to their 3840px sizes (VA-12); the website's column is 1600px (polish D1) |
| container `colourrail`: `252px`, `350px` | `page.css` | below 252px the dots go three to a row (3 + 2, VA-32); from 350px, beside the garment, each dot has its name under it (polish D8) |

### Pictures in rows: the order timeline

№04 gives each of its eight steps one photo, every one cut to the same **1:1** square (visual
audit VA-29, owner's choice 2026-10-02). The shape is CSS, not eight files: `.photo-figure__frame--square`
(`aspect-ratio: 1 / 1`) frames the picture, `object-fit: cover` cuts it, and each photo's own
`object-position` (its `focus` in `apps/cms/src/lib/factoryPhotos.ts`) keeps its subject in. A
square, because the eight files are four 8:5 and four 4:5 and a square gives up the least of both.

| Width | One step's row |
|---|---|
| 900px and up | the words on the left, the photo on the right in a 400px column, both starting at the row's top edge |
| under 900px | the photo above its words, as wide as the column up to 400px |

The words come first in the markup and `order` lifts the photo above them on a phone only, so a
screen reader hears a step's title before its picture; nothing in a row takes focus, so the two
orders cannot disagree for a keyboard. The pictures are lazy and carry their width and height, and
the wipe and drift that run as they scroll in stop under `prefers-reduced-motion`.

### A family's two pages name each other

A product family can have two pages: its buyer page (for example `/custom-outerwear-manufacturer`)
and its filtered gallery (`/products?family=outerwear`). Since visual audit VA-33 (owner-approved
2026-10-01, words 2026-10-02) each links to the other with the existing ghost button, never the
primary one: the buyer page ends "What we make" with "See all outerwear in 3D", and the gallery
puts "About our outerwear" beside its result count. The words are built from the family's own name,
lower-cased (`seeAllLabel` and `aboutLabel` in `apps/cms/src/lib/familyPages.ts`), and Sports
Accessories, which has no buyer page, has neither link. The gallery's canonical address stays
`/products`: the link is a way across, not a second page to index.

### The product grid: two on a phone, and never one alone

`/products` and the buyer pages share `.product-grid`. Visual audit VA-42 (owner's choice
2026-10-02) found `/products` 30,363px long on a 390px phone, 36 screens with no garment on the
first one, and at 1440px the 40 cards leaving one alone on the last row. Decision D1 stands: one
long page, every garment in the document. Since the owner's call of 2026-10-02 the fourth column
starts at 1440px, so the catalogue's 40 garments fill ten rows of four there; 1280px keeps three.
From 1920px, where the page is 1600px wide since polish D1, there are five: eight full rows.

| Width | Columns | Picture | The filter on `/products` |
|---|---|---|---|
| under 560px | 2 | square | one row that scrolls sideways |
| 560 to 899px | 2 | 4:5 | wraps |
| 900 to 1439px | 3 | 4:5 | wraps |
| 1440 to 1919px | 4 | 4:5 | wraps |
| 1920px and up | 5 | 4:5 | wraps |

The counts are written out rather than left to `auto-fill`, because the rule against a lone last
card has to know them. With three, four or five columns and one card over, the second-to-last card
starts the last row, so it holds two. With two columns and an odd count the last card spans both
and lies down, its picture on the left and its words on the right. A single card on a page is
left alone. `apps/cms/src/productGridOrphans.test.ts` runs the real selectors over every count
from 2 to 60, and `apps/cms/e2e/productsGrid.spec.ts` does it with real cards.

On a phone the colour dots are 24 to 40px wide and still 44px tall: WCAG 2.2 SC 2.5.8 asks for 24px
and the site holds every button to 44px tall, but five 44px-wide dots do not fit a 134px card.
That is narrower than the 44px width §4 states for touch targets, which is the cost of the fix;
the owner accepted it on 2026-10-02.
The card's text has 12px of padding and a long name wraps inside it. The filter row is a scroller
of links, so Tab walks every chip and the browser scrolls each into view; it ends at the screen's
edges and cannot make the page scroll sideways.

### A buyer page opens on its family's picture

Home and contact open on a factory photo; the four buyer pages opened on plain paper until visual
audit VA-48 (owner's choice 2026-10-02). Each now opens on the picture its family's card shows on
the home page (`familyPictures` in `apps/cms/src/lib/families.ts`: the first garment's studio render,
else its poster, else the family's own photo), in a 4:5 frame, `.family-hero__frame`. The label and
the headline keep the full column; the picture sits beside the lede and the buttons from 900px
and after them on a phone. It is beside the lede and not behind the headline because the 72px
display type that takes three lines across the column would take six in half of it, and because no
text is then ever over the picture: the headline and lede keep paper's contrast, in both themes.

The picture is the page's largest paint, so it is eager with `fetchpriority="high"` on the image
itself (never a preload link: one per page is pinned), its space is reserved by the frame's ratio
and the image's width and height so nothing moves when it lands, and its alt text is its own. A
family with no picture at all keeps the hero it had, with nothing drawn.

### The margin inside a garment picture

The renders are cropped tight, so in a box with no margin each garment ran to the edge (visual audit
VA-55, owner's choice 2026-10-02: the sports bra touched both sides, the jacket's sleeves the sides
and the bottom, the bib shorts top and bottom). The pictures on the home family cards, in the
product cards' swipe gallery and in the buyer page's hero now keep a margin, as `padding` on the
picture itself: `calc(var(--picture-inset) * 1.25) var(--picture-inset)`, with `--picture-inset: 7%`.
The property is declared in `apps/cms/src/app/(frontend)/site.css`, not `tokens.css`, because only the
website's cards read it.

`object-fit: contain` fits the picture into what the padding leaves, so the 4:5 boxes are the size they
were and a 4:5 render lands 7% from every edge. Percentage padding is measured against the width, so the
block value is 1.25 times the inline one to reach the same fraction of the height. A render taller than
4:5 is bound by the height and keeps its 7% of height; a wider one keeps its 7% of width. The browser
test holds a floor of 6%, the bottom of the owner's "about 6-8%". Sports Accessories, whose photo is the
one on black, has the same margin: the owner kept the photo and chose to give it the margin. The home
page's 3D section picture has none, because the live model lies exactly over its frame.

### The cookie card

The choice is a fixed card at the foot of the screen (`base.css` `.consent`), with Decline and
Accept the same size and style. Since 2026-10-01: it is the first stop after the skip link; while
it is open the page keeps a strip clear of it (`scroll-padding-block-end` plus the same height of
room, which since polish M2 sits inside the footer above the RUN APPAREL wordmark, so the wordmark
stays the last thing on the page; a page with no footer keeps it at its foot) so no focused item
sits under it (WCAG 2.2 SC 2.4.11); on a short screen it is
one row; and on a garment page the phone action bar steps aside until it is answered. Safari
does not scroll a field it already counts as on screen, so `ConsentBanner.tsx` lifts a focused
field clear itself, and only one shorter than the room above the card: its first version also
lifted page-tall containers and opened every garment page at the footer.

Its sentence is capped at **54ch** (VA-18, 2026-10-02), not left to the page's `p` cap of 60ch,
which let it run 76–79 characters a line from 1024px up. 54ch holds about 67; below 48ch the
sentence tips from three lines to four and the card grows. Both apps' browser suites count the
rendered lines (`consent.spec.ts`).

### The phone contact bar

On a phone the fixed bar at the foot of the screen (`page.css` `.action-bar`) is the persistent
way to start a conversation, and the page's own EMAIL US and WHATSAPP US under "Develop this with
us" are what a screen reader meets reading down. Both stay (`Contact.tsx` records why). Since
2026-10-02 (visual audit VA-54) the bar fades away while the page's own pair is on screen above
it, because at 402x874 and 375x667 the same two buttons were shown twice at the same moment, and
it returns when that pair scrolls off. Since 2026-10-03 it also fades while any of the footer is
above it (owner's choice): over the dark footer the paper bar was a white block on an iPhone, and
the footer carries the email, WhatsApp and "Start an inquiry" itself. So since polish M2
(2026-10-04) no room is kept for the bar under the footer: with the bar always gone there, it was an
empty band under the wordmark, and a garment page now ends at its footer as the website does.
`lib/actionBarStepsAside.ts` sets `data-tucked` on the bar
from an `IntersectionObserver` whose bottom edge is pulled up by the bar's own height; the fade,
and leaving the Tab order and the accessibility tree, are CSS: `opacity` over `--fast`, and
`visibility`, which hides the bar once the fade ends and shows it again at once. A bar with
keyboard focus inside it stays until focus leaves, and under reduced motion the change is
instant. The cookie card hides the bar separately, with no fade. The bar keeps its place in the
layout throughout, so the room the stage reserves for it is unchanged, and it is still not shown
from 900px wide or on a screen 500px tall or less (see Breakpoints).

### Panels

`--surface` background, `1px solid var(--line)`, `--radius-panel` (18px).

**A guide card on the website's guides index is one link (VA-47, 2026-10-02).** The index used to
list each guide twice, as a card with its own button and as a chip at the foot of the page. Now the
card's heading is the only link, named by the guide's title, and its `::after` is stretched over the
card (`site.css`, `.guide-card__link`), so a click or tap anywhere on it opens the guide. Nothing
interactive sits inside it, and the card hovers as the family cards do: a 4px lift and an accent
edge on a mouse and on keyboard focus, the press on touch. The foot of the page keeps only the
buyer-page chips; each guide page still lists its sibling guides.

### The works slab: where we ship, and the marks (polish X7)

№05's numbers end in one slab of two halves split by a hairline (`site.css`, `.works-slab`;
`FactsBento.tsx`, on the home page and the four buyer pages). "Where we ship" draws the world in dots,
from the land mask of the contact globe's library (`apps/cms/scripts/gen-world-map.mjs` writes
`public/world-map.svg`), with the works pinned in volt where the CMS's `worksCoordinates` put them
(no coordinates, no pin: the contact globe's rule, `lib/globe.ts`); the line under it is `SHIPS_TO`.
"Certification" is the footer's marks, at a 44px square's area (the footer's are 36), each group
beside its one line (`CERTIFICATION_LINES`, held to the owner's paragraph by
`companyFacts.test.ts`); the paragraph itself stays whole in `/llms.txt`. Until 2026-10-05 the two
were a line beside seven (audit of 3 October).

**The slab is dark in both themes, in the footer's colours** (ink in light mode, `--raised` in dark),
because the marks are the bodies' reversed artwork, off-white for a dark ground. Its colours are
declared on the slab, which sets no `color-scheme`, so each `light-dark()` takes the page's theme. On
paper it takes the page's colours and drops the map and the marks; in forced colours the map goes.
`apps/cms/e2e/worksSlab.spec.ts` measures the balance, the ground and the pin.

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
| any width, screen 500px tall or less | as above, but the bar rests at its condensed 52px (4px padding) rather than 60px; the controls stay 44px (2026-10-01) |

The menu is the browser's own popover: it opens and closes with scripting off, Escape and a
tap outside close it, and the browser reports its state to assistive technology. The site's
bar is fixed and condenses as the page scrolls; the viewer's is in the page flow and does not,
so `--header-h` still measures where its 3D stage starts.

The Speed Lines icon's three lines are each drawn the icon's full 20px and shortened with
`scaleX` (0.6, 1 and 0.8 of it: the 12, 20 and 16px they have always been), so folding into an X
moves only `transform` and `opacity` and stays on the compositor (VA-19, 2026-10-02). They used to
animate `width`, which is layout on every frame; `scripts/served-css-motion-probe.mjs` no longer
carries an exception for them. The customisation panel's grid rows are the other animation that
moves layout; that one is deliberate and stays (`page.css`).

### The bar's edge, and the bar that leaves (VA-40)

Visual audit VA-40, owner-approved 2026-10-01, built 2026-10-02. The bar and the label row under it took
92px of an 874px phone at all times, and over a dark photograph the bar's shadow and curved edges
vanished (the website's dark "Browse the references" button scrolling under it read as one shape).

**The edge is the soft shadow alone** (`--shadow-raised`), by the owner's choice in polish D12
(2026-10-04). VA-40 had added a 1px ring in the paper colour as the bar's first shadow layer. It
stopped where the two curved top corners begin (masks painted over the bar's own shadow), and the
owner read that as unfinished. Over dark photographs the bar now separates by its shadow and its lime
menu button. `apps/viewer/src/styles/barEdge.test.ts` holds the bar to that one shadow.

**The bar that leaves** is the garment pages' alone, on a phone (`screen`, under 720px,
`hover: none` — the phone the status-area strip defines): while the visitor scrolls down it slides off
the screen by a `transform`, and it returns as soon as they scroll up. The page's script sets
`data-bar-hidden` on the shell (`apps/viewer/src/lib/barAutoHide.ts`); the rule that answers it is
in `notch.css`, and the website never sets the attribute.

| It stays on screen when | Why |
|---|---|
| the page is within 8px of the top | a bar at the top of the page is the page's first thing |
| its menu is open | the menu hangs from it |
| keyboard focus is inside it, or a Tab was pressed | a keyboard visitor must not lose the control they are on |
| the page is scrolled less than 16px down since the last turn | a nudge or a flick does not move it; coming back takes 6px up |

- It moves with `transform` on `--ui` and `--ease` (220ms), nothing that moves layout, so the stage
  below never shifts. Reduced motion makes it instant, by the shared rule in `base.css`.
- **Away means not focusable and not announced**: `visibility: hidden`, held until the slide ends and
  lifted at once when it returns. A Tab press brings it back.
- **The status strip stays** (VA-50). Only the bar moves, never the shell, so the clock and battery
  keep the bar's colour; whether Safari would still tint the area if the strip left was not tested.
- Paper keeps the bar: the rule is for `screen` only.

### The footer

One footer on the public site and the 3D garment pages since 2026-10-02 (visual audit VA-31,
owner-approved 2026-10-01: the garment pages had ended in a pale footer of their own, which no
decision chose). The bar's arrangement: its stylesheet is
[`packages/ui/src/footer.css`](../packages/ui/src/footer.css), with the tab, question and clock
that only the website draws (polish Q42) in
[`packages/ui/src/footer-prompt.css`](../packages/ui/src/footer-prompt.css), which only the website
imports (polish D1); its words, links and rules are
[`packages/shared/src/siteFooter.ts`](../packages/shared/src/siteFooter.ts); each app writes the
same markup in its own framework (`apps/cms/src/components/site/SiteFooter.tsx`,
`apps/viewer/src/components/Footer.tsx`), and both browser suites hold the result to one
accessibility tree, `siteFooterAriaSnapshot`. The garment pages get the footer's details in
their API answer (`siteSettings.footer`), from the same projection the website uses. WCAG 2.2
SC 3.2.6 Consistent Help asks for contact details in the same place on every page of a site.

**The facts since polish X23 and F9 (2026-10-04).** Five blocks in one order on both hosts:
Contact, "What we make" (the four category pages, F9, the owner's Q22), Elsewhere, Capacity and
Standards, then one row of the standards' marks. They run the column's width from its left edge,
under a rule as wide as the legal row's: two columns on a phone (the two link groups side by side,
Contact and the two claims across both), three from 720px, five from 1280px. They were a box of up
to 640px pushed to the right, which left a gap under the question on a computer and stood about two
and a half phone screens tall. Their lines are in normal letters (only the headings and the legal
row keep capitals); entries naming the same holder share a line (`standardsLines`: the two
"Suppliers:" entries); and every mark is drawn at one area, a 36px square's, not one height
(`markBox`), three to a row on a phone.

### Paper

A printed page is light whatever theme it was printed from (visual audit VA-04, 2026-10-02:
printed from dark mode, the headline measured 1.27:1 and body text 1.20:1 on white, because a
browser drops background colours on paper and printing changes neither the system setting nor
a saved choice). `packages/ui/src/tokens.css` narrows `color-scheme` to light in print, so every
`light-dark()` token takes its light half; `notch.css` prints the bar's words in ink with no
pill and no status strip; `base.css` hides the cookie card and switches transitions off on
paper, because even the 0.01ms reduced-motion transition held the dark colour for a frame.
The footer's own paper palette sits at the end of `footer.css` (FA-M-52). Both hosts'
`e2e/print.spec.ts` print from dark mode, set by the system and by the switch, and measure every
word against white. The photo heroes (home, contact, and products with its film) re-declare their
own dark colours, which the paper rule cannot reach, so on paper `site.css` drops the photo, the
film and the pause button and hands those colours back to the page (found 2026-10-02: volt on
white, 1.27:1, from either theme).

A garment page prints as one spec sheet (polish F14, 2026-10-04; it ran to three sheets with the
Email / WhatsApp bar on each): the colour's picture on the left at 76 x 95mm (4:5, the posters'
shape), the labels, name and description beside it, then the facts and the contact details
across the sheet, inside 10mm margins. One A4 or Letter sheet holds the catalogue's fullest
garment (the longest description and six performance features). Three things make it work:
`apps/viewer/src/lib/usePrinting.ts` gives paper the one-column arrangement whatever screen
it is printed from (on a computer the facts sit in the 3D window's corners); a still picture
stands in for the 3D, whose canvas prints as its last frame, cropped; and the print block at the
end of `apps/viewer/src/styles/page.css` floats the picture and hides everything made for a
screen. The shared footer had a grid layer that printed as an opaque white sheet over the
contact details; `footer.css` drops it on paper. `apps/viewer/e2e/print.spec.ts` prints both
paper sizes from a computer and a phone.

### The products film

Since 2026-10-02 the hoodie film plays behind the `/products` hero's words (the owner's request
of 2026-10-01), under the home photo hero's own dark wash, so the words read as they do there.
The files are built from the owner's original by `scripts/build-products-film.mjs`: a 4.5s loop
whose seam (10.4, mean difference per channel) is smaller than two ordinary neighbouring frames
(12–17), as AV1 (310 KB) and H.264 (899 KB, the owner's choice), plus a 15–36 KB still of its first
frame. `apps/cms/src/components/site/ProductsFilm.tsx` shows the still first, and starts the film
only once the page has loaded and the hero is on screen; it pauses off screen and in a hidden tab,
never starts by itself under reduced motion, on Data Saver, on 2G or under automation, and its
44px button reads "Pause video" or "Play video" (WCAG 2.2.2). The still and the film are placed
like the home photo, so the hero is still exactly as tall as its words.

**Served in pieces.** The site's static files answer a `Range` request with the whole file
(measured live: `bytes=0-99` returned all 12,864 bytes of a photo, `200`), and iPhone Safari plays
no video from a server that does that, so `wrangler.jsonc` runs the Worker first for `/film/*`
only and `apps/cms/filmRange.mjs` cuts the bytes asked for. `next start` serves ranges itself, so
the browser suite (`e2e/productsFilm.spec.ts`) cannot see this half: `src/filmRange.test.ts` can,
and so can the local Cloudflare preview: `opennextjs-cloudflare build`, then `opennextjs-cloudflare
preview --local-upstream wear-run.com --port 4174`, then `curl --range 0-99` on a film file must
download 100 bytes, Apple's own test.

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

Eight stacking contexts in the viewer, in reading order from the canvas upward, and
three more that only the marketing site uses. Added as tokens 2026-09-05 (the
viewer's) and 2026-09-06 (the site's); the numbers are exactly what shipped, so
nothing moved — with one stated exception below.

| Token | Value | Layer |
|---|---|---|
| `--z-hero-grid` | -1 | the site's `.site-hero__grid` — the blueprint grid behind the hero copy |
| `--z-menu-dim` | -1 | `.notch-shell::before`, both hosts — the dim behind the open phone menu (polish X26, 2026-10-04); -1 inside the bar's own layer, so it covers the page and stays under the bar |
| `--z-stage-control` | 1 | `.stage__ar` — inside the stage, above the canvas |
| `--z-card-control` | 1 | the site's `.card-gallery__arrow` — previous / next over a gallery card's picture (VA-30) |
| `--z-footer-tab` | 2 | the site's `.site-footer__tab` — seated on the footer slab's top edge |
| `--z-footer-glow` | 6 | the site's `.footer-glow` — the light, blended over the slab's content |
| `--z-header` | 40 | the bar; both hosts' `.notch-shell` share it since 2026-09-24 |
| `--z-action-bar` | 50 | the persistent contact bar |
| `--z-consent` | 55 | `.consent`, the cookie choice (2026-09-30) — over the action bar until answered; under the grain, the dialog and the curtain |
| `--z-grain` | 60 | the full-page grain overlay |
| `--z-dialog` | 65 | the HD image dialog (2026-09-27) — above the grain, so the studio render is never dimmed; under the cursor |
| `--z-cursor` | 70 | `.cursor-ring`, pointer devices only |
| `--z-preloader` | 80 | the opening curtain |
| `--z-skip-link` | 100 | must beat everything, the preloader included |

The exception: the site's notch bar shipped at a raw `20` and now reads `--z-header`
(40). Its stylesheet declares no other stacking value between the two, and the
shared cursor and skip link sit at 70 and 100 either way, so the order a visitor
sees is unchanged — measured by grep of `site.css` and `base.css`, not assumed.

**The open phone menu is in the browser's TOP LAYER, above every z-index here — the skip link
and the cursor included.** It opens under the bar, so it never covers the skip link, which
appears at the top-left. The cursor's dot and ring (fine pointers only) passed under it until
2026-10-04; since polish F5 they join the top layer after the menu while it is open, because the
last element added there is drawn on top (packages/shared/src/cursorRules.ts). While it is open
the page behind it is dimmed and holds still (polish X26 and F3, 2026-10-04); the dim is the
bar's own layer rather than the popover's `::backdrop`, which would cover the bar as well and
split it from the menu it widens into.

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
| `--showpiece` | 1400ms |
| `--stagger` | 40ms |
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
| The site's three showpieces only: the numbers counting up, the order timeline drawing, the contact globe's routes | `--showpiece` (owner decision 2026-09-29, D26 in `docs/DECISIONS-BETA-WEBSITE.md`) |
| Retargeted progress fills | `--fast` (see `page.css`'s note — a fill retargeted several times a second visibly trails the number beside it at anything slower) |
| The phone contact bar fading away while the page's own Email and WhatsApp, or the footer, are on screen (VA-54, 2026-10-02; the footer 2026-10-03) | `--fast`, as the audit's fix text asks. It follows the scroll position, which a visitor can reverse at any moment, so it is the retargeted case above rather than a state a finger is waiting on (`--ui`, 20ms slower). See "The phone contact bar" |
| The pause between rows that arrive one after another — the phone menu's rows only (visual audit VA-51, 2026-10-01); never the page's entrance reveals (D8) | `--stagger` |

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

**The hard stop is a 0.01ms transition on `all`, not "no transition".** It keeps
`transitionend` firing, and it also means a script that writes a size and then measures it
reads the OLD size for that instant. The footer wordmark refits itself that way, so under
reduced motion it shrank for as long as the page was open (87.9px to 56.0px in three
seconds on the live site, found 2026-10-01 by the screenshot suite). Anything that measures
what it just sized gets `transition-property: none` on itself and on whatever inherits the
size, as `.footer-mark` and `.footer-mark__layer` now do in `footer.css`.

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

**Fluid spacing keeps to the 2px grid too, since 2026-10-02 (visual audit VA-17).** Fourteen
values (paddings, gaps and the site gutter) grow with the window through `clamp()`, and between their
two ends they used to land off the grid (the audit counted 152 sizes such as 38.4 or 91.74px),
where the gate above cannot look. Each now has a twin, `round(<the same clamp>, 2px)`, inside
`@supports (width: round(1px, 2px))` and after its rule; the plain `clamp()` stays for a browser
that does not know `round()` (Baseline only since May 2024), because that browser would drop the
whole declaration and fall to 0. A safe-area inset or the bar's clearance is never rounded, only
the clamp beside it. `apps/viewer/src/styles/fluidSpacing.test.ts` fails on a fluid spacing
value without its twin, and both apps' `e2e/fluidSpacing.spec.ts` read the real paddings at
widths where an unrounded value would be fractional.

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
