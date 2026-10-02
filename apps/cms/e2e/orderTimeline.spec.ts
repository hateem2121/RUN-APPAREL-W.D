import { FACTORY_PHOTOS } from '../src/lib/factoryPhotos'
import { ORDER_PHASES } from '../src/lib/orderProcess'
import { expect, type Page, test } from './offlineMedia'

/**
 * VA-29 with VA-34 (visual audit, owner's choice 2026-10-02): "How an order works" gives every
 * one of its eight steps its own photo, all cut to ONE square, and the "Inside the factory"
 * strip is gone. `src/orderTimelinePhotos.test.ts` holds the data and the markup; this holds what
 * only a browser can say: that the eight really render at one ratio, that each step and its
 * photo line up (words left, photo right) on a wide screen, and that on a phone the photo sits
 * above its step.
 *
 * What would have to break for these to fail: a picture drawn in a shape of its own (the old
 * wide, tall, wide, tall), a row where the words and the photo start at different heights, the
 * two columns swapping or collapsing too soon, a phone layout with the picture under its words
 * (so it reads as belonging to the next step), or the strip still on the page.
 *
 * ⚠️ REDUCED MOTION IS EMULATED, as every layout suite here does: the section rises and each
 * picture wipes open as it scrolls in, and a rectangle read mid-rise is not the layout. The
 * measuring below is of boxes (`getBoundingClientRect` of the frame and the words), which the
 * wipe's `clip-path` never changes, and the drift moves only the picture inside its frame.
 */

const STEPS = ORDER_PHASES.flatMap((phase) => phase.steps)

type Box = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

type Row = {
  step: Box
  text: Box
  figure: Box
  frame: Box
  title: string
}

async function rows(page: Page): Promise<Row[]> {
  return page.evaluate(() => {
    const box = (element: Element | null): Box => {
      if (!element) throw new Error('a step is missing a part')
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    }
    return [...document.querySelectorAll('.timeline__step')].map((step) => ({
      step: box(step),
      text: box(step.querySelector('.timeline__text')),
      figure: box(step.querySelector('figure')),
      frame: box(step.querySelector('.photo-figure__frame')),
      title: step.querySelector('.timeline__title')?.textContent ?? '',
    }))
  })
}

async function open(page: Page, width: number, height: number) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height })
  await page.goto('/')
  // The control that the section exists: an empty list would pass every check below.
  await expect(page.locator('.timeline__step')).toHaveCount(8)
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values)

test.describe('VA-29 — every step has its own photo, one square each', () => {
  test('on a wide screen the eight pictures are one size and one square, in one column', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    const measured = await rows(page)
    expect(measured.map((row) => row.title)).toEqual(STEPS.map((step) => step.title))

    for (const [index, row] of measured.entries()) {
      const label = `step ${index + 1} (${row.title})`
      expect(
        Math.abs(row.frame.width - row.frame.height),
        `${label}: the picture is ${row.frame.width} x ${row.frame.height}, not a square`,
      ).toBeLessThanOrEqual(1)
      // 280px squares from 900px (owner's choice, 2026-10-02, to shorten the section).
      expect(row.frame.width, `${label}: the picture is under 279px wide`).toBeGreaterThanOrEqual(
        279,
      )
    }
    // Eight pictures, one shape: no width or height differs from another by more than a pixel.
    expect(spread(measured.map((row) => row.frame.width)), 'the widths differ').toBeLessThanOrEqual(
      1,
    )
    expect(
      spread(measured.map((row) => row.frame.height)),
      'the heights differ',
    ).toBeLessThanOrEqual(1)
    // One column down the right, and one down the left.
    expect(
      spread(measured.map((row) => row.frame.left)),
      'the pictures are not in one column',
    ).toBeLessThanOrEqual(1)
    expect(
      spread(measured.map((row) => row.text.left)),
      'the words are not in one column',
    ).toBeLessThanOrEqual(1)
  })

  test('on a wide screen each step’s words are on the left, its photo on the right, and the row lines up', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    const measured = await rows(page)
    for (const [index, row] of measured.entries()) {
      const label = `step ${index + 1} (${row.title})`
      expect(
        row.frame.left,
        `${label}: the photo is not to the right of the words`,
      ).toBeGreaterThanOrEqual(row.text.right)
      // The words and the picture start at the row's top edge — the strict rhythm.
      expect(
        Math.abs(row.text.top - row.step.top),
        `${label}: the words start off the row's top`,
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(row.figure.top - row.step.top),
        `${label}: the photo starts off the row's top`,
      ).toBeLessThanOrEqual(1)
      // The row is as tall as its picture, so the next row cannot start inside it.
      expect(row.step.bottom, `${label}: the row is shorter than its photo`).toBeGreaterThanOrEqual(
        row.figure.bottom - 1,
      )
      if (index > 0) {
        const above = measured[index - 1] as Row
        expect(
          row.step.top,
          `${label}: starts before the step above it ends`,
        ).toBeGreaterThanOrEqual(above.step.bottom)
      }
    }
  })

  for (const width of [320, 390, 768]) {
    test(`at ${width}px the photo sits above its step, full column wide up to 400px, and still square`, async ({
      page,
    }) => {
      await open(page, width, 844)
      const measured = await rows(page)
      for (const [index, row] of measured.entries()) {
        const label = `step ${index + 1} (${row.title})`
        expect(row.figure.bottom, `${label}: the photo is not above its words`).toBeLessThanOrEqual(
          row.text.top + 1,
        )
        expect(
          Math.abs(row.frame.left - row.text.left),
          `${label}: the photo and the words are not in one column`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(row.frame.width - row.frame.height),
          `${label}: not a square`,
        ).toBeLessThanOrEqual(1)
        expect(row.frame.width, `${label}: wider than the cap`).toBeLessThanOrEqual(400.5)
        expect(row.frame.width, `${label}: unusably small`).toBeGreaterThan(200)
      }
      expect(
        spread(measured.map((row) => row.frame.width)),
        'the widths differ',
      ).toBeLessThanOrEqual(1)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        'the page scrolls sideways',
      ).toBeLessThanOrEqual(0)
    })
  }

  test('every picture is that step’s photo: its alt text, lazy, sized, cut by cover and aimed at its focus', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    const images = await page.locator('.timeline img').evaluateAll((all) =>
      all.map((img) => {
        const style = getComputedStyle(img)
        return {
          src: img.getAttribute('src') ?? '',
          alt: img.getAttribute('alt') ?? '',
          loading: img.getAttribute('loading'),
          width: Number(img.getAttribute('width')),
          height: Number(img.getAttribute('height')),
          srcset: img.getAttribute('srcset') ?? '',
          sizes: img.getAttribute('sizes') ?? '',
          fit: style.objectFit,
          position: style.objectPosition,
        }
      }),
    )
    expect(images).toHaveLength(8)
    for (const [index, image] of images.entries()) {
      const step = STEPS[index]
      const photo = FACTORY_PHOTOS.find((entry) => entry.slug === step?.photo)
      const label = `step ${index + 1} (${step?.title})`
      expect(image.src, label).toMatch(new RegExp(`^/factory/${photo?.slug}-\\d+\\.webp$`))
      expect(image.alt, `${label}: not the photo's own alt text`).toBe(photo?.alt)
      expect(image.loading, `${label}: not lazy (nothing in №04 is on the first screen)`).toBe(
        'lazy',
      )
      expect(image.width, `${label}: no width reserved`).toBeGreaterThan(0)
      expect(image.height, `${label}: no height reserved`).toBeGreaterThan(0)
      expect(image.srcset, `${label}: the two widths are not offered`).toMatch(/\d+w, .*\d+w/)
      expect(image.sizes, `${label}: no sizes`).not.toBe('')
      expect(image.fit, `${label}: the picture is squeezed, not cut`).toBe('cover')
      expect(image.position, `${label}: not aimed at the photo's own focus`).toBe(
        `${photo?.focus?.[0]}% ${photo?.focus?.[1]}%`,
      )
    }
  })

  test('the four phases, the You / We markers and the drawn line are all still there (D23)', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    await expect(page.locator('.timeline__name')).toHaveText(
      ORDER_PHASES.map((phase) => phase.name),
    )
    await expect(page.locator('.timeline__actor')).toHaveText(STEPS.map((step) => step.actor))
    await expect(page.locator('.timeline__line')).toHaveCount(1)
    await expect(page.locator('.timeline__marker')).toHaveText(
      STEPS.map((_, index) => String(index + 1).padStart(2, '0')),
    )
  })
})

test.describe('VA-34 — the "Inside the factory" strip is gone, and no photo is drawn twice', () => {
  test('there is no such heading, grid or lightbox, and "Talk to us" is №06', async ({ page }) => {
    await open(page, 1440, 900)
    await expect(page.getByRole('heading', { name: /inside the factory/i })).toHaveCount(0)
    await expect(page.locator('.factory-grid, .factory-tile, .lightbox')).toHaveCount(0)
    const labels = await page.locator('.section-number').allTextContents()
    expect(labels.join('\n')).not.toMatch(/inside the factory/i)
    expect(labels.at(-1)).toBe('№06 — Talk to us')
  })

  test('each factory photo is on the home page once: №01 draws two, №04 draws eight', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    const slugs = await page.locator('main img').evaluateAll((all) =>
      all
        .map((img) => img.getAttribute('src') ?? '')
        // The hero's own crops (`hero-wide-…`) are a different picture on purpose.
        .filter((src) => src.startsWith('/factory/') && !src.startsWith('/factory/hero-'))
        .map((src) => src.replace(/^\/factory\/(.+)-\d+\.webp$/, '$1')),
    )
    expect(slugs.sort(), 'a factory photo is missing, or drawn twice').toEqual(
      FACTORY_PHOTOS.map((photo) => photo.slug).sort(),
    )
  })
})
