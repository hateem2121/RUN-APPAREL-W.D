import type { GlobalConfig } from 'payload'
import { isAdmin, isAuthenticated } from '../access/roles'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Settings',
  // See Products.ts — pinned against Payload v4 flipping the default to ON.
  versions: false,
  // Deliberately no `group`: with Products and Photos & 3D files under
  // "Content", a lone "System" heading for one entry was more chrome than
  // information. Settings now sits on its own, which is the third and last
  // thing a content editor ever needs.
  admin: {},
  access: {
    // System configuration is Admin-only to change; editors may view it.
    read: isAuthenticated,
    update: isAdmin,
  },
  fields: [
    { name: 'companyName', type: 'text', required: true, defaultValue: 'RUN APPAREL (PVT) LTD' },
    { name: 'email', type: 'email', required: true, defaultValue: 'partner@wear-run.com' },
    {
      name: 'whatsappNumber',
      type: 'text',
      required: true,
      defaultValue: '+923361777313',
      admin: {
        description: 'International format; the viewer builds wa.me links from the digits.',
      },
    },
    {
      name: 'catalogueUrl',
      type: 'text',
      required: true,
      defaultValue: 'https://wear-run.help/catalogue',
      // The third of the three catalogue fields corrected 2026-09-05. This one
      // carried no label and no description at all, so it rendered as "Catalogue
      // Url" with nothing to say it is inert — quieter than the other two and
      // misleading in the same way.
      label: 'Catalogue link (not shown on the website)',
      admin: {
        description:
          'Kept on record only. The website has had no “Catalogue” button since 4 September 2026 — these product pages are indexed by Google and the catalogue is a 54 MB trade PDF. Changing this does not change anything a visitor sees.',
      },
    },
    { name: 'temporaryWordmark', type: 'text', required: true, defaultValue: 'RUN APPAREL' },
    { name: 'footerLine', type: 'text', required: true, defaultValue: 'RUN THE EXTRA MILE.' },
    { name: 'legalLine', type: 'text', required: true, defaultValue: '© RUN APPAREL (PVT) LTD' },
    {
      name: 'inquiryTemplate',
      type: 'group',
      admin: {
        description:
          'Reference copy of the enquiry template the viewer generates for email/WhatsApp. Tokens: [Product Name], [Product Code], [Colour].',
      },
      fields: [
        {
          name: 'subject',
          type: 'text',
          defaultValue: 'Product Enquiry — [Product Name] / [Colour]',
        },
        {
          name: 'bodyIntro',
          type: 'textarea',
          defaultValue:
            'Hello RUN Team,\n\nI am interested in [Product Name] ([Product Code]) in [Colour].',
        },
        {
          name: 'microcopy',
          type: 'text',
          defaultValue:
            'Share your company, target market, estimated quantity and product requirements so our team can advise accurately.',
        },
      ],
    },
    // The `analytics` group and its `cfBeaconToken` were here until 2026-08-09.
    // It was the last survivor of the analytics removal earlier the same day:
    // `initAnalytics()` and `VITE_CF_BEACON_TOKEN` went because both were dead
    // twice over, and this box was left behind — referenced by no line of any
    // app, so typing a token into it did precisely nothing. A setting that looks
    // like it does something and does not is worse than no setting, which is the
    // same argument that removed `presentationMode` from Products.
    //
    // ⚠️ THE COLUMN IS STILL THERE, ON PURPOSE — `analytics_cf_beacon_token text`
    // (nullable) in 20260720_185735_initial. See the Products note; a D1 table
    // rebuild is not worth an unused nullable column.
    // `viewerApi.cacheSeconds` was REMOVED 2026-08-18 (audit L2). It fed
    // publicViewer.ts's Cache-Control, and that header has no observable effect on
    // this deployment — perfProbe.test.ts records "a Worker's own response does not
    // pass through the edge cache, so s-maxage buys nothing", and live probes found
    // no cf-cache-status on those responses at all. An owner-editable knob that
    // changes nothing is worse than no knob.
    //
    // ⚠️ THE COLUMN IS STILL THERE, ON PURPOSE — same call as
    // `analytics_cf_beacon_token` above: a nullable column left behind costs
    // nothing, and a D1 table rebuild to drop it is the operation this repo's
    // migration notes warn about most (a DROP runs an implicit DELETE, and that
    // cascades). No migration accompanies this removal, deliberately.
  ],
}
