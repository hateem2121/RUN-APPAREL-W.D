import type { Family } from './families'

/**
 * The sports Teamwear's garments are listed under, a button each on the Teamwear page (polish S7).
 *
 * ⚠️ THE GROUPS ARE THE OWNER'S (Q44, 2026-10-04): of the 19 live garments, Soccer 4, American
 * football 3, Cycling 2, Tennis & pickleball 6, Training 3 and Water sports 1. Teamwear was one list
 * of 19, from bib shorts to a wetsuit; the other families are short enough to read whole and have
 * no groups (`sportsFor`).
 *
 * ⚠️ A GARMENT'S SPORT IS READ FROM ITS GARMENT TYPE (Products, `garmentType`): the plain words a
 * buyer searches, "Men's Cycling Bib Shorts", which every live Teamwear garment carries. Not a field
 * of its own, which would need a migration and nineteen entries to say what the type already says.
 * The first sport, in the order below, whose words the type holds wins, so a "Soccer Training Top"
 * is soccer. A garment whose type names no sport, or that has no type, is listed under "All" only;
 * typing its type in the CMS puts it under its sport.
 *
 * ⚠️ NO NEW ADDRESSES (the report's "filter on the same page", the owner's answer Q27): the buttons
 * show and hide cards in place. A key is a radio's value and a card's `data-sport`, never a URL.
 */
export type Sport = {
  /** The radio's value and the card's `data-sport`. Not shown, and not part of any address. */
  readonly key: string
  /** The button's words. */
  readonly label: string
  /** The words in a garment type that list the garment under this sport. */
  readonly words: RegExp
}

export const TEAMWEAR_SPORTS: readonly Sport[] = [
  { key: 'soccer', label: 'Soccer', words: /\bsoccer\b/i },
  { key: 'american-football', label: 'American football', words: /\bamerican football\b/i },
  { key: 'cycling', label: 'Cycling', words: /\bcycling\b/i },
  { key: 'tennis-pickleball', label: 'Tennis & pickleball', words: /\b(?:tennis|pickleball)\b/i },
  { key: 'training', label: 'Training', words: /\btraining\b/i },
  {
    key: 'water-sports',
    label: 'Water sports',
    words: /\b(?:wetsuit|neoprene|scuba|swim\w*|surf\w*|rash ?guard)\b/i,
  },
]

/** The families divided by sport: Teamwear alone (Q44). */
const SPORTS_BY_FAMILY: Readonly<Record<string, readonly Sport[]>> = {
  'teamwear-uniforms': TEAMWEAR_SPORTS,
}

/** The sports a family's garments are listed under; none for a family the owner has not divided. */
export function sportsFor(family: Family): readonly Sport[] {
  return SPORTS_BY_FAMILY[family.slug] ?? []
}

/** The sport a garment type names, or null for one that names none. */
export function sportOf(garmentType: string, sports: readonly Sport[]): Sport | null {
  return sports.find((sport) => sport.words.test(garmentType)) ?? null
}

/**
 * The column counts at which the grid's last-row rule starts the last row early (site.css, VA-42):
 * three columns from 900px, four from 1440px, five from 1920px. On a tablet's two columns (560-899px;
 * a phone has one since polish M1) the last card lies across both instead (`lie`).
 */
const ROW_COLUMNS = [3, 4, 5] as const

/**
 * Where a card stands among its own sport's cards: the marks the grid's last-row rules read while
 * one sport is shown.
 */
export type SportPlace = {
  /** The sport's key, or null for a garment listed under "All" only. */
  readonly sport: string | null
  /** The column counts at which this card starts the last row (`data-cut`). */
  readonly cut: readonly number[]
  /** The last of an odd number of cards, more than one: on a tablet it lies across both columns. */
  readonly lie: boolean
}

/**
 * Each garment's place among its own sport's garments, in the page's order.
 *
 * ⚠️ THE FULL LIST'S RULES COUNT EVERY CARD IN THE LIST, SHOWN OR NOT. They find "the card before the
 * last" by its place in the HTML, so with one sport shown they would move a card of another sport,
 * or a card in the middle, and leave a card alone (VA-42). These marks say what those same rules
 * would do if the sport's cards were the whole list; `productGridOrphans.test.ts` holds the two
 * together for every count, and site.css reads the marks only while a sport is chosen.
 */
export function sportPlaces(
  garments: readonly { garmentType: string }[],
  sports: readonly Sport[],
): SportPlace[] {
  const keys = garments.map((garment) => sportOf(garment.garmentType, sports)?.key ?? null)
  return keys.map((key, at) => {
    if (key === null) return { sport: null, cut: [], lie: false }
    const count = keys.filter((other) => other === key).length
    // 1-based, as `:nth-child` counts.
    const index = keys.slice(0, at + 1).filter((other) => other === key).length
    return {
      sport: key,
      cut: ROW_COLUMNS.filter((columns) => index === count - 1 && index % columns === 0),
      lie: index === count && count % 2 === 1 && count > 1,
    }
  })
}

/** The sports that have garments here, in the owner's order, each with how many. */
export function sportCounts(
  places: readonly SportPlace[],
  sports: readonly Sport[],
): Array<{ sport: Sport; count: number }> {
  return sports
    .map((sport) => ({ sport, count: places.filter((place) => place.sport === sport.key).length }))
    .filter((entry) => entry.count > 0)
}
