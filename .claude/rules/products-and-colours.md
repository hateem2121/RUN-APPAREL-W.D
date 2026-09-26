---
paths:
  - "apps/cms/src/collections/Products.ts"
  - "apps/cms/src/fields/**"
  - "apps/shrink/src/colourImport.ts"
  - "packages/shared/src/importColours*"
  - "tools/asset-pipeline/src/variant-colour.ts"
  - "tools/asset-pipeline/src/colour-name.ts"
---

# Products, colourways and colour names

Moved from the root `CLAUDE.md` on 2026-09-26, word for word. The root keeps the two
rules that must never be missed: a colourway slug is printed on physical QR tags, and row
order decides the default colourway.

## `fileColours` is deliberately NOT gated

🟡 **`fileColours` is deliberately NOT in `GATED_FIELDS`.** Gating it once blocked
the shrink robot's own write on a published-but-model-less product, i.e. it
prevented recovery from the state the gate was complaining about (2026-07-29).
Do not "fix" this. The gap it leaves is covered by reporting instead —
`becameUnverifiedWhilePublished` writes an Events row. See `Products.ts`.

## Colour names are read from the file, not typed

🟢 `tools/asset-pipeline/src/variant-colour.ts` picks each variant's dominant fabric
by surface area (excluding trim and artwork), converts `baseColorFactor` from
linear to sRGB, and names it by CIEDE2000 against a palette in `colour-name.ts`.
This exists because on 2026-08-03 every published colour name on the live site was
wrong — a maroon garment labelled "Navy", a blush one "Black", a powder blue one
"Crimson" — and two colourways in the file were never mapped at all.
🟢 **Area is summed by material NAME (2026-09-02):** CLO writes one material per
PANEL, and a 4.36% print panel named Geovent's white cloth "Navy"
(CG-05). A white factor over a fabric picture is sampled only when colourways carry
different pictures; every export censused binds one to all five, so the name stays
blank and the report says why.

Two rules it must keep: a 🟡 **colourway slug is printed on physical QR tags** and
must never be changed by an automated process, and **row order decides the default
colourway**, so nothing may reorder rows. Imported rows append, arrive
`active: false`, and a low-confidence match arrives with an empty name rather than
a guess. Tested in `packages/shared/src/importColours.test.ts` (moved 2026-08-11).
