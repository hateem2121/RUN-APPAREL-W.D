import { LINEAGE } from './companyFacts'

/**
 * №01 "Who we are" on the home page (owner, 2026-09-29: credibility leads — decision D23).
 *
 * ⚠️ NOTHING NEW IS CLAIMED HERE. Every sentence and figure is one the owner already confirmed
 * on 2026-09-07 and that the page states elsewhere: the lineage wording and the parent company
 * sharing its site (the certification line and the factory caption say the same). It
 * repeats none of №05's numbers (`aboutCopy.test.ts`).
 */

/**
 * `labelFirst` puts the label ABOVE its figure, in the page's reading order as well as on screen:
 * "Making clothes since" then "1889" reads as a sentence, where the figure first read as "1889,
 * making clothes since" (visual audit VA-58, 2026-10-02, owner's decision). A figure whose label
 * says what it counts ("Buildings, first stitch to sealed bag") stays figure-first.
 */
export type AboutPoint = { value: string; label: string; labelFirst?: true }

export const ABOUT = {
  // Not "A family trade" — the owner, 2026-09-29: it "may let people think that we are
  // traders". A maker is the claim; `aboutCopy.test.ts` holds it.
  heading: 'A family of makers,',
  accent: 'since 1889.',
  lede: `RUN APPAREL makes private label clothing in Sialkot, Pakistan. ${LINEAGE}`,
  // "company’s six" is tied with a non-breaking space (the owner’s words unchanged): untied,
  // "buildings" ended a 76-character line at 768 and 1440px, one over FA-C-52’s 75
  // (apps/cms/e2e/legibility.spec.ts, 2026-10-15); tied, the longest line is 73 at 768, 1180 and 1440px.
  body:
    'We produce on the DURUS INDUSTRIES site — our parent company’s\u00a0six buildings in Sialkot — ' +
    'so the cutting, printing, stitching, checking and packing of your order all happen in one ' +
    'place, with one team answerable for it.',
  // Only what is this section's own: №05 shows the headcount and floor area two sections
  // later, and saying them twice made both weaker (2026-09-29). The label's word changed
  // 2026-10-09 (owner): "Manufacturing since" matches `LINEAGE`'s own verb.
  points: [
    { value: '1889', label: 'Manufacturing since', labelFirst: true },
    // "Six" since 2026-10-15 (owner): the works are six buildings on one site. It said "One"
    // building until then, which a buyer looking at the aerial photo beside it could see was wrong.
    { value: 'Six', label: 'Buildings, first stitch to sealed bag' },
  ] satisfies AboutPoint[],
} as const
