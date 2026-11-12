import { describe, expect, it } from 'vitest'
import {
  PRELOADER_BOOT_SCRIPT,
  PRELOADER_FALLBACK_MS,
  PRELOADER_FINISH_MS,
  PRELOADER_HOLD_MS,
  PRELOADER_SHOWPIECE_MS,
} from './preloader'

/**
 * The SHIPPED curtain script, run against a stand-in browser on a fake clock (12 Nov 2026 loader
 * fix, A4). Until then the unit tests checked two functions the page never called, so the live
 * curtain lifted at 0.8 s on a fast page and stopped at 1971 on a slow one while every test was
 * green. Each case below is a load measured live that day, replayed: when the curtain first
 * paints, when the page's pictures, fonts and styles finish, and when the tab is visible.
 */
type Picture = { finishAt: number; failed?: boolean; lazy?: boolean; below?: boolean }
type Page = {
  bootAt: number
  pictures?: Picture[]
  stylesAt?: number
  fontsAt?: number
  parsedAt?: number
  hiddenUntil?: number
  /** With `hiddenUntil`: the tab goes to the back at this moment instead of from the start. */
  hiddenFrom?: number
  act?: { at: number; type: string }
  endAt?: number
  /** From this moment the page's own list throws, as a broken browser or extension might. */
  breakAt?: number
  /** Next's `nomodule` polyfill: in the page, never fetched by a modern browser, so never timed. */
  noModuleScript?: boolean
}
type Frame = { t: number; state: string; year: string; pct: string }

const THIS_YEAR = new Date().getFullYear()

async function simulate(page: Page): Promise<{
  frames: Frame[]
  layoutReads: number
  prevented: boolean
  listening: string[]
}> {
  let now = page.bootAt
  let layoutReads = 0
  const attributes = new Map<string, string>()
  const timers: Array<{ at: number; fn: () => void }> = []
  let frameQueue: Array<(t: number) => void> = []
  const listeners = new Map<string, Array<(e: unknown) => void>>()
  const text = (initial: string) => ({ textContent: initial, style: {} as Record<string, string> })
  const year = text('1889')
  const pct = text('0%')
  const picks = [0, 1, 2, 3, 4].map(() => text(''))
  const images = (page.pictures ?? []).map((p) => ({
    below: Boolean(p.below),
    getAttribute: (name: string) => (name === 'loading' && p.lazy ? 'lazy' : null),
    get complete() {
      return now >= p.finishAt
    },
    get naturalWidth() {
      return p.failed ? 0 : 1200
    },
    decode: () => (p.failed ? Promise.reject(new Error('broken')) : Promise.resolve()),
    getBoundingClientRect: () => {
      layoutReads += 1
      throw new Error('the driver read layout (A6)')
    },
  }))
  const sheet = { href: 'https://wear-run.com/a.css', tagName: 'LINK' }
  const polyfill = { src: 'https://wear-run.com/polyfills.js', tagName: 'SCRIPT' }
  // The stand-in answers only the selectors the driver uses; a `nomodule` script matches any
  // selector that does not leave it out, as `script[src]` alone does in a real page.
  const all = (selector: string): unknown[] => {
    if (page.breakAt !== undefined && now >= page.breakAt) throw new Error('planted fault')
    if (selector.includes('loom-mark__pick')) return picks
    if (selector.includes('img')) return images.filter((i) => i.getAttribute('loading') !== 'lazy')
    if (selector.includes('stylesheet') || selector.includes('script')) {
      return page.noModuleScript && !selector.includes(':not([nomodule])')
        ? [sheet, polyfill]
        : [sheet]
    }
    return []
  }
  const documentStub = {
    documentElement: {
      setAttribute: (n: string, v: string) => attributes.set(n, v),
      removeAttribute: (n: string) => attributes.delete(n),
      getAttribute: (n: string) => attributes.get(n) ?? null,
      hasAttribute: (n: string) => attributes.has(n),
    },
    referrer: 'https://www.google.com/',
    get readyState() {
      return now >= (page.parsedAt ?? 0) ? 'interactive' : 'loading'
    },
    get visibilityState() {
      return now >= (page.hiddenFrom ?? 0) && now < (page.hiddenUntil ?? 0) ? 'hidden' : 'visible'
    },
    fonts: {
      get status() {
        return now >= (page.fontsAt ?? 0) ? 'loaded' : 'loading'
      },
    },
    images,
    querySelector: (s: string) => (s.includes('year') ? year : s.includes('pct') ? pct : null),
    querySelectorAll: all,
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((f) => f !== fn),
      )
    },
  }
  const seen: Array<() => void> = []
  class FakeIntersectionObserver {
    constructor(private readonly callback: (entries: unknown[]) => void) {}
    observe(target: { below: boolean }) {
      seen.push(() => this.callback([{ target, isIntersecting: !target.below }]))
    }
    disconnect() {}
  }
  const scope = {
    IntersectionObserver: FakeIntersectionObserver,
    document: documentStub,
    window: {} as Record<string, unknown>,
    navigator: { webdriver: false },
    matchMedia: () => ({ matches: false }),
    location: { host: 'wear-run.com' },
    URL,
    performance: {
      now: () => now,
      getEntriesByType: () => [{ type: 'navigate' }],
      getEntriesByName: (name: string) =>
        name === polyfill.src ? [] : now >= (page.stylesAt ?? 0) ? [{}] : [],
    },
    requestAnimationFrame: (fn: (t: number) => void) => {
      frameQueue.push(fn)
      return frameQueue.length
    },
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ at: now + ms, fn })
      return timers.length
    },
    clearTimeout: () => {},
  }
  new Function(...Object.keys(scope), PRELOADER_BOOT_SCRIPT)(...Object.values(scope))

  const actEvent = {
    prevented: false,
    preventDefault() {
      actEvent.prevented = true
    },
  }
  const frames: Frame[] = []
  const end = page.endAt ?? 9000
  while (now < end) {
    now += 16
    if (page.act && now >= page.act.at && now < page.act.at + 16) {
      for (const fn of listeners.get(page.act.type) ?? []) fn(actEvent)
    }
    for (const timer of timers.filter((x) => x.at <= now)) {
      timers.splice(timers.indexOf(timer), 1)
      timer.fn()
    }
    // A hidden tab draws no frames.
    for (const answer of seen.splice(0)) answer()
    if (documentStub.visibilityState === 'visible') {
      const due = frameQueue
      frameQueue = []
      for (const fn of due) fn(now)
    }
    await Promise.resolve()
    await Promise.resolve()
    frames.push({
      t: now,
      state: attributes.get('data-preload') ?? '-',
      year: year.textContent,
      pct: pct.textContent,
    })
  }
  const listening = [...listeners].filter(([, fns]) => fns.length).map(([type]) => type)
  return { frames, layoutReads, prevented: actEvent.prevented, listening }
}

function summary(frames: Frame[]) {
  const on = frames.filter((f) => f.state === 'on')
  const lift = frames.find((f) => f.state === 'lifting')
  const appeared = on[0]?.t ?? null
  return {
    appeared,
    liftAfterAppear: lift && appeared !== null ? lift.t - appeared : null,
    years: new Set(on.map((f) => f.year)).size,
    lastYear: on.at(-1)?.year,
    lastPct: on.at(-1)?.pct,
    lifted: !!lift,
  }
}

describe('the shipped curtain, replayed on a fake clock', () => {
  it('a fast page still plays the whole roll and ends on this year at 100%', async () => {
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 200 }],
      stylesAt: 180,
      fontsAt: 190,
      parsedAt: 200,
    })
    const s = summary(frames)
    expect(s.liftAfterAppear).toBeGreaterThanOrEqual(PRELOADER_SHOWPIECE_MS)
    expect(s.years).toBeGreaterThanOrEqual(20)
    expect(s.lastYear).toBe(String(THIS_YEAR))
    expect(s.lastPct).toBe('100%')
  })

  it('a slow page lifts at the ceiling counted from the curtain, after showing this year', async () => {
    const { frames } = await simulate({
      bootAt: 1690,
      pictures: [{ finishAt: 6400 }],
      stylesAt: 2500,
      fontsAt: 2600,
      parsedAt: 2000,
    })
    const s = summary(frames)
    expect(s.liftAfterAppear).toBeGreaterThanOrEqual(3000)
    expect(s.liftAfterAppear).toBeLessThanOrEqual(
      3000 + PRELOADER_FINISH_MS + PRELOADER_HOLD_MS + 32,
    )
    expect(s.lastYear).toBe(String(THIS_YEAR))
  })

  it('waits for the first-screen picture when it lands before the ceiling (A3)', async () => {
    const { frames } = await simulate({
      bootAt: 1690,
      pictures: [{ finishAt: 3750 }],
      stylesAt: 2000,
      fontsAt: 2100,
      parsedAt: 2000,
    })
    const lift = frames.find((f) => f.state === 'lifting')
    expect(lift?.t).toBeGreaterThanOrEqual(3750)
  })

  it('a tab opened in the background never paints the curtain', async () => {
    const { frames } = await simulate({
      bootAt: 100,
      hiddenUntil: 5000,
      pictures: [{ finishAt: 300 }],
      parsedAt: 300,
    })
    expect(frames.some((f) => f.state === 'on' && f.t >= 5000)).toBe(false)
    expect(frames.some((f) => f.state === 'lifting')).toBe(false)
  })

  it('a page with no first-screen pictures is ready on fonts and styles, and still rolls', async () => {
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 9000, lazy: true }],
      stylesAt: 200,
      fontsAt: 200,
      parsedAt: 200,
    })
    const s = summary(frames)
    expect(s.liftAfterAppear).toBeGreaterThanOrEqual(PRELOADER_SHOWPIECE_MS)
    expect(s.liftAfterAppear).toBeLessThan(2000)
  })

  it('a picture that fails counts as finished, not as a wait until the ceiling', async () => {
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 300, failed: true }],
      stylesAt: 200,
      fontsAt: 200,
      parsedAt: 300,
    })
    expect(summary(frames).liftAfterAppear).toBeLessThan(2000)
  })

  it('a never-fetched nomodule script does not hold a fast page to the ceiling', async () => {
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 200 }],
      stylesAt: 180,
      fontsAt: 190,
      parsedAt: 200,
      noModuleScript: true,
    })
    expect(summary(frames).liftAfterAppear).toBeLessThan(2000)
  })

  // Review M3 (13 Nov 2026): on a phone, /products had an eager card picture at 970px on an 844px
  // screen, and the curtain waited for it although nobody could see it.
  it('a picture below the first screen does not hold the curtain (M3)', async () => {
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 200 }, { finishAt: 9000, below: true }],
      stylesAt: 180,
      fontsAt: 190,
      parsedAt: 200,
    })
    expect(summary(frames).liftAfterAppear).toBeLessThan(2000)
  })

  it('a picture ON the first screen still holds it until it is in (M3 control)', async () => {
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 200 }, { finishAt: 2400 }],
      stylesAt: 180,
      fontsAt: 190,
      parsedAt: 200,
    })
    expect(frames.find((f) => f.state === 'lifting')?.t).toBeGreaterThanOrEqual(2400)
  })

  it('never reads layout while it counts (A6)', async () => {
    const { layoutReads } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 1000 }],
      parsedAt: 300,
    })
    expect(layoutReads).toBe(0)
  })
})

describe('a visitor who acts ends the curtain (A5, A8)', () => {
  for (const type of ['keydown', 'pointerdown']) {
    it(`a ${type} during the show finishes the roll and lifts within a quarter second`, async () => {
      const { frames } = await simulate({
        bootAt: 150,
        pictures: [{ finishAt: 9000 }],
        parsedAt: 300,
        act: { at: 700, type },
      })
      const lift = frames.find((f) => f.state === 'lifting')
      expect(lift?.t).toBeLessThanOrEqual(700 + PRELOADER_FINISH_MS + 48)
      expect(lift?.year, 'this year is on screen as it fades (site.css lifting fade)').toBe(
        String(THIS_YEAR),
      )
    })
  }

  it('a tap on the curtain does not pass through to the page under it', async () => {
    const { prevented } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 9000 }],
      parsedAt: 300,
      act: { at: 700, type: 'pointerdown' },
    })
    expect(prevented).toBe(true)
  })
})

/*
 * Review I2 (12 Nov 2026): an error inside one frame stopped the loop, and the curtain's listeners
 * and its `data-preload="on"` stayed for good, eating every later tap and key. The CSS fallback
 * hid the papers, so nothing on screen showed it. Now any error ends the curtain quietly.
 */
describe('a fault inside the show never leaves the curtain holding the page', () => {
  it('ends quietly and lets go of every listener when a frame throws', async () => {
    const { frames, listening } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 9000 }],
      parsedAt: 300,
      breakAt: 700,
    })
    expect(frames.at(-1)?.state).toBe('-')
    expect(listening).toEqual([])
  })

  it('lets go of every listener after a normal lift too', async () => {
    const { listening } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 200 }],
      stylesAt: 180,
      fontsAt: 190,
      parsedAt: 200,
    })
    expect(listening).toEqual([])
  })
})

/*
 * Review M7 (13 Nov 2026): a tab sent to the back mid-show and brought back just after the CSS
 * fallback began its 220 ms exit (3820 ms) was ended at once, cutting that exit short.
 */
describe('a tab back during the fallback exit lets the exit finish (M7)', () => {
  it('does not remove the curtain before the fallback exit has played', async () => {
    const appearAt = 166
    const { frames } = await simulate({
      bootAt: 150,
      pictures: [{ finishAt: 9000 }],
      parsedAt: 300,
      hiddenFrom: 600,
      hiddenUntil: appearAt + PRELOADER_FALLBACK_MS + 80,
    })
    const removed = frames.find((f) => f.t > 600 && f.state === '-')
    expect(removed, 'the curtain never left').toBeDefined()
    expect((removed?.t ?? 0) - appearAt).toBeGreaterThanOrEqual(
      PRELOADER_FALLBACK_MS + PRELOADER_FINISH_MS,
    )
  })
})
