/** The token the stage band subtracts, and the element it must match. */
const TOKEN = '--action-bar-h'
const SELECTOR = '.action-bar'

/**
 * Keep `--action-bar-h` equal to the action bar's ACTUAL height.
 *
 * ⚠️ IT WAS A CONSTANT 72px, AND rem TEXT BROKE THAT ASSUMPTION. The token is what
 * `.page` and `.stage-block` reserve at the bottom so the colourway rail sits above
 * the fixed bar. It was correct while every font size was px — the bar could not
 * change height. Since the type scale became rem on 2026-09-04 the bar grows with
 * the visitor's own text-size setting, and the reserve did not follow.
 *
 * MEASURED at 375x812, the same page at three root sizes:
 *
 *     root 16px   bar  72.0px   token 72px   ok
 *     root 20px   bar  76.3px   token 72px   4.3px short
 *     root 24px   bar 106.1px   token 72px   34px short -> rail 5px UNDER the bar
 *
 * ⚠️ AND IT IS NOT A LINEAR FUNCTION OF THE ROOT SIZE, which is why no clever CSS
 * expression was used. Between 20px and 24px the buttons' labels wrap to a second
 * line and the bar jumps 30px at once. `max(72px, 4.4rem)` — the closest single
 * expression — over-reserves 12px of garment at 20px and is still 0.5px short at
 * 24px. A formula fitted to three samples of a content-dependent breakpoint is a
 * guess with decimals on it.
 *
 * So this measures instead. `apps/viewer/CLAUDE.md` records the stage band's height
 * budget being wrong THREE TIMES by reasoning instead of measuring, and `--header-h`
 * exists as a token precisely so a test can compare it against the rendered header.
 * This is the same lesson applied one element over: read the number off the page.
 *
 * ⚠️ NO FEEDBACK LOOP, and it is worth checking before believing that. A
 * ResizeObserver that writes a property affecting its own target oscillates.
 * `--action-bar-h` is read by `.page` (padding-bottom), `.stage-block`
 * (padding-bottom) and `.stage__more` (bottom) — never by `.action-bar` itself, so
 * writing it cannot change what was just measured.
 *
 * ⚠️ THIS IS NO LONGER THE ONLY THING HOLDING THE RESERVE UP, AND IT MUST NOT BE.
 * On CI's WebKit the value written here reaches `.page` one update late, proven
 * with the strongest write the platform has — an important inline style read back
 * on the same element in the same pass:
 *
 *     attr "padding-bottom: 107px !important;"  prio "important"  pad "73px"
 *
 * Six mechanisms failed identically: this custom property, a bare `var()` instead
 * of `calc(var() + env())`, an inline style, a forced `offsetHeight` reflow,
 * `!important` priority, and deferring the write out of the ResizeObserver into a
 * requestAnimationFrame. The engine is reporting a stale computed style, which no
 * write can correct. So `page.css` carries a `max(var(--action-bar-h), 4.5rem)`
 * floor that is correct without this module running at all; what this adds is
 * precision on the engines where it works. Do not remove the floor.
 *
 * Below 900px only, by construction: the bar is `display: none` above that, so
 * `getBoundingClientRect()` returns 0 and the guard below leaves the CSS default in
 * place rather than reserving nothing.
 */
export function startActionBarHeight(): () => void {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') {
    return () => {}
  }

  const bar = document.querySelector(SELECTOR)
  if (!bar) return () => {}

  const apply = () => {
    const height = bar.getBoundingClientRect().height
    // 0 means hidden — the two-column layouts drop the bar entirely. Clearing the
    // override lets the stylesheet's own value apply rather than reserving nothing.
    if (height > 0) {
      document.documentElement.style.setProperty(TOKEN, `${Math.ceil(height)}px`)
    } else {
      document.documentElement.style.removeProperty(TOKEN)
    }
  }

  const observer = new ResizeObserver(apply)
  observer.observe(bar)
  apply()

  return () => {
    observer.disconnect()
    document.documentElement.style.removeProperty(TOKEN)
  }
}
