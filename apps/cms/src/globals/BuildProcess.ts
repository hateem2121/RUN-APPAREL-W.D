import type { GlobalConfig } from 'payload'
import { isAdminOrEditor, isAuthenticated } from '../access/roles'

/**
 * "How we build your product" — ONE text, on every garment page.
 *
 * ⚠️ THIS REPLACES A PER-PRODUCT COPY, and the difference is the whole point.
 * Until 2026-08-17 the same two fields lived on every product and
 * `CatalogueDefaults` merely SEEDED them at create time: editing the defaults
 * changed what the next new garment started with and left every existing page
 * saying whatever it said the day it was made. Nothing marked a product's copy
 * as "same as everyone else's" or "deliberately different", so at 100+ products
 * that is 100 chances to leave stale wording live on one page and the current
 * wording on another. Owner decision: one text, edited in one place, applying
 * everywhere including products already created.
 *
 * WHERE IT IS READ. `endpoints/publicViewer.ts` fetches this on every request
 * and hands it to `buildViewerResponse`, which projects it into the SAME
 * `customisationIntroHtml` / `customisationSteps` fields the viewer already
 * consumed — so `apps/viewer` needed no change at all and the public API shape
 * is unaltered.
 *
 * The products' own columns are still there and still hold their old values.
 * They are hidden in the admin UI (see Products.ts) rather than dropped: on D1 a
 * table rebuild is the single most hazardous operation in this repo, and the
 * projection still falls back to them during the deploy window before this
 * global is first saved. See `buildProcess` in endpoints/projectViewer.ts.
 */
export const BuildProcess: GlobalConfig = {
  slug: 'build-process',
  label: 'How we build your product',
  // Explicit even though `false` is the 3.x default — same reason as Products.ts,
  // SiteSettings.ts and CatalogueDefaults.ts: Payload v4 flips the default to ON,
  // which would silently add a `_versions` table to D1 and double the row-writes
  // per save. Stating it pins today's behaviour through that upgrade.
  versions: false,
  admin: {
    group: 'Content',
    /**
     * ⚠️ RETIRED 2026-09-05 AND HIDDEN FROM THE ADMIN. Nothing reads this global
     * any more; see the docblock on `buildViewerResponse` in
     * endpoints/projectViewer.ts.
     *
     * It held one "How we build your product" text for the whole catalogue and
     * OVERRODE every product's own copy the moment it was saved — the
     * discriminator was `id`, "has anyone ever opened this screen", not "does it
     * contain anything". After 2026-09-04, when eleven garments were given
     * bespoke per-garment copy by owner decision, the only thing a save here
     * could do was destroy that work in one click. Saving it EMPTY was worse: it
     * served zero steps on every page, because `Array.isArray([])` is true.
     *
     * `hidden` is what makes that unreachable rather than merely discouraged. A
     * warning in a CLAUDE.md is not a control — the owner asked for the hazard
     * removed, not documented.
     *
     * ⚠️ THE DOCUMENT AND ITS TABLE ARE DELIBERATELY LEFT IN PLACE. Dropping
     * columns on D1 means a table rebuild, which the root CLAUDE.md calls the
     * single most hazardous operation in this repo; `presentation_mode`, retired
     * in place on 2026-08-09, is the precedent and still sits in the schema
     * harmlessly. The config also stays registered so `payload migrate` continues
     * to know the table exists.
     */
    hidden: true,
    description:
      'Retired. Customisation copy is written per garment, on each product’s own “How we build your product” tab.',
  },
  access: {
    // Anonymous visitors never read this document directly. It reaches them only
    // through the public viewer endpoint, which projects it into the payload.
    read: isAuthenticated,
    update: isAdminOrEditor,
  },
  fields: [
    {
      name: 'customisationIntro',
      type: 'richText',
      label: 'Opening paragraph',
      admin: {
        description:
          'The paragraph above the steps, on every product page. Business-to-business wording only — this is not a shop.',
      },
    },
    {
      name: 'customisationSteps',
      type: 'array',
      label: 'The steps',
      labels: { singular: 'Step', plural: 'Steps' },
      admin: {
        description:
          'Shown in order as the “How we build your product” list on every product page. Deleting every step removes the list from every page.',
      },
      fields: [
        { name: 'number', type: 'number', required: true, label: 'Step number' },
        { name: 'title', type: 'text', required: true, label: 'Step title' },
        { name: 'body', type: 'textarea', required: true, label: 'Step text' },
      ],
    },
  ],
}
