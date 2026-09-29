import { LINEAGE } from './companyFacts'

/**
 * №01 "Who we are" on the home page (owner, 2026-09-29: credibility leads — decision D23).
 *
 * ⚠️ NOTHING NEW IS CLAIMED HERE. Every sentence and figure is one the owner already confirmed
 * on 2026-09-07 and that the page states elsewhere: the lineage wording and the parent company
 * sharing the building (the certification line and the factory caption say the same). It
 * repeats none of №05's numbers (`aboutCopy.test.ts`).
 */

export type AboutPoint = { value: string; label: string }

export const ABOUT = {
  // Not "A family trade" — the owner, 2026-09-29: it "may let people think that we are
  // traders". A maker is the claim; `aboutCopy.test.ts` holds it.
  heading: 'A family of makers,',
  accent: 'since 1889.',
  lede: `RUN APPAREL makes private label clothing in Sialkot, Pakistan. ${LINEAGE}`,
  body:
    'We produce inside the DURUS INDUSTRIES building — our parent company’s — so the cutting, ' +
    'printing, stitching, checking and packing of your order all happen under one roof, with ' +
    'one team answerable for it.',
  // Only what is this section's own: №05 shows the headcount and floor area two sections
  // later, and saying them twice made both weaker (2026-09-29).
  points: [
    { value: '1889', label: 'Making clothes since' },
    { value: 'One', label: 'Building, first stitch to sealed bag' },
  ] satisfies AboutPoint[],
} as const
