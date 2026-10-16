import { FACTS } from './companyFacts'

/**
 * №01 "Who we are" on the home page (owner, 2026-09-29: credibility leads — decision D23), on the
 * aerial photo since 2026-10-16 (option C, D41).
 *
 * ⚠️ NOTHING NEW IS CLAIMED HERE. Every figure is one the site already states: 1889 and the six
 * buildings (the hero, the about page), the floor area (`FACTS`, which №05 shows too, by the
 * owner's choice of 2026-10-16) and the solar share (the factory page and the environmental
 * policy). The heading's "for generations" is the owner's own claim, chosen 2026-10-16.
 */

/**
 * `labelFirst` puts the label ABOVE its figure, in the page's reading order as well as on screen:
 * "Making clothes since" then "1889" reads as a sentence, where the figure first read as "1889,
 * making clothes since" (visual audit VA-58, 2026-10-02, owner's decision). A figure whose label
 * says what it counts ("Buildings, first stitch to sealed bag") stays figure-first.
 *
 * `countUp` rolls the figure in as it comes into view (`CountUp.tsx`), for a quantity only: 1889 is
 * a year and "Six" a word, so neither counts. `prefix` is plain text before a counted figure
 * ("About"), so the count-up reads the number alone.
 */
export type AboutPoint = {
  value: string
  label: string
  labelFirst?: true
  countUp?: true
  prefix?: string
}

/** The floor area, read from `FACTS` rather than typed twice (`aboutPages.ts` does the same). */
const FLOOR = FACTS.find((fact) => fact.label.startsWith('Sq m'))

/**
 * The lineage without its year, for this section only (owner, 2026-10-16). The year is said by the
 * hero and by this section's first figure, so the heading and this sentence no longer repeat it.
 * The shared `LINEAGE` keeps its year: the press page reads 1889 out of it (`press.ts`
 * `FAMILY_SINCE`), and the careers and community pages quote it whole. The second sentence is
 * `LINEAGE`'s own, word for word (`aboutCopy.test.ts`).
 */
export const LINEAGE_HERE =
  'The family has been manufacturing and exporting without a break since it began. Company ' +
  'names have changed over that time; the roots have not.'

export const ABOUT = {
  // Not "A family trade" — the owner, 2026-09-29: it "may let people think that we are
  // traders". A maker is the claim; `aboutCopy.test.ts` holds it. "for generations." replaced
  // "since 1889." on 2026-10-16 (owner): the year is the first figure's, a few lines below.
  heading: 'A family of makers,',
  accent: 'for generations.',
  lede: `RUN APPAREL makes private label clothing in Sialkot, Pakistan. ${LINEAGE_HERE}`,
  // "company’s six" is tied with a non-breaking space (the owner’s words unchanged): untied,
  // "buildings" ended a 76-character line at 768 and 1440px, one over FA-C-52’s 75
  // (apps/cms/e2e/legibility.spec.ts, 2026-10-15); tied, the longest line is 73 at 768, 1180 and 1440px.
  body:
    'We produce on the DURUS INDUSTRIES site — our parent company’s six buildings in Sialkot — ' +
    'so the cutting, printing, stitching, checking and packing of your order all happen in one ' +
    'place, with one team answerable for it.',
  // Four since 2026-10-16 (option C, owner): the floor area and the solar share joined 1889 and
  // the six buildings. The floor area is also one of №05's figures; the owner chose to show it in
  // both. The label's word changed 2026-10-09 (owner): "Manufacturing since" matches the lineage's
  // own verb.
  points: [
    { value: '1889', label: 'Manufacturing since', labelFirst: true },
    // "Six" since 2026-10-15 (owner): the works are six buildings on one site. It said "One"
    // building until then, which a buyer looking at the aerial photo beside it could see was wrong.
    { value: 'Six', label: 'Buildings, first stitch to sealed bag' },
    { value: FLOOR?.value ?? '', label: FLOOR?.label ?? '', countUp: true },
    {
      prefix: 'About',
      value: '80%',
      label: 'Of our electricity, from the solar roof',
      countUp: true,
    },
  ] satisfies AboutPoint[],
} as const
