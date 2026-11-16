import { CONSENT_COPY } from './consent.ts'
import {
  SITE_MENU_LINKS,
  SITE_MENU_NAME,
  SITE_NAV_LABEL,
  SITE_NAV_LINKS,
  SITE_OTHER_LANGUAGE_EN,
  THEME_SWITCH_NAMES,
  THEME_SWITCH_WORDS,
} from './siteBar.ts'
import {
  SITE_FOOTER_COMPANY,
  SITE_FOOTER_LEARN,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
} from './siteFooter.ts'

/**
 * THE SITE'S TWO LANGUAGES AND ITS OWN WORDS IN BOTH, FOR BOTH APPS (moved here from
 * `apps/cms/src/lib/locale.ts`, `i18n/chrome.ts`, `i18n/islandWords.ts` and `i18n/footerRu.ts` on
 * 2026-11-16, when the owner chose Russian 3D garment pages: the viewer draws those pages, may not
 * import from the website app (`biome.jsonc` → `noRestrictedImports`), and must say exactly what
 * the website's Russian pages say around them). The website re-exports everything from here.
 *
 * ⚠️ EVERY PATH HERE IS THE ENGLISH PATH. A Russian page is `/ru` + its English twin's path, with
 * the SAME Latin slug, so the pair is found by string, never by a lookup table that can drift.
 */

export type Locale = 'en' | 'ru'

export const RU_PREFIX = '/ru'

/** `/` → `/ru`; `/guides/aql-inspection` → `/ru/guides/aql-inspection`. */
export function ruPath(enPath: string): string {
  return enPath === '/' ? RU_PREFIX : `${RU_PREFIX}${enPath}`
}

/** The language of the page at `pathname`. */
export function localeOf(pathname: string | null): Locale {
  return isRussianPath(pathname) ? 'ru' : 'en'
}

/** `/ru` or anything under `/ru/`. Not `/rugby`. */
export function isRussianPath(pathname: string | null): boolean {
  return pathname === '/ru' || Boolean(pathname?.startsWith('/ru/'))
}

/**
 * THE WEBSITE'S OWN WORDS AROUND EVERY PAGE, IN BOTH LANGUAGES (Russian section, 2026-11-15).
 *
 * ⚠️ THE ENGLISH HALF IS THE SHARED CONSTANTS THEMSELVES, not a copy. `packages/shared` also draws
 * the 205 English 3D garment pages and stays untouched (design, "Corrections from the builder
 * check"), so English cannot drift from it here. The Russian half has the same keys
 * (`chrome.test.ts`), and every Russian link is its English link's `/ru` twin, kept by `ruHref`.
 */

type Link = { readonly href: string; readonly label: string }

export type ChromeWords = {
  readonly lang: Locale
  readonly home: string
  readonly skipLink: string
  readonly navLabel: string
  readonly menuName: string
  readonly navLinks: readonly Link[]
  readonly menuLinks: readonly Link[]
  readonly themeNames: { readonly toDark: string; readonly toLight: string }
  readonly themeWords: { readonly toDark: string; readonly toLight: string }
  readonly footer: { readonly [K in keyof typeof SITE_FOOTER_WORDS]: string }
  readonly footerLinks: readonly (Link & { readonly consent: boolean })[]
  readonly made: readonly Link[]
  readonly company: readonly Link[]
  readonly learn: readonly Link[]
  readonly consent: { readonly [K in keyof typeof CONSENT_COPY]: string }
  /** The curtain's line under the year: "Loading · 0%". */
  readonly loading: string
  /** The nav progress line's words for a page: "Loading Contact…". */
  readonly loadingPage: (title: string) => string
  /** "Opens Mon 09:00 PKT". `day` is the shared clock's English abbreviation, or none for today. */
  readonly opensAt: (open: string, day?: string) => string
  /** The link to the same page in the other language, drawn in the header and the footer. */
  readonly otherLanguage: {
    readonly label: string
    readonly hrefLang: Locale
    readonly name: string
  }
}

/** A Russian link to the English page `href` names, keeping any `#fragment`. */
export function ruHref(href: string): string {
  const [path, fragment] = href.split('#')
  return `${ruPath(path || '/')}${fragment ? `#${fragment}` : ''}`
}

export const CHROME_EN: ChromeWords = {
  lang: 'en',
  home: '/',
  skipLink: 'Skip to main content',
  navLabel: SITE_NAV_LABEL,
  menuName: SITE_MENU_NAME,
  navLinks: SITE_NAV_LINKS,
  menuLinks: SITE_MENU_LINKS,
  themeNames: THEME_SWITCH_NAMES,
  themeWords: THEME_SWITCH_WORDS,
  footer: SITE_FOOTER_WORDS,
  footerLinks: SITE_FOOTER_LINKS,
  made: SITE_FOOTER_MADE,
  company: SITE_FOOTER_COMPANY,
  learn: SITE_FOOTER_LEARN,
  consent: CONSENT_COPY,
  loading: 'Loading',
  loadingPage: (title) => `Loading ${title}…`,
  opensAt: (open, day) => `Opens ${day ? `${day} ` : ''}${open} ${SITE_FOOTER_WORDS.clockZone}`,
  otherLanguage: SITE_OTHER_LANGUAGE_EN,
}
