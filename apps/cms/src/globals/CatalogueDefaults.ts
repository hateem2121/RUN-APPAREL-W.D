import type { GlobalConfig } from 'payload'
import { isAdminOrEditor, isAuthenticated } from '../access/roles'
import { DEFAULT_RETIRED_MESSAGE } from '../collections/Products'

/**
 * Catalogue defaults — the copy every garment starts with.
 *
 * The catalogue link and the retired-colour message read identically on every
 * garment today. At 100+ products, typing them into each one is 100 chances to
 * leave a stale value live on one page and the current one on another, with
 * nothing marking a product's copy as "same as everyone else's" or
 * "deliberately different" — so this puts them in one place instead.
 *
 * THIS IS A SOURCE FOR NEW DOCUMENTS, NOT A LIVE LINK. Products.ts reads these
 * fields into a new product's own fields at the moment it is created (see
 * readCatalogueDefaults there) and copies them onto that product's own row —
 * it does not read this document again afterwards. Editing this page changes
 * what the NEXT new product starts with; it does not rewrite any product
 * already made, including one made a minute earlier. See admin.description
 * below — that is exactly the behaviour a non-technical editor would
 * reasonably expect to work the other way.
 */
export const CatalogueDefaults: GlobalConfig = {
  slug: 'catalogue-defaults',
  label: 'Catalogue defaults',
  // Explicit even though `false` is the 3.x default — see Products.ts and
  // SiteSettings.ts: Payload v4 flips the default to ON, which would silently
  // add a `_versions` table to D1 and double the row-writes per save. Stating
  // it pins today's behaviour through that upgrade.
  versions: false,
  admin: {
    group: 'Content',
    description:
      'The settings every NEW garment starts with. Changing something here changes what the NEXT product you create begins with — it does NOT rewrite any product you have already made, even one made a minute ago. To fix one existing product, open it and edit it directly. (“How we build your product” does not work this way and is not here — it is one text for every product, in its own screen under Content.)',
  },
  access: {
    // Anonymous visitors never see this — it never reaches the public viewer
    // API, only new products' starting copy. Editors may view it; see update
    // below for who may change it.
    read: isAuthenticated,
    update: isAdminOrEditor,
  },
  fields: [
    /**
     * ⚠️ `customisationIntro` AND `customisationSteps` LEFT THIS GLOBAL ON
     * 2026-08-17. They are not gone — they moved to `globals/BuildProcess.ts`
     * and changed KIND while they moved.
     *
     * Here they were a SEED: copied onto each new product at create time and
     * never read again, so editing them changed only what the next garment
     * started with. There they are LIVE: read on every public request and
     * projected onto every product page, including ones made months ago. The
     * owner asked for the second behaviour, which is also the one this file's
     * own admin.description has to warn people it does not have.
     *
     * The remaining two fields are genuinely per-product — a garment can have
     * its own catalogue link and its own retired-colour wording — so they stay
     * seeds and this global keeps its name.
     */
    {
      name: 'catalogueUrl',
      type: 'text',
      required: true,
      defaultValue: 'https://wear-run.help/catalogue',
      label: 'Catalogue link',
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.trim() === '') {
          return 'A catalogue link is required.'
        }
        try {
          new URL(value)
          return true
        } catch {
          return `“${value}” is not a complete web address. It needs to start with https:// — e.g. https://wear-run.help/catalogue.`
        }
      },
      admin: { description: 'Where a NEW product’s “Catalogue” button sends people.' },
    },
    {
      name: 'retiredMessage',
      type: 'text',
      required: true,
      defaultValue: DEFAULT_RETIRED_MESSAGE,
      label: 'Message for retired colours',
      admin: {
        description:
          'Shown on a NEW product when someone scans a QR code for a colour that has been switched off.',
      },
    },
  ],
}
