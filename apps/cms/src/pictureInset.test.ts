import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { escapeRegExp } from '../regexEscape.mjs'

/**
 * VA-55 (visual audit, owner's choice 2026-10-02): the renders are cropped tight, so inside a card's
 * 4:5 box each garment ran to the edge — the sports bra touched both sides, the jacket's sleeves
 * reached the sides and the bottom, the bib shorts touched top and bottom. The pictures now have a
 * margin of about 6-8% inside the same box, CSS only, no new images.
 *
 * ⚠️ THIS TAKES THE NUMBERS OUT OF THE STYLESHEET and works out where a picture of any shape ends
 * up, the way `object-fit: contain` places it in a padded box. A test that hard-coded 7% would pass
 * while the stylesheet said 3%. It is arithmetic, not a browser: `e2e/pictureInset.spec.ts` measures
 * the same in a real engine, with real pictures swapped in.
 *
 * What would have to break for these to fail: the margin shrinks below the owner's floor, the rule
 * stops reaching one of its two pictures (or reaches another — the home page's 3D section picture,
 * which a live model lies exactly over), the padding moves onto the slide and changes the swipe's
 * geometry, or the family tickets lose the margin they keep by position (polish D3).
 */

const SITE_CSS = readFileSync(join(import.meta.dirname, 'app', '(frontend)', 'site.css'), 'utf8')
  // Comments are left out: they quote the values and selectors they discuss.
  .replace(/\/\*[\s\S]*?\*\//g, '')

const FLOOR = 0.06

const declared = (selectorPattern: string) =>
  new RegExp(`(?:^|\\n)${selectorPattern}\\s*\\{([^}]*)\\}`).exec(SITE_CSS)?.[1] ?? ''

/** The pictures padded in a 4:5 box. The family tickets' boxes are any shape: they keep it by position. */
const PADDED = ['.card-gallery__slide .product-card__img', '.family-hero__frame .product-card__img']

function insetRule() {
  const selector = PADDED.map((entry) => escapeRegExp(entry)).join(',\\s*')
  return declared(selector)
}

/** The inline inset as a fraction of the box's width, read from `--picture-inset`. */
function insetFromCss(): number {
  const value = /--picture-inset:\s*([\d.]+)%/.exec(SITE_CSS)?.[1]
  if (!value) throw new Error('site.css no longer declares --picture-inset')
  return Number(value) / 100
}

/** The block padding as a multiple of the inline one: the `* 1.25` in `calc(var(--picture-inset) * 1.25)`. */
function blockFactor(): number {
  const factor =
    /padding:\s*calc\(var\(--picture-inset\)\s*\*\s*([\d.]+)\)\s+var\(--picture-inset\)/.exec(
      insetRule(),
    )?.[1]
  if (!factor)
    throw new Error('the inset rule no longer pads block = calc(inset * n), inline = inset')
  return Number(factor)
}

/**
 * Where a picture of `ratio` (width / height) is drawn in a box of `boxRatio`, padded as the rule pads
 * it, as the distance from each edge in fractions of the box's own width (sides) and height (top and
 * bottom). Percentage padding is always against the WIDTH, so the box is 1 wide and 1/boxRatio tall.
 */
function margins(inset: number, factor: number, boxRatio: number, ratio: number) {
  const width = 1
  const height = 1 / boxRatio
  const padX = inset * width
  const padY = inset * factor * width
  const contentW = width - 2 * padX
  const contentH = height - 2 * padY
  const scale = Math.min(contentW / ratio, contentH)
  const drawnW = scale * ratio
  const drawnH = scale
  return {
    side: (width - drawnW) / 2 / width,
    topBottom: (height - drawnH) / 2 / height,
  }
}

const BOXES = [
  { name: '4:5 (a card above a phone, the hero)', ratio: 4 / 5 },
  { name: '1:1 (a product card on a phone, VA-42)', ratio: 1 },
]
const PICTURES = [
  { name: 'a 4:5 render', ratio: 4 / 5 },
  { name: 'a 2:3 render, taller than the box (height-bound)', ratio: 2 / 3 },
  { name: 'a 5:4 picture, wider than the box (width-bound)', ratio: 5 / 4 },
  { name: 'a square picture', ratio: 1 },
]

describe('the margin is in the stylesheet and is the owner’s 6 to 8%', () => {
  it('declares --picture-inset between 6% and 8%', () => {
    expect(insetFromCss()).toBeGreaterThanOrEqual(0.06)
    expect(insetFromCss()).toBeLessThanOrEqual(0.08)
  })

  it('pads the picture itself, on exactly the product card’s slide and the hero', () => {
    expect(
      insetRule(),
      'the inset rule is missing or reaches a different set of pictures',
    ).not.toBe('')
    expect(blockFactor()).toBe(1.25)
  })

  it('never insets the home page’s 3D section picture, nor the base card-picture rule', () => {
    expect(declared('\\.product-card__img')).not.toMatch(/padding/)
    // The three selectors are the whole list: no `.proof__frame` and no bare `.product-card__img`.
    expect(insetRule()).toMatch(/padding:/)
    expect(SITE_CSS).not.toMatch(/\.proof__frame[^{]*\.product-card__img[^{]*\{[^}]*padding/)
  })

  it('leaves the swipe’s geometry alone: the margin is on the picture, not on the slide', () => {
    expect(declared('\\.card-gallery__slide')).not.toMatch(/padding/)
    expect(declared('\\.card-gallery__slide')).toMatch(/flex:\s*0 0 100%/)
  })

  it('keeps the 4:5 boxes, but the family ticket’s, which is its half of the ticket (D3)', () => {
    expect(declared('\\.product-card__figure')).toMatch(/aspect-ratio:\s*4\s*\/\s*5/)
    expect(declared('\\.family-hero__frame')).toMatch(/aspect-ratio:\s*4\s*\/\s*5/)
    expect(declared('\\.family-card__media')).not.toMatch(/aspect-ratio/)
  })
})

describe('every garment sits at least 6% from every edge, whatever the shape of its render', () => {
  for (const box of BOXES) {
    for (const picture of PICTURES) {
      it(`${picture.name}, in a ${box.name} box`, () => {
        const { side, topBottom } = margins(insetFromCss(), blockFactor(), box.ratio, picture.ratio)
        expect(side, 'sideways margin, as a fraction of the box width').toBeGreaterThanOrEqual(
          FLOOR,
        )
        expect(
          topBottom,
          'top and bottom margin, as a fraction of the box height',
        ).toBeGreaterThanOrEqual(FLOOR)
      })
    }
  }

  // NEGATIVE CONTROL, run both ways: the sums see a margin that is too thin. 4% at the sides fails
  // for the square render in the 4:5 box, and no margin at all is what the audit measured.
  it('sees a margin that is too thin, and the missing one the audit found', () => {
    const thin = margins(0.04, 1.25, 4 / 5, 4 / 5)
    expect(Math.min(thin.side, thin.topBottom)).toBeLessThan(FLOOR)
    const none = margins(0, 1, 4 / 5, 4 / 5)
    expect(none.side).toBe(0)
    expect(none.topBottom).toBe(0)
    // …and the margin the stylesheet declares clears the same bar.
    const real = margins(insetFromCss(), blockFactor(), 4 / 5, 4 / 5)
    expect(Math.min(real.side, real.topBottom)).toBeGreaterThanOrEqual(FLOOR)
  })

  it('a 4:5 render fills what is left of a 4:5 box evenly: the same fraction on every side', () => {
    const { side, topBottom } = margins(insetFromCss(), blockFactor(), 4 / 5, 4 / 5)
    expect(side).toBeCloseTo(insetFromCss(), 6)
    expect(topBottom).toBeCloseTo(insetFromCss(), 6)
  })
})

/**
 * Where a picture of `ratio` is drawn when the IMAGE BOX is inset by `inset` of the frame's width at
 * the sides and of its HEIGHT at top and bottom (a position, as the family ticket's picture is), in
 * fractions of the frame's width (sides) and height (top and bottom).
 */
function positioned(inset: number, boxRatio: number, ratio: number) {
  const width = 1
  const height = 1 / boxRatio
  const contentW = width * (1 - 2 * inset)
  const contentH = height * (1 - 2 * inset)
  const scale = Math.min(contentW / ratio, contentH)
  return {
    side: (width - scale * ratio) / 2 / width,
    topBottom: (height - scale) / 2 / height,
  }
}

/*
 * Polish D3: a family ticket's picture box is its half of the ticket, any shape from an opened
 * ticket's tall left (179 x 380 at 1180px, 0.47) through a sideways ticket with three lines of kinds
 * (139 x 204, 0.68, where the padding left a 2:3 render 5.97% from the top) to the fifth across a
 * tablet (324 x 152, 2.1). So it keeps its margin by POSITION: `inset` reads the height for top and
 * bottom, where percentage padding reads the width on every side.
 */
describe('a family ticket keeps the margin by position, whatever its box (D3)', () => {
  const rule = declared('\\.family-card__img')

  it('places the picture `--picture-inset` in from every edge, and pads it nowhere', () => {
    expect(rule).toMatch(/position:\s*absolute/)
    expect(rule).toMatch(/inset:\s*var\(--picture-inset\)/)
    expect(rule).toMatch(/inline-size:\s*calc\(100% - 2 \* var\(--picture-inset\)\)/)
    expect(rule).toMatch(/block-size:\s*calc\(100% - 2 \* var\(--picture-inset\)\)/)
    expect(rule).not.toMatch(/padding/)
    expect(PADDED).not.toContain('.family-card__img')
  })

  for (const boxRatio of [0.4, 0.47, 0.68, 0.8, 1, 1.5, 2.1, 2.6]) {
    it(`every picture shape sits 6% or more from every edge of a ${boxRatio} box`, () => {
      for (const picture of PICTURES) {
        const { side, topBottom } = positioned(insetFromCss(), boxRatio, picture.ratio)
        expect(side, picture.name).toBeGreaterThanOrEqual(FLOOR)
        expect(topBottom, picture.name).toBeGreaterThanOrEqual(FLOOR)
      }
    })
  }

  // NEGATIVE CONTROL: the padding the other two pictures use fails a 2:3 render in the box shape
  // where its width and its height bind at once (about 0.68, the ticket the browser test found),
  // worked out from the stylesheet's own numbers; the position keeps it there.
  it('sees the padding leave a 2:3 render under 6% where the position does not', () => {
    const inset = insetFromCss()
    const worst = 1 / ((1 - 2 * inset) / (2 / 3) + 2 * inset * blockFactor())
    expect(worst).toBeGreaterThan(0.66)
    expect(worst).toBeLessThan(0.7)
    expect(margins(inset, blockFactor(), worst, 2 / 3).topBottom).toBeLessThan(FLOOR)
    expect(positioned(inset, worst, 2 / 3).topBottom).toBeGreaterThanOrEqual(FLOOR)
  })
})
