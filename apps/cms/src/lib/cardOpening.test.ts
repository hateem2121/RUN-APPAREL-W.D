import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARD_OPENING_NAME } from './cardOpening'

/**
 * Polish MO3: a product card's picture grows into the garment page's loading screen. That needs
 * BOTH pages to opt in and BOTH to use one name, and the two halves live in two apps that cannot
 * import each other (biome.jsonc), one of them in CSS. A rename or a dropped opt-in on either side
 * fails silently in the browser: the page just loads. So this reads the four files as shipped.
 * The browser half (a card tap transitions, any other link does not) is `e2e/motion.spec.ts`.
 */
const root = resolve(__dirname, '../../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

/** Everything wrong with one page's opt-in, as sentences. */
function optInProblems(css: string): string[] {
  const problems: string[] = []
  const block =
    /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/
  if (!block.test(css))
    problems.push('no `@view-transition { navigation: auto }` under motion-welcome')
  if (/@view-transition\s*\{[^}]*navigation:\s*auto/.test(css.replace(block, ''))) {
    problems.push('an opt-in outside the reduced-motion guard')
  }
  return problems
}

describe('a card picture grows into the garment page (polish MO3)', () => {
  const site = read('apps/cms/src/app/(frontend)/site.css')
  const viewer = read('apps/viewer/src/styles/page.css')
  const garmentHtml = read('apps/viewer/index.html')
  const inlineStyles = [...garmentHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join('\n')

  it('both pages opt in, and only when motion is welcome', () => {
    expect(optInProblems(site), 'the website').toEqual([])
    expect(optInProblems(inlineStyles), 'the garment page, inline in its HTML').toEqual([])
  })

  /*
   * ⚠️ INLINE ON THE GARMENT PAGE, MEASURED (index.html has the numbers): from page.css the
   * browser decided before the stylesheet arrived and turned every arrival down. A second copy
   * there would only make the inline one look optional.
   */
  it("the garment page's opt-in is not in its stylesheet", () => {
    expect(viewer).not.toMatch(/@view-transition/)
  })

  it("the garment page's loading screen carries the name the card's picture is given", () => {
    expect(viewer).toMatch(
      new RegExp(`\\.preloader\\s*\\{\\s*view-transition-name:\\s*${CARD_OPENING_NAME};`),
    )
    // The website names a picture only in script, at the tap; never in its stylesheet, where
    // every card would carry it at once and two equal names cancel the whole transition.
    expect(site).not.toContain(CARD_OPENING_NAME)
  })

  it('the garment page waits for the loading screen before the browser starts', () => {
    expect(read('apps/viewer/index.html')).toMatch(
      /<link rel="expect" href="#root" blocking="render" \/>/,
    )
  })

  it('the script that names the tapped picture is on every website page', () => {
    const layout = read('apps/cms/src/app/(frontend)/layout.tsx')
    expect(layout).toMatch(
      /import \{ CardOpening \} from '\.\.\/\.\.\/components\/site\/CardOpening'/,
    )
    expect(layout).toMatch(/<CardOpening \/>/)
  })

  // NEGATIVE CONTROLS, run both ways: an opt-in with no motion guard, and none at all.
  it('sees the fault: an unguarded opt-in, and a missing one', () => {
    expect(optInProblems('@view-transition { navigation: auto; }')).toEqual([
      'no `@view-transition { navigation: auto }` under motion-welcome',
      'an opt-in outside the reduced-motion guard',
    ])
    expect(optInProblems('.x { color: red }')).toEqual([
      'no `@view-transition { navigation: auto }` under motion-welcome',
    ])
  })
})
