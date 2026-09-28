# Customization copy — draft for all eleven garments, 2026-09-04

**In plain words:** Draft words about customising each garment, written for the CMS but not added yet.

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
| CAPSULE CORE HOODIE | custom cropped hoodie manufacturer |
| GEOVENT TENNIS DRESS | custom tennis uniform manufacturer |
| THE AGGRESSOR UNIFORM | custom American football uniform manufacturer |
| ENDURA CROP TOP | private label women's activewear manufacturer |
| ENDURANCE TRACKSUIT | custom tracksuit manufacturer |

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
| GEOVENT TENNIS DRESS | digital sublimation print |
| THE AGGRESSOR UNIFORM | silicone printing |
| ENDURA CROP TOP | screen printing |
| **CAPSULE CORE HOODIE** | **high-density screen print** (owner-confirmed 2026-09-07) |
| **ENDURANCE TRACKSUIT** | **screen print** (owner-confirmed 2026-09-07) |

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

## 12. CAPSULE CORE HOODIE — `r-cch` (R-CCH)

**Intro**

> A cropped hoodie lives or dies on where the hem sits and how the hood holds its
> shape once it is worn in. We work as a custom cropped hoodie manufacturer for
> lifestyle and studio brands — send a tech pack, a reference piece or a mood board
> and we develop it into a production-ready garment.
> A first test order can be as few as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A sketch, a hoodie you want bettered, or a description of where it will be worn — yoga studio, recovery, street. Crop length and hood volume are the two decisions that define this garment, and a photograph of the look you want settles both faster than a spec sheet. |
| 2 | LOCK THE SPECIFICATION | We fix the soft-touch tech fleece at 140–180 GSM in a 98% recycled polyester / 2% spandex blend, the relaxed flow fit, the structured raglan panelling, and the ribbed hemline that holds the crop where you want it. Wide bell sleeves and the oversized hood are specified to your proportions, not to one house block. |
| 3 | ADD YOUR BRAND | The body takes a high-density screen print, so a chest logo sits raised and solid rather than sinking into the fleece pile. Placement is set against the raglan seams before printing, so a mark never breaks across a panel join. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development hoodie is worn and washed, not just measured. Crop length and hood weight are the usual corrections; you approve a reference sample and production is manufactured to that approved standard. |

---

## 13. GEOVENT TENNIS DRESS — `r-gtd` (R-GTD)

**Intro**

> A tennis dress has to hold a serve and a hem at the same time. We manufacture
> tennis and court uniforms to your specification — as a custom tennis uniform
> manufacturer we take a club design, a sponsor sheet or a written brief and develop
> it into a production-ready garment with you.
> Test orders start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A club colorway, a squad list, a dress you want matched, or simply the level your players compete at. Skirt length and coverage under the skirt are the questions that come up first, and they are easier answered in conversation than on a drawing. |
| 2 | LOCK THE SPECIFICATION | We fix the eco poly stretch at 180–220 GSM in an 85% recycled polyester / 15% spandex blend, the engineered seam placement that keeps stitching off the shoulder and underarm, and the flex jersey panels that carry the movement. Once agreed, that specification is the standard every unit is measured against. |
| 3 | ADD YOUR BRAND | Digital sublimation puts color into the fibre rather than onto it, so an all-over pattern crosses the bodice and the skirt without a join and will not crack at the waist seam. Artwork is mapped to pattern pieces before printing, so a sponsor mark never lands on a curve. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development dress is played in. Skirt length and strap position are the usual corrections; both are fixed against your feedback, you approve a reference sample, and production follows it. |

---

## 14. THE AGGRESSOR UNIFORM — `r-au` (R-AU)

**Intro**

> A football uniform is two garments that have to survive the same contact. We work as
> a custom American football uniform manufacturer for clubs and programs — bring a
> team sheet, a numbering font, sponsor artwork or a uniform you want matched, and we
> develop the jersey and the padded trouser together.
> A first test order can start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A roster with numbers and names, a helmet color to build around, or a program's existing identity. You do not need finished artwork — most uniform programs begin with a color and a number font, and the panel layout is built around them. |
| 2 | LOCK THE SPECIFICATION | We fix the double mesh interlock at 220–260 GSM in a 95% polyester / 5% spandex blend, the contoured masculine-specific cut, the contrasting ribbed V-neck trim, and the EVA foam pad placement at hip, thigh and knee in the trouser. Pad position is set to the positions your players actually play. |
| 3 | ADD YOUR BRAND | Silicone printing holds a hard edge through contact, which is why numbers and player names are printed this way rather than transferred. Numbering, name panel and sponsor marks are laid out against the chevron yoke before printing so nothing breaks across a seam. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development set is worn in contact, not inspected on a table. Pad position and number legibility at distance are the two things that usually change; both are corrected, you approve a reference set, and production is manufactured to it. |

---

## 15. ENDURA CROP TOP — `r-ect` (R-ECT)

**Intro**

> A training set is judged on whether the two halves still match after twenty washes.
> As a private label women's activewear manufacturer we develop the crop top and the
> shorts as one program — send a tech pack, a sample or a description of the training
> and we take it to a production-ready garment.
> Test orders can be as small as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A color story, a set you want bettered, or the kind of session it is for — studio, lifting, running. Sleeve length and rise on the shorts are the decisions that shape the set, and your training description usually answers both. |
| 2 | LOCK THE SPECIFICATION | We fix the single jersey knit at 140–190 GSM in a 90% polyester / 10% spandex blend, the cropped cut, the thumb holes that keep the sleeves down through a full session, and the high-waist rise on the matching shorts. Both pieces are specified together so the fabric and the color match across them. |
| 3 | ADD YOUR BRAND | Screen printing sits cleanly on a fine single jersey without stiffening it, which is why it is used here rather than a heavier transfer. The printed logo band that finishes the top's hem and the shorts' waist is set out as one layout across both pieces. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development set is trained in and washed. Crop length and waistband tension are the usual corrections; you approve a reference set and production is manufactured to that approved standard. |

---

## 16. ENDURANCE TRACKSUIT — `r-et` (R-ET)

**Intro**

> A tracksuit is worn on the way to training and on the way home, so it is judged as
> often off the field as on it. We work as a custom tracksuit manufacturer for teams
> and brands — bring a team identity, a sample or a sketch and we develop the hood and
> the pant as one set.
> A first test order can be as few as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A team color, a travel kit you want matched, or simply how it will be used — warm-ups, team travel, or everyday wear. Whether the top is a hood or a collar is the first decision, and it changes the pattern more than any other choice here. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% organic cotton fleece at 280–350 GSM, the tapered pant silhouette, the pullover hood with drawcord, the contrast raglan sleeves, and the ribbed cuffs and elasticated waist that hold the shape after washing. Once agreed, that specification is what every unit is measured against. |
| 3 | ADD YOUR BRAND | The chest takes a screen print, which is what allows an oversized tonal logo to read as texture rather than as a patch stuck on the front. Placement is set against the raglan seams so a large mark never breaks across the shoulder join. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development set is worn and washed, because cotton fleece moves on the first wash and that is exactly what a reference sample has to account for. Sleeve length and cuff tension are the usual corrections; you approve a reference set and production follows it. |

---

## Added 2026-09-28 — the 24 garments processed on the owner's Mac

Same method and the same rules as the sixteen above; these are the 24: every material claim is read from
that garment's own CMS record (fabric, GSM, fit, features, description — imported from
the printed catalogue on 2026-08-17), and nothing is invented. **Where the record names no
decoration method, step 3 names none** and says the method is agreed at specification.
Where a record contradicts the garment's own 3D export (the catalogue's known defects,
`.claude/rules/cms-scripted-writes.md`), the copy says neither version: SHORT RAGNAL
SLEEVE's "V-shaped collar" (the export has a round neck) and CHEVRON V-NECK SOCCER
JERSEY's "white chevron" and "polyester" (the export has neither; the record says nylon)
are left out. The 50-piece fact appears in every intro, worded differently each time.

---

## 17. SHORT RAGNAL SLEEVE — `r-srs` (R-SRS)

**Intro**

> A six-panel soccer tee in a 100% polyester jersey interlock, cut for a squad that
> trains in it as often as it plays in it. We make custom soccer shirts to your
> specification, from a crest and two team colors or from a full tech pack.
> An opening order can be 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, a crest, a sponsor list or last season's shirt. The six panels are the canvas, so it helps to decide early which colors sit on the body and which on the arm gussets. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% polyester interlock at 140–180 GSM, the six-panel construction with matching side panels and arm gussets, the self-fabric sleeve piping, and the folded sleeve and waist hems. That becomes the reference every shirt is checked against. |
| 3 | ADD YOUR BRAND | Crest, numbers and sponsor marks are placed against the panel lines so a logo never straddles a seam. The decoration method is agreed at specification, matched to the jersey rather than chosen afterwards. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development shirt is worn in a training session. Sleeve piping and hem length are the usual adjustments; you approve a reference sample and production is made to it. |

---

## 18. SCUBA-NECK PERFORMANCE — `r-snp` (R-SNP)

**Intro**

> A scuba suit in laminated high-stretch neoprene, 88% polychloroprene and 12% nylon,
> engineered for a low-bulk anatomical fit. We produce custom scuba and dive suits for
> clubs, schools and brands, developed from your brief.
> A first run can start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | How the suit will be used — training, instruction or recreation — and any colors or marks you need. Water temperature and use decide more of this garment than its looks do, so that comes first. |
| 2 | LOCK THE SPECIFICATION | We fix the laminated neoprene at 1400–1600 GSM, the ergonomic neckline, the anatomically engineered panels, the reinforced chest and shoulder zones, and the flatlock and bonded seams. Seam type is agreed once and held for every suit. |
| 3 | ADD YOUR BRAND | The tonal geometric design is part of the panel layout, and your marks are placed where the neoprene stretches least, so they keep their shape on a body. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development suit is tried in the water, not only on a stand, because fit at the neckline and shoulders only shows in use. You approve a reference suit and production follows it. |

---

## 19. PRO-PILE SHERPA JACKET — `r-pps` (R-PPS)

**Intro**

> A men's sherpa jacket in a high-loft thermal fleece with a bonded mesh lining and
> ripstop overlays, made for outdoor work, commuting and layering. We manufacture custom
> fleece jackets for brands and teams, from a sketch, a sample or a tech pack.
> You can begin with 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A reference jacket, a color story or a sketch. Decide early where the ripstop overlays go, because they carry both the durability and most of the jacket's visual structure. |
| 2 | LOCK THE SPECIFICATION | We fix the 80% cotton / 20% polyester sherpa at 320–440 GSM, the bonded mesh lining, the ripstop overlays, the zippered chest pocket, the elasticated cuffs and hem, and the relaxed athletic fit. |
| 3 | ADD YOUR BRAND | High-loft pile does not take every method equally, so branding usually goes on the smooth ripstop overlays or the chest-pocket area. The method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jacket is checked for sleeve articulation and hem grip, then worn. Double-needle stitching is inspected at the stress points before you approve the reference sample. |

---

## 20. PACEZIP RUNNING SHIRT — `r-prs` (R-PRS)

**Intro**

> A quarter-zip running shirt in 100% recycled polyester, mixing mesh and piqué knit
> panels so the wearer can open it up as the pace rises. We make custom running shirts
> for clubs, events and brands, to your design.
> Test orders start as low as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A club identity, an event, or a shirt you already run in. Say how it will be worn — racing, training or everyday — because that sets where the mesh goes. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% recycled polyester at 180–220 GSM, the mesh and piqué knit panels, the quarter-zip with its metal zip, and the side pocket. Recycled content is part of the specification, not a substitute found later. |
| 3 | ADD YOUR BRAND | Logos and event marks go on the piqué panels, which hold a mark more cleanly than open mesh. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development shirt is run in. Zip length and pocket placement are the usual corrections; you approve the reference sample and production matches it. |

---

## 21. HYDRA-FIT JERSEY — `r-hfj` (R-HFJ)

**Intro**

> A men's full-sleeve training jersey that goes from the gym to the street, with power
> knit and waffle knit panels for drape and hand-feel. We produce custom training
> jerseys for brands and teams from your artwork or tech pack.
> The minimum for a first order is 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Artwork, a brand palette or a jersey you like the cut of. Decide which panels carry color and which carry texture — the two knits read differently in the same shade. |
| 2 | LOCK THE SPECIFICATION | We fix the 95% polyester / 5% spandex stretch at 160–210 GSM, the power knit and waffle knit panels, the upper stitch detailing, and the sleek athletic cut. |
| 3 | ADD YOUR BRAND | A DTF print carries the logo cleanly across the smooth panels without stiffening the stretch. Placement is set so the mark sits flat on the chest rather than across the waffle knit. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jersey is worn through a session and washed. Sleeve length and print hand-feel are checked before you approve the reference sample for production. |

---

## 22. VANTA CORE JACKET — `r-vcj` (R-VCJ)

**Intro**

> A men's tech jacket in a high-density bonded softshell with a DWR weather-resistant
> finish and an adjustable scuba hood. We manufacture custom softshell jackets for
> warm-ups, teams and brands, from a sketch or a tech pack.
> Production can start from 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | How and where it will be worn — warm-ups, commuting or outdoor use — and your colors. The hood system and cuffs matter more than anything else here, so they are discussed first. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% polyester softshell at 220–260 GSM with its DWR finish, the adjustable scuba hood, the tactical chest zippers, the dual-layer storm cuffs, the thermal regulation lining and the 3D engineered panelling. |
| 3 | ADD YOUR BRAND | Marks are placed so they do not interrupt the chest zippers or the panel seams. The decoration method is agreed at specification against the DWR finish. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jacket is checked for hood adjustment, cuff seal and bar-tack strength, then worn. You approve the reference jacket and production follows it. |

---

## 23. X-MILO TRAINING VEST — `r-xmt` (R-XMT)

**Intro**

> A men's hybrid training vest in a lightweight quick-dry fabric with breathable mesh
> panels, built for gym, running, CrossFit and cycling. We make custom training vests
> for teams and brands from your artwork or brief.
> A trial batch can be 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Team artwork, a palette or a single logo. Because the whole vest is printed, the design can run edge to edge — tell us where the mesh panels should sit so the graphic works with them. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% polyester / 10% spandex at 180–220 GSM, the breathable mesh panels, the sleeveless ergonomic construction, the flatlock stitching and the flexible compression fit. |
| 3 | ADD YOUR BRAND | A full sublimation print carries color and graphics into the fabric itself, across every panel, so nothing cracks or peels at the armholes. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development vest is trained in and washed. Armhole depth and print alignment at the side seams are the usual checks before you approve the reference sample. |

---

## 24. TIGER TAIL PROFLEX — `r-ttp` (R-TTP)

**Intro**

> A tennis dress inspired by the tiger tail butterfly, made in a recycled interlock knit
> with digital sublimation across the body. We manufacture custom tennis dresses for
> clubs, academies and brands, developed from your design.
> An order can start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, a pattern idea, or this dress as it is. The butterfly-wing graphic can carry your own colors, so it helps to share them before anything is redrawn. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% recycled polyester interlock at 170–240 GSM and the dress construction, so every unit matches the approved reference. |
| 3 | ADD YOUR BRAND | Digital sublimation puts the full graphic into the fabric before cutting, so the pattern stays clear through stretch and wash. Your marks are placed within that graphic. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development dress is played in, because movement on court is where fit shows. You approve a reference dress and production is made to it. |

---

## 25. MANTRA RAY PROFLEX — `r-mrp` (R-MRP)

**Intro**

> A tennis and pickleball court shirt whose upper pattern follows the giant oceanic
> manta ray, made in a recycled polyester single jersey. We produce custom court shirts
> for clubs, leagues and brands from your artwork.
> You can start with a 50-piece order.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, league marks, or this design recolored. Tell us whether it is for tennis, pickleball or both — it changes nothing in the cut, but it changes where teams want their marks. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% recycled polyester single jersey at 170–240 GSM and the upper panel and sleeve layout that carries the manta ray pattern. |
| 3 | ADD YOUR BRAND | Screen printing lays down the manta ray graphic and your marks in solid, opaque color. Each color is its own screen, so the palette is agreed before sampling. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development shirt is played in and washed. Print registration on the upper pattern is checked before you approve the reference sample. |

---

## 26. TERRA ACTIVE ZIP — `r-taz` (R-TAZ)

**Intro**

> A men's half-zip polo in a tech-piqué power knit with a blade collar and a
> semi-auto lock zipper placket, for golf, team travel and the office. We make custom
> polos for teams, clubs and brands to your specification.
> The first order can be as small as 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, a crest, or a polo you want matched. Say where it will be worn — course, travel or office — because that decides how loud the branding should be. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% nylon / 10% spandex tech-piqué at 140–180 GSM, the blade collar, the semi-auto lock zipper placket, the split hem and the reinforced shoulder seams, in an athletic tapered fit. |
| 3 | ADD YOUR BRAND | This polo is made ready for custom sublimation or embroidery — sublimation for an all-over or tonal design, embroidery for a crest that should look stitched rather than printed. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development polo is worn and washed. Collar shape and placket length are the usual checks before you approve the reference sample. |

---

## 27. THE KINETIC MATRIX JACKET — `r-kmj` (R-KMJ)

**Intro**

> A men's technical jacket in a hydro-repellent softshell with a structural scuba hood
> and integrated visor. We manufacture custom technical jackets for brands and teams,
> developed from your brief or tech pack.
> A first production run can be 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Your colors and how the jacket will be used — training, commuting or weather protection. The bold wave graphic can carry your palette, so share it early. |
| 2 | LOCK THE SPECIFICATION | We fix the 82% recycled polyester / 18% spandex softshell at 250 GSM, the scuba hood with visor, the core ventilation system, the waterproof zippers, the adjustable cuffs, the shock-cord hem and the reinforced bonded seams. |
| 3 | ADD YOUR BRAND | Marks are placed clear of the ventilation openings and the bonded seams. The decoration method is agreed at specification against the hydro-repellent face. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jacket is checked for hood fit, visor shape and seam sealing, then worn. You approve the reference jacket and production follows it. |

---

## 28. AURORA LONGLINE JACKET — `r-alj` (R-ALJ)

**Intro**

> A men's longline jacket in a weather-resistant bonded softshell with a high-neck scuba
> hood, cut long for commuter coverage. We produce custom longline and puffer jackets
> for brands, from a sketch, a sample or a tech pack.
> Orders begin at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A reference coat, a color story or a sketch. Length is the defining decision on this jacket, so we agree it before anything else. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% nylon shell, the high-neck scuba hood with toggles, the dual-entry utility pockets, the adjustable storm cuffs, the matte memory-shine finish and the extended commuter fit. |
| 3 | ADD YOUR BRAND | Branding usually sits at the chest or the upper sleeve, where the quilting is flattest. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jacket is worn and its finish checked in daylight, because a memory-shine surface reads differently indoors. You approve the reference jacket and production follows it. |

---

## 29. WORKOUT CROPPED TOP — `r-wct` (R-WCT)

**Intro**

> A cropped training top in a compression interlock and moisture-wicking athletic
> spandex, made for lifting, conditioning and yoga. We manufacture custom women's
> activewear for private-label brands from your design.
> A test order can be just 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A brand palette, a logo, or a top you want matched. Crop length is the first decision, because it sets how the top pairs with your leggings. |
| 2 | LOCK THE SPECIFICATION | We fix the 75% nylon / 25% spandex compression interlock at 180–260 GSM, the ventilated cropped cut and the contrast panels, and hold that specification for every unit. |
| 3 | ADD YOUR BRAND | A DTF print places your logo cleanly on the chest without stiffening the compression fabric. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development top is trained in and washed. Compression and crop length are checked before you approve the reference sample. |

---

## 30. METRO-SHIELD SUIT — `r-mss` (R-MSS)

**Intro**

> A men's commuter suit in a weather-resistant ripstop softshell with a tech fleece
> lining, a windproof membrane and taped waterproof seams. We make custom rain and
> commuter suits for brands and teams from your brief.
> Start with as few as 50 sets.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Your colors, and how the suit will be used — commuting, travel or outdoor work. The two-tone panel layout is where your palette goes, so share it early. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% polyester Taslon shell with 100% polyester taffeta lining and 40–60 GSM insulation, the high-neck scuba hood, the utility zipper pockets, the reinforced knee panels, the toggle hem and cuffs, and the taped seams, in a tapered urban fit. |
| 3 | ADD YOUR BRAND | Marks are placed away from the taped seams so the waterproofing is never broken. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development suit is checked for seam taping, hood fit and knee articulation, then worn. You approve the reference set and production follows it. |

---

## 31. ZENMOVE TIGHTS — `r-zt` (R-ZT)

**Intro**

> Women's yoga tights in a poly stretch knit with squat-proof opacity and color-lock
> dyeing that resists fading and pilling. We produce custom yoga tights for
> private-label brands, to your specification.
> Your first order can be 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A brand palette, a pair you want matched, or a list of must-haves. Opacity is the first thing we agree, because it is what a customer tests in the fitting room. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% polyester / 10% spandex knit at 160–250 GSM, the squat-proof opacity, the color-lock dyeing, the EVA padding and the skinny fit. |
| 3 | ADD YOUR BRAND | Your logo is placed at the waistband or hip, where the knit stretches least. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development pair goes through a squat test and a wash test. You approve the reference pair and production is made to it. |

---

## 32. BEEFLEX COURT DRESS — `r-bcd` (R-BCD)

**Intro**

> A tennis bra and skirt set whose structure follows the geometry of a bee hive, in a
> poly-stretch interlock chosen for flexibility. We manufacture custom tennis sets for
> clubs, academies and brands.
> A first set order can be 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, marks, or this set recolored. The contrast panels are where two colors meet, so choose the pair before anything else. |
| 2 | LOCK THE SPECIFICATION | We fix the 88% polyester / 12% spandex interlock at 160–220 GSM and the bra and skirt construction, so every set matches the approved reference. |
| 3 | ADD YOUR BRAND | A DTF print places your mark cleanly on the bra panel and holds up to stretch on court. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development set is played in. Strap and skirt fit are the usual adjustments; you approve the reference set and production follows it. |

---

## 33. MOTION-X TRAINING ZIPPER — `r-mxt` (R-MXT)

**Intro**

> A men's training top in a performance stretch fabric with a full-length front zipper
> for ventilation, made for gym work, running and warm-ups. We make custom training
> jackets for teams and brands.
> A team order can start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Team colors, a sponsor sheet or a crest. The side panels are the second color, so we agree the pair before the logos. |
| 2 | LOCK THE SPECIFICATION | We fix the 88% polyester / 12% spandex at 220–260 GSM, the full-length front zipper, the invisible side zip panels, the flatlock stitching and the athletic fit with ergonomic panels. |
| 3 | ADD YOUR BRAND | Two methods are specified: DTF print for sponsor marks and graphics, and embroidery for a crest that should look stitched. Placement is set clear of the front zipper. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development top is worn through a warm-up and washed. Zipper length and sleeve fit are checked before you approve the reference sample. |

---

## 34. VELOCITY PERFORMANCE JERSEY — `r-vpj` (R-VPJ)

**Intro**

> A soccer jersey with a tonal abstract geometric sublimation across the body and a
> clean V-neck, with diagonal panels that leave room for sponsors. We produce custom
> soccer jerseys for clubs and leagues from your artwork.
> A club order can begin at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, a sponsor list and numbering needs. The diagonal panels are made for sponsor placement, so bring the sponsor list at the start. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% polyester / 10% spandex interlock at 150–180 GSM, the V-neck, the diagonal chest and shoulder panels, and the modern athletic fit. |
| 3 | ADD YOUR BRAND | Sublimation printing carries the geometric pattern, your colors, crest and sponsors into the fabric itself, so nothing lifts after a season of washing. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jersey is played in. Pattern alignment across the diagonal panels is checked before you approve the reference sample. |

---

## 35. CRIMSON STRIDE PULLOVER — `r-csp` (R-CSP)

**Intro**

> A men's half-zip midlayer with a brushed thermal fleece interior and a stand-up mock
> neck, made for training, sideline recovery and travel. We manufacture custom
> pullovers and midlayers for teams and brands.
> You can order from 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Team colors, a crest, or a pullover you want matched. The large chest graphic can carry your palette, so share it early. |
| 2 | LOCK THE SPECIFICATION | We fix the 95% cotton / 5% spandex fleece at 210–260 GSM, the brushed thermal interior, the stand-up mock neck, the half zip, the ribbed cuffs and hem, and the double-stitch construction, in a relaxed athletic fit. |
| 3 | ADD YOUR BRAND | Your marks are placed on the chest, clear of the half zip. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development pullover is worn and washed, because a cotton fleece moves on the first wash. You approve the reference sample and production follows it. |

---

## 36. CORE ALIGN TIGHTS — `r-cat` (R-CAT)

**Intro**

> Women's yoga tights built on a compression architecture, with a high-rise ergonomic
> waistband and a puri knit that holds its shape and opacity. We make custom yoga and
> training tights for private-label brands.
> 50 pieces is enough for a first order.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | A brand palette, a pair you want matched, or the level of compression you are after. Compression is agreed first, because it defines the garment. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% nylon / 10% spandex puri knit at 160–240 GSM, the compression architecture, the high-rise ergonomic waistband, the hydrophobic fibers and the skinny fit. |
| 3 | ADD YOUR BRAND | The waistband carries your mark, where it sits flat and stays visible. The decoration method is agreed at specification. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development pair is tested in a hot session and washed, to check shape and opacity retention. You approve the reference pair and production is made to it. |

---

## 37. FLEX FITTED TRAINING VEST — `r-fft` (R-FFT)

**Intro**

> A training bib for drills, scrimmages and sessions where players need telling apart
> fast, in an aero liner mesh with adjustable sides. We manufacture custom training bibs
> for clubs and academies.
> A squad order can start at 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | How many teams you need to tell apart, and in which colors. That sets the number of colorways before any logo is discussed. |
| 2 | LOCK THE SPECIFICATION | We fix the 100% polyester aero liner mesh at 80–100 GSM and the adjustable sides that give a more secure fit than a loose bib. |
| 3 | ADD YOUR BRAND | Screen printing lays down numbers, crests and sponsor marks in solid, opaque color that stays readable across the pitch. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development bib is worn in a drill. Side adjustment and print opacity on the mesh are checked before you approve the reference sample. |

---

## 38. WOMEN'S ATHLETIC TENNIS DRESS — `r-wsa` (R-WSA)

**Intro**

> A tennis dress drawn from the Great Pyramid, with digital sublimation across the bra,
> a conical skirt and a textured compression belt. We produce custom tennis dresses for
> clubs, academies and brands.
> The minimum first order is 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, marks, or this dress recolored. The printed bra panel and the textured belt are the two features that carry a design. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% nylon / 10% spandex interlock at 160–240 GSM, the textured compression belt and the conical skirt construction. |
| 3 | ADD YOUR BRAND | Digital sublimation carries the moon-texture graphic and your colors into the bra panel itself, so it stays clear through stretch. Your marks are placed within it. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development dress is played in. Belt compression and skirt movement are checked before you approve the reference dress. |

---

## 39. INDIGO FLOW SWEATSHIRT — `r-ifs` (R-IFS)

**Intro**

> A crew-neck sweatshirt in a soft, durable flex jersey with precision-finished cuffs and
> hem, for warm-ups, travel and everyday wear. We manufacture custom sweatshirts for teams
> and brands from your artwork.
> A first run can be 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Artwork, a palette, or this design recolored. The all-over pattern can carry your colors, so share them before it is redrawn. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% nylon / 10% spandex flex jersey at 160–240 GSM, the crew neckline, the precision-finished cuffs and hem, and the relaxed, refined fit. |
| 3 | ADD YOUR BRAND | Digital printing carries the all-over pattern and your marks across the body, including the raglan sleeves. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development sweatshirt is worn and washed to check fade resistance. You approve the reference sample and production follows it. |

---

## 40. CHEVRON V-NECK SOCCER JERSEY — `r-cvn` (R-CVN)

**Intro**

> A soccer jersey in a lightweight, quick-dry flex jersey knit with contrast sleeve
> panels, made for matches and training. We make custom soccer jerseys for clubs,
> schools and leagues from your design.
> Orders can start from 50 pieces.

| # | Title | Body |
|---|---|---|
| 1 | START WHERE YOU ARE | Club colors, a crest, a sponsor list and numbering. The contrast sleeves are a second color decision in their own right. |
| 2 | LOCK THE SPECIFICATION | We fix the 90% nylon / 10% spandex flex jersey at 160–240 GSM, the contrast sleeve panels and the ergonomic athletic fit. |
| 3 | ADD YOUR BRAND | A DTF print places crests, numbers and sponsor marks cleanly on the body and holds up through match washing. |
| 4 | SAMPLE, APPROVE, PRODUCE | A development jersey is played in. Number placement and sleeve fit are checked before you approve the reference sample. |

---

## Garment fit values — owner-confirmed 2026-09-04

Four products had an empty `garmentFit`, so the `[ FIT ]` annotation on the stage
and the `[ Fit ]` row in the spec list were both omitted on their pages — and the
value is also absent from the JSON-LD `Fit` property. Confirmed values, to be
entered in the CMS:

⚠️ `r-gtd` was added on **2026-09-07**, when it was published. Its fit is empty in
the printed catalogue too, so there was nothing to read it from — the other tennis
dress in the range (`r-mm` MINECUT MOTION) already says **Athletic fit**, and the
owner chose the same words so a buyer comparing the two sees matching language.

| Product | `garmentFit` |
|---|---|
| `r-wzu` WOMEN ZIP-UP VEST | **Athletic fit** |
| `r-mm` MINECUT MOTION | **Athletic fit** |
| `r-css` CLASSIC SOCCER SHIRT | **Boxy fit** |
| `r-gtd` GEOVENT TENNIS DRESS | **Athletic fit** |

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
the 2026-09-04 product-page audit (kept privately since 2026-09-10).
