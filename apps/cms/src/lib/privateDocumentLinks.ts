/**
 * Keep the private document links out of the CMS's PUBLIC catalogue link fields.
 *
 * WHY (2026-09-11). The catalogue and company profile moved to
 * `catalogue.wear-run.help/<code>` and `profile.wear-run.help/<code>`, where the words
 * after the address are what keep casual visitors out. The three "Catalogue link" fields (Products,
 * Catalogue defaults, Site settings) look like the obvious place to put the new link — and
 * the public product API emits `catalogueUrl` to anyone, twice per response. A link saved
 * there would be published.
 *
 * ⚠️ The host list must match `infra/apex-404/documents.js`; a test pins it.
 */

export const PRIVATE_DOCUMENT_HOSTS = ['catalogue.wear-run.help', 'profile.wear-run.help'] as const

export const PRIVATE_LINK_MESSAGE =
  'This field is public — the product API shows it to anyone. Do not paste the private catalogue or profile link here.'

/**
 * The refusal message when `value` points at a private document host, otherwise null.
 * A link pasted without `https://` is caught too, because that is how people paste.
 */
export function privateDocumentLinkError(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (text === '') return null
  let host: string
  try {
    host = new URL(text).hostname
  } catch {
    host = text.split('/')[0] ?? ''
  }
  const bare = host.replace(/\.$/, '')
  return (PRIVATE_DOCUMENT_HOSTS as readonly string[]).includes(bare) ? PRIVATE_LINK_MESSAGE : null
}

/**
 * The one validator all three public `catalogueUrl` fields share. The required and
 * complete-address rules are the ones Products and CatalogueDefaults already had;
 * SiteSettings had none at all until 2026-09-11.
 */
export function validateCatalogueUrl(value: unknown): true | string {
  if (typeof value !== 'string' || value.trim() === '') return 'A catalogue link is required.'
  const privateLink = privateDocumentLinkError(value)
  if (privateLink) return privateLink
  try {
    new URL(value)
    return true
  } catch {
    return `“${value}” is not a complete web address. It needs to start with https:// — e.g. https://wear-run.help/catalogue.`
  }
}
