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
 * WHY A TEXT SCAN, NOT ONLY `new URL(text).hostname` (2026-09-15). Parsing the whole
 * trimmed value as ONE url missed a private link that was not the entire field: `Catalogue:
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
 * Percent-decode once — some mail scanners (Outlook Safe Links) wrap a link as
 * `?url=https%3A%2F%2Fcatalogue.wear-run.help%2F…`. A value that fails to decode (a
 * literal `%` with no valid escape after it) is kept as-is, rather than thrown away.
 */
function decodeOnce(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * The text, once, and twice percent-decoded — so a scanner in front of a scanner
 * (`%253A`, a double-encoded link) resolves too.
 */
function decodedVariants(text: string): string[] {
  const once = decodeOnce(text)
  return [text, once, decodeOnce(once)]
}

/** A URL-shaped run of text, with or without a scheme — a bare `//host/…` counts too. */
const URL_TOKEN_PATTERN = /(?:https?:)?\/\/[^\s<>"']+/gi

/**
 * The private host that some URL-shaped token in `text` resolves to, or null.
 *
 * WHY THIS EXISTS ALONGSIDE THE TEXT SCAN ABOVE (2026-09-16, re-review Important 4
 * residual gap, and this fix's own regression). `new URL().hostname` runs the same
 * host normalisation a browser does, which the plain text scan cannot: a
 * percent-encoded dot in the host, the ideographic full stop U+3002, a soft hyphen
 * inside the host, and a fullwidth first letter all parse to the exact private
 * hostname (checked against Node's own URL implementation before writing this), and
 * none of them is a literal substring match for the text scan alone.
 */
function hostFromUrlTokens(text: string): string | null {
  for (const token of text.match(URL_TOKEN_PATTERN) ?? []) {
    const withScheme = token.startsWith('//') ? `https:${token}` : token
    try {
      const host = new URL(withScheme).hostname.replace(/\.$/, '')
      if ((PRIVATE_DOCUMENT_HOSTS as readonly string[]).includes(host)) return host
    } catch {
      // Not a parseable URL — the text scan above is what would catch it, if anything does.
    }
  }
  return null
}

/**
 * The refusal message when `value` contains a private document host anywhere in its
 * text — read directly, percent-decoded up to twice, or as a URL-shaped token's
 * browser-normalised hostname — otherwise null. A link pasted without `https://`,
 * labelled, buried in another URL's query string, percent-encoded, or spelled with a
 * host-normalisation look-alike is caught too — anything short of all three checks
 * let one of those through (see the patterns above).
 */
export function privateDocumentLinkError(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (text === '') return null
  return decodedVariants(text).some(
    (variant) => PRIVATE_HOST_PATTERN.test(variant) || hostFromUrlTokens(variant) !== null,
  )
    ? PRIVATE_LINK_MESSAGE
    : null
}

/**
 * The one validator all three public `catalogueUrl` fields share. The required and
 * complete-address rules are the ones Products and CatalogueDefaults already had;
 * SiteSettings had none at all before this change (decided 2026-09-11, live from the
 * merge that deploys it).
 */
export function validateCatalogueUrl(value: unknown): true | string {
  if (typeof value !== 'string' || value.trim() === '') return 'A catalogue link is required.'
  const privateLink = privateDocumentLinkError(value)
  if (privateLink) return privateLink
  try {
    new URL(value)
    return true
  } catch {
    // The example is a plain host, not /catalogue — that path is now a retired 410
    // address, and this message must not point an editor at a dead link (2026-09-15).
    return `“${value}” is not a complete web address. It needs to start with https:// — e.g. https://wear-run.help.`
  }
}
