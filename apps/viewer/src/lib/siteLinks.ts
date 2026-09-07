/**
 * The marketing site, which this viewer may link to from 2026-09-07.
 *
 * ⚠️ THIS IS NOT `catalogueUrl`, AND THE DIFFERENCE IS THE WHOLE POINT.
 * `src/catalogueLinks.test.ts` still forbids every reference to the catalogue:
 * that is a 54.3 MB B2B PDF on the apex, and owner decision 2026-09-04 says no
 * indexed product page may hand it to arbitrary search traffic. These are the
 * ordinary HTML pages of the marketing site — `/products` is an index of the
 * eleven garments this viewer serves — so the decision that ruled the catalogue
 * out does not reach them. See `docs/DECISIONS-BETA-WEBSITE.md` D5.
 *
 * ⚠️ A LITERAL, NOT A CMS SETTING, AND DELIBERATELY. `ViewerSiteSettings` is the
 * shared contract with the CMS global; adding a field there is a CMS migration and
 * a new way for the two surfaces to disagree about their own address. The host is
 * also not editable content — it is where this company's website lives, pinned in
 * `apps/cms/siteHostRules.mjs` as `SITE_HOST` and in the deploy's zone routes.
 * `src/siteLinks.test.ts` asserts the two spellings agree.
 *
 * No trailing slash: these are concatenated, and `wear-run.help//products` is a
 * different URL to a crawler.
 */
export const SITE_ORIGIN = 'https://wear-run.help'

/** The reference index — every published garment, one ordinary indexable page. */
export const SITE_PRODUCTS_URL = `${SITE_ORIGIN}/products`
