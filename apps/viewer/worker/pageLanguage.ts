import { garmentPathPrefix, type Locale, RU_GARMENT_PATH_PREFIX } from '@run-apparel/shared'

/**
 * THE RUSSIAN GARMENT PAGE'S SHELL (owner, 2026-11-16: `/ru/products/<product>/<colour>`).
 *
 * The viewer ships ONE `index.html`, written in English. A Russian page must not reach a browser
 * or a robot declaring `lang="en"`: a screen reader would read the Russian words with English
 * rules, and Yandex and Google would take the page's language from it. So a Russian page's shell
 * is rewritten here, on every request, a person's as well as a robot's; the app then sets the
 * garment's own title as it does in English (App.tsx).
 *
 * ⚠️ AN HTMLRewriter SELECTOR THAT MATCHES NOTHING IS A SILENT NO-OP (viewer-headers rule), so
 * `pageLanguage.test.ts` asserts that every tag rewritten here is still in `index.html`.
 */

/** The page's language, from its address. */
export function pageLanguage(pathname: string): Locale {
  return garmentPathPrefix(pathname) === RU_GARMENT_PATH_PREFIX ? 'ru' : 'en'
}

/** `og:locale` for each language: `en_US` as index.html and the website's cards, `ru_RU` as the Russian site's. */
export const OG_LOCALE: Readonly<Record<Locale, string>> = { en: 'en_US', ru: 'ru_RU' }

/** The shell's generic words in Russian, the floor until the garment's own replace them. */
export const RU_SHELL = {
  title: 'RUN APPAREL — 3D-образец изделия',
  description:
    'RUN APPAREL — интерактивный 3D-образец изделия для B2B-партнёров. Поворачивайте, приближайте и\u00a0смотрите расцветки.',
} as const

/** The tags this file rewrites, by selector: `pageLanguage.test.ts` checks each is in index.html. */
export const SHELL_SELECTORS = [
  'html',
  'title',
  'meta[name="description"]',
  'meta[property="og:locale"]',
] as const

/**
 * A Russian page's shell: `lang="ru"`, `og:locale` and the generic title and description in
 * Russian. An English page passes through untouched, byte for byte.
 */
export function withPageLanguage(response: Response, lang: Locale): Response {
  if (lang === 'en') return response
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response
  return new HTMLRewriter()
    .on('html', {
      element(el) {
        el.setAttribute('lang', 'ru')
      },
    })
    .on('title', {
      element(el) {
        el.setInnerContent(RU_SHELL.title)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', RU_SHELL.description)
      },
    })
    .on('meta[property="og:locale"]', {
      element(el) {
        el.setAttribute('content', OG_LOCALE.ru)
      },
    })
    .transform(response)
}
