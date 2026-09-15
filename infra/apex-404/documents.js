/**
 * The two private documents this Worker serves, and where each one lives.
 *
 * WHY HOSTS, NOT PATHS (owner decision, 2026-09-11). The documents used to sit at
 * `wear-run.help/catalogue` and `/profile` — addresses anyone could guess, which is the
 * whole problem. Each now has its own hostname and opens only with the words that follow
 * it. The owner chose them (D12, 2026-09-11) and they live only in a Worker SECRET, never in
 * this repository. They keep out accidental visitors and search engines; they are not a
 * password against someone determined to guess, and the owner accepted that knowingly.
 *
 * ⚠️ THE R2 KEYS ARE SPELLED EXACTLY AS THE OBJECTS ARE NAMED, TYPO INCLUDED.
 * "RUN PRODUCT CATALOUGE.pdf" is the object's real key in `run-assets`. Correcting it
 * here 404s the download AND makes `scripts/backup-r2.mjs` back up nothing.
 */

/**
 * @typedef {{
 *   id: 'catalogue' | 'profile',
 *   host: string,
 *   secret: 'CATALOGUE_CODE' | 'PROFILE_CODE',
 *   pdfKey: string,
 *   downloadName: string,
 *   title: string,
 *   altLabel: string,
 *   manifestKey: string,
 * }} DocumentConfig
 */

/** @type {{ catalogue: DocumentConfig, profile: DocumentConfig }} */
export const DOCUMENTS = {
  catalogue: {
    id: 'catalogue',
    host: 'catalogue.wear-run.help',
    secret: 'CATALOGUE_CODE',
    pdfKey: 'RUN PRODUCT CATALOUGE.pdf',
    downloadName: 'RUN-Apparel-Catalogue.pdf',
    title: 'Product Catalogue',
    altLabel: 'Product catalogue',
    manifestKey: 'documents/catalogue/manifest.json',
  },
  profile: {
    id: 'profile',
    host: 'profile.wear-run.help',
    secret: 'PROFILE_CODE',
    pdfKey: 'Company Profile.pdf',
    downloadName: 'RUN-Apparel-Company-Profile.pdf',
    title: 'Company Profile',
    altLabel: 'Company profile',
    manifestKey: 'documents/profile/manifest.json',
  },
}

/**
 * The hosts whose `/catalogue*` and `/profile*` routes still reach this Worker, only so
 * they can answer "no longer active" instead of the marketing site's 404.
 */
export const RETIRED_HOSTS = ['wear-run.help', 'www.wear-run.help']

/**
 * The retired ROUTES' path prefixes — `wrangler.jsonc`: `wear-run.help/catalogue*`,
 * `/profile*`, and the `www.` pair. Matched in index.js against a document's own CODE,
 * never a request (review Important 1, owner decision D18, 2026-09-15).
 *
 * WHY A CODE MUST AVOID THESE WORDS. Workers Caching keys on path + Worker version, NOT
 * host (index.js file header), and those four routes match ANY suffix — so
 * `wear-run.help/catalogue-2027…` is still "the retired route" as far as the cache is
 * concerned. A code that starts with one of these words could therefore have its page,
 * picture or download served from a cache entry the retired route matches, on the
 * retired apex address, without this Worker running there at all; a code exactly
 * `catalogue` would re-open `wear-run.help/catalogue` outright. `apps/cms/src/workerConfigs.test.ts`
 * pins these against the routes so the two lists cannot drift apart.
 */
export const RETIRED_PATH_NAMES = ['catalogue', 'profile']

/**
 * @param {string} hostname
 * @returns {DocumentConfig | undefined}
 */
export function documentForHost(hostname) {
  const host = hostname.toLowerCase()
  return Object.values(DOCUMENTS).find((doc) => doc.host === host)
}
