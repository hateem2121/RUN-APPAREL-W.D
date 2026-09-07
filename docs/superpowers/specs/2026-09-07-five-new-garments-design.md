# Five new garments — design

**Date:** 2026-09-07
**Goal:** publish five garments the catalogue already describes but has never been able to
show, taking the live catalogue from 11 products to 16.

| CMS product | Slug | Raw export (7 Sep) | Raw size | Triangles |
|---|---|---|---|---|
| #52 R-CCH CAPSULE CORE HOODIE | `r-cch` | CAPSULE CORE HOODIE.zip | 59.2 MB | 213,709 |
| #32 R-ECT ENDURA CROP TOP | `r-ect` | ENDURA CROP TOP + Shorts.zip | 428.8 MB | 239,838 |
| #55 R-ET ENDURANCE TRACKSUIT | `r-et` | ENDURANCE TRACKSUIT.zip | 498.6 MB | 415,391 |
| #6 R-GTD GEOVENT TENNIS DRESS | `r-gtd` | GEOVENT TENNIS DRESS.zip | 91.4 MB | 504,999 |
| #11 R-AU THE AGGRESSOR UNIFORM | `r-au` | THE AGGRESSOR UNIFORM.zip | 375.6 MB | 552,742 |

All five CMS products are drafts today with **0 colourways and no model**, which is what
makes the shrink robot usable: it deliberately refuses to attach a model or import colours
onto a *published* product.

## What was measured before designing anything

The source folder holds 16 zips. Eleven map one-to-one onto the eleven garments already
live; five carry today's date and are the subject of this spec. The owner confirmed that
reading rather than it being inferred.

Each zip holds exactly one GLB. Reading each file's JSON chunk directly (streamed out of
the zip, so nothing was extracted to disk to learn this):

- **All five are the correct "diffuse-off" export.** Every one carries five
  `KHR_materials_variants` whose fabric materials hold a *different* `baseColorFactor` per
  colourway. This is the property that four of five earlier exports lacked, where one
  colour was served on five buttons.
- **All five carry CLO factory data** at document-root `extras.MetaData`, and none carries
  `asset.copyright`. Both are handled by the pipeline's existing root-extras pass.
- **CAPSULE CORE HOODIE carries one texture with no `source`.** That is the defect that
  throws `Cannot read properties of undefined (reading 'uri')` in three.js while the
  Khronos validator reports the file as valid. The pipeline's dead-texture repair covers
  it.
- Triangle counts are 214k–553k. No file shows the topstitch explosion that made the
  cycling bib 100% thread, so no per-garment stitch budget is expected.

**Upload throughput was measured, not assumed:** 595,739 bytes/sec against Cloudflare's
own upload endpoint, roughly double the 300 kB/s recorded on 2026-09-03. 1.45 GB of raw
exports is therefore about 42 minutes of unattended upload.

## Two mapping questions, both settled by evidence and then by the owner

**ENDURA CROP TOP + Shorts.** The file name carries "+ Shorts"; the CMS product is
described as a top only, and a separate WOMEN RUNNING SHORTS product exists. CLO merges
everything into a single `Cloth` node, so the file cannot be split and the node names
cannot settle it. The owner chose: the whole outfit goes on ENDURA CROP TOP, and that
product's description is updated to mention the shorts.

**THE AGGRESSOR UNIFORM.** This product's stored description reads "The men's counterpart
to the Aggressor jersey…", which is why it was mis-mapped on 2026-09-04 — a men's jersey
was attached to it, then removed, and R-AJM was created for that garment instead. The
description was copied rather than moved, so R-AU still reads as a duplicate of R-AJM.

Page 12 of the live catalogue PDF settles what R-AU actually is: a **two-piece American
football uniform** — jersey plus padded trouser, RUN-branded elastic waistband, EVA foam
pads at thigh, knee and hip, chevron yoke, player name and number. The raw export agrees:
its materials include `46`, `Name 2`, `Knitted Elastic`, `Skull`, `Teamwear Logo` and
`RUN LOGO`, and at 552,742 triangles it is the largest of the five. The catalogue's own
data for R-AU also differs from the jersey's on fabric (95/5 against 88/12), construction
(double *mesh* interlock) and an EVA foam pad the jersey does not have.

The owner chose: draft a new description from what the file shows, and approve it before
saving.

## Approach

Use the shrink robot — the tested path — rather than running the pipeline locally and
attaching by hand. Attaching by hand is precisely what `apps/shrink/src/attach.ts` exists
to prevent, and its two guards (`target.published`, `target.hasGlbAsset`) are the things
that make a re-run safe. The cost of that choice is the 42-minute upload; the alternative
would upload roughly 25 MB instead, and give up every guard on the write.

### Phase 0 — render locally before anything is uploaded or written

Extract the five GLBs, run the pipeline on this machine, and render every colourway of
every garment. No network, no CMS writes.

This phase exists because of the 2026-09-04 mis-attach, whose lesson was recorded as
"render a garment before attaching it to a product — a description can describe the right
thing and still be the wrong row". Rendering first also produces the evidence needed to
draft the Aggressor Uniform description and to sanity-check colour naming later.

Assertions that must hold before Phase 1 starts, each one proven rather than assumed:

- the dead-texture repair **fired** on CAPSULE CORE HOODIE and on nothing else;
- root `extras` is absent and `asset.copyright` present on all five outputs;
- five distinct colours render per garment;
- artwork verdict is `ok` on all five;
- every output is valid glTF.

### Phase 1 — upload, then let the robot work

Upload the five raw exports into the R2 ingest bucket smallest-first, so each success
de-risks the next and the two heaviest run last. Order: hoodie (59 MB), tennis dress
(91 MB), uniform (376 MB), endura (429 MB), tracksuit (499 MB).

Each upload is followed by a `RawUploads` document that describes the object rather than
carrying it, matching what the browser sends. The robot then shrinks the file, attaches
the model, and imports five colourway rows — switched off, with any low-confidence name
left blank rather than guessed.

Model filenames are new and dated, never reused, so each model gets a fresh cache address
and no cache purge is needed. This matters because `HEAD` and `GET` land on different edge
cache entries on the media domain, which has cost sessions before.

### Phase 2 — colours, copy, publish

Cross-check the robot's imported colours against the Phase 0 renders, then fill the colour
plan in `scripts/colourway-names.json` and publish each product with
`scripts/publish-garment.mjs`.

Two colourway rules are inviolable and the script already enforces both: a slug is set once
and never rewritten, because it is printed on physical QR tags; and row order decides the
default colourway, so nothing may reorder rows.

Copy changes, both shown to the owner before saving:

- a new R-AU description written from the rendered garment and the catalogue page;
- an R-ECT description updated to say the outfit includes shorts.

### Phase 3 — repo and deploy

- Add five rows to `scripts/live-products.mjs`. This is not bookkeeping:
  `scripts/publish-garment.mjs` refuses to publish a product missing from that list,
  because on 2026-09-04 nine garments were published while the list named two and
  `scripts/smoke-live-products.mjs` reported "all 2 live products serve a real, fetchable
  model" while nine served nothing anyone checked.
- Regenerate posters via `scripts/upload-posters.mjs` and link-preview cards via
  `tools/asset-pipeline/scripts/og-cards.mjs`.
- Extend the sitemap at `apps/viewer/public/sitemap.xml` from 55 URLs to 80.
- Run every gate, open a PR, merge, and verify live with
  `scripts/smoke-live-products.mjs` and `scripts/smoke-live-previews.mjs`.

## Verification

Every claim of success is a measurement, taken the way a customer's browser takes it:

- model size read with `scripts/model-size.mjs`, never from a Node `fetch`
  `content-length` — Cloudflare compresses the GLB and drops the header, which made an
  earlier sweep read every model as 0 bytes;
- model fetched with a plain `GET`, never `HEAD`;
- factory data confirmed absent from the **live** file by ranged GET, not from local
  pipeline output;
- each garment rendered and looked at, all five colourways, before it is called done.

## Out of scope, stated so it is not silently dropped

Narrowing the shrink robot's Cloudflare credential is separate work, tracked privately.
It is not addressed here.
