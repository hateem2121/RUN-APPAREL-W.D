import { CATEGORY_PAGE_PATHS } from './categoryPages.ts'
import { SITE_MENU_LINKS, SITE_NAV_LINKS } from './siteBar.ts'
import { CHROME_EN, type ChromeWords, type Locale, ruHref, ruPath } from './siteChrome.ts'
import {
  SITE_FOOTER_COMPANY,
  SITE_FOOTER_LEARN,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_WORDS,
} from './siteFooter.ts'

/**
 * THE SITE'S OWN WORDS IN RUSSIAN (split from `siteChrome.ts` on 2026-11-16).
 *
 * ⚠️ IN A FILE OF THEIR OWN SO AN ENGLISH PAGE NEVER DOWNLOADS THEM. The viewer's English garment
 * pages import `CHROME_EN` only; this package declares `"sideEffects": false`, so the bundler
 * leaves this whole file out of their script (measured: 15.6 KB gzip of Russian on every English
 * page before the split, against a script budget with 2 KB left). A Russian garment page loads it
 * in its own chunk (`apps/viewer/src/lib/ru.ts`); the website reads `CHROME` on the server.
 */

const RU_LINK_LABELS: Readonly<Record<string, string>> = {
  '/products': 'Продукция',
  '/contact': 'Контакты',
  '/guides': 'Руководства',
}

function ru(links: readonly { readonly href: string; readonly label: string }[]) {
  return links.map(({ href }) => {
    const label = RU_LINK_LABELS[href]
    if (!label) throw new Error(`islandWords.ts has no Russian label for ${href}`)
    return { href: `/ru${href}`, label }
  })
}

export const RU_NAV_LINKS = ru(SITE_NAV_LINKS)
export const RU_MENU_LINKS = ru(SITE_MENU_LINKS)
export const RU_THEME_NAMES = { toDark: 'Включить тёмную тему', toLight: 'Включить светлую тему' }
export const RU_THEME_WORDS = { toDark: 'Тёмная тема', toLight: 'Светлая тема' }

type Link = { readonly href: string; readonly label: string }

/** The families' Russian names, keyed by the English category the shared list is built from. */
export const FAMILY_RU: Readonly<Record<string, string>> = {
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
  '/guides': 'Руководства',
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

export const CHROME_RU: ChromeWords = {
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

export const CHROME: Readonly<Record<Locale, ChromeWords>> = { en: CHROME_EN, ru: CHROME_RU }

/**
 * THE FOOTER'S CMS-HELD WORDS, IN RUSSIAN (Russian section, 2026-11-15).
 *
 * The footer's question, tab, promise, capacity lines and standards lines are the owner's, typed
 * in the CMS in English (read live from wear-run.com on 2026-11-15). Each Russian line is keyed by
 * the EXACT English it was translated from, so:
 *
 * ⚠️ WHEN THE OWNER EDITS ONE IN THE CMS, THE RUSSIAN FOOTER SHOWS THE NEW ENGLISH, never a
 * Russian line that no longer says the same thing. A stale translation would be a wrong claim; an
 * English line on a Russian page is only untranslated. Add the new line here to translate it.
 *
 * ⚠️ "SISTER COMPANY" IS «РОДСТВЕННАЯ КОМПАНИЯ», NEVER «ДОЧЕРНЯЯ» (subsidiary) OR «МАТЕРИНСКАЯ»
 * (parent): the owner ruled on 2026-11-04 that the two companies are sisters, not parent and
 * child, and both Russian words state exactly that relationship.
 */
export const FOOTER_RU: Readonly<Record<string, string>> = {
  'Start a conversation': 'Обсудить проект',
  'Have a garment that needs making properly?': 'Есть изделие, которое нужно сшить на совесть?',
  'Send a tech pack, a sketch, or just the idea.': 'Пришлите техпакет, эскиз или просто идею.',
  'Reply within 24 hours': 'Ответим в течение 24 часов',
  'MOQ 50 pieces per style': 'Минимальная партия — 50 шт. на модель',
  'Lead time usually 2–4 weeks from order confirmation':
    'Срок производства — обычно 2–4 недели с момента подтверждения заказа',
  'Mon–Sat 08:00–17:00 PKT': 'Пн–сб 08:00–17:00 PKT',
  'Sister company: SEDEX-registered, SMETA-audited':
    'Родственная компания: зарегистрирована в SEDEX, прошла аудит SMETA',
  'Suppliers: ISO 9001, OEKO-TEX, GRS; amfori BSCI audits':
    'Поставщики: ISO 9001, OEKO-TEX, GRS; аудиты amfori BSCI',
  'Both companies: registered with the SECP': 'Обе компании: зарегистрированы в SECP',
  'SME Climate Hub: Committed': 'SME Climate Hub: взяли обязательство',
  '32.41° N · 74.46° E': '32.41° с. ш. · 74.46° в. д.',
}

/** The Russian for a CMS footer line, or the line itself when it has none (see above). */
export function ruFooter(english: string): string {
  return FOOTER_RU[english] ?? english
}
