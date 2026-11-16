import {
  CHROME,
  type ChromeWords,
  CONSENT_COPY,
  FAMILY_RU,
  type Locale,
  localeOf,
  ruFooter,
} from '@run-apparel/shared'

/**
 * WHICH LANGUAGE THIS GARMENT PAGE SPEAKS (owner, 2026-11-16): `/ru/products/<product>/<colour>` is
 * the Russian copy of `/products/<product>/<colour>`. The page's own words follow the address; the
 * garment's CMS-typed text (name, description, colours, the customisation story) stays as the team
 * types it. Read from the address on every call, never cached at import: the address is the only
 * truth, and a test can set it.
 *
 * A language change is always a full page load (the other language is another document), so a
 * value read during render cannot go stale under a mounted component.
 */
export function pageLocale(): Locale {
  return typeof window === 'undefined' ? 'en' : localeOf(window.location.pathname)
}

/** The website's own words around the page (bar, footer, consent), shared with the website. */
export function chrome(): ChromeWords {
  return CHROME[pageLocale()]
}

/** The consent question's words, in the page's language. */
export function consentWords(): ChromeWords['consent'] {
  return pageLocale() === 'ru' ? CHROME.ru.consent : CONSENT_COPY
}

/**
 * A footer line the owner types in the CMS (question, tab, capacity, standards), in the page's
 * language: its Russian when `FOOTER_RU` has one for exactly this English, else the English
 * itself, so an edit in the CMS never leaves a stale Russian claim (siteChrome.ts says why).
 */
export function footerLine(english: string): string {
  return pageLocale() === 'ru' ? ruFooter(english) : english
}

/** A category's name in the page's language: the CMS keeps it in English (`FAMILY_RU`). */
export function categoryName(english: string): string {
  return pageLocale() === 'ru' ? (FAMILY_RU[english.trim()] ?? english) : english
}

/** A website path in the page's language: `/contact` → `/ru/contact` on a Russian page. */
export function sitePath(enPath: string): string {
  if (pageLocale() !== 'ru') return enPath
  return enPath === '/' ? '/ru' : `/ru${enPath}`
}
