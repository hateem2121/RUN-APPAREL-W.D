import {
  CATEGORY_PAGE_PATHS,
  CONSENT_COPY,
  SITE_FOOTER_COMPANY,
  SITE_FOOTER_LEARN,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
  SITE_MENU_LINKS,
  SITE_MENU_NAME,
  SITE_NAV_LABEL,
  SITE_NAV_LINKS,
  THEME_SWITCH_NAMES,
  THEME_SWITCH_WORDS,
} from '@run-apparel/shared'
import { type Locale, ruPath } from '../locale'
import { RU_MENU_LINKS, RU_NAV_LINKS, RU_THEME_NAMES, RU_THEME_WORDS } from './islandWords'

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

const EN: ChromeWords = {
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
  otherLanguage: { label: 'Русский', hrefLang: 'ru', name: 'Читать по-русски' },
}

/** The families' Russian names, keyed by the English category the shared list is built from. */
const FAMILY_RU: Readonly<Record<string, string>> = {
  'Teamwear & Uniforms': 'Командная форма',
  Sportswear: 'Спортивная одежда',
  Outerwear: 'Верхняя одежда',
  'Casual Wear': 'Повседневная одежда',
  'Sports Accessories': 'Спортивные аксессуары',
}

const DAY_RU: Readonly<Record<string, string>> = {
  Mon: 'пн',
  Tue: 'вт',
  Wed: 'ср',
  Thu: 'чт',
  Fri: 'пт',
  Sat: 'сб',
  Sun: 'вс',
}

const RU_LABELS: Readonly<Record<string, string>> = {
  '/products': 'Продукция',
  '/contact': 'Контакты',
  '/guides': 'Гиды',
  '/privacy': 'Конфиденциальность',
  '/privacy#cookies': 'Файлы cookie',
  '/terms': 'Условия',
  '/about': 'О компании',
  '/inside-the-factory': 'Наше производство',
  '/careers': 'Вакансии',
  '/community': 'Сообщество',
  '/policies': 'Политики',
  '/case-studies': 'Кейсы',
  '/press': 'Пресса',
  '/faq': 'Вопросы и ответы',
  '/glossary': 'Глоссарий',
  '/journal': 'Журнал',
}

function ruLink(link: Link): Link {
  const label = RU_LABELS[link.href]
  if (!label) throw new Error(`chrome.ts has no Russian label for ${link.href}`)
  return { href: ruHref(link.href), label }
}

const RU: ChromeWords = {
  lang: 'ru',
  home: ruPath('/'),
  skipLink: 'Перейти к содержанию',
  navLabel: 'Основное меню',
  menuName: 'Меню',
  // The menu and theme words live with the client islands that draw them (islandWords.ts).
  navLinks: RU_NAV_LINKS,
  menuLinks: RU_MENU_LINKS,
  themeNames: RU_THEME_NAMES,
  themeWords: RU_THEME_WORDS,
  footer: {
    eyebrow: 'С чего начать',
    contact: 'Контакты',
    made: 'Что мы производим',
    company: 'Компания',
    learn: 'Полезное',
    capacity: 'Мощности',
    standards: 'Стандарты',
    elsewhere: 'Мы в сети',
    clockCity: 'Сиалкот · офис и производство',
    clockZone: SITE_FOOTER_WORDS.clockZone,
    openNow: 'Сейчас открыто',
    marks: 'Знаки стандартов, перечисленных выше',
    newTab: '(откроется в новой вкладке)',
  },
  footerLinks: SITE_FOOTER_LINKS.map((link) => ({ ...ruLink(link), consent: link.consent })),
  made: Object.entries(CATEGORY_PAGE_PATHS).flatMap(([category, href]) => {
    if (!href) return []
    const label = FAMILY_RU[category]
    if (!label) throw new Error(`chrome.ts has no Russian name for ${category}`)
    return [{ href: ruHref(href), label }]
  }),
  company: SITE_FOOTER_COMPANY.map(ruLink),
  learn: SITE_FOOTER_LEARN.map(ruLink),
  consent: {
    text: 'Можно учесть ваш визит? Если вы согласитесь, Google Analytics, Apollo и PostHog покажут нам, какие страницы читают, какие компании заходят на сайт и как используют наш 3D-просмотр. Пока вы не выберете, ничего не сохраняется.',
    accept: 'Принять',
    decline: 'Отклонить',
    more: 'Политика конфиденциальности',
    change: 'Файлы cookie',
  },
  loading: 'Загрузка',
  loadingPage: (title) => `Загрузка: ${title}…`,
  opensAt: (open, day) =>
    `Откроемся ${day ? `${DAY_RU[day] ?? day} ` : ''}в ${open} ${SITE_FOOTER_WORDS.clockZone}`,
  otherLanguage: { label: 'English', hrefLang: 'en', name: 'Read in English' },
}

export const CHROME: Readonly<Record<Locale, ChromeWords>> = { en: EN, ru: RU }
