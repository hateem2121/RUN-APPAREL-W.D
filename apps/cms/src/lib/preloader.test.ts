import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  counterYear,
  PRELOADER_BOOT_SCRIPT,
  PRELOADER_CEILING_MS,
  PRELOADER_FLOOR_MS,
  preloaderLiftAt,
} from './preloader'

/**
 * The /about preloader's decision (BUILD 8.4, as the owner ruled on 2026-10-09: "No saving:
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

describe('when the curtain lifts', () => {
  it('waits the count-up length when the photo is ready early, never less than the floor', () => {
    expect(preloaderLiftAt({ decodedAt: 300, showpiece: 1400 })).toBe(1400)
    expect(preloaderLiftAt({ decodedAt: 0, showpiece: 400 })).toBe(PRELOADER_FLOOR_MS)
  })

  it('waits for a slow photo, but never past 2.2 s', () => {
    expect(preloaderLiftAt({ decodedAt: 1800, showpiece: 1400 })).toBe(1800)
    expect(preloaderLiftAt({ decodedAt: 9000, showpiece: 1400 })).toBe(2200)
    expect(preloaderLiftAt({ decodedAt: null, showpiece: 1400 })).toBe(2200)
  })
})

describe('the counter keeps pace with the lift', () => {
  it('starts at 1889, reaches this year exactly at the lift, and never runs backwards', () => {
    expect(counterYear({ elapsed: 0, liftAt: 1400, to: 2026 })).toBe(1889)
    expect(counterYear({ elapsed: 1400, liftAt: 1400, to: 2026 })).toBe(2026)
    expect(counterYear({ elapsed: 5000, liftAt: 1400, to: 2026 })).toBe(2026)
    let previous = 1889
    for (let t = 0; t <= 1400; t += 50) {
      const year = counterYear({ elapsed: t, liftAt: 1400, to: 2026 })
      expect(year).toBeGreaterThanOrEqual(previous)
      previous = year
    }
  })

  it('moves fast first and settles into the year, as the count-up does (ease-out)', () => {
    expect(counterYear({ elapsed: 700, liftAt: 1400, to: 2026 })).toBeGreaterThan(1889 + 137 / 2)
  })
})

describe("the CSS fallback lifts at the script's ceiling", () => {
  it('site.css delays the fallback curtain by exactly PRELOADER_CEILING_MS', () => {
    const css = readFileSync(
      join(import.meta.dirname, '..', 'app', '(frontend)', 'site.css'),
      'utf8',
    )
    const rule = /html\[data-preload="on"\] \.preloader \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule, 'the fallback rule was not found, so nothing was measured').not.toBe('')
    expect(/animation-delay:\s*(\d+)ms/.exec(rule)?.[1]).toBe(String(PRELOADER_CEILING_MS))
  })
})
