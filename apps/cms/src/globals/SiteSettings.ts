import type { GlobalConfig } from 'payload'
import { isAdmin, isAuthenticated } from '../access/roles'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: { group: 'System' },
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
      admin: { description: 'International format; the viewer builds wa.me links from the digits.' },
    },
    { name: 'catalogueUrl', type: 'text', required: true, defaultValue: 'https://wear-run.help/catalogue' },
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
          defaultValue: 'Hello RUN Team,\n\nI am interested in [Product Name] ([Product Code]) in [Colour].',
        },
        {
          name: 'microcopy',
          type: 'text',
          defaultValue:
            'Share your company, target market, estimated quantity and product requirements so our team can advise accurately.',
        },
      ],
    },
    {
      name: 'analytics',
      type: 'group',
      admin: { description: 'Cloudflare Web Analytics only — cookieless, no third-party trackers.' },
      fields: [
        {
          name: 'cfBeaconToken',
          type: 'text',
          admin: { description: 'Cloudflare Web Analytics beacon token for the viewer site (optional).' },
        },
      ],
    },
    {
      name: 'viewerApi',
      type: 'group',
      admin: { description: 'Public viewer API behaviour.' },
      fields: [
        {
          name: 'cacheSeconds',
          type: 'number',
          defaultValue: 60,
          admin: { description: 'Edge cache lifetime for public viewer responses.' },
        },
      ],
    },
  ],
}
