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
 * Matches a private host anywhere in the text, as a WHOLE hostname: not preceded by a
 * hostname character, optionally followed by one trailing dot, and then not followed by
 * a hostname character. Built from PRIVATE_DOCUMENT_HOSTS with the dots escaped, so the
 * two can never say different hosts (a test pins that below).
 *
 * WHY A TEXT SCAN, NOT `new URL(text).hostname` (2026-09-15). Parsing the whole trimmed
 * value as ONE url missed a private link that was not the entire field: `Catalogue:
 * https://catalogue.wear-run.help/…` parsed with `catalogue:` read as the scheme; a
 * link buried in another URL's query string was never unwrapped; two links separated by
 * a space failed to parse as any one URL and fell through to a `text.split('/')[0]`
 * fallback that named neither host; and a bare `catalogue.wear-run.help:443/…` with no
 * `https://` parses as a URL whose SCHEME is `catalogue.wear-run.help` (dots and
 * hyphens are legal scheme characters) and so has no hostname at all. All four saved.
 */
const PRIVATE_HOST_PATTERN = new RegExp(
  `(?<![a-z0-9.-])(?:${PRIVATE_DOCUMENT_HOSTS.map((host) => host.replace(/\./g, '\\.')).join('|')})\\.?(?![a-z0-9.-])`,
)

/**
 * The refusal message when `value` contains a private document host anywhere in its
 * text, otherwise null. A link pasted without `https://`, labelled, buried in another
 * URL's query string, or one of several space-separated links is caught too — anything
 * short of scanning the whole text let each of those through (see the pattern above).
 */
export function privateDocumentLinkError(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (text === '') return null
  return PRIVATE_HOST_PATTERN.test(text) ? PRIVATE_LINK_MESSAGE : null
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
