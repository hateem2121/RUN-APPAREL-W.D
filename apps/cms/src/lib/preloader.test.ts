import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CURTAIN_TIMING,
  counterYear,
  curtainPercent,
  liftReason,
  PRELOADER_BOOT_SCRIPT,
  PRELOADER_CEILING_MS,
  PRELOADER_FALLBACK_MS,
  PRELOADER_FINISH_MS,
  PRELOADER_SHOWPIECE_MS,
  stepShown,
} from './preloader'

/**
 * The /about preloader's decision (as the owner ruled on 2026-10-09: "No saving:
 * arriving from outside"). The pre-paint script is run here against stand-in browsers, so each
 * reason it must stay hidden is proved, and so is the one case that shows it.
 */
type Visit = {
  webdriver?: boolean
  reducedMotion?: boolean
  navigation?: string | null
  referrer?: string
  host?: string
}

function run(visit: Visit): { shown: boolean; stored: number } {
  const attributes = new Map<string, string>()
  let stored = 0
  const storage = {
    setItem: () => {
      stored += 1
    },
    getItem: () => null,
  }
  const scope = {
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
      referrer: visit.referrer ?? '',
    },
    navigator: { webdriver: visit.webdriver ?? false },
    matchMedia: (query: string) => ({
      matches: query.includes('reduce') ? (visit.reducedMotion ?? false) : false,
    }),
    performance: {
      getEntriesByType: () =>
        visit.navigation === null ? [] : [{ type: visit.navigation ?? 'navigate' }],
    },
    location: { host: visit.host ?? 'wear-run.com' },
    URL,
    sessionStorage: storage,
    localStorage: storage,
  }
  new Function(...Object.keys(scope), PRELOADER_BOOT_SCRIPT)(...Object.values(scope))
  return { shown: attributes.get('data-preload') === 'on', stored }
}

describe('the /about preloader decides before the first paint', () => {
  it('shows for a visitor arriving from a search, another site, or a typed address', () => {
    expect(run({ referrer: 'https://www.google.com/' }).shown).toBe(true)
    expect(run({ referrer: 'https://www.linkedin.com/feed/' }).shown).toBe(true)
    expect(run({ referrer: '' }).shown).toBe(true)
  })

  it('stays hidden when coming from another page of the site', () => {
    expect(run({ referrer: 'https://wear-run.com/products' }).shown).toBe(false)
  })

  it('stays hidden on a reload or a step back, never under reduced motion or automation', () => {
    expect(run({ navigation: 'reload' }).shown).toBe(false)
    expect(run({ navigation: 'back_forward' }).shown).toBe(false)
    expect(run({ reducedMotion: true }).shown).toBe(false)
    expect(run({ webdriver: true }).shown).toBe(false)
  })

  it('stores nothing on the device, whatever it decides (the privacy page promises it)', () => {
    for (const visit of [{}, { navigation: 'reload' }, { referrer: 'https://wear-run.com/' }]) {
      expect(run(visit).stored).toBe(0)
    }
    expect(PRELOADER_BOOT_SCRIPT).not.toMatch(/Storage|cookie/)
  })

  it('is a constant: nothing a visitor or the CMS sends can reach it', () => {
    // Built like themeBoot.ts: no template holes, so CodeQL has no input to trace into it.
    expect(PRELOADER_BOOT_SCRIPT).not.toMatch(/\$\{/)
  })

  // NEGATIVE CONTROL: a script that skipped the referrer check would show from inside the site.
  it('sees the fault: without the referrer check it would show from the site itself', () => {
    const broken = PRELOADER_BOOT_SCRIPT.replace(/if\(r\)/, 'if(false)')
    expect(broken, 'the planted fault did not land').not.toBe(PRELOADER_BOOT_SCRIPT)
    const attributes = new Map<string, string>()
    new Function('document', 'navigator', 'matchMedia', 'performance', 'location', 'URL', broken)(
      {
        documentElement: { setAttribute: (n: string, v: string) => attributes.set(n, v) },
        referrer: 'https://wear-run.com/products',
      },
      { webdriver: false },
      () => ({ matches: false }),
      { getEntriesByType: () => [{ type: 'navigate' }] },
      { host: 'wear-run.com' },
      URL,
    )
    expect(attributes.get('data-preload')).toBe('on')
  })
})

describe('the roll never jumps and never runs backwards', () => {
  it('needs the whole showpiece to go from 1889 to this year, in 16 ms frames', () => {
    let shown = 0
    let frames = 0
    while (shown < 1 && frames < 1000) {
      const next = stepShown(shown, 1, 16, false, CURTAIN_TIMING)
      expect(next).toBeGreaterThanOrEqual(shown)
      shown = next
      frames += 1
    }
    expect(frames * 16).toBeGreaterThanOrEqual(PRELOADER_SHOWPIECE_MS)
  })

  it('finishes what is left within the finish time once capped', () => {
    let shown = 0.3
    let spent = 0
    while (shown < 1 && spent < 1000) {
      shown = stepShown(shown, 1, 16, true, CURTAIN_TIMING)
      spent += 16
    }
    expect(spent).toBeLessThanOrEqual(PRELOADER_FINISH_MS + 16)
  })

  it('never moves back when real progress is lower than what is shown', () => {
    expect(stepShown(0.6, 0.4, 16, false, CURTAIN_TIMING)).toBe(0.6)
  })

  it('shows the year and the percent from the same value, landing together', () => {
    expect(counterYear(0, 1889, 2026)).toBe(1889)
    expect(counterYear(1, 1889, 2026)).toBe(2026)
    expect(counterYear(0.5, 1889, 2026)).toBe(1958)
    expect(curtainPercent(0)).toBe(0)
    expect(curtainPercent(1)).toBe(100)
    expect(curtainPercent(0.954)).toBe(95)
  })
})

describe('when the curtain lifts, counted from when it appears', () => {
  const at = (sinceAppearMs: number, ready: boolean, shown: number, interacted = false) =>
    liftReason({ sinceAppearMs, ready, shown, interacted }, CURTAIN_TIMING)

  it('never before the whole roll has played, even when the page is ready at once', () => {
    expect(at(800, true, 1)).toBe(null)
    expect(at(PRELOADER_SHOWPIECE_MS, true, 1)).toBe('ready')
  })

  it('never while the year is still rolling', () => {
    expect(at(2000, true, 0.9)).toBe(null)
    expect(at(PRELOADER_CEILING_MS, false, 0.97)).toBe(null)
  })

  it('at the ceiling once the last year is on screen, ready or not', () => {
    expect(at(PRELOADER_CEILING_MS, false, 1)).toBe('cap')
  })

  it('at once when the visitor acts and the roll has finished', () => {
    expect(at(300, false, 1, true)).toBe('interaction')
  })
})

describe('the shipped script runs the tested functions', () => {
  it('each function works with nothing from its module, as it will inline', () => {
    for (const fn of [stepShown, liftReason, counterYear, curtainPercent]) {
      const alone = new Function(`return (${String(fn)})`)() as (...a: unknown[]) => unknown
      expect(() => alone(0.5, 1, 16, false, CURTAIN_TIMING)).not.toThrow()
    }
    expect(PRELOADER_BOOT_SCRIPT).toContain(String(stepShown))
    expect(PRELOADER_BOOT_SCRIPT).toContain(String(liftReason))
  })
})

describe("the CSS fallback lifts after the script's ceiling and finish", () => {
  it('site.css delays the fallback curtain by exactly PRELOADER_FALLBACK_MS', () => {
    const css = readFileSync(
      join(import.meta.dirname, '..', 'app', '(frontend)', 'site.css'),
      'utf8',
    )
    const rule = /html\[data-preload="on"\] \.preloader__lockup \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule, 'the fallback rule was not found, so nothing was measured').not.toBe('')
    expect(/animation-delay:\s*(\d+)ms/.exec(rule)?.[1]).toBe(String(PRELOADER_FALLBACK_MS))
    expect(PRELOADER_FALLBACK_MS).toBe(PRELOADER_CEILING_MS + PRELOADER_FINISH_MS + 600)
  })
})
