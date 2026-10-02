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

/**
 * Links the PHONE MENU adds after the bar's (visual audit VA-37, owner-approved 2026-10-01: Guides
 * in the phone menu). Not in the wide bar: its one-row fit is measured for the two links above
 * (docs/DESIGN.md, "The menu bar"), so notch.css shows these in the open phone menu only.
 */
export const SITE_MENU_LINKS = [{ href: '/guides', label: 'Guides' }] as const

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
 * The switch's WORDS, shown beside its icon in the phone menu only (visual audit VA-52,
 * owner-approved 2026-10-01: "DARK MODE" / "LIGHT MODE", the capitals set by CSS). Hidden from
 * assistive technology, which keeps THEME_SWITCH_NAMES — and each name contains its words, so
 * what a voice user reads aloud still works (WCAG 2.5.3, label in name).
 */
export const THEME_SWITCH_WORDS = {
  toDark: 'Dark mode',
  toLight: 'Light mode',
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
  const menuLinks = SITE_MENU_LINKS.map(({ label }) => `link ${JSON.stringify(label)}`)
  const menu = `button ${JSON.stringify(SITE_MENU_NAME)}`
  const theSwitch = `button /^(${escapeRegExp(THEME_SWITCH_NAMES.toDark)}|${escapeRegExp(THEME_SWITCH_NAMES.toLight)})$/`
  const items =
    state === 'wide'
      ? [...links, theSwitch]
      : state === 'phone-closed'
        ? [menu]
        : [menu, ...links, ...menuLinks, theSwitch]
  return [
    '- banner:',
    '  - /children: equal',
    `  - link ${JSON.stringify(wordmark)}`,
    `  - navigation ${JSON.stringify(SITE_NAV_LABEL)}:`,
    '    - /children: equal',
    ...items.map((item) => `    - ${item}`),
  ].join('\n')
}

/** How long the phone menu stays marked as closing: well past its exit (`--instant`, 120ms). */
export const MENU_CLOSING_MS = 300

type ToggleListener = (event: { readonly newState?: string }) => void

/** As much of the phone menu as `markMenuClosing` touches. A plain HTMLElement satisfies it. */
export interface ClosingMenu {
  readonly dataset: { closing?: string }
  addEventListener(type: 'beforetoggle', listener: ToggleListener): void
  removeEventListener(type: 'beforetoggle', listener: ToggleListener): void
}

interface Timers {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

/**
 * ⚠️ THE PHONE MENU'S EXIT IS ANIMATED ONLY WHILE IT IS CLOSING (visual audit VA-51). notch.css
 * keeps the panel on screen as it leaves by letting `display` and `overlay` ride its transition.
 * On the plain list that transition ALSO ran when a phone turned from landscape to portrait: the
 * inline links became the hidden menu, and the panel's exit played for 120ms in the phone's
 * shape (caught by apps/cms/e2e/navbar.spec.ts, LA-06, 2026-10-01). So it lives on
 * `.notch__menu[data-closing]`, and this sets that mark the moment the menu starts to close —
 * `beforetoggle` fires for every way a popover closes (its button, Escape, a tap outside,
 * hidePopover()) and never for a change of layout — and clears it once the exit is over.
 * Without script the menu simply closes at once. Returns the clean-up for a React effect.
 */
export function markMenuClosing(menu: ClosingMenu): () => void {
  const clock = globalThis as unknown as Timers
  let timer: unknown
  const onToggle: ToggleListener = (event) => {
    clock.clearTimeout(timer)
    if (event.newState === 'closed') {
      menu.dataset.closing = ''
      timer = clock.setTimeout(() => {
        delete menu.dataset.closing
      }, MENU_CLOSING_MS)
    } else {
      delete menu.dataset.closing
    }
  }
  menu.addEventListener('beforetoggle', onToggle)
  return () => {
    clock.clearTimeout(timer)
    menu.removeEventListener('beforetoggle', onToggle)
  }
}
