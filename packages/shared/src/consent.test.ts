import { describe, expect, it } from 'vitest'
import {
  acceptTrackers,
  APOLLO_APP_ID,
  CONSENT_COPY,
  CONSENT_STORAGE_KEY,
  declineTrackers,
  forgetTrackers,
  GA_MEASUREMENT_ID,
  parseConsent,
  readConsent,
  safeStorage,
  startTrackers,
  TRACKER_CSP,
  type TrackerWindow,
  writeConsent,
} from './consent'

/** A Storage that behaves like the browser's, small enough to read in one glance. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  }
}

/** A window with only what `startTrackers` touches; records every script it is asked to load. */
function fakeWindow() {
  const scripts: { src: string; async: boolean; onload: (() => void) | null }[] = []
  const win: TrackerWindow = {
    document: {
      createElement: () => {
        const script = { src: '', async: false, onload: null }
        scripts.push(script)
        return script
      },
      head: { appendChild: (node) => node },
    },
  }
  return { win, scripts }
}

describe('the stored choice', () => {
  it('reads back only the two words it writes', () => {
    expect(parseConsent('accepted')).toBe('accepted')
    expect(parseConsent('declined')).toBe('declined')
  })

  /*
   * FAILS CLOSED. Anything that is not exactly `accepted` must never start a tracker: a
   * half-written value, another script's junk under the same key, or a future format this
   * build does not know. `null` means "ask again", which is the safe reading.
   */
  it.each([null, undefined, '', 'true', 'ACCEPTED', 'accepted ', '{"choice":"accepted"}', 1])(
    'treats %j as no choice at all',
    (raw) => {
      expect(parseConsent(raw)).toBeNull()
    },
  )

  it('round-trips through storage', () => {
    const storage = fakeStorage()
    expect(readConsent(storage)).toBeNull()
    writeConsent(storage, 'declined')
    expect(storage.data.get(CONSENT_STORAGE_KEY)).toBe('declined')
    expect(readConsent(storage)).toBe('declined')
  })

  // Safari's private mode and a blocked-storage setting both THROW on access.
  it('a storage that throws reads as no choice, and writing to it does not throw', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
      key: () => null,
      length: 0,
    }
    expect(readConsent(broken)).toBeNull()
    expect(() => writeConsent(broken, 'accepted')).not.toThrow()
  })
})

describe('reaching the browser storage', () => {
  it('hands back the real storage when it can be reached', () => {
    const storage = fakeStorage()
    expect(safeStorage(() => storage)).toBe(storage)
  })

  // Safari with storage blocked throws on the property access itself.
  it('hands back a stand-in that keeps nothing when reaching it throws', () => {
    const storage = safeStorage(() => {
      throw new Error('SecurityError')
    })
    writeConsent(storage, 'accepted')
    expect(readConsent(storage)).toBeNull()
  })
})

describe('the words on the choice', () => {
  // The privacy page names both; the short form must not say less than is true.
  it('names both companies and says nothing is stored before choosing', () => {
    expect(CONSENT_COPY.text).toContain('Google Analytics')
    expect(CONSENT_COPY.text).toContain('Apollo')
    expect(CONSENT_COPY.text).toMatch(/nothing is stored until you choose/i)
  })
})

describe('starting the trackers', () => {
  it('loads exactly two scripts: Google Analytics and Apollo', () => {
    const { win, scripts } = fakeWindow()
    startTrackers(win)
    expect(scripts.map((s) => s.src.split('?')[0])).toEqual([
      'https://www.googletagmanager.com/gtag/js',
      'https://assets.apollo.io/micro/website-tracker/tracker.iife.js',
    ])
    expect(scripts[0]?.src).toContain(`id=${GA_MEASUREMENT_ID}`)
    expect(scripts.every((s) => s.async)).toBe(true)
  })

  /*
   * ⚠️ THE ORDER OF THE QUEUE IS THE PRIVACY SETTING. Google reads `consent default` only if
   * it is queued BEFORE `config`; queued after, the tag has already run with everything
   * granted. Advertising stays denied for good: the owner asked for visitor counts, not ads.
   */
  it('queues consent before config, with analytics granted and every advertising use denied', () => {
    const { win } = fakeWindow()
    startTrackers(win)
    const queue = (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
    const names = queue.map((entry) => entry[0])
    expect(names.indexOf('consent')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('consent')).toBeLessThan(names.indexOf('config'))
    expect(queue.find((entry) => entry[0] === 'consent')).toEqual([
      'consent',
      'default',
      {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ])
    expect(queue.find((entry) => entry[0] === 'config')?.[1]).toBe(GA_MEASUREMENT_ID)
  })

  // gtag.js ignores plain arrays: each queue entry must be a real `arguments` object.
  it('queues `arguments` objects, which is the only shape gtag.js accepts', () => {
    const { win } = fakeWindow()
    startTrackers(win)
    for (const entry of win.dataLayer ?? []) {
      expect(Array.isArray(entry)).toBe(false)
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]')
    }
  })

  it('hands Apollo its app id once its script has loaded, and not before', () => {
    const { win, scripts } = fakeWindow()
    const seen: string[] = []
    startTrackers(win)
    win.trackingFunctions = { onLoad: ({ appId }) => void seen.push(appId) }
    expect(seen).toEqual([])
    scripts[1]?.onload?.()
    expect(seen).toEqual([APOLLO_APP_ID])
  })

  // A second Accept click, or two banners on one page, must not double-count every visit.
  it('does nothing the second time', () => {
    const { win, scripts } = fakeWindow()
    startTrackers(win)
    startTrackers(win)
    expect(scripts).toHaveLength(2)
  })
})

describe('forgetting the trackers', () => {
  it('removes what Apollo and Google stored, and nothing else', () => {
    const storage = fakeStorage({
      apolloAnonId: 'x',
      [`${APOLLO_APP_ID}_eventQueue`]: '[]',
      [`${APOLLO_APP_ID}_canTrack`]: '{}',
      'run-theme': 'dark',
      [CONSENT_STORAGE_KEY]: 'declined',
    })
    const cookies: string[] = []
    forgetTrackers(storage, {
      hostname: 'wear-run.com',
      readCookies: () => '_ga=GA1.1.1; _ga_YBY5G3HQLD=GS2.1; other=1',
      writeCookie: (value) => void cookies.push(value),
    })
    expect([...storage.data.keys()].sort()).toEqual([CONSENT_STORAGE_KEY, 'run-theme'].sort())
    expect(cookies.filter((c) => c.startsWith('_ga=')).length).toBeGreaterThan(0)
    expect(cookies.filter((c) => c.startsWith('_ga_YBY5G3HQLD=')).length).toBeGreaterThan(0)
    expect(cookies.some((c) => c.startsWith('other='))).toBe(false)
    expect(cookies.every((c) => c.includes('Max-Age=0'))).toBe(true)
  })
})

describe('the hosts the security policy must admit', () => {
  it('names Google and Apollo, each host exactly', () => {
    expect(TRACKER_CSP.script).toEqual([
      'https://www.googletagmanager.com',
      'https://assets.apollo.io',
    ])
    expect(TRACKER_CSP.connect).toContain('https://aplo-evnt.com')
  })

  /*
   * ⚠️ THE ABSENCE IS THE POINT. Apollo's script can load LiveIntent's (`d-code.liadm.com`)
   * to fetch a hashed copy of the visitor's email address, which is identifying a PERSON.
   * The owner chose company-level tracking only (2026-09-30), and leaving this host out of
   * the policy is what makes the browser enforce that whatever Apollo's server decides.
   */
  it('does NOT admit LiveIntent, so a visitor is never identified as a person', () => {
    const all = [...TRACKER_CSP.script, ...TRACKER_CSP.connect, ...TRACKER_CSP.img].join(' ')
    expect(all).not.toMatch(/liadm/)
  })

  it('never uses a bare wildcard or a scheme-only source', () => {
    for (const host of [...TRACKER_CSP.script, ...TRACKER_CSP.connect, ...TRACKER_CSP.img]) {
      expect(host).toMatch(/^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/)
    }
  })
})

describe('the two buttons', () => {
  const jar = { hostname: 'wear-run.com', readCookies: () => '', writeCookie: () => {} }

  it('Accept remembers the choice and starts both trackers', () => {
    const { win, scripts } = fakeWindow()
    const storage = fakeStorage()
    acceptTrackers(win, storage)
    expect(readConsent(storage)).toBe('accepted')
    expect(scripts).toHaveLength(2)
  })

  it('a first Decline remembers the choice, starts nothing and needs no reload', () => {
    const { win, scripts } = fakeWindow()
    const storage = fakeStorage()
    expect(declineTrackers(win, storage, jar)).toBe(false)
    expect(readConsent(storage)).toBe('declined')
    expect(scripts).toHaveLength(0)
  })

  // A started script cannot be stopped, so withdrawing on the same page asks for a reload.
  it('a Decline after Accept clears what was stored and asks for a reload', () => {
    const { win } = fakeWindow()
    const storage = fakeStorage()
    acceptTrackers(win, storage)
    storage.setItem('apolloAnonId', 'x')
    expect(declineTrackers(win, storage, jar)).toBe(true)
    expect(readConsent(storage)).toBe('declined')
    expect(storage.getItem('apolloAnonId')).toBeNull()
  })
})

describe('when the browser gives no storage and no cookies', () => {
  const noStorage = () =>
    safeStorage(() => {
      throw new Error('SecurityError')
    })

  // The stand-in must answer every method the real one has, or a Decline would throw.
  it('the stand-in storage answers every call and keeps nothing', () => {
    const storage = noStorage()
    storage.setItem('anything', 'x')
    storage.removeItem('anything')
    expect(storage.getItem('anything')).toBeNull()
    expect(storage.key(0)).toBeNull()
    expect(storage.length).toBe(0)
  })

  it('Decline still works, and asks for no reload, when nothing can be stored or read', () => {
    const { win } = fakeWindow()
    const jar = {
      hostname: 'wear-run.com',
      readCookies: () => {
        throw new Error('cookies blocked')
      },
      writeCookie: () => {},
    }
    expect(() => declineTrackers(win, noStorage(), jar)).not.toThrow()
    expect(declineTrackers(win, noStorage(), jar)).toBe(false)
  })

  it('forgetting survives a storage whose every method throws', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => {
        throw new Error('denied')
      },
      length: 3,
    }
    const jar = { hostname: 'wear-run.com', readCookies: () => '', writeCookie: () => {} }
    expect(() => forgetTrackers(hostile, jar)).not.toThrow()
  })
})
