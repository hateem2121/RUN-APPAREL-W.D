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
  POSTHOG_API_HOST,
  POSTHOG_PROJECT_TOKEN,
  posthogConfig,
  readConsent,
  restoreTrackers,
  safeStorage,
  startTrackers,
  TRACKER_CSP,
  type TrackerWindow,
  trackerEvent,
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
  // The privacy page names all three; the short form must not say less than is true.
  it('names every company and says nothing is stored before choosing', () => {
    expect(CONSENT_COPY.text).toContain('Google Analytics')
    expect(CONSENT_COPY.text).toContain('Apollo')
    expect(CONSENT_COPY.text).toContain('PostHog')
    expect(CONSENT_COPY.text).toMatch(/nothing is stored until you choose/i)
  })
})

describe('starting the trackers', () => {
  it('loads exactly three scripts: Google Analytics, Apollo and PostHog', () => {
    const { win, scripts } = fakeWindow()
    startTrackers(win)
    expect(scripts.map((s) => s.src.split('?')[0])).toEqual([
      'https://www.googletagmanager.com/gtag/js',
      'https://assets.apollo.io/micro/website-tracker/tracker.iife.js',
      'https://us-assets.i.posthog.com/static/array.js',
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
    expect(scripts).toHaveLength(3)
  })
})

/*
 * POSTHOG'S QUEUE IS THE ONLY THING ITS SCRIPT READS (array.js 1.435.8, 2026-10-04): an array
 * whose `_i` holds `[token, config, name]`, and whose `init` is NOT a function. A real,
 * already-running PostHog has an `init` function, and the script stops when it sees one; a
 * queue shaped that way would load the script and start nothing, silently.
 */
describe('starting PostHog', () => {
  const queueOf = (hostname?: string) => {
    const { win } = fakeWindow()
    if (hostname !== undefined) win.location = { hostname }
    startTrackers(win)
    return win.posthog as unknown[] & { _i: unknown[][]; people: unknown[]; init?: unknown }
  }

  it('leaves the queue its script reads: an array, `_i` = [[token, config, "posthog"]]', () => {
    const queue = queueOf('wear-run.com')
    expect(Array.isArray(queue)).toBe(true)
    expect(queue._i).toEqual([[POSTHOG_PROJECT_TOKEN, posthogConfig('wear-run.com'), 'posthog']])
    expect(queue.people).toEqual([])
    expect(typeof queue.init).not.toBe('function')
  })

  it('sends to the US project the owner chose', () => {
    expect(POSTHOG_API_HOST).toBe('https://us.i.posthog.com')
    expect(POSTHOG_PROJECT_TOKEN).toMatch(/^phc_[A-Za-z0-9]+$/)
  })

  it('on wear-run.com it records, with typing hidden and no errors, surveys or profiles', () => {
    expect(posthogConfig('wear-run.com')).toEqual({
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
      capture_exceptions: false,
      disable_surveys: true,
      session_recording: { maskAllInputs: true },
    })
  })

  // Same rule as Google's `traffic_type: internal`, and the same lesson of 2026-09-30.
  it('anywhere else it is opted out from the start and never records', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      'viewer.wear-run.help',
      'www.wear-run.com',
      'wear-run.com.evil.example',
      undefined,
    ]) {
      const config = posthogConfig(host)
      expect(config.opt_out_capturing_by_default, String(host)).toBe(true)
      expect(config.disable_session_recording, String(host)).toBe(true)
      // Everything else, the privacy settings included, is the same as on the real site.
      expect(config.session_recording).toEqual({ maskAllInputs: true })
      expect(config.capture_exceptions).toBe(false)
    }
    // The negative control: the real site is NOT opted out, or the check above proves nothing.
    expect(posthogConfig('wear-run.com').opt_out_capturing_by_default).toBeUndefined()
  })

  it('the queue a page builds carries that page’s own host rule', () => {
    expect(queueOf('localhost')._i[0]?.[1]).toEqual(posthogConfig('localhost'))
    expect(queueOf()._i[0]?.[1]).toEqual(posthogConfig(undefined))
  })
})

describe('a named event for Google (polish S10, the key event `ask_about_garment`)', () => {
  const events = (win: TrackerWindow) =>
    (win.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((entry) => entry[0] === 'event')

  it('is queued once the visitor accepted and the tag is running', () => {
    const { win } = fakeWindow()
    startTrackers(win)
    trackerEvent(win, 'ask_about_garment', { garment_code: 'R-XMP', colour: 'Wine' })
    expect(events(win)).toEqual([
      ['event', 'ask_about_garment', { garment_code: 'R-XMP', colour: 'Wine' }],
    ])
  })

  it('queues nothing before Accept, so no event waits for a tag a later Accept starts', () => {
    const { win } = fakeWindow()
    trackerEvent(win, 'ask_about_garment')
    expect(win.dataLayer).toBeUndefined()
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

  it('removes what PostHog stored, in storage and in cookies, and nothing else', () => {
    const persistence = `ph_${POSTHOG_PROJECT_TOKEN}_posthog`
    const storage = fakeStorage({
      [persistence]: '{"distinct_id":"x"}',
      [`__ph_opt_in_out_${POSTHOG_PROJECT_TOKEN}`]: '1',
      'run-theme': 'dark',
      // A name that merely CONTAINS the prefix is someone else's and must stay.
      graph_ph_note: 'keep',
      [CONSENT_STORAGE_KEY]: 'declined',
    })
    const cookies: string[] = []
    forgetTrackers(storage, {
      hostname: 'wear-run.com',
      readCookies: () => `${persistence}=%7B%7D; other=1`,
      writeCookie: (value) => void cookies.push(value),
    })
    expect([...storage.data.keys()].sort()).toEqual(
      [CONSENT_STORAGE_KEY, 'graph_ph_note', 'run-theme'].sort(),
    )
    // Expired on the registrable domain, where PostHog sets it, as well as on the host.
    expect(cookies).toContain(`${persistence}=; Max-Age=0; Path=/; Domain=.wear-run.com`)
    expect(cookies.some((c) => c.startsWith('other='))).toBe(false)
  })
})

describe('the hosts the security policy must admit', () => {
  it('names Google, Apollo and PostHog, each host exactly', () => {
    expect(TRACKER_CSP.script).toEqual([
      'https://www.googletagmanager.com',
      'https://assets.apollo.io',
      'https://us-assets.i.posthog.com',
    ])
    expect(TRACKER_CSP.connect).toContain('https://us.i.posthog.com')
    expect(TRACKER_CSP.connect).toContain('https://us-assets.i.posthog.com')
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

  /*
   * PostHog's own guide suggests `*.posthog.com`. As a SCRIPT source that admits code served
   * for any PostHog project, an attacker's included (commit review, 2026-10-04). Its script
   * loads code from one host only, so the policy names that host and nothing wider.
   */
  it('admits PostHog by its exact hosts, never by a wildcard', () => {
    const all = [...TRACKER_CSP.script, ...TRACKER_CSP.connect, ...TRACKER_CSP.img].join(' ')
    expect(all).not.toMatch(/\*\.(i\.)?posthog\.com/)
    expect(TRACKER_CSP.script.filter((host) => host.includes('posthog'))).toEqual([
      'https://us-assets.i.posthog.com',
    ])
  })

  it('never uses a bare wildcard or a scheme-only source', () => {
    for (const host of [...TRACKER_CSP.script, ...TRACKER_CSP.connect, ...TRACKER_CSP.img]) {
      expect(host).toMatch(/^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/)
    }
  })
})

describe('the two buttons', () => {
  const jar = { hostname: 'wear-run.com', readCookies: () => '', writeCookie: () => {} }

  it('Accept remembers the choice and starts the three trackers', () => {
    const { win, scripts } = fakeWindow()
    const storage = fakeStorage()
    acceptTrackers(win, storage)
    expect(readConsent(storage)).toBe('accepted')
    expect(scripts).toHaveLength(3)
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

// Polish audit X13: Back or Forward can restore a page exactly as it was left, so a choice made
// on another page in between must be caught up on (`restoreTrackers`, called on `pageshow`).
describe('a page brought back by Back or Forward', () => {
  const jar = { hostname: 'wear-run.com', readCookies: () => '', writeCookie: () => {} }
  const pageViews = (win: TrackerWindow) =>
    (win.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view').length

  it('still unanswered: the question stays, nothing starts', () => {
    const { win, scripts } = fakeWindow()
    expect(restoreTrackers(win, fakeStorage(), jar)).toEqual({ answered: false, reload: false })
    expect(scripts).toHaveLength(0)
  })

  it('accepted on another page since: the three trackers start here, and the question closes', () => {
    const { win, scripts } = fakeWindow()
    const storage = fakeStorage({ [CONSENT_STORAGE_KEY]: 'accepted' })
    expect(restoreTrackers(win, storage, jar)).toEqual({ answered: true, reload: false })
    expect(scripts).toHaveLength(3)
  })

  it('accepted and already running: the restore is counted once, and nothing loads twice', () => {
    const { win, scripts } = fakeWindow()
    const storage = fakeStorage()
    acceptTrackers(win, storage)
    expect(pageViews(win)).toBe(0)
    restoreTrackers(win, storage, jar)
    expect(pageViews(win)).toBe(1)
    expect(scripts).toHaveLength(3)
    const last = win.dataLayer?.at(-1)
    expect(Object.prototype.toString.call(last)).toBe('[object Arguments]')
  })

  it('declined on another page since, with Google running here: asks for a reload', () => {
    const { win } = fakeWindow()
    const storage = fakeStorage()
    acceptTrackers(win, storage)
    writeConsent(storage, 'declined')
    expect(restoreTrackers(win, storage, jar)).toEqual({ answered: true, reload: true })
    expect(pageViews(win)).toBe(0)
  })

  it('declined, nothing running: clears what the trackers stored again, no reload', () => {
    const { win, scripts } = fakeWindow()
    const storage = fakeStorage({ [CONSENT_STORAGE_KEY]: 'declined', apolloAnonId: 'x' })
    expect(restoreTrackers(win, storage, jar)).toEqual({ answered: true, reload: false })
    expect(storage.getItem('apolloAnonId')).toBeNull()
    expect(scripts).toHaveLength(0)
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

/*
 * VISITS THAT ARE NOT REAL VISITORS MUST NOT BE COUNTED (2026-09-30). Read out of the
 * owner's Analytics that day, before the site had even deployed the tag: 13 "users" and 15
 * page views, every one from hostName `localhost`, which was this project's own checking.
 * Anywhere that is not the real site marks itself `traffic_type: internal`, the parameter
 * Google Analytics' own internal-traffic filter drops.
 */
describe('only the real site counts as a real visit', () => {
  const config = (hostname?: string) => {
    const { win } = fakeWindow()
    if (hostname !== undefined) win.location = { hostname }
    startTrackers(win)
    const entry = (win.dataLayer ?? [])
      .map((e) => Array.from(e as ArrayLike<unknown>))
      .find((e) => e[0] === 'config')
    return entry
  }

  it('on wear-run.com the visit is sent as it is', () => {
    expect(config('wear-run.com')).toEqual(['config', GA_MEASUREMENT_ID])
  })

  it('anywhere else it is marked internal: a developer’s machine, a preview, the old host', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      'viewer.wear-run.help',
      'www.wear-run.com',
      'wear-run.com.evil.example',
    ]) {
      expect(config(host), host).toEqual([
        'config',
        GA_MEASUREMENT_ID,
        { traffic_type: 'internal' },
      ])
    }
  })

  it('an unknown place is internal too: the safe direction is to count too little', () => {
    expect(config()).toEqual(['config', GA_MEASUREMENT_ID, { traffic_type: 'internal' }])
  })
})
