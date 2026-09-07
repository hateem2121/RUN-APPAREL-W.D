import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRELOADER_WIPE_MS } from '../lib/motion'

/**
 * The two surfaces a visitor stares at while nothing has arrived yet — the
 * branded preloader that covers the CMS fetch, and the blurred colourway photo
 * that covers the model download.
 *
 * ⚠️ NEITHER IS REACHABLE FROM ANY OTHER GATE IN THIS PACKAGE, and that is why
 * this file reads CSS instead of a browser.
 *
 *   - `<Preloader>` computes `reduce` as `prefersReducedMotion() || navigator.
 *     webdriver`, and under automation it hands back immediately and renders no
 *     wipe at all. Playwright sets `navigator.webdriver`. So the wipe cannot be
 *     sampled by the e2e suite in any project, at any media setting — the audit
 *     of 2026-09-06 measured it in a real browser with the flag absent.
 *   - `.stage__placeholder`'s `will-change` is a compositor HINT. It changes no
 *     computed geometry and no pixel, so nothing that measures the rendered page
 *     can see it move; only its own declaration can.
 *
 * Both findings scored 8–9 in that audit and both were held up by prose alone.
 * A number measured once is a fact about one afternoon.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const PAGE_CSS = readFileSync(join(import.meta.dirname, 'page.css'), 'utf8')
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'packages', 'ui', 'src', 'tokens.css'), 'utf8')

/**
 * The declaration block of the FIRST rule whose selector list is exactly
 * `selector`.
 *
 * Exact rather than "contains", because `.stage__placeholder` and
 * `.stage__placeholder--leaving` share a prefix and the media-query override
 * further down declares `.stage__placeholder` again. Every caller states which
 * one it means, and `ruleCount` below asserts the file agrees.
 */
function ruleBody(css: string, selector: string): string {
  const pattern = new RegExp(
    `(^|[};])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`,
    'm',
  )
  const found = css.match(pattern)
  expect(found, `no rule with the exact selector "${selector}" in page.css`).not.toBeNull()
  return (found?.[2] ?? '').trim()
}

/** How many rules in the file use exactly this selector. */
function ruleCount(css: string, selector: string): number {
  const pattern = new RegExp(
    `(^|[};])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{`,
    'gm',
  )
  return [...css.matchAll(pattern)].length
}

/** A `--token: value;` declaration out of tokens.css. */
function token(name: string): string {
  const found = TOKENS_CSS.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  expect(found, `token ${name} is not declared in packages/ui/src/tokens.css`).not.toBeNull()
  return (found?.[1] ?? '').trim()
}

describe('the preloader wipe (FA-H-23)', () => {
  /**
   * Sampled per frame on the live site 2026-09-06: `clip-path` ran
   * `inset(0 0 0%)` → 6.88 → 12.88 → 18.75 → 24.25 → … → 92.82% at ~8 ms
   * intervals with no dropped or duplicated frames, decelerating throughout.
   * Decelerating throughout is what `--ease-out-expo` means; the measurement
   * cannot be repeated here, so the three inputs that produce it are pinned
   * instead.
   */
  it('wipes the clip-path on the editorial curve, not on the UI one', () => {
    const body = ruleBody(PAGE_CSS, '\\.preloader')
    const transition = body
      .match(/transition\s*:\s*([^;]+);/)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim()

    expect(
      transition,
      'the preloader no longer transitions its clip-path. The wipe IS the ' +
        'clip-path — a preloader that cannot animate it simply disappears. ' +
        'See audit FA-H-23.',
    ).toBe('clip-path var(--slow) var(--ease-out-expo)')
  })

  it('wipes upward to nothing, so the page is uncovered from the bottom', () => {
    // `inset(0 0 100% 0)` closes the bottom edge to the top. Any other final
    // value leaves part of the overlay on screen for good, over a page whose
    // `<main>` has just taken focus.
    expect(ruleBody(PAGE_CSS, '\\.preloader--exit')).toContain('clip-path: inset(0 0 100% 0)')
  })

  /**
   * The hand-off and the animation must be the same length, and they are written
   * in two languages in two files.
   *
   * ⚠️ THEY HAVE ALREADY DISAGREED ONCE. `<Preloader>` waited 760 ms for a wipe
   * CSS ran for 800 — the `onExited` callback fired 40 ms before the animation it
   * was waiting for finished, so the page took focus underneath a preloader still
   * on screen. `lib/motion.ts` was created to record that, and its own docblock
   * says "the duplication is deliberate and the comments are what keep it
   * honest". A comment is not a gate; this is.
   */
  it('hands over exactly when the wipe ends, in both languages', () => {
    expect(token('--slow')).toBe(`${PRELOADER_WIPE_MS}ms`)
  })

  it('reads a real ease-out-expo curve, so the assertions above are not about a missing token', () => {
    // Positive control. `var(--ease-out-expo)` resolving to nothing would drop the
    // whole `transition` declaration silently — the exact mechanism that shipped a
    // 1.00:1 skip link (see tokens.test.ts) — while the string assertion above
    // still passed.
    expect(token('--ease-out-expo')).toMatch(/^cubic-bezier\(/)
  })
})

describe('the placeholder photo while the model downloads (FA-H-24)', () => {
  /**
   * `will-change` is a promise to the compositor, paid for in memory on the one
   * device in this product that cannot spare it — a phone holding a 1.8–7.8 MB
   * garment. It is legitimate here because both named properties genuinely
   * animate for the element's whole life: `opacity` cross-fades it out on load,
   * and `filter` is retargeted from the byte count on every progress tick
   * (`Stage.tsx` sets `blur(${placeholderBlurPx(...)}px)` inline).
   *
   * The hint is RELEASED by removal — `{showPlaceholder && placeholder && …}`
   * unmounts the element rather than hiding it — which `e2e/placeholder-webgl.
   * spec.ts` covers in a real browser. What that cannot see is the hint drifting
   * away from the properties that earn it: naming a property nothing animates
   * costs the same memory and buys nothing, and naming one that DOES animate but
   * is missing from the list gives up the promotion the hint exists for. Neither
   * changes a pixel, so no rendered measurement can report either.
   */
  it('hints exactly the two properties it actually animates', () => {
    const body = ruleBody(PAGE_CSS, '\\.stage__placeholder')

    const willChange = body
      .match(/will-change\s*:\s*([^;]+);/)?.[1]
      ?.split(',')
      .map((part) => part.trim())
      .sort()

    expect(
      willChange,
      'the placeholder’s will-change no longer names the properties it ' +
        'animates. It is a memory cost on a phone already carrying the model; it ' +
        'is earned only while both opacity and filter are really moving. ' +
        'See audit FA-H-24.',
    ).toEqual(['filter', 'opacity'])

    const transitioned = body
      .match(/transition\s*:\s*([^;]+);/)?.[1]
      ?.split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .sort()

    expect(
      transitioned,
      'the properties the placeholder transitions and the properties it hints at ' +
        'have drifted apart',
    ).toEqual(willChange)
  })

  it('reads the base rule, not the reduced-motion override (negative control)', () => {
    /*
     * `.stage__placeholder` is declared twice: once here and once inside
     * `@media (prefers-reduced-motion: reduce)`, which sets `transition: none`.
     * `ruleBody` returns the FIRST match, and if that ever stopped being the base
     * rule the assertion above would compare `none` against itself and pass while
     * measuring nothing — this repo's most repeated failure.
     */
    expect(ruleCount(PAGE_CSS, '\\.stage__placeholder')).toBe(2)
    expect(ruleBody(PAGE_CSS, '\\.stage__placeholder')).toContain('will-change')
  })
})
