import { EMPTY_FOOTER } from './siteFooter.ts'
import type { ViewerSiteSettings } from './types.ts'

/**
 * Default public site settings — the single source of truth for the values
 * used when the CMS SiteSettings global is empty (publicViewer endpoint) or
 * the API is unreachable (viewer UnavailableState). Keep in sync with the
 * SiteSettings global's field defaults.
 */
export const DEFAULT_SITE_SETTINGS: ViewerSiteSettings = {
  companyName: 'RUN APPAREL (PVT) LTD',
  // inquiry@ since 2026-10-11 (owner; partner@ before). Every address the site shows is an alias
  // of team@, so mail that came from the website is told apart; buyers write to this one.
  email: 'inquiry@wear-run.com',
  whatsappNumber: '+923361777313',
  catalogueUrl: 'https://wear-run.help/catalogue',
  temporaryWordmark: 'RUN APPAREL',
  footerLine: 'RUN THE EXTRA MILE.',
  legalLine: '© RUN APPAREL (PVT) LTD',
  // The footer's default copy and no claim (visual audit VA-31): what a garment page draws when
  // the API is unreachable, the same footer the website draws during an outage.
  footer: EMPTY_FOOTER,
}
