import { WHAT_WE_ARE } from './companyFacts'

/**
 * The search descriptions of the marketing site's own pages.
 *
 * ⚠️ WORDED BY THE OWNER, 2026-09-16, chosen from options. Do not rephrase without asking.
 * The home text was chosen as "the first option, but remove Sialkot"; the products text as
 * offered. REWORDED BY THE OWNER 2026-10-11 (question tool): the home text now opens the way
 * every profile does ("RUN APPAREL is a private label sportswear manufacturer"), still without
 * Sialkot, and the contact text moved here from its page.
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
  'RUN APPAREL is a private label sportswear manufacturer in Pakistan: teamwear, uniforms, casual wear, outerwear and sports accessories, from 50 pieces per style.'

/**
 * The contact page's description, moved here from its page on 2026-10-11 so the length and copy
 * rules hold it too. It names the company with `WHAT_WE_ARE`, the phrase every profile opens with.
 */
export const CONTACT_DESCRIPTION = `Get in touch with RUN APPAREL, a ${WHAT_WE_ARE}. We reply within 24 hours.`

/**
 * The products page's description. It had a variant for each family filter until polish S3
 * (2026-10-05), when the filter's addresses began forwarding to the families' own pages.
 */
export const PRODUCTS_DESCRIPTION =
  'Every RUN APPAREL garment in 3D. Turn it, check how it is made and see the print before a sample ships.'
