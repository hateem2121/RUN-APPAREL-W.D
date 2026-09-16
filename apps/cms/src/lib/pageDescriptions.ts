/**
 * The search descriptions of the marketing site's own pages.
 *
 * ⚠️ WORDED BY THE OWNER, 2026-09-16, chosen from options. Do not rephrase without asking.
 * The home text was chosen as "the first option, but remove Sialkot"; the products text as
 * offered.
 *
 * ⚠️ 160 CHARACTERS IS THE CEILING. Search results show about that much of a description.
 * Measured live 2026-09-16, the home page's ran 296 and the products page's 186, so both
 * were cut mid-sentence in front of every searcher (audit L-06 / FI-01).
 * `pageDescriptions.test.ts` holds every page to it, including each family-filtered view of
 * the products page, which adds a prefix.
 *
 * Kept out of the page files because a Next page module may export only what Next expects,
 * and a test needs to import these.
 */
export const MAX_PAGE_DESCRIPTION = 160

export const HOME_DESCRIPTION =
  'Private label sportswear, teamwear, uniforms, casual wear, outerwear and sports accessories. Made to order in Pakistan, since 1889. 50-piece minimum.'

export const PRODUCTS_DESCRIPTION =
  'Every RUN APPAREL garment in 3D. Turn it, check how it is made and see the print before a sample ships.'

/**
 * The products page's description, for one family filter or for all of them. The prefix is
 * the one the page already used before 2026-09-16; only the sentence after it changed.
 */
export function productsDescription(familyName: string | null): string {
  return familyName
    ? `${familyName} from RUN APPAREL. ${PRODUCTS_DESCRIPTION}`
    : PRODUCTS_DESCRIPTION
}
