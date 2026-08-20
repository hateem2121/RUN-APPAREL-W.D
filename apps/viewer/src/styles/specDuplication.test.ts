import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The four spec facts must render EXACTLY ONCE at every width.
 *
 * ⚠️ WHY THIS EXISTS. Until 2026-08-21 they rendered twice above 1000px, word for
 * word: `.stage__callouts` drew [ FABRIC ] [ WEIGHT ] [ FIT ] [ PERFORMANCE ] over
 * the canvas, and `.spec-list` printed the same four `<dd>` values further down the
 * page from the same CMS fields. Measured on the live payload at 1440x900 — both
 * visible, both identical.
 *
 * Nothing could have caught it. Both elements are valid, both are populated from
 * real data, axe has no opinion about saying something twice, and the duplication
 * is only visible when both breakpoints happen to be satisfied at once. It is the
 * shape CLAUDE.md opens with, from the other side: not a missing failure mode, a
 * missing DEFINITION of failure.
 *
 * The fix is one number in two rules, so this test's job is to prove they are the
 * same number:
 *
 *   `.stage__callouts` appears at min-width: 1000px  (below it the canvas column
 *     is ~559px and two 240px callouts would sit on the garment)
 *   `.spec-list`      hides    at min-width: 1000px  (above it the callouts are
 *     already saying it)
 *
 * Lower the callouts' without lowering this one and the facts print twice again.
 * Raise this one without the callouts' and they vanish from the page entirely
 * between the two values — which is the worse of the two failures, because the
 * information is simply gone rather than merely repeated.
 */

const PAGE_CSS = join(import.meta.dirname, 'page.css')

/** Blank comment BODIES, preserving offsets — the same helper `tokens.test.ts` uses.
 *  Required here because the comments above BOTH rules discuss both breakpoints. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

/**
 * The min-width of the `@media` block that contains a given declaration.
 *
 * Deliberately crude and deliberately anchored on the DECLARATION rather than on
 * the selector: `.spec-list` is declared in four places in this file and only one
 * of them sets `display: none`. Searching for the selector alone would find the
 * base rule and report no media query at all.
 */
function mediaMinWidthContaining(css: string, declaration: string): number | null {
  const at = css.indexOf(declaration)
  if (at === -1) return null
  // Walk backwards to the nearest `@media (min-width: N…)` that opens before it.
  const before = css.slice(0, at)
  const opens = [...before.matchAll(/@media \(min-width: (\d+)px\)/g)]
  const last = opens.at(-1)
  return last ? Number(last[1]) : null
}

describe('the spec facts are never printed twice', () => {
  const css = stripComments(readFileSync(PAGE_CSS, 'utf8'))

  it('the callouts appear and the spec list hides at the same breakpoint', () => {
    const calloutsAppear = mediaMinWidthContaining(css, '.stage__callouts {\n    display: block;')
    const listHides = mediaMinWidthContaining(css, '.spec-list {\n    display: none;')

    expect(
      calloutsAppear,
      'no `@media (min-width: …) { .stage__callouts { display: block } }`',
    ).not.toBeNull()
    expect(listHides, 'no `@media (min-width: …) { .spec-list { display: none } }`').not.toBeNull()
    expect(
      listHides,
      `.spec-list hides at ${listHides}px but .stage__callouts appears at ` +
        `${calloutsAppear}px. Between those two widths the four facts are either ` +
        'printed twice or not printed at all. Move both or neither.',
    ).toBe(calloutsAppear)
  })

  /**
   * The negative control. Both assertions above are `.not.toBeNull()` plus an
   * equality, so a helper that silently returned the same wrong answer twice would
   * pass. This proves it reads a real, specific number out of the file.
   */
  it('reads a real breakpoint, not a default', () => {
    expect(mediaMinWidthContaining(css, '.spec-list {\n    display: none;')).toBe(1000)
    expect(mediaMinWidthContaining(css, 'no such declaration in this file')).toBeNull()
  })
})
