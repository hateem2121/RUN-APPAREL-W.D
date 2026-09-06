# Customization copy — draft for all eleven garments, 2026-09-04

**Status: DRAFT. Nothing here has been written to the CMS.** Paste each block into
the matching product's `Customisation intro` and `Customisation steps` fields, or
ask for the API script and it can be applied in one pass.

## Why this exists

Measured 2026-09-04 across all eleven live products: **ten had
`customisationSteps: []` and an empty `customisationIntroHtml`.** Only `rxps` had
content, and its four steps were generic — they described the process, not the
garment, and not the buyer.

Two consequences, one commercial and one technical:

1. **Commercial.** The section headed *"FROM IDEA TO PRODUCTION."* rendered a
   heading and one fallback sentence on 10 of 11 pages, then stopped. The page did
   not look broken; it looked thin, which is worse, because nobody reports it.
2. **Technical / SEO.** These pages are a single-page app. A crawler that runs no
   JavaScript sees almost no text. Unique, substantial, per-garment prose is the
   cheapest crawlable text this viewer can carry — and copying one generic block to
   eleven products would create *duplicate content across 55 URLs*, which is an SEO
   negative rather than a neutral. That is why `rxps` is rewritten here too.

## Who this is written for

**A decision-maker, not a browser.** The reader is a brand owner, a procurement
lead, a club director or a founder deciding whether to start a development
conversation with a manufacturer they have not met. So each step answers a
question that person is actually asking:

| Step | The buyer's real question |
|---|---|
| 1. Share your starting point | *How much work do I have to do before you can help?* |
| 2. Define the product | *Will the specification be controlled, or will it drift?* |
| 3. Add your brand | *Will my branding survive production and look right?* |
| 4. Sample, refine and produce | *What protects me between approval and delivery?* |

The register is deliberately technical and unsalesy, matching the existing brand
voice on these pages. Buyers at this level discount adjectives and read
specifications; every paragraph therefore names a material, a method or a control
rather than an emotion.

## How it is written for search

The target buyer is **outside Pakistan — North America, South America, Europe, the
GCC and Oceania** — searching in English for a manufacturer. That buyer does not
search for "X-MILO PRO BIB". They search for the *category plus the intent*:
"custom cycling bib shorts manufacturer", "private label activewear supplier",
"OEM sports bra manufacturer", "custom soccer jersey supplier".

So each garment's copy carries its own category phrase, naturally, once or twice —
never repeated into keyword stuffing, which reads badly to a CEO and is discounted
by Google anyway. The vocabulary used is the vocabulary this business already
uses: **custom manufacturing, OEM, private label, tech pack, development sample,
approved standard, production**. Those terms are true of the process described on
these pages; nothing here claims a capability the site does not already state.

| Garment | Category phrase it targets |
|---|---|
| X-MILO PRO SKIN-SUIT | custom cycling skinsuit manufacturer |
| X-MILO PRO BIB | custom cycling bib shorts manufacturer |
| APEX FLEX PULLOVER | custom half-zip pullover / activewear manufacturer |
| AERO-TECH WINDBREAKER | custom cycling windbreaker manufacturer |
| ARMOR-TECH JACKET | custom leather jacket manufacturer |
| WOMEN ZIP-UP VEST | private label women's activewear manufacturer |
| MINECUT MOTION | custom tennis dress manufacturer |
| THE AGGRESSOR JERSEY | custom American football jersey manufacturer (women's) |
| THE AGGRESSOR JERSEY MEN | custom American football jersey manufacturer |
| CLASSIC SOCCER SHIRT | custom soccer jersey manufacturer |
| ARISAN SPORTS BRA | custom sports bra manufacturer |

## What is grounded, and what is deliberately absent

Every material claim is read from that garment's own CMS record — fabric, GSM, fit,
performance features, description. **Nothing is invented.** Step 3 names the
decoration method the product actually specifies:

| Garment | Decoration method, from its own spec |
|---|---|
| X-MILO PRO SKIN-SUIT | full digital print |
| X-MILO PRO BIB | full sublimation print |
| APEX FLEX PULLOVER | DTF print |
| AERO-TECH WINDBREAKER | full sublimation print |
| **ARMOR-TECH JACKET** | **screen-printed logo** (owner-confirmed 2026-09-04) |
| WOMEN ZIP-UP VEST | DTF print |
| MINECUT MOTION | digital sublimation print |
| THE AGGRESSOR JERSEY | digital sublimation + silicone printing |
| THE AGGRESSOR JERSEY MEN | silicone printing |
| CLASSIC SOCCER SHIRT | digital sublimation print |
| ARISAN SPORTS BRA | screen printing |

⚠️ **The ARMOR-TECH JACKET entry is a correction.** An earlier draft of this file
said the jacket "is not printed — leather does not take sublimation" and built its
step 3 around hardware instead. **That was wrong**: the garment carries a
screen-printed logo, confirmed by the owner on 2026-09-04. The sublimation half of
the sentence was true and the conclusion drawn from it was not. Its step 3 below
now names screen printing, and keeps the hardware detail as the secondary branding
route rather than the only one.

**One commercial fact is now included, owner-confirmed 2026-09-04:** test orders can
start as low as **50 pieces**. It appears in every garment's intro, phrased eleven
different ways — the fact has to be on all 55 URLs, but one identical sentence
repeated across them is the duplicate-content problem this file exists to avoid. It
is also a search term in its own right ("low MOQ sportswear manufacturer", "custom
activewear manufacturer 50 pieces").

**Still absent, because I cannot verify them:** lead times, unit prices,
certifications, audit status, factory capacity, and any claim about existing
customers or regions served. A procurement lead asks for lead time immediately
after MOQ, so that is the next-biggest gap — see the end of this file.

---

## 1. X-MILO PRO SKIN-SUIT — `rxps` (R-XPS)

**Intro**

> A skinsuit is the least forgiving garment in a cycling range: one piece, worn at
> speed, every seam load-bearing. We work as a custom cycling skinsuit manufacturer
> for brands and teams — bring a tech pack, race artwork, a competitor sample or a
> sketch, and we develop it into a production-ready garment with you.
> Test orders start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A tech pack, a sponsor layout, a sample to be matched, or a race calendar and a deadline. You do not need a finished design to begin — most skinsuit programs start from a sponsor sheet, and our team builds the pattern and print layout around it. |
| 2 | LOCK THE SPECIFICATION | We fix the four-way stretch nylon knit at 160–220 GSM, the race fit, chamois density for your riders' distances, and the mesh bib strap and gripper specification. Once agreed, that specification is the standard every unit is measured against — not a starting point that drifts in production. |
| 3 | ADD YOUR BRAND | The suit takes a full digital print, so sponsor blocks, national colors and gradients cross panels and seams without a join. Artwork is mapped to pattern pieces before printing, so a sponsor's mark never lands on a curve or a seam allowance. |
| 4 | SAMPLE, APPROVE, PRODUCE | You receive a development suit to ride in, not just to inspect. Fit and print placement are corrected against your feedback, you approve a reference sample, and production is manufactured to that approved standard. |

---

## 2. X-MILO PRO BIB — `r-xmp` (R-XMP)

**Intro**

> Custom cycling bib shorts are judged on the chamois and the grippers, and nothing
> else survives hour four. We manufacture bibs to your specification — send a
> design, a tech pack, artwork or a written brief and we develop it into a
> production-ready garment.
> A first test order can be as small as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A club design, a sponsor layout, a pair you want bettered, or simply a description of the riding your athletes do. Road, MTB and endurance pull the specification in different directions, so that description is often more useful to us than a drawing. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% polyester / 10% spandex compression knit at 180–220 GSM, the aero race fit, and multi-density chamois pad selection for your riders' distances. Mesh bib straps and silicone leg grippers are specified to build, not to a single house pattern. |
| 3 | ADD YOUR BRAND | Full sublimation puts color into the fibre rather than onto it, so a sponsor mark will not crack or peel at the gripper or the seat. Flatlock stitching keeps seams flat beneath the print. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development pair goes out for real rides. Chamois feedback and gripper tension are the two things that usually change; both are corrected, you approve a reference sample, and production follows it. |

---

## 3. APEX FLEX PULLOVER — `r-afp` (R-AFP)

**Intro**

> A custom half-zip pullover that carries a brand from the gym to the street. We
> work as an OEM and private label activewear manufacturer — bring a tech pack,
> artwork, a reference garment, or a description of the look you are after.
> Test runs start from 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A brand moodboard, a competitor piece you want improved on, a tech pack, or a rough sketch. This garment sells on appearance as much as performance, so references shorten the route to a first sample considerably. |
| 2 | LOCK THE SPECIFICATION | We fix the waffle-knit eco-poly stretch at 160–210 GSM, the sleek athletic cut, and the convertible stand collar. The invisible zip is specified to disappear into the knit rather than interrupt it — a detail that separates a private label piece from a blank. |
| 3 | ADD YOUR BRAND | DTF print holds fine detail and small type cleanly on a waffle texture, where sublimation struggles. Logos, chest marks and sleeve hits are placed to sit flat on the knit relief rather than bridge it. |
| 4 | SAMPLE, APPROVE, PRODUCE | You approve a development sample, we settle collar height, zip pull and print scale together — they read differently on a body than on screen — and production is manufactured to the approved standard. |

---

## 4. AERO-TECH WINDBREAKER — `r-atw` (R-ATW)

**Intro**

> At 40–70 GSM every gram is visible in the hand. We manufacture custom cycling
> windbreakers and packable shells to your specification — bring a design, a tech
> pack, artwork or a brief describing the conditions your riders face.
> You can begin with a 50-piece test order.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Team artwork, an event brief, a tech pack, or the weather your athletes actually ride in. A summer criterium shell and an autumn sportive shell are different products, and that decision is best made before pattern work begins. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% nylon taffeta between 40 and 70 GSM, the streamlined aero fit, and the ventilated back yoke. DWR finish and breathable mesh lining are specified to your climate, and packable construction is retained through every variant. |
| 3 | ADD YOUR BRAND | Full sublimation carries artwork across the entire panel layout, including the yoke, with no added weight and no stiffening — which is why print is used here rather than an applied transfer that would compromise the shell's whole purpose. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development shell is tested for pack size, wind resistance and noise. Those three trade against one another; we settle the balance with you, you approve a reference sample, and production follows it. |

---

## 5. ARMOR-TECH JACKET — `r-atj` (R-ATJ)

**Intro**

> A 1.2 mm cowhide utility jacket is a hardware and construction program as much
> as a materials one. We work as a custom leather jacket manufacturer for brands —
> bring a tech pack, reference garments, hardware you want matched, or a written
> brief.
> Test orders begin at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Reference jackets, a tech pack, hardware samples, or a written specification. Leather rewards precision and punishes revision, so the more reference you bring, the closer the first development piece lands and the fewer hides are spent getting there. |
| 2 | LOCK THE SPECIFICATION | We fix the 1.2 mm cowhide, the tactical engineered fit, the thermal-regulating inner lining, and the 3D articulated shoulder panels that keep the arms mobile in a stiff hide. Waterproof utility zippers and adjustable velcro cuffs are specified as named components, not substituted at production. |
| 3 | ADD YOUR BRAND | Your mark is screen-printed onto the hide, which holds a crisp edge on leather where a heat transfer would not survive the surface. Branding continues into the build itself — the multi-point storm hood, panel splits, stitching color and metal or embossed hardware all carry identity. |
| 4 | SAMPLE, APPROVE, PRODUCE | You approve a development jacket in the real hide, never a substitute material. Hood adjustment and cuff travel are the usual corrections; once approved, that jacket is the standard production is measured against. |

---

## 6. WOMEN ZIP-UP VEST — `r-wzu` (R-WZU)

**Intro**

> A bra-vest has to hold like a sports bra and cover like a crop, and most fail at
> one of the two. We manufacture private label women's activewear to your
> specification — bring a design, a tech pack, artwork or a size range and a brief.
> A first order can be as small as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A brand moodboard, your intended size range, a tech pack, or a garment you want improved on. Tell us the training this is for — support requirement is set by the activity, not by the size, and that decision shapes the whole pattern. |
| 2 | LOCK THE SPECIFICATION | We fix the 85% recycled polyester / 15% spandex eco-power mesh at 150–220 GSM, the athletic fit, mesh panel construction, elastane strap tension, and the reversible zip that lets the piece be worn open or closed. Recycled content is specified and held, not swapped at production. |
| 3 | ADD YOUR BRAND | DTF print carries fine detail on stretch mesh without stiffening the panel or blocking airflow, which a heavy transfer would. Placement avoids compression seams entirely, so branding does not move as the garment stretches. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development vest is trained in, not modelled. Strap tension and zip travel are the usual corrections; you approve a reference sample and production is manufactured to it across your full size range. |

---

## 7. MINECUT MOTION — `r-mm` (R-MM)

**Intro**

> Twenty-two panels, each mapped to a facet of an old mine cut diamond. It is the
> most geometrically demanding garment we make, and it is fully customizable — we
> manufacture custom tennis dresses to your specification from artwork, a tech pack
> or a brief.
> You can start with 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, a tournament brief, artwork, or a tech pack. Because the panel layout *is* the design here, it is worth agreeing how your colors should break across facets before anything is drawn — that conversation costs nothing and saves a sampling round. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% polyester / 10% spandex stretch knit at 160–250 GSM, the athletic fit, and the 22-panel faceted construction. Panel count is structural rather than decorative, so it is agreed once and held for the life of the program. |
| 3 | ADD YOUR BRAND | Digital sublimation prints each of the 22 panels individually before assembly, so a graphic runs across facets and still meets exactly at the seam. That registration is the whole point of the garment, and it is what a lesser process cannot reproduce at volume. |
| 4 | SAMPLE, APPROVE, PRODUCE | You approve a development dress and, critically, check facet alignment on a body in motion rather than on a hanger. Panel mapping is corrected, and production is manufactured to the approved standard. |

---

## 8. THE AGGRESSOR JERSEY — `r-aj` (R-AJ)

**Intro**

> A custom American football jersey built on a contoured, female-specific block —
> not a men's pattern resized, which is what most of the market offers. Bring a
> design, a tech pack, artwork or a brief and we develop it with you.
> A trial run starts at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Team artwork, a sponsor sheet, numbering and name requirements, or a tech pack. Numbers and names change a layout more than most people expect, so bringing the roster early avoids a redesign after the first sample. |
| 2 | LOCK THE SPECIFICATION | We fix the 88% polyester / 12% spandex double interlock at 220–260 GSM and the contoured, female-specific cut. The contrasting ribbed V-neck trim is specified as a color decision in its own right rather than defaulted to the body color. |
| 3 | ADD YOUR BRAND | Two methods work together. Digital sublimation carries the full-body graphic and distressed brushstroke work; silicone printing adds raised numbers and marks with grip and depth that a flat print cannot produce — and that survive a season of contact. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jersey goes to real players. Shoulder mobility and number placement are the usual corrections; you approve a reference sample and production is manufactured to it. |

---

## 9. THE AGGRESSOR JERSEY MEN — `r-ajm` (R-AJM)

**Intro**

> The men's counterpart to the Aggressor, on a contoured masculine block with an
> EVA foam pad. We manufacture custom American football jerseys to your
> specification — bring a design, a tech pack, artwork or a brief.
> Test orders start from 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Team artwork, a sponsor layout, numbering, or a tech pack. If you are also running the women's Aggressor, both are developed together so the two read as one kit rather than two designs that happen to share a color. |
| 2 | LOCK THE SPECIFICATION | We fix the 95% polyester / 5% spandex double mesh interlock at 220–260 GSM, the contoured masculine cut, and EVA foam pad placement and density for your level of contact. Pad specification is agreed per program, not carried over by default. |
| 3 | ADD YOUR BRAND | Silicone printing gives raised numbers and marks with real depth and grip, and it outlasts a flat transfer under contact. The contrasting ribbed V-neck trim is a second, separate color decision that most suppliers will not offer you. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jersey is tested in contact, not merely fitted. Pad position and number durability are the usual corrections; you approve a reference sample and production follows it. |

---

## 10. CLASSIC SOCCER SHIRT — `r-css` (R-CSS)

**Intro**

> A custom soccer jersey in a 50/50 cotton-poly balance — the weight and hand of a
> classic shirt with modern print. We manufacture soccer kit to your specification
> for clubs and brands; bring a crest, a heritage shirt, artwork or a tech pack.
> A first order can start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A club crest, colors, sponsor requirements, a heritage shirt you want referenced, or a tech pack. Retro programs usually begin with a photograph, and that is enough for us to work from. |
| 2 | LOCK THE SPECIFICATION | We fix the 50% polyester / 50% cotton balance fabric at 160–220 GSM, the boxy fit, the fold-over polo collar, and the diagonal chest and shoulder panel construction that carries the pattern. Fabric blend is specified and held — it is the first thing substituted by suppliers competing on price alone. |
| 3 | ADD YOUR BRAND | Digital sublimation prints the tonal geometric pattern, crest, sponsor and numbering into the fabric, so the shirt keeps a soft cotton-blend hand rather than a plastic panel across the chest. Names and numbers are part of the print, not applied afterwards. |
| 4 | SAMPLE, APPROVE, PRODUCE | You approve a development shirt; collar shape and pattern scale are settled on a body rather than on screen, and production is manufactured to the approved standard across your full size run. |

---

## 11. ARISAN SPORTS BRA — `r-asb` (R-ASB)

**Intro**

> High-support compression in a breathable spacer knit. We work as an OEM sports
> bra manufacturer for activewear brands — bring a design, a tech pack, artwork, or
> your size range and a support requirement.
> A first production test can be as small as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A brand moodboard, your size range, a tech pack, or a bra you want bettered. Support requirement comes from the activity and the size range together, so we need both before pattern work — a bra graded from one sample size is the commonest failure in this category. |
| 2 | LOCK THE SPECIFICATION | We fix the 95% nylon / 5% spandex spacer knit at 200–240 GSM, the high-support compression level, the moisture-wicking specification, and the strappy back — which is structural here, not decorative, and is graded rather than repeated across sizes. |
| 3 | ADD YOUR BRAND | Screen printing sits cleanly on a thick spacer knit without filling the loft that provides the breathability, which is why it is used here in place of a heavier transfer. Placement avoids the compression band entirely. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development bra is tested for bounce across your size range, not only on a sample size. Strap and band tension are the usual corrections; you approve a reference sample and production is manufactured to it. |

---

## Garment fit values — owner-confirmed 2026-09-04

Three products had an empty `garmentFit`, so the `[ FIT ]` annotation on the stage
and the `[ Fit ]` row in the spec list were both omitted on their pages. Confirmed
values, to be entered in the CMS:

| Product | `garmentFit` |
|---|---|
| `r-wzu` WOMEN ZIP-UP VEST | **Athletic fit** |
| `r-mm` MINECUT MOTION | **Athletic fit** |
| `r-css` CLASSIC SOCCER SHIRT | **Boxy fit** |

These now also appear in the step 2 copy above, so the two do not contradict each
other. They also flow into the JSON-LD structured data as a `Fit` property, which
those three garments currently omit entirely.

---

## What would move this furthest — beyond copy

Copy alone will not rank a site internationally. These are the gaps that matter for
a buyer in Toronto, Munich, Dubai, São Paulo or Melbourne searching for a
manufacturer, ordered by impact against effort. **None of these are done.**

### 1. The strongest B2B signals are missing, and I could not write them

A procurement lead's first three questions are **minimum order quantity, lead time,
and what compliance you hold**. None of those exist anywhere on these pages, and I
did not invent them. Adding them — even as ranges — would do more for conversion
than any wording above, and they are also what buyers type into search
("low MOQ sportswear manufacturer", "custom activewear manufacturer 100 pieces").

### 2. Unblock the AI assistants — DECIDED 2026-09-04, not yet done

**Owner decision: unblock.** Not done here — it needs the Cloudflare dashboard, and
no API token is reachable from the repo.

What is served today, prepended by Cloudflare to this project's own `robots.txt`:
`Disallow: /` for **GPTBot, ClaudeBot, Google-Extended, meta-externalagent,
Amazonbot, Bytespider, CCBot and Applebot-Extended**, plus
`Content-Signal: search=yes, ai-train=no, use=reference`. Ordinary Google search is
unaffected — this only concerns AI crawlers.

**To turn it off** (path taken from Cloudflare's own current documentation, not
from memory — their UI naming has changed twice):

1. Cloudflare dashboard → the zone → **Security** → **Settings**.
2. Filter by **Bot traffic**.
3. Find **"Set your preference to block training in robots.txt"** and turn it
   **off**.

⚠️ **CHECK THE SECOND LAYER TOO, OR THIS WILL LOOK LIKE IT DID NOT WORK.**
`robots.txt` only *requests* that a crawler stay away — compliance is voluntary and
it changes nothing at the network level. Cloudflare has a separate feature,
**AI Crawl Control → Crawlers**, that actually *enforces* blocks. If any of those
crawlers are blocked there, they will keep getting a 403 no matter what
`robots.txt` says. Both have to be permissive for an assistant to read these pages.

**Verify afterwards** — the managed block is gone when this prints nothing:

```bash
curl -s https://viewer.wear-run.help/robots.txt | grep -A1 "GPTBot\|ClaudeBot"
```

And confirm a crawler is actually served rather than challenged:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "GPTBot/1.0" https://viewer.wear-run.help/rxps/wine
```

A `200` is the answer you want. A `403` means the AI Crawl Control layer is still
blocking, and step 3 alone was not enough.

⚠️ **One thing to know before doing it.** Turning this off does not merely allow AI
answers to cite these pages — it also permits AI *training* on them. The
`ai-train=no` signal goes away with the block. For a product catalogue whose value
is the garments and the process rather than the words, that is a reasonable trade,
and it is the trade the decision accepts. It is worth being explicit about because
it is not reversible for content already collected.

### 3. Language and region signals — partly done

**Done 2026-09-04, owner decision: American spelling.** Every string a visitor reads
now uses the American form — "colorway", "color", "customization", "inquiry" — in
the viewer UI, the `<meta name="description">`, the Open Graph and Twitter
descriptions, the JSON-LD, and the pre-filled enquiry template. "Colorway" is the
higher-volume search term in the US and Canada, the largest target market.

⚠️ **Code identifiers were deliberately NOT renamed.** `ColourwayTabs`,
`.colourways`, `colourway-stage`, the `colourways` payload field and the
`colourway-has-no-glb` diagnostic all keep British spelling. None of them is
indexed, renaming them is hundreds of edits across components, CSS, tests and a
telemetry history, and the search benefit is exactly zero. The rule applied was:
change what a visitor reads, not what a developer types.

**Still open:** `<html lang="en">` is static while `og:locale` says `en_GB`. With
the copy now American, `en` is defensible and `en-GB` is now wrong — worth setting
deliberately rather than leaving as a default nobody chose.

### 4. A note on the domain, offered rather than argued

`wear-run.help` carries no search penalty, but `.help` is an unusual TLD for a
manufacturer and B2B buyers do read a domain as a trust signal when comparing
unfamiliar suppliers. Worth knowing when the site is competing for exactly that
kind of first impression. This is a business decision and there may be reasons for
it that are not visible from the code.

### 5. Already fixed on the audit branch

The sitemap listed 2 of 11 products (45 of 55 pages absent), and no page carried
structured data. Both are addressed in `fix/product-page-audit-2026-09-04`; see
`docs/AUDIT-PRODUCT-PAGES-2026-09-04.md`.
