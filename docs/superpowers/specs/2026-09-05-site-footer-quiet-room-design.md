# The public site footer — "The Quiet Room" design

**Date:** 2026-09-05 · **Status:** approved by the owner, revision 7 of the design artifact
· **Scope:** `apps/cms` public pages only (Home, Products, Contact); the 3D viewer is untouched.

## Why a footer, and why this one

The three public pages ended in a 120px strip: a tagline, four links, a legal line. The owner
supplied nine reference footers they respond to (fabrichealth.com, jords.co.uk, footer.design,
milkywayfilms.it, good-fella.com, unitedcarriers.com, trydot.app, rotimi.cc, esrbespoke.au)
and a showcase HTML of their own. All nine were rendered at 1440×900 and measured.

What the references share, measured rather than felt:

| Pattern | Evidence |
|---|---|
| The footer is a **room, not a strip** | 7 of 8 real footers are 530–1200px tall; two are exactly one viewport |
| **Most of the room is empty** | ESR, Rotimi, Jords, Good Fella: over half the area carries nothing |
| The name appears once, **enormous and quiet** | 4 of 8 at 150–400px; 3 of those cut off by an edge or a fade |
| **10px mono uppercase** does the labelling, above its value | 5 of 8 |
| **Flat, checkable business facts** | every B2B one: VAT/registration numbers, hours, "operating across", two addresses |
| The CTA is a **question + one action + a de-risking line**, at the top | 5 of 8 carry a CTA; 4 lead with a large headline; 3 explicitly lower the stakes |

The mechanism that makes the emptiness read as composed is a **missing middle**: 10px type and
300px type with almost nothing between. Body-sized text in that much space reads as unfinished.

## Decisions (all owner-confirmed, in order)

1. **Full-screen height** from tablet widths up (`min-height: 100svh` at ≥768px). On phones the
   content sets the height — a full dark slab after the page is thumb-travel past nothing.
2. **The action is a question and one link to `/contact`.** No form, no newsletter: nothing new
   that can fail silently. "Have a garment that needs making *properly*?" with the last word in
   Instrument Serif italic volt (the system's own `--serif-accent` idea); a de-risking line;
   the reply promise drawn as a **dimension line** — the tech-pack device.
3. **The header notch, flipped, is the CTA.** A volt tab seated ON the slab's top edge, with the
   two concave fillets at its *bottom* bridging down to that edge — the exact mirror of the
   header bar hanging below the page's top edge. Label centred at rest; on hover/focus it slides
   left and an arrow arrives; the tab's width never changes so the fillets never move. On touch
   the arrow is always shown. Geometry:

   | | header (`.notch`) | footer tab |
   |---|---|---|
   | rounded corners | `border-end-*-radius` | `border-start-*-radius` |
   | fillet anchor | `inset-block-start: 0` | `inset-block-end: 0` |
   | mask circle | `at 0 100%` / `at 100% 100%` | `at 0 0` / `at 100% 0` |

   ⚠️ The tab must sit **outside** any `overflow: hidden` box or it is clipped away entirely.
   So `<footer>` is unclipped and `position: relative`; an inner slab div carries the clip for
   the wordmark crop; the tab is a child of `<footer>` pinned to the slab's top edge.
4. **A bracketed live Sialkot clock** (Jords's corner-bracket device) with an **open/closed
   light computed from the hours field** — Good Fella's `■ ACCEPTING PROJECTS`, made true.
   Renders `--:--` and no light until the client mounts; the light exists only once hours are
   set.
5. **Facts as a 2×2 block, bottom-right, on its own hairline:** Contact / Capacity / Certified /
   Elsewhere. The last three are **optional CMS fields with no defaults** — a certification is a
   claim, not copy — and each block disappears entirely when empty.
6. **The wordmark is an outline**, fitted to the slab's full width by *measuring* the rendered
   text (two fixed sizes both ran "RUN APPAREL" off the edge), cropped by the bottom edge. It
   reads the same `temporaryWordmark` field as the top bar, so the two ends of the page cannot
   disagree about the company's name. A pointer **spotlight** (170px, fixed — a letter and a
   half) lights the stroke in full volt and the glyph interiors at 30% volt; fine pointers
   only, nothing on touch, nothing under reduced motion. The base outline *is* the design.
7. **The site's blueprint grid** (`packages/ui/src/base.css` `.blueprint`, 26px) fades in behind
   the wordmark — Fabric's treatment.
8. **The viewer's cursor comes to the site, dependency-free.** 6px dot tracking the pointer
   exactly; 34px 1px ring trailing on a spring; ×1.53 with a 14% volt fill over links, buttons
   and tabs; `cursor: none` only once the replacement is drawn. The CSS already exists in
   `packages/ui/src/base.css` (`.cursor-dot`, `.cursor-ring`, `.has-custom-cursor`) and is
   reused verbatim; only ~40 lines of JS are new. No Motion in `apps/cms`.
   ⚠️ Position and scale live in ONE `transform` string, translate before scale — the viewer's
   ring once carried `scale` as a standalone property and landed 1.53× away from the pointer.
9. **Inside the footer the cursor glows, and the glow jumps to everything.** Three layers ride
   with the pointer over the slab: a soft volt **halo** (`mix-blend-mode: screen`); a
   **transfer** disc in full volt through `multiply`, so anything lighter than the slab under it
   — letters, links, the clock, the wordmark's outline — takes the colour while the dark ground
   barely changes; and the **grid drawn again in volt**, masked to the pointer AND to the base
   grid's bottom fade, so lines light only where lines exist. Over content the halo drops to a
   third and the content carries the light. Footer only.
   **One light, from the ring's trailed point.** Measured 2026-09-05 on the design artifact:
   positioned from the raw pointer, the halo sat at x=738 while the ring was still at x=348 in
   the same frame, so the glow detached from the cursor on every fast move. Every luminous
   thing — halo, transfer, grid, and the wordmark spotlight — is now positioned from the ring's
   trailed position inside the frame that moves the ring, and the hand-off to content has
   180ms of hysteresis on leaving (four dim-and-relight toggles crossing the 2×2 became one).
   `multiply` was chosen over `overlay` by rendering both: overlay lifts the ground into a
   torch-on-the-floor; multiply puts the light into the letters, which is what was asked for.
10. **Owner's answers to the four open questions:** whole-footer two columns → *no, the facts
    area as a 2×2*; spotlight colour → *volt*; on phones → *nothing, plain outline*; bring over
    → *all four* (serif accent, Elsewhere block, dimension line, mono eyebrow).

## Data model (CMS `site-settings` global)

Copy fields carry defaults; claim fields carry none.

| Field | Type | Default | Notes |
|---|---|---|---|
| `ctaLabel` | text | "Start an enquiry" | the tab |
| `ctaQuestion` | text | "Have a garment that needs making properly?" | last word italicised by the component |
| `ctaSubline` | text | "Send a tech pack, a sketch, or just the idea." | |
| `ctaPromise` | text | "Reply within 2 business days" | the dimension line |
| `capacity.moq` | text | — | e.g. "50 pcs per style" |
| `capacity.leadTime` | text | — | e.g. "4–6 weeks from approval" |
| `capacity.hoursFirstDay` / `hoursLastDay` | select mon…sun | — | a contiguous working week |
| `capacity.hoursOpen` / `hoursClose` | text `HH:MM` | — | works local time, `Asia/Karachi` |
| `worksCoordinates` | text | — | shown under the address only if set; never derived |
| `certifications[]` | array of `{ name }` | — | each a claim; none without the owner |
| `socialLinks[]` | array of `{ label, url }` | — | `https://` only |

Projected on the cms-only `PublicSiteSettings` (`apps/cms/src/lib/projectPublic.ts`), **not** on
the shared `ViewerSiteSettings` — the viewer API returns that type to the 3D pages and its
fixtures and smoke gates must not move. Migration is hand-written (the generated chain is
stale; see `apps/cms/src/migrations/20260905_090000_site_logo.ts`): eleven `ADD COLUMN`s and two
leaf tables for the arrays, names verified against `payload generate:db-schema` before writing.

## Behaviour matrix

| Situation | Tab | Clock / light | Wordmark | Cursor | Glow |
|---|---|---|---|---|---|
| Desktop, fine pointer | slides + arrow on hover/focus | live, light per hours | outline + spotlight | dot + ring | halo → transfer |
| Touch | arrow always shown | live, light per hours | plain outline | none | none |
| `prefers-reduced-motion` | no transition | live, light per hours | plain outline | none | none |
| JavaScript off | plain link | `--:--`, no light | outline at first-paint size | native arrow | none |
| Windows High Contrast | border, no fillets | text only | outline in CanvasText | none | none |
| Fields empty (CI) | — | clock only, no light | — | — | — |

## Testing strategy

Every gate broken on purpose before it is trusted. Pure logic lives in `apps/cms/src/lib`
(counted by coverage: `src/**/*.ts`, floors 84/80/74/84) with unit tests; client components are
thin DOM glue; the browser suite in `apps/cms/e2e` measures the geometry — tab bottom equals slab
top, the wordmark's `scrollWidth` equals its `clientWidth`, the 2×2 has two tracks, empty
blocks are absent, the cursor is absent on touch and under reduced motion and present on a fine
pointer, and every link renders with JavaScript disabled.

## Out of scope

A contact form; newsletter; company registration number (owner declined); porting the viewer's
Motion-based cursor as shared code (would drag ~150 KB raw into the site and needs a shared
package to satisfy the cross-app import lint); any change to the viewer.

## Still owed by the owner

The real values for the three claim blocks — live social accounts, held certifications, and
MOQ / lead time / working hours. The build ships with those blocks hidden until entered; see
`docs/OWNER-CHECKLIST.md`.
