import {
  CHROME_EN,
  type ChromeWords,
  type Locale,
  localeOf,
  type SpecGroup,
  type ViewerProduct,
} from '@run-apparel/shared'
import type { ViewerWords } from './words'

/**
 * WHICH LANGUAGE THIS GARMENT PAGE SPEAKS (owner, 2026-11-16): `/ru/products/<product>/<colour>` is
 * the Russian copy of `/products/<product>/<colour>`. The page's own words follow the address; the
 * garment's CMS-typed text (name, description, colours, the customisation story) stays as the team
 * types it. Read from the address on every call: the address is the only truth, and a test can
 * set it. A language change is always a full page load (the other language is another document).
 *
 * ⚠️ THE RUSSIAN WORDS ARE A SEPARATE CHUNK, LOADED BEFORE A RUSSIAN PAGE DRAWS (`main.tsx` →
 * `lib/ru.ts` → `registerRussian`). Built into the main script they cost every English visitor
 * 15.6 KB gzip against a script budget with 2 KB left (`scripts/check-bundle-budget.mjs`,
 * measured 2026-11-16). So nothing in the main script may import a Russian table: it asks
 * `russian()`, which is null on an English page and until the chunk has arrived.
 */
export function pageLocale(): Locale {
  return typeof window === 'undefined' ? 'en' : localeOf(window.location.pathname)
}

/** Everything a Russian page needs that an English one does not: `lib/ru.ts` builds it. */
export type RussianPack = {
  readonly words: ViewerWords
  readonly chrome: ChromeWords
  /** A CMS-typed footer line's Russian, or the line itself (`FOOTER_RU`). */
  readonly footerLine: (english: string) => string
  /** A category's Russian name, or the category itself (`FAMILY_RU`). */
  readonly familyName: (english: string) => string
  /** A garment type's Russian name, or the type itself (`GARMENT_TYPE_RU`). */
  readonly garmentType: (english: string) => string
  /** The four spec groups with Russian headings and notes (`specNotes.ru.ts`). */
  readonly specGroups: (product: ViewerProduct) => SpecGroup[]
}

let pack: RussianPack | null = null

/** Called once by `main.tsx` on a Russian page, before the first render. */
export function registerRussian(next: RussianPack | null): void {
  pack = next
}

/** The Russian pack on a Russian page once it has loaded, else null (an English page, always). */
export function russian(): RussianPack | null {
  return pageLocale() === 'ru' ? pack : null
}

/** The website's own words around the page (bar, footer, consent), shared with the website. */
export function chrome(): ChromeWords {
  return russian()?.chrome ?? CHROME_EN
}

/** The consent question's words, in the page's language. */
export function consentWords(): ChromeWords['consent'] {
  return chrome().consent
}

/**
 * A footer line the owner types in the CMS (question, tab, capacity, standards), in the page's
 * language: its Russian when `FOOTER_RU` has one for exactly this English, else the English
 * itself, so an edit in the CMS never leaves a stale Russian claim (siteChrome.ru.ts says why).
 */
export function footerLine(english: string): string {
  return russian()?.footerLine(english) ?? english
}

/** A category's name in the page's language: the CMS keeps it in English (`FAMILY_RU`). */
export function categoryName(english: string): string {
  return russian()?.familyName(english.trim()) ?? english
}

/** A garment type in the page's language, for the page title (`GARMENT_TYPE_RU`). */
export function garmentTypeName(english: string): string {
  return russian()?.garmentType(english) ?? english
}

/** A website path in the page's language: `/contact` → `/ru/contact` on a Russian page. */
export function sitePath(enPath: string): string {
  if (pageLocale() !== 'ru') return enPath
  return enPath === '/' ? '/ru' : `/ru${enPath}`
}
