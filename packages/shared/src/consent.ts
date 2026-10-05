/**
 * The cookie choice and the three trackers it gates: Google Analytics, Apollo's website
 * visitor tracker and PostHog. Shared, because the website (apps/cms) and the garment pages
 * (apps/viewer) are one origin, `wear-run.com`, so one stored choice must cover both.
 *
 * PostHog joined on 2026-10-04 (owner decision) for ONE job the other two cannot do: session
 * replay and heatmaps, i.e. seeing HOW a buyer uses the 3D page, not just that they came. It
 * had been evaluated and dropped on 2026-08-25 as a fourth layer of counting on a site with
 * no cookies; the cookie question of 2026-09-30 removed the second half of that reason.
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

/**
 * PostHog's project token: public by design, like the two above. PostHog's docs call it "a
 * public, client-side key", "safe to expose in client-side code" and write-only: it can send
 * events, never read them (posthog.com/docs/feature-flags/installation, read 2026-10-04). The
 * project is on PostHog's US cloud, read through its own API on 2026-10-04; the owner chose to
 * keep it there.
 */
export const POSTHOG_PROJECT_TOKEN = 'phc_koNg9SmLSye49u8trEjUf9kd5cTYUveERNRDYKbW9p5y'
export const POSTHOG_API_HOST = 'https://us.i.posthog.com'

const GA_SCRIPT = 'https://www.googletagmanager.com/gtag/js'
const APOLLO_SCRIPT = 'https://assets.apollo.io/micro/website-tracker/tracker.iife.js'
// The file PostHog's own snippet loads: its `api_host` with `.i.` turned into `-assets.i.`.
const POSTHOG_SCRIPT = 'https://us-assets.i.posthog.com/static/array.js'

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
 *
 * PostHog's are its two exact hosts. Read in its script (array.js 1.435.8, 2026-10-04): every
 * piece of CODE it loads (itself, the replay recorder, the project's `/array/<token>/config.js`)
 * comes from `us-assets.i.posthog.com`, and it SENDS to `us.i.posthog.com`.
 *
 * ⚠️ NOT THE `*.posthog.com` ITS OWN CSP GUIDE SUGGESTS. A script source of every PostHog host
 * would admit code served for ANY PostHog project, an attacker's included, which turns an
 * injection on this site into a way round the policy. The commit review of 2026-10-04 flagged
 * it, and the hosts above are all the script uses. If PostHog ever moves them, replay stops (and
 * on the garment pages the policy reports the block to Sentry): a failure, never a silent widening.
 *
 * Its recorder starts a worker from a `blob:` address; both pages' `worker-src 'self' blob:`
 * already allows that, for the 3D decoders.
 */
export const TRACKER_CSP = {
  script: [
    'https://www.googletagmanager.com',
    'https://assets.apollo.io',
    'https://us-assets.i.posthog.com',
  ],
  connect: [
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.googletagmanager.com',
    'https://aplo-evnt.com',
    'https://us.i.posthog.com',
    'https://us-assets.i.posthog.com',
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
 * Approved by the owner on 2026-09-30, and with PostHog named on 2026-10-04. It must stay
 * TRUE: it names every company, says what they learn, and says nothing is stored until the
 * visitor chooses (`consent.test.ts`).
 */
export const CONSENT_COPY = {
  text: 'May we count your visit? If you accept, Google Analytics, Apollo and PostHog tell us which pages are read, which companies visit, and how our 3D viewer is used. Nothing is stored until you choose.',
  accept: 'Accept',
  decline: 'Decline',
  more: 'Privacy notice',
  /**
   * The footer link that brings the question back, on every page of both hosts. It sends
   * `CONSENT_OPEN_EVENT` as a CANCELABLE event and the banner cancels it, so the link can
   * tell "a question opened here" (stay put) from "nothing was listening" (an automated
   * browser, where the banner is absent on purpose): then it goes to `/privacy#cookies`
   * as an ordinary link. A control that silently did nothing would be the worst way to
   * fail at "withdrawing is as easy as giving".
   */
  change: 'Cookies',
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
  /** PostHog's queue until its script arrives; its script replaces it with the real thing. */
  posthog?: unknown
  runTrackersStarted?: boolean
  document: {
    createElement(tag: 'script'): TrackerScript
    head: { appendChild(node: TrackerScript): unknown }
  }
  /** Where the page is being served from; absent in a test that does not care. */
  location?: { hostname: string }
}

/** The one hostname whose visits are real visitors'. Every other host forwards here. */
export const LIVE_HOSTNAME = 'wear-run.com'

function loadScript(win: TrackerWindow, src: string, onload: (() => void) | null = null): void {
  const script = win.document.createElement('script')
  script.src = src
  script.async = true
  script.onload = onload
  win.document.head.appendChild(script)
}

/**
 * What PostHog is started with. Every privacy setting is written here rather than left to
 * PostHog's project settings, so a click in its dashboard cannot widen what this site sends.
 *
 * - `defaults` is the settings snapshot PostHog's install guide names (read 2026-10-04).
 * - `person_profiles: 'identified_only'`: this site never names a visitor, so no person
 *   profile is ever made. Visits stay anonymous.
 * - `capture_exceptions: false`: errors are Sentry's job. The project setting had exception
 *   capture ON; an explicit `false` here wins over it (read in array.js 1.435.8: the
 *   project's value is used only when this one is left out).
 * - `disable_surveys: true`: no survey is planned, so its script is never fetched.
 * - `maskAllInputs`: what a visitor types into the contact form is replaced with `*` in the
 *   browser, before anything is sent. It is PostHog's default; stated so it cannot be lost.
 *
 * ⚠️ ONLY THE REAL SITE IS RECORDED, the rule `startTrackers` applies to Google below.
 * Anywhere else PostHog still loads (so a browser test can see that Accept started it) but
 * is opted out from the first moment and never records: nothing is sent from a developer's
 * machine or a test run. An unknown host counts as "elsewhere".
 */
export function posthogConfig(hostname: string | undefined): Record<string, unknown> {
  const config: Record<string, unknown> = {
    api_host: POSTHOG_API_HOST,
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    capture_exceptions: false,
    disable_surveys: true,
    session_recording: { maskAllInputs: true },
  }
  if (hostname === LIVE_HOSTNAME) return config
  return { ...config, opt_out_capturing_by_default: true, disable_session_recording: true }
}

/**
 * Start the three trackers. Call ONLY after the visitor has accepted.
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
  /*
   * ⚠️ ONLY THE REAL SITE COUNTS AS A REAL VISIT. Read from the owner's Analytics on
   * 2026-09-30, before the tag had even deployed: 13 "users", all from hostName
   * `localhost`, which was this project's own checking. Everywhere that is not exactly the
   * live hostname marks itself `traffic_type: internal`, the parameter Analytics' built-in
   * internal-traffic filter drops (Admin → Data filters; it must be set to Active). An
   * unknown host counts as internal: counting too little is the safe mistake.
   */
  if (win.location?.hostname === LIVE_HOSTNAME) gtag('config', GA_MEASUREMENT_ID)
  else gtag('config', GA_MEASUREMENT_ID, { traffic_type: 'internal' })
  loadScript(win, `${GA_SCRIPT}?id=${GA_MEASUREMENT_ID}`)

  // Apollo's own snippet adds a random `nocache` value; kept, so its script is never stale.
  const nocache = Math.random().toString(36).substring(7)
  loadScript(win, `${APOLLO_SCRIPT}?nocache=${nocache}`, () => {
    win.trackingFunctions?.onLoad({ appId: APOLLO_APP_ID })
  })

  /*
   * PostHog's snippet, minus everything this site does not use. Its script reads
   * `window.posthog._i`, a list of `[token, config, name]`, and starts each one; the rest of
   * the snippet only queues method calls made before the script arrives, and this site makes
   * none (read in array.js 1.435.8, 2026-10-04: it needs `_i` to be an array and `init` NOT
   * to be a function, or it takes the object for an already-running PostHog and stops).
   */
  win.posthog = Object.assign([], {
    _i: [[POSTHOG_PROJECT_TOKEN, posthogConfig(win.location?.hostname), 'posthog']],
    people: [],
  })
  loadScript(win, POSTHOG_SCRIPT)
}

/** How `forgetTrackers` reaches cookies, so it can be tested without a browser. */
export interface CookieJar {
  hostname: string
  readCookies(): string
  writeCookie(value: string): void
}

/** PostHog's names start with one of these, in storage and in cookies (array.js 1.435.8). */
const POSTHOG_PREFIXES = ['ph_', '__ph_']
const isPostHogName = (name: string) => POSTHOG_PREFIXES.some((prefix) => name.startsWith(prefix))

/**
 * Remove what the three trackers stored, for a visitor who accepted and later declines.
 * Withdrawing must undo what accepting did, or "Decline" is only a word.
 *
 * Apollo keeps `apolloAnonId` and keys prefixed with its app id in localStorage (read out of
 * its script, 2026-09-30); Google keeps `_ga` and `_ga_<stream>` cookies. PostHog keeps
 * `ph_<token>_posthog` as a cookie and in localStorage, and `__ph_opt_in_out_<token>` (read
 * out of its script, 2026-10-04). Nothing else is touched: the theme choice and the consent
 * choice itself stay.
 */
export function forgetTrackers(storage: ConsentStorage, jar: CookieJar): void {
  try {
    const doomed: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (
        key &&
        (key === 'apolloAnonId' || key.startsWith(`${APOLLO_APP_ID}_`) || isPostHogName(key))
      ) {
        doomed.push(key)
      }
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
      .filter((name) => name === '_ga' || name.startsWith('_ga_') || isPostHogName(name))
    // Google and PostHog set these on the registrable domain; expire them there and on the
    // host itself.
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

/** The visitor pressed Accept: remember it, then start the trackers. */
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
