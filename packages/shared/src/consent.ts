/**
 * The cookie choice and the two trackers it gates: Google Analytics and Apollo's website
 * visitor tracker. Shared, because the website (apps/cms) and the garment pages
 * (apps/viewer) are one origin, `wear-run.com`, so one stored choice must cover both.
 *
 * ⚠️ THIS REVERSED A DECISION. Until 2026-09-30 the site set no cookies at all and said so
 * (owner decision 2026-09-07, Cloudflare Web Analytics only). The owner then asked for
 * Google Analytics and Apollo on every page, behind a choice shown to every visitor. The
 * rule that keeps the old promise as true as it can be: NOTHING here runs, and nothing is
 * stored, until a visitor presses Accept. A plain visit still contacts nobody new.
 *
 * ⚠️ NO DOM TYPES, ON PURPOSE. `apps/shrink` compiles this package without the DOM library,
 * so the browser objects are described structurally (`TrackerWindow`, `ConsentStorage`)
 * and the two apps pass their real `window` and `localStorage` in.
 */

/** One key, two possible values. Written only when a visitor presses a button. */
export const CONSENT_STORAGE_KEY = 'run-consent'

export type ConsentChoice = 'accepted' | 'declined'

/**
 * Public site tags, not secrets: both are printed in the page source of any site that uses
 * them. Read from each vendor's own set-up screen on 2026-09-30.
 */
export const GA_MEASUREMENT_ID = 'G-YBY5G3HQLD'
export const APOLLO_APP_ID = '69ddf8fa0fd941000d64bc24'

const GA_SCRIPT = 'https://www.googletagmanager.com/gtag/js'
const APOLLO_SCRIPT = 'https://assets.apollo.io/micro/website-tracker/tracker.iife.js'

/**
 * The hosts each page's Content-Security-Policy must admit for the trackers to work. Both
 * policies (`apps/cms/publicViewerHeaders.mjs`, `apps/viewer/scripts/csp.mjs`) read this
 * list, so the two cannot drift apart.
 *
 * Google's are the ones its own CSP guide for Analytics 4 names; regional collection uses
 * sub-hosts, hence the wildcards. Apollo's were read out of its script on 2026-09-30:
 * loaded from `assets.apollo.io`, reporting to `aplo-evnt.com`.
 *
 * ⚠️ `d-code.liadm.com` IS LEFT OUT DELIBERATELY. Apollo's script loads it (LiveIntent)
 * when Apollo's server says it may, to fetch a hashed copy of the visitor's email address:
 * identifying a person, not a company. The owner chose company-level tracking only. With
 * the host absent the browser refuses that script whatever the server answers; Apollo's
 * code catches the failure and still reports the visit. `consent.test.ts` pins the absence.
 */
export const TRACKER_CSP = {
  script: ['https://www.googletagmanager.com', 'https://assets.apollo.io'],
  connect: [
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.googletagmanager.com',
    'https://aplo-evnt.com',
  ],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
} as const

/** Dispatched on `document` to show the choice again (the privacy page's button does it). */
export const CONSENT_OPEN_EVENT = 'run:consent-open'

/**
 * The words on the choice, in one place so the website and the garment pages cannot say
 * different things. The privacy page (`apps/cms`, `/privacy`) explains the detail; this is
 * the short form a visitor reads before deciding.
 *
 * Approved by the owner on 2026-09-30. It must stay TRUE: it names both companies, says
 * what they learn, and says nothing is stored until the visitor chooses (`consent.test.ts`).
 */
export const CONSENT_COPY = {
  text: 'May we count your visit? If you accept, Google Analytics and Apollo tell us which pages are read and which companies visit. Nothing is stored until you choose.',
  accept: 'Accept',
  decline: 'Decline',
  more: 'Privacy notice',
} as const

/** The part of `Storage` this file uses. */
export interface ConsentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

/**
 * ⚠️ FAILS CLOSED. Only the exact word `accepted` starts a tracker; anything else that is
 * not `declined` reads as "no choice yet", so the visitor is asked again. Same shape as
 * `parseSearchVisibility` in the CMS: a typo can never open what it guards.
 */
export function parseConsent(raw: unknown): ConsentChoice | null {
  return raw === 'accepted' || raw === 'declined' ? raw : null
}

const NO_STORAGE: ConsentStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  key: () => null,
  length: 0,
}

/**
 * The browser's storage, or a stand-in that keeps nothing.
 *
 * ⚠️ TOUCHING `window.localStorage` CAN ITSELF THROW (Safari with storage blocked, some
 * embedded browsers), before any method is called, so the access is what gets wrapped.
 * With the stand-in the visitor is simply asked on each page and nothing is remembered.
 */
export function safeStorage(get: () => ConsentStorage): ConsentStorage {
  try {
    return get() ?? NO_STORAGE
  } catch {
    return NO_STORAGE
  }
}

/** A storage that throws (private mode, blocked storage) reads as no choice. */
export function readConsent(storage: ConsentStorage): ConsentChoice | null {
  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function writeConsent(storage: ConsentStorage, choice: ConsentChoice): void {
  try {
    storage.setItem(CONSENT_STORAGE_KEY, choice)
  } catch {
    /* storage unavailable: the choice still holds for this page view */
  }
}

interface TrackerScript {
  src: string
  async: boolean
  onload: (() => void) | null
}

/** The part of `window` the trackers touch. */
export interface TrackerWindow {
  dataLayer?: unknown[]
  trackingFunctions?: { onLoad(options: { appId: string }): void }
  runTrackersStarted?: boolean
  document: {
    createElement(tag: 'script'): TrackerScript
    head: { appendChild(node: TrackerScript): unknown }
  }
}

function loadScript(win: TrackerWindow, src: string, onload: (() => void) | null = null): void {
  const script = win.document.createElement('script')
  script.src = src
  script.async = true
  script.onload = onload
  win.document.head.appendChild(script)
}

/**
 * Start both trackers. Call ONLY after the visitor has accepted.
 *
 * Both are added from bundled code rather than pasted as the vendors' inline snippets: an
 * inline script would need a hash in the garment pages' policy and a nonce on the website's,
 * and a script this file adds needs neither, only its host (`TRACKER_CSP`).
 *
 * ⚠️ `consent default` IS QUEUED BEFORE `config`, AND THAT ORDER IS THE PRIVACY SETTING.
 * Google reads the default only if it is already in the queue when the tag configures.
 * Analytics is granted because this runs after Accept; the three advertising uses stay
 * denied for good, because the owner wants visitor counts, not advertising.
 */
export function startTrackers(win: TrackerWindow): void {
  if (win.runTrackersStarted) return
  win.runTrackersStarted = true

  const queue: unknown[] = win.dataLayer ?? []
  win.dataLayer = queue
  // gtag.js accepts only real `arguments` objects in this queue; a plain array is ignored.
  function gtag(..._args: unknown[]) {
    // biome-ignore lint/complexity/noArguments: gtag.js requires the Arguments object itself
    queue.push(arguments)
  }
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  gtag('js', new Date())
  gtag('config', GA_MEASUREMENT_ID)
  loadScript(win, `${GA_SCRIPT}?id=${GA_MEASUREMENT_ID}`)

  // Apollo's own snippet adds a random `nocache` value; kept, so its script is never stale.
  const nocache = Math.random().toString(36).substring(7)
  loadScript(win, `${APOLLO_SCRIPT}?nocache=${nocache}`, () => {
    win.trackingFunctions?.onLoad({ appId: APOLLO_APP_ID })
  })
}

/** How `forgetTrackers` reaches cookies, so it can be tested without a browser. */
export interface CookieJar {
  hostname: string
  readCookies(): string
  writeCookie(value: string): void
}

/**
 * Remove what the two trackers stored, for a visitor who accepted and later declines.
 * Withdrawing must undo what accepting did, or "Decline" is only a word.
 *
 * Apollo keeps `apolloAnonId` and keys prefixed with its app id in localStorage (read out of
 * its script, 2026-09-30); Google keeps `_ga` and `_ga_<stream>` cookies. Nothing else is
 * touched: the theme choice and the consent choice itself stay.
 */
export function forgetTrackers(storage: ConsentStorage, jar: CookieJar): void {
  try {
    const doomed: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && (key === 'apolloAnonId' || key.startsWith(`${APOLLO_APP_ID}_`))) doomed.push(key)
    }
    for (const key of doomed) storage.removeItem(key)
  } catch {
    /* storage unavailable: nothing was stored there either */
  }

  try {
    const names = jar
      .readCookies()
      .split(';')
      .map((pair) => pair.split('=')[0]?.trim() ?? '')
      .filter((name) => name === '_ga' || name.startsWith('_ga_'))
    // Google sets these on the registrable domain; expire them there and on the host itself.
    const domains = [jar.hostname, `.${jar.hostname.split('.').slice(-2).join('.')}`]
    for (const name of names) {
      for (const domain of domains) {
        jar.writeCookie(`${name}=; Max-Age=0; Path=/; Domain=${domain}`)
      }
      jar.writeCookie(`${name}=; Max-Age=0; Path=/`)
    }
  } catch {
    /* cookies unavailable */
  }
}

/** The visitor pressed Accept: remember it, then start both trackers. */
export function acceptTrackers(win: TrackerWindow, storage: ConsentStorage): void {
  writeConsent(storage, 'accepted')
  startTrackers(win)
}

/**
 * The visitor pressed Decline: remember it and remove anything the trackers stored.
 *
 * Returns whether the page must be RELOADED. A script that has started cannot be
 * un-started, so a visitor who accepted earlier on this page and now declines gets a fresh
 * page with neither tracker on it. A first-time Decline needs no reload: nothing ran.
 */
export function declineTrackers(
  win: TrackerWindow,
  storage: ConsentStorage,
  jar: CookieJar,
): boolean {
  writeConsent(storage, 'declined')
  forgetTrackers(storage, jar)
  return win.runTrackersStarted === true
}
