/**
 * THE BAR LEAVES ON A PHONE WHILE THE VISITOR SCROLLS DOWN, AND COMES BACK AS THEY SCROLL UP
 * (visual audit VA-40, 2026-10-02, owner-approved). The bar and the label row under it took 92px
 * of an 874px screen at all times. This sets ONE attribute, `data-bar-hidden`, on the bar's shell;
 * everything the visitor sees — the slide, the hairline, the bar taking no focus while it is away,
 * the instant version under reduced motion — is CSS (packages/ui/src/notch.css, "the bar leaves").
 *
 * WHAT HOLDS THE BAR ON SCREEN, always: the top of the page, its menu being open, KEYBOARD focus
 * being inside it, and the visitor being on the keyboard (a Tab press brings it back and keeps it
 * until they touch or click). A bar that is away is not focusable (`visibility: hidden`), so a
 * keyboard visitor cannot land on a control nobody can see — and the Tab press that would have
 * wanted it is the one that returns it. ⚠️ WHETHER THAT SAME PRESS ALSO MOVES FOCUS INTO THE BAR
 * is the browser's focus step seeing a style change made a moment earlier in the same task. It is
 * not relied on, and not verified here (no browser was run): the next press moves in. At worst
 * that is one press, and the alternative — a hidden bar that can be focused — is the invisible
 * focus WCAG 2.2 SC 2.4.11 is about.
 *
 * ⚠️ PHONES ONLY, BY THE STRIP'S OWN QUERY. `BAR_AUTOHIDE_QUERY` is the same string as the
 * stylesheet's (`screen and (width < 720px) and (hover: none)`, the phone the status-area strip
 * defines, VA-50); `styles/barEdge.test.ts` fails if the two differ. On a desktop, however narrow
 * its window, the bar never moves.
 *
 * ⚠️ THE SCROLL POSITION IS CLAMPED to the page, because iOS lets it run past both ends and bounce
 * back: an unclamped bounce at the foot reads as scrolling up and would show the bar over nothing.
 * Reading it is cheap, and a browser fires `scroll` once per frame, so there is no extra throttle.
 */

/** The phone, exactly as `packages/ui/src/notch.css` writes it for the bar that leaves. */
export const BAR_AUTOHIDE_QUERY = 'screen and (width < 720px) and (hover: none)'

/** Within this of the top the bar is always shown (px). iOS pulls the page down past 0 there. */
export const BAR_TOP_ZONE = 8
/** Downward travel since the last turn before the bar leaves (px): a nudge does not move it. */
export const BAR_HIDE_AFTER = 16
/** Upward travel since the last turn before it returns (px): "as soon as they scroll up". */
export const BAR_SHOW_AFTER = 6

export type BarState = {
  hidden: boolean
  /** The position at the previous reading. */
  lastY: number
  /** Where the current direction of travel began. */
  anchorY: number
  direction: 'up' | 'down' | null
}

/** The bar on screen, with nothing in progress. */
export const barAtRest = (y = 0): BarState => ({
  hidden: false,
  lastY: y,
  anchorY: y,
  direction: null,
})

/**
 * The next state for a new scroll position. `held` is anything that keeps the bar on screen: its
 * menu is open, focus is inside it, or the visitor is on the keyboard.
 */
export function stepBar(state: BarState, y: number, held: boolean): BarState {
  if (held || y <= BAR_TOP_ZONE) return barAtRest(y)
  const delta = y - state.lastY
  if (delta === 0) return state
  const direction = delta > 0 ? 'down' : 'up'
  // A turn restarts the count from where it happened, so a long scroll down followed by a small
  // flick up is measured from the flick, not from the first thumb-down.
  const anchorY = direction === state.direction ? state.anchorY : state.lastY
  if (direction === 'down') {
    return { hidden: state.hidden || y - anchorY >= BAR_HIDE_AFTER, lastY: y, anchorY, direction }
  }
  return { hidden: state.hidden && anchorY - y < BAR_SHOW_AFTER, lastY: y, anchorY, direction }
}

/** The page's scroll position, kept inside the page. */
function scrollPosition(): number {
  const farthest = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  return Math.min(Math.max(window.scrollY, 0), farthest)
}

/**
 * Start watching the page for the bar in `shell`. Returns the function that stops it and puts the
 * bar back. Does nothing where `matchMedia` is missing (the bar then simply stays, as before).
 */
export function startBarAutoHide(shell: HTMLElement): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const phone = window.matchMedia(BAR_AUTOHIDE_QUERY)
  const menu = shell.querySelector<HTMLElement>('[popover]')

  let state = barAtRest(scrollPosition())
  let keyboard = false
  let menuOpen = false

  const apply = (next: BarState) => {
    state = next
    shell.toggleAttribute('data-bar-hidden', next.hidden)
  }
  const show = () => apply(barAtRest(scrollPosition()))

  /** `:popover-open` throws where popovers do not exist; the `toggle` listener below covers them. */
  const popoverOpen = () => {
    try {
      return menu?.matches(':popover-open') ?? false
    } catch {
      return false
    }
  }
  /**
   * KEYBOARD focus inside the bar, not any focus: Android's Chrome leaves a tapped button focused,
   * and that must not hold the bar for the rest of the visit. `:focus-visible` is the browser's own
   * "this focus came from the keyboard"; where it cannot be asked, any focus inside counts.
   */
  const focusInside = () => {
    const active = document.activeElement
    if (!active || !shell.contains(active)) return false
    try {
      return active.matches(':focus-visible')
    } catch {
      return true
    }
  }
  const held = () => keyboard || menuOpen || popoverOpen() || focusInside()

  const onScroll = () => {
    if (!phone.matches) {
      if (state.hidden) show()
      return
    }
    apply(stepBar(state, scrollPosition(), held()))
  }
  const onToggle = (event: Event) => {
    menuOpen = (event as Event & { newState?: string }).newState === 'open'
    if (menuOpen) show()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    keyboard = true
    show()
  }
  const onPointer = () => {
    keyboard = false
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  shell.addEventListener('focusin', show)
  menu?.addEventListener('toggle', onToggle)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('touchstart', onPointer, { capture: true, passive: true })
  phone.addEventListener?.('change', onScroll)

  return () => {
    window.removeEventListener('scroll', onScroll)
    shell.removeEventListener('focusin', show)
    menu?.removeEventListener('toggle', onToggle)
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('touchstart', onPointer, true)
    phone.removeEventListener?.('change', onScroll)
    shell.removeAttribute('data-bar-hidden')
  }
}
