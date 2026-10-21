import { describe, expect, it } from 'vitest'
import {
  afterScroll,
  colourHref,
  DRAWN_UP_FRONT,
  restingTarget,
  slideAt,
  slidesToLoad,
  startsFar,
  stepColour,
} from './cardGallery'

describe('slideAt', () => {
  it('reads the slide from the scroll position', () => {
    expect(slideAt(0, 300, 5)).toBe(0)
    expect(slideAt(300, 300, 5)).toBe(1)
    expect(slideAt(1200, 300, 5)).toBe(4)
  })

  it('follows the slide that covers more of the frame mid-swipe', () => {
    expect(slideAt(149, 300, 5)).toBe(0)
    expect(slideAt(151, 300, 5)).toBe(1)
  })

  it('handles the negative scrollLeft a right-to-left page reports', () => {
    expect(slideAt(-600, 300, 5)).toBe(2)
  })

  it('never points past either end', () => {
    // Overscroll bounce on iOS reports positions beyond the content for a moment.
    expect(slideAt(5000, 300, 5)).toBe(4)
    expect(slideAt(0, 300, 1)).toBe(0)
  })

  it('answers 0 for a strip that has not been laid out', () => {
    // Before layout (or display: none) the slide width is 0; dividing by it is NaN or Infinity.
    expect(slideAt(0, 0, 5)).toBe(0)
    expect(slideAt(Number.NaN, 300, 5)).toBe(0)
    expect(slideAt(0, 300, 0)).toBe(0)
  })
})

describe('colourHref', () => {
  it('builds the viewer URL printed QR tags use', () => {
    expect(colourHref('https://viewer.wear-run.help', 'rxps', 'wine')).toBe(
      'https://viewer.wear-run.help/rxps/wine',
    )
  })
})

describe('slidesToLoad', () => {
  it('adds the showing slide and both neighbours, and keeps what was loaded', () => {
    expect([...slidesToLoad(new Set([0]), 2, 5)].sort()).toEqual([0, 1, 2, 3])
  })

  it('stays inside the strip at either end', () => {
    expect([...slidesToLoad(new Set(), 0, 5)].sort()).toEqual([0, 1])
    expect([...slidesToLoad(new Set(), 4, 5)].sort()).toEqual([3, 4])
    expect([...slidesToLoad(new Set(), 0, 1)]).toEqual([0])
  })

  it('does not change the set it was given', () => {
    const before = new Set([0])
    slidesToLoad(before, 3, 5)
    expect([...before]).toEqual([0])
  })
})

describe('stepColour', () => {
  it('goes one colour on either way, round from the last to the first', () => {
    expect(stepColour(null, 2, 1, 5)).toBe(3)
    expect(stepColour(null, 4, 1, 5)).toBe(0)
    expect(stepColour(null, 0, -1, 5)).toBe(4)
  })

  // VA-30, 2026-10-02: counted from the colour passing by, "previous" twice from the second colour
  // landed on the first instead of wrapping round to the last.
  it('counts from where a glide is going, not from the colour it is passing', () => {
    expect(stepColour(0, 1, -1, 5)).toBe(4)
  })
})

describe('afterScroll', () => {
  const moving = { rested: false, restsReported: true }
  const rested = { rested: true, restsReported: true }

  it('follows the strip when nothing is gliding it: a finger, the wheel or a key moved it', () => {
    expect(afterScroll(null, 2, moving)).toEqual({ heading: null, show: 2 })
  })

  it('shows none of the colours a glide passes on its way', () => {
    expect(afterScroll(4, 2, moving)).toEqual({ heading: 4, show: null })
  })

  // Firefox, 11 Oct 2026: sent back to the first colour at 166px, the strip read the first colour
  // at 182px on its way out to 207px, and only then turned round.
  it('does not end a glide because the strip reads its colour while still moving', () => {
    expect(afterScroll(0, 0, moving)).toEqual({ heading: 0, show: null })
  })

  it('ends a glide where the strip comes to rest, and shows that colour', () => {
    expect(afterScroll(4, 4, rested)).toEqual({ heading: null, show: 4 })
    // Stopped short of where it was sent: the dots follow the picture, never the other way round.
    expect(afterScroll(4, 3, rested)).toEqual({ heading: null, show: 3 })
  })

  it('in a browser that never reports a rest, ends a glide when the strip reads its colour', () => {
    const unreported = { rested: false, restsReported: false }
    expect(afterScroll(1, 1, unreported)).toEqual({ heading: null, show: 1 })
    expect(afterScroll(1, 0, unreported)).toEqual({ heading: 1, show: null })
  })
})

describe('restingTarget', () => {
  it('leaves a strip that rests on a picture alone', () => {
    expect(restingTarget(0, 366, 5)).toBeNull()
    expect(restingTarget(732, 366, 5)).toBeNull()
  })

  // Firefox 155, 11 Oct 2026: "next" then "previous" 8ms apart left the strip 2–8px into the
  // second picture, at rest, on a mandatory snap strip.
  it('names the picture to settle on when the strip rests between two', () => {
    expect(restingTarget(7, 366, 5)).toBe(0)
    expect(restingTarget(373, 366, 5)).toBe(1)
    expect(restingTarget(360, 366, 5)).toBe(1)
  })

  it('allows a pixel either way, so rounding never starts a correction', () => {
    expect(restingTarget(366.9, 366, 5)).toBeNull()
    expect(restingTarget(365.1, 366, 5)).toBeNull()
  })

  // A card 365.6px wide reports clientWidth 366; measured in slides of 366 the fifth picture
  // would read 1.6px off for ever, and every correction would start another.
  it('measures against the strip’s real, fractional width', () => {
    expect(restingTarget(1462, 365.6, 5)).toBeNull()
    expect(restingTarget(1462.4, 365.6, 5)).toBeNull()
  })

  it('reads a right-to-left strip by its distance from the start', () => {
    expect(restingTarget(-7, 366, 5)).toBe(0)
    expect(restingTarget(-366, 366, 5)).toBeNull()
  })

  it('does nothing for a strip with no width or no pictures', () => {
    expect(restingTarget(7, 0, 5)).toBeNull()
    expect(restingTarget(7, 366, 0)).toBeNull()
  })
})

/*
 * ⚠️ CI's FAILURE, REPLAYED (main, run 38142934506, 11 Oct 2026; VA-30 in `e2e/pages.spec.ts`).
 * "Next", then "previous" twice, must end on the LAST colour. Firefox ended on the first, on both
 * tries. Its recorder put the strip at 139px at the first "previous" and at 214px at the second: a
 * smooth scroll sent somewhere new KEEPS ITS SPEED (Chromium and WebKit too, measured 10–58px), so
 * the strip went on towards the second colour, past halfway, before it turned round. Reading the
 * first colour on its way out ended the glide; crossing halfway then showed the second colour; and
 * the second "previous" counted back from there, to the first.
 *
 * The positions below are the real gallery's in Firefox 155 the same day (a /products card at
 * 1280px wide, slide 366px: halfway is 183px), from `e2e/galleryArrows.spec.ts`'s press pattern,
 * where 17 of 60 such presses ended on the first colour before this fix.
 */
describe('"previous" twice while a "next" glide is under way (VA-30, CI run 38142934506)', () => {
  const SLIDE = 366
  const COLOURS = 5

  /** The gallery's own arithmetic, driven the way `CardGallery.tsx` drives it. */
  function gallery() {
    let active = 0
    let heading: number | null = null
    return {
      press(by: number) {
        heading = stepColour(heading, active, by, COLOURS)
        active = heading
        return heading
      },
      scroll(px: number, rested = false) {
        const next = afterScroll(heading, slideAt(px, SLIDE, COLOURS), {
          rested,
          restsReported: true,
        })
        heading = next.heading
        if (next.show !== null) active = next.show
      },
      get active() {
        return active
      },
    }
  }

  it('ends on the last colour, though the strip runs on past halfway before it turns', () => {
    const g = gallery()
    g.press(1)
    for (const px of [2, 8, 18, 31, 46, 63, 98, 115, 133, 149, 166]) g.scroll(px)
    g.press(-1)
    for (const px of [182, 195, 204, 207, 203]) g.scroll(px)
    const sentTo = g.press(-1)
    // The browser then takes the strip where it was last sent, past the colours between, and it
    // comes to rest there (all three engines did, in every probe).
    for (const share of [0.25, 0.5, 0.75]) g.scroll(203 + (sentTo * SLIDE - 203) * share)
    g.scroll(sentTo * SLIDE, true)
    expect(sentTo, 'where the second "previous" sent the strip').toBe(4)
    expect(g.active, 'the colour the dots show once the strip rests').toBe(4)
  })
})

describe('startsFar', () => {
  it('leaves the first DRAWN_UP_FRONT cards whole and marks every later one', () => {
    expect(DRAWN_UP_FRONT).toBe(4)
    expect([0, 1, 2, 3].map(startsFar)).toEqual([false, false, false, false])
    expect([4, 5, 40].map(startsFar)).toEqual([true, true, true])
  })
})
