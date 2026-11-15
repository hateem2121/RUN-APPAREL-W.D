import { SITE_MENU_LINKS, SITE_NAV_LINKS } from '@run-apparel/shared'

/**
 * THE FEW RUSSIAN WORDS THE HEADER'S CLIENT ISLANDS NEED (Russian section, 2026-11-15).
 *
 * ⚠️ NavLinks and ThemeSwitch TAKE NO PROPS, ON PURPOSE (publicSite.test.ts): Next copies every
 * prop of a client component into the page's HTML, which is how the settings global reached the
 * source on 2026-09-05. So they read the page's own address (`isRussianPath`) and pick their words
 * here. Kept to these few strings because this file ships in every page's script; the rest of the
 * Russian chrome stays on the server (chrome.ts, which takes its Russian menu links from here).
 */

/** `/ru` or anything under `/ru/`. Not `/rugby`. */
export function isRussianPath(pathname: string | null): boolean {
  return pathname === '/ru' || Boolean(pathname?.startsWith('/ru/'))
}

const RU_LINK_LABELS: Readonly<Record<string, string>> = {
  '/products': 'Продукция',
  '/contact': 'Контакты',
  '/guides': 'Гиды',
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
