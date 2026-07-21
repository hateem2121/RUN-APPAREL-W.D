import type { ViewerSiteSettings } from './types'

/**
 * Default public site settings — the single source of truth for the values
 * used when the CMS SiteSettings global is empty (publicViewer endpoint) or
 * the API is unreachable (viewer UnavailableState). Keep in sync with the
 * SiteSettings global's field defaults.
 */
export const DEFAULT_SITE_SETTINGS: ViewerSiteSettings = {
  companyName: 'RUN APPAREL (PVT) LTD',
  email: 'partner@wear-run.com',
  whatsappNumber: '+923361777313',
  catalogueUrl: 'https://wear-run.help/catalogue',
  temporaryWordmark: 'RUN APPAREL',
  footerLine: 'RUN THE EXTRA MILE.',
  legalLine: '© RUN APPAREL (PVT) LTD',
}
