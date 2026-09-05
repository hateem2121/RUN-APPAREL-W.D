import type { GlobalConfig } from 'payload'
import { IMAGE_MIME_TYPES } from '../collections/mediaRules'
import { isAdmin, isAuthenticated } from '../access/roles'

const DAY_OPTIONS = [
  { label: 'Monday', value: 'mon' },
  { label: 'Tuesday', value: 'tue' },
  { label: 'Wednesday', value: 'wed' },
  { label: 'Thursday', value: 'thu' },
  { label: 'Friday', value: 'fri' },
  { label: 'Saturday', value: 'sat' },
  { label: 'Sunday', value: 'sun' },
]

/** `HH:MM`, 24-hour. Blank is allowed — the field is optional and blank means "no hours". */
const validateClock = (value: unknown) =>
  !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) || 'Use 24-hour HH:MM, e.g. 09:00'

/** The public site links out to these; a plain-http profile would be a mixed-content warning. */
const validateHttps = (value: unknown) =>
  /^https:\/\/\S+$/.test(String(value ?? '')) || 'Must start with https://'

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
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      label: 'Company logo (browser tab icon)',
      // Same allow-list every other image field uses, so a GLB can never be picked.
      filterOptions: { mimeType: { in: [...IMAGE_MIME_TYPES] } },
      admin: {
        description:
          'The little picture on the browser tab. Leave this empty and the built-in RUN mark is used. ' +
          'A SQUARE picture works best — a wide logo gets squashed into a tiny square and becomes unreadable. ' +
          'Around 512 x 512 is plenty. Upload it under Photos & 3D files first, then pick it here.',
      },
    },
    /*
     * ⚠️ maxLength EXISTS SO THE NAME IS NOT SILENTLY SHORTENED — the layout can no
     * longer break, and that distinction was measured rather than assumed.
     *
     * First attempt got this wrong in both directions. The bar originally wrapped to a
     * second line as the wordmark grew — 112px against an 84px top clearance, silently
     * reintroducing the overlap that clearance exists to prevent, from a CMS text field.
     * The fix was made in CSS (`flex-wrap: nowrap` + truncation), so the bar is now 60px
     * tall at EVERY input; re-measured at 320px across 11–32 characters, no ceiling.
     *
     * What is left is cosmetic: at 320px, the narrowest phone still in use, only about
     * TWELVE characters fit before the name truncates with an ellipsis. "RUN APPAREL"
     * is eleven. So this cap is not protecting the layout — it is keeping the value in
     * a range where most phones show the whole name.
     */
    {
      name: 'temporaryWordmark',
      type: 'text',
      required: true,
      maxLength: 24,
      defaultValue: 'RUN APPAREL',
      admin: {
        description:
          'The brand name in the top bar. Short is better: on the narrowest phones only ' +
          'about 12 characters fit, and a longer name is shortened with "…" there. ' +
          'The page layout is safe either way.',
      },
    },
    { name: 'footerLine', type: 'text', required: true, defaultValue: 'RUN THE EXTRA MILE.' },
    { name: 'legalLine', type: 'text', required: true, defaultValue: '© RUN APPAREL (PVT) LTD' },
    /*
     * ── The footer ────────────────────────────────────────────────────────────
     * Four COPY fields carry defaults. Everything under `capacity`, plus
     * `worksCoordinates`, `certifications` and `socialLinks`, is a CLAIM about the
     * business and carries none: the footer renders nothing for a blank claim, and a
     * certification the company does not hold must never appear because a default
     * put it there. Owner decision 2026-09-05; see docs/OWNER-CHECKLIST.md item 5.
     */
    {
      name: 'ctaLabel',
      type: 'text',
      required: true,
      maxLength: 32,
      defaultValue: 'Start an enquiry',
      admin: { description: 'The green tab at the top of the footer. Links to the Contact page.' },
    },
    {
      name: 'ctaQuestion',
      type: 'text',
      required: true,
      maxLength: 80,
      defaultValue: 'Have a garment that needs making properly?',
      admin: {
        description: 'The big question. The LAST word is set in italic green automatically.',
      },
    },
    {
      name: 'ctaSubline',
      type: 'text',
      required: true,
      maxLength: 120,
      defaultValue: 'Send a tech pack, a sketch, or just the idea.',
    },
    {
      name: 'ctaPromise',
      type: 'text',
      required: true,
      maxLength: 48,
      defaultValue: 'Reply within 2 business days',
      admin: {
        description:
          'Drawn as a measurement line under the question. This is a promise in writing.',
      },
    },
    {
      name: 'capacity',
      type: 'group',
      admin: {
        description:
          'Facts a buyer wants before they write to you. Every box is optional and the footer hides what is blank. ' +
          'The clock light ("Open now") is worked out from the hours — leave them blank and no light is shown.',
      },
      fields: [
        {
          name: 'moq',
          type: 'text',
          maxLength: 48,
          admin: { description: 'e.g. "50 pcs per style"' },
        },
        {
          name: 'leadTime',
          type: 'text',
          maxLength: 48,
          admin: { description: 'e.g. "4–6 weeks from approval"' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'hoursFirstDay',
              type: 'select',
              options: DAY_OPTIONS,
              admin: { width: '25%' },
            },
            { name: 'hoursLastDay', type: 'select', options: DAY_OPTIONS, admin: { width: '25%' } },
            {
              name: 'hoursOpen',
              type: 'text',
              validate: validateClock,
              admin: { width: '25%', description: 'HH:MM, Sialkot time' },
            },
            {
              name: 'hoursClose',
              type: 'text',
              validate: validateClock,
              admin: { width: '25%', description: 'HH:MM, Sialkot time' },
            },
          ],
        },
      ],
    },
    {
      name: 'worksCoordinates',
      type: 'text',
      maxLength: 40,
      admin: {
        description:
          'Optional, shown under the address. e.g. "32.49° N · 74.52° E". Only if you know it is right.',
      },
    },
    {
      name: 'certifications',
      type: 'array',
      labels: { singular: 'Certification', plural: 'Certifications' },
      admin: {
        description:
          'Only standards you actually hold. Each one is a claim buyers may ask you to prove.',
      },
      fields: [{ name: 'name', type: 'text', required: true, maxLength: 48 }],
    },
    {
      name: 'socialLinks',
      type: 'array',
      labels: { singular: 'Social link', plural: 'Social links' },
      fields: [
        { name: 'label', type: 'text', required: true, maxLength: 24 },
        { name: 'url', type: 'text', required: true, validate: validateHttps },
      ],
    },
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
