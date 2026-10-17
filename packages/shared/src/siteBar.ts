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

import { type HoldablePage, holdPage } from './pageHold.ts'

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

/** As much of the phone menu as `holdPageWhileOpen` touches. A plain HTMLElement satisfies it. */
export interface ToggleSource {
  addEventListener(type: 'beforetoggle', listener: ToggleListener): void
  removeEventListener(type: 'beforetoggle', listener: ToggleListener): void
}

/**
 * ⚠️ THE PAGE HOLDS STILL WHILE THE PHONE MENU IS OPEN (polish F3, 2026-10-04). The menu is fixed
 * under the bar, so a wheel or a swipe beside it scrolled the page away underneath, and a tap to
 * close it then landed somewhere else. `beforetoggle` fires for every way the menu opens and
 * closes, so the hold cannot outlive it; a scroll inside the menu stays in the menu
 * (`overscroll-behavior: contain`, notch.css). pageHold.ts says how the page is held without a
 * sideways jump. Returns the clean-up for a React effect.
 */
export function holdPageWhileOpen(menu: ToggleSource, page: HoldablePage): () => void {
  let release: (() => void) | null = null
  const onToggle: ToggleListener = (event) => {
    if (event.newState === 'open') {
      release ??= holdPage(page)
    } else {
      release?.()
      release = null
    }
  }
  menu.addEventListener('beforetoggle', onToggle)
  return () => {
    menu.removeEventListener('beforetoggle', onToggle)
    release?.()
    release = null
  }
}

type MenuEventListener = (event: {
  readonly target?: unknown
  readonly relatedTarget?: unknown
}) => void

/** As much of the menu's button as `closeMenuOnLeave` touches. A plain HTMLElement satisfies it. */
export interface MenuButtonLike {
  contains(node: unknown): boolean
  addEventListener(type: 'focusout', listener: MenuEventListener): void
  removeEventListener(type: 'focusout', listener: MenuEventListener): void
}

/** As much of the phone menu as `closeMenuOnLeave` touches. A plain HTMLElement satisfies it. */
export interface LeavableMenu {
  contains(node: unknown): boolean
  matches(selector: string): boolean
  hidePopover(): void
  addEventListener(type: 'click' | 'focusout', listener: MenuEventListener): void
  removeEventListener(type: 'click' | 'focusout', listener: MenuEventListener): void
}

/**
 * ⚠️ TWO WAYS THE PHONE MENU STAYED OPEN WHEN IT SHOULD HAVE CLOSED (live audit, Pixel 7
 * emulation, 2026-10-17). Both close it with `hidePopover()`, so `beforetoggle` fires and
 * `holdPageWhileOpen` releases the page and `markMenuClosing` draws the exit exactly as for a tap
 * outside: no new close path can leave the page held.
 *
 * 1. A LINK TO THE PAGE YOU ARE ON. NavLinks closed the menu when `usePathname()` changed, and
 *    tapping "Products" on /products changes nothing, so the menu stayed open over the page the
 *    visitor had just chosen. A tap INSIDE a popover is not a tap outside it, so the browser
 *    does not close it either. This closes on the activation of any link in the menu, whether
 *    the path changes or not. It never calls `preventDefault`, so navigation, Next's prefetch
 *    and its client-side route change run untouched.
 *
 * 2. TAB PAST THE LAST ITEM ("Dark mode"). A `popover="auto"` is not modal: the page behind is
 *    neither inert nor hidden from Tab, so focus walked out of the menu into the page while the
 *    menu stayed open over a held, dimmed page, and a keyboard user could not see what they
 *    were focused on. MDN's popover pages (read 2026-10-17) list light dismiss as a click
 *    outside, Escape and another popover opening: moving focus is not on the list. So when focus
 *    leaves the menu (and its button) for something else on the page, close it.
 *
 * WHY `relatedTarget` MUST BE NON-NULL TO CLOSE. `focusout` carries the element that is
 * RECEIVING focus, and null when focus goes to nothing: a tap on an empty patch of the page or
 * on the menu's own padding, a click on non-focusable text, the window or tab losing focus, or
 * focus leaving for the browser's own toolbar. Closing on null would close the menu when a
 * visitor taps its padding, and again when they switch windows and back; and a tap on the page
 * outside is already closed by the browser's own light dismiss, so there is nothing for us to
 * add. A non-null target outside the menu is the case the browser does NOT handle: keyboard
 * (or screen reader) focus moving to another control on the page.
 *
 * WHY THE CLOSE WAITS ONE TASK. During `focusout` the focus has not landed yet. A
 * `hidePopover()` made at that moment can hand focus back to the button, the element focused
 * before the menu opened, which would swallow the Tab and park focus on the button. A task
 * later, focus is where the visitor sent it; the close runs only if it is still outside the
 * menu and its button (Shift+Tab straight back into the menu cancels it).
 *
 * The button's own `focusout` counts too (Shift+Tab from the button to the wordmark leaves the
 * menu and its button behind just the same). Focus moving between the button and the menu's
 * items, which is how a keyboard visitor walks the list, never closes it. Returns the clean-up
 * for a React effect.
 */
export function closeMenuOnLeave(
  menu: LeavableMenu,
  button: MenuButtonLike,
  page: { readonly activeElement: unknown },
): () => void {
  const clock = globalThis as unknown as Timers
  let timer: unknown
  const within = (node: unknown) => node != null && (menu.contains(node) || button.contains(node))
  const close = () => {
    if (menu.matches(':popover-open')) menu.hidePopover()
  }

  const onClick: MenuEventListener = (event) => {
    const target = event.target as { closest?: (selector: string) => unknown } | null
    const link = typeof target?.closest === 'function' ? target.closest('a[href]') : null
    if (link && menu.contains(link)) close()
  }
  const onFocusOut: MenuEventListener = (event) => {
    const next = event.relatedTarget
    if (next == null || within(next)) return
    clock.clearTimeout(timer)
    timer = clock.setTimeout(() => {
      if (!within(page.activeElement)) close()
    }, 0)
  }

  menu.addEventListener('click', onClick)
  menu.addEventListener('focusout', onFocusOut)
  button.addEventListener('focusout', onFocusOut)
  return () => {
    clock.clearTimeout(timer)
    menu.removeEventListener('click', onClick)
    menu.removeEventListener('focusout', onFocusOut)
    button.removeEventListener('focusout', onFocusOut)
  }
}
