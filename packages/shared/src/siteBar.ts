/**
 * The menu bar's words and links — ONCE, for the public site and the 3D viewer.
 *
 * Owner decisions: 2026-09-11 (phones get the full name and a menu button, because more
 * pages are coming), 2026-09-17 ("Same menu bars everywhere. The one I prefer is at
 * wear-run.help"), 2026-09-23 (the button is the Speed Lines icon; its name stays "Menu").
 *
 * ⚠️ WHY THE MARKUP IS NOT HERE. The two headers are written in two frameworks — the site's
 * is a Next server component using `next/link` with a `usePathname` client island; the
 * viewer's is a client component in a Vite SPA whose links go to another origin — so each
 * app writes its own JSX, the way the custom cursor has two implementations
 * (apps/cms/src/auditGuards.test.ts, FA-Q-03). What a visitor could see drift is shared
 * instead: the stylesheet is packages/ui/src/notch.css, the words and links are here, and
 * `siteBarAriaSnapshot` is the one template both apps' browser suites hold their rendered
 * bar to.
 *
 * Adding a page: add it to SITE_NAV_LINKS. Both bars, both phone menus and both contract
 * suites follow — then re-measure the inline fit (docs/DESIGN.md, "The menu bar").
 */

/** The bar's links, as paths on the site. The viewer prefixes the site's origin. */
export const SITE_NAV_LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/contact', label: 'Contact' },
] as const

/** The navigation landmark's name. */
export const SITE_NAV_LABEL = 'Main'

/** The popover's id; the menu button names it in `popovertarget`. One per page. */
export const SITE_MENU_ID = 'site-menu'

/** The menu button's accessible name (owner, 2026-09-23). Never shown: the button is an icon. */
export const SITE_MENU_NAME = 'Menu'

/** The theme switch's two names: what a press will DO, as the viewer has said since 2026-08. */
export const THEME_SWITCH_NAMES = {
  toDark: 'Switch to dark mode',
  toLight: 'Switch to light mode',
} as const

/**
 * The wordmark as the site sets it — what "the one at wear-run.help" means for the name
 * (audits TY-08 and XS-01: the viewer set it 900 and 22% wider). Values as
 * `getComputedStyle` returns them at the 16px default text size.
 */
export const SITE_BAR_WORDMARK = {
  fontWeight: '800',
  fontStretch: '100%',
  fontSize: '16px',
  letterSpacing: '-0.32px',
} as const

export type SiteBarState = 'wide' | 'phone-closed' | 'phone-open'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/**
 * The accessibility tree both bars must render, as a Playwright `toMatchAriaSnapshot`
 * template for the `<header>`. `/children: equal` at both levels makes an extra or missing
 * control a failure; Playwright's default (`contain`) would let one host grow a link the
 * other lacks. The switch's name follows the theme, so it matches either of its two names.
 */
export function siteBarAriaSnapshot(state: SiteBarState, wordmark: string): string {
  const links = SITE_NAV_LINKS.map(({ label }) => `link ${JSON.stringify(label)}`)
  const menu = `button ${JSON.stringify(SITE_MENU_NAME)}`
  const theSwitch = `button /^(${escapeRegExp(THEME_SWITCH_NAMES.toDark)}|${escapeRegExp(THEME_SWITCH_NAMES.toLight)})$/`
  const items =
    state === 'wide'
      ? [...links, theSwitch]
      : state === 'phone-closed'
        ? [menu]
        : [menu, ...links, theSwitch]
  return [
    '- banner:',
    '  - /children: equal',
    `  - link ${JSON.stringify(wordmark)}`,
    `  - navigation ${JSON.stringify(SITE_NAV_LABEL)}:`,
    '    - /children: equal',
    ...items.map((item) => `    - ${item}`),
  ].join('\n')
}
