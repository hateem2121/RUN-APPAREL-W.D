import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import door, {
  DOOR_FULL,
  DOOR_OFF,
  DOOR_SWITCH_KEY,
  DOOR_WAIT_LOGGED_MS,
  doorClock,
  forgetBuild,
  forSiteOnly,
  hasSiteOnly,
  SITE_BUILD_PATH,
  siteOnlyOn,
  VERSION_OVERRIDES_HEADER,
  withDoorTiming,
} from '../door.mjs'
import {
  CONTENT_VERSION_KEY,
  forgetKvMemo,
  keptHeaders,
  STORE_BUILD_KEY,
  STORE_MODE_KEY,
} from '../pageCache.mjs'
import { RSC_STORE_KEY } from '../tapStore.mjs'
import {
  CMS_WORKER,
  SITE_ONLY_WORKER,
  workerName,
  workerVersionResponse,
} from '../workerVersion.mjs'

/**
 * The front door and the SITE-ONLY Worker (the admin split, 22 Nov 2026).
 *
 * WHAT PRODUCTION WOULD DO IF THIS WENT WRONG, and the stand-in that can show each fault:
 *   - a page drawn by one Worker loading the OTHER Worker's script files. The two builds do not
 *     share all of them (7 script files were only in the site-only build, measured that day), so
 *     here the two Workers answer DIFFERENT things for the same address and hold different files:
 *     `only-in-site.js` is a 404 on the CMS Worker and `only-in-cms.js` a 404 on the site-only one;
 *   - a form post reaching the Worker that has no mail or Turnstile secret;
 *   - the garment data asked of a store that cannot draw it;
 *   - the off switch not switching, or a deploy's check passing on the Worker that is already live;
 *   - the smaller Worker failing, and the page failing with it.
 *
 * `cms` stands in for the CMS Worker behind the route (door.mjs handOn; `ORIGIN` in a preview),
 * `siteOnly` for the site-only Worker's default entrypoint. Every test says which of the two was
 * asked, because "the page came back" is true of both.
 */
const CMS_BUILD = 'site-aaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaa'
const SITE_ONLY_BUILD = 'site-bbbbbbbbbbbbbbbbbbbb.bbbbbbbbbbbb'

const kvOf = (values: Record<string, string | null>) => ({
  get: vi.fn(async (key: string) => values[key] ?? null),
})

const kept = () =>
  keptHeaders(new Headers({ 'content-type': 'text/plain; charset=utf-8' }), Date.now() - 60_000)

type World = {
  /** KV `front-door`. */
  door?: string | null
  /** false = the door as it was before the split: no bindings to the site-only Worker. */
  bound?: boolean
  /** What the site-only Worker does with a request it is handed. */
  siteOnly?: (request: Request) => Response | Promise<Response>
}

function world(options: World = {}) {
  const pathOf = (request: Request) => new URL(request.url).pathname
  const cms = {
    fetch: vi.fn(async (request: Request) => {
      const path = pathOf(request)
      if (path === SITE_BUILD_PATH) return new Response('refused', { status: 530 })
      if (path === '/_next/static/chunks/only-in-site.js') return new Response('', { status: 404 })
      return new Response(`CMS Worker: ${request.method} ${path}`)
    }),
  }
  const cmsFiles = { fetch: vi.fn(async (_request: Request) => new Response(`${CMS_BUILD}\n`)) }
  const cmsPages = {
    fetch: vi.fn(
      async (_r: Request, _i?: unknown) => new Response('CMS store', { headers: kept() }),
    ),
  }
  const siteOnly = {
    fetch: vi.fn(async (request: Request) => {
      const path = pathOf(request)
      if (path === SITE_BUILD_PATH) return new Response(`${SITE_ONLY_BUILD}\n`)
      if (options.siteOnly) return options.siteOnly(request)
      if (path === '/_next/static/chunks/only-in-cms.js') return new Response('', { status: 404 })
      if (path === '/factory/missing.webp') return new Response('', { status: 404 })
      return new Response(`site-only Worker: ${request.method} ${path}`)
    }),
  }
  const siteOnlyPages = {
    fetch: vi.fn(
      async (_r: Request, _i?: unknown) => new Response('site-only store', { headers: kept() }),
    ),
  }
  const viewer = { fetch: vi.fn(async (_request: Request) => new Response('viewer Worker')) }
  const env = {
    ORIGIN: cms,
    SITE_FILES: cmsFiles,
    SITE_PAGES: cmsPages,
    ...(options.bound === false ? {} : { SITE_ONLY: siteOnly, SITE_ONLY_PAGES: siteOnlyPages }),
    VIEWER: viewer,
    SITE_CACHE: kvOf({
      [DOOR_SWITCH_KEY]: options.door ?? null,
      [STORE_BUILD_KEY]: null,
      'content-version': '7',
    }),
    CF_VERSION_METADATA: { id: 'door-version' },
    STORE_HEDGE: 'on',
    PAGE_COPY: 'off',
  }
  const ctx = { waitUntil: vi.fn() }
  /** Requests that reached a Worker's CODE (the build file is a static file: it starts nothing). */
  const asked = (worker: { fetch: { mock: { calls: Array<[Request]> } } }) =>
    worker.fetch.mock.calls.map(([request]) => pathOf(request)).filter((p) => p !== SITE_BUILD_PATH)
  return { env, ctx, cms, cmsFiles, cmsPages, siteOnly, siteOnlyPages, viewer, asked }
}

const get = (url: string, headers: HeadersInit = {}) => new Request(url, { headers })

beforeEach(() => {
  forgetKvMemo()
  forgetBuild()
  // A stopped clock, so only the tests that move it see the door's timing marks.
  doorClock.now = () => 0
})

/**
 * WHERE THE DOOR'S OWN WAIT GOES (door.mjs doorTiming, 24 Nov 2026).
 *
 * WHAT PRODUCTION DID. From Sydney on 23 Nov 2026, after 21 quiet minutes, ten garment-data
 * requests took 582 to 862 ms to their first byte. Each was a store hit answered by the door
 * alone, and the answer's own marks covered under half of it (`kv;dur` 267 to 273 ms,
 * `store;dur` 3 to 6 ms): about 400 ms went to waits nothing measured.
 *
 * THE STAND-IN. A Worker's clock moves only while it waits on something outside itself, so the
 * clock here is moved BY the things the door waits on: each KV key and the build-name file cost
 * what the test says, and nothing else moves it. A KV read ends its cost after the moment it was
 * STARTED, as a real one does, so reads started together overlap (door.mjs startSettingsReads,
 * 24 Nov 2026: the switch's wait now covers the flag's, which reads 0). That is the production
 * shape: a copy of the door that has just started pays for its reads, and one that remembers
 * them pays nothing.
 */
describe('the door’s own wait, in its timing marks', () => {
  type Costs = { switchMs: number; flagMs: number; fileMs: number }

  /** A world whose reads cost time, and the garment-data request the Sydney probes sent. */
  function slowWorld(costs: Costs) {
    const w = world()
    let clock = 0
    doorClock.now = () => clock
    const values: Record<string, string | null> = { 'content-version': '7' }
    w.env.SITE_CACHE.get.mockImplementation(async (key: string) => {
      const cost =
        key === DOOR_SWITCH_KEY ? costs.switchMs : key === STORE_BUILD_KEY ? costs.flagMs : 0
      const doneAt = clock + cost
      await Promise.resolve()
      clock = Math.max(clock, doneAt)
      return values[key] ?? null
    })
    const answerOf = w.siteOnly.fetch.getMockImplementation()
    w.siteOnly.fetch.mockImplementation(async (request: Request) => {
      if (new URL(request.url).pathname === SITE_BUILD_PATH) clock += costs.fileMs
      return (answerOf as (request: Request) => Promise<Response>)(request)
    })
    const ask = () =>
      door.fetch(get('https://cms.wear-run.help/api/public/viewer/rxps/wine'), w.env, w.ctx)
    return { ...w, ask }
  }

  it('a copy of the door that has just started says how long each of its three waits took', async () => {
    const w = slowWorld({ switchMs: 270, flagMs: 130, fileMs: 60 })
    const response = await w.ask()
    const timing = response.headers.get('server-timing') ?? ''
    // The flag's read ran inside the switch's wait (they start together), so it shows 0.
    // Until 24 Nov 2026 this read 270, 130, 60: one wait after another.
    expect(timing).toContain('door-switch;dur=270, door-flags;dur=0, door-build;dur=60')
    // The answer is the store's, still marked as a hit, and neither Worker behind the door ran.
    expect(timing).toContain('api-cache;desc="hit"')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('CMS store')
    expect(w.asked(w.cms)).toEqual([])
    expect(w.asked(w.siteOnly)).toEqual([])
  })

  it('a copy that remembers all three adds nothing: the next answer carries no door marks', async () => {
    const w = slowWorld({ switchMs: 270, flagMs: 130, fileMs: 60 })
    await w.ask()
    const second = await w.ask()
    expect(second.headers.get('server-timing')).toContain('api-cache;desc="hit"')
    expect(second.headers.get('server-timing')).not.toContain('door-')
    // Negative control for the line above: the first answer in a fresh world does carry them.
    forgetKvMemo()
    forgetBuild()
    const fresh = await slowWorld({ switchMs: 270, flagMs: 130, fileMs: 60 }).ask()
    expect(fresh.headers.get('server-timing')).toContain('door-switch;dur=270')
  })

  it('a website page gets the same marks, beside what the store said', async () => {
    const w = slowWorld({ switchMs: 12, flagMs: 0, fileMs: 30 })
    const response = await door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)
    const timing = response.headers.get('server-timing') ?? ''
    expect(timing).toContain('page-cache;desc="hit"')
    expect(timing).toContain('door-switch;dur=12, door-flags;dur=0, door-build;dur=30')
    expect(await response.text()).toBe('site-only store')
  })

  it('a long wait is written to Workers Logs as well, a short one is not', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const waits = () => log.mock.calls.map(([line]) => line).filter((line) => line?.doorWait)
      await slowWorld({ switchMs: 270, flagMs: 130, fileMs: 60 }).ask()
      expect(waits()).toEqual([{ doorWait: 330, switchMs: 270, flagsMs: 0, buildMs: 60 }])
      log.mockClear()
      forgetKvMemo()
      forgetBuild()
      const short = await slowWorld({ switchMs: 40, flagMs: 30, fileMs: 20 }).ask()
      expect(40 + 20).toBeLessThan(DOOR_WAIT_LOGGED_MS)
      expect(short.headers.get('server-timing')).toContain('door-switch;dur=40')
      expect(waits()).toEqual([])
    } finally {
      log.mockRestore()
    }
  })

  it('an answer the door did not wait for leaves as the very object it arrived as', () => {
    const answer = new Response('kept')
    expect(withDoorTiming(answer, { switchMs: 0, flagsMs: 0, buildMs: 0 })).toBe(answer)
    expect(withDoorTiming(answer, { switchMs: 0.4, flagsMs: 0.3, buildMs: 0.2 })).toBe(answer)
  })

  it('never fails an answer: one whose headers cannot be read is sent as it is', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const broken = {
        get headers(): Headers {
          throw new Error('headers are gone')
        },
      } as unknown as Response
      expect(withDoorTiming(broken, { switchMs: 300, flagsMs: 0, buildMs: 0 })).toBe(broken)
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      error.mockRestore()
    }
  })
})

/**
 * THE SETTINGS READS START TOGETHER (door.mjs startSettingsReads, 24 Nov 2026).
 *
 * WHAT PRODUCTION DID. Sydney, 05:08 UTC that day: ten garment-data requests, all store hits,
 * first byte 429 to 718 ms, each made of three waits in a row of about 210 ms (the switch, the
 * `page-store-build` flag, then the content version and store mode). Each step asked KV for its
 * own key only when the step before had its answer.
 *
 * THE STAND-IN. A stopwatch cannot show this honestly in a test, so the KV here does not answer
 * until the test lets it: whatever has been asked for by then is what the door asks for AT ONCE.
 * In production each of those reads takes about 210 ms from a region that has gone quiet, so
 * "asked at once" is one wait and "asked one after another" is three.
 */
describe('the door’s settings reads, started together', () => {
  /** A world whose KV holds every answer back until `release()`; `asked()` is what was read so far. */
  function heldWorld() {
    const w = world()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const values: Record<string, string | null> = { [CONTENT_VERSION_KEY]: '7' }
    w.env.SITE_CACHE.get.mockImplementation(async (key: string) => {
      await gate
      return values[key] ?? null
    })
    const asked = () => w.env.SITE_CACHE.get.mock.calls.map(([key]) => key).sort()
    /** Long enough for every step that is not waiting on KV to have run. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
    return { ...w, release, asked, settle }
  }

  const EVERY_READ = [CONTENT_VERSION_KEY, DOOR_SWITCH_KEY, STORE_BUILD_KEY, STORE_MODE_KEY].sort()
  /** The contact form's address: a stand-in request inside this test, sent to no server. */
  const FORM_PATH = '/contact/submit'

  it('a garment’s data: all four keys are asked for before the first one answers', async () => {
    const w = heldWorld()
    const answer = door.fetch(
      get('https://cms.wear-run.help/api/public/viewer/rxps/wine'),
      w.env,
      w.ctx,
    )
    await w.settle()
    // NEGATIVE CONTROL, run on the door as it was before this change: only the switch had been
    // asked for here (`['front-door']`), and the other three waited their turn.
    expect(w.asked()).toEqual(EVERY_READ)
    w.release()
    const response = await answer
    expect(await response.text()).toBe('CMS store')
    expect(response.headers.get('server-timing')).toContain('api-cache;desc="hit"')
    // Asked for once each: the steps behind found the reads already made.
    expect(w.asked()).toEqual(EVERY_READ)
  })

  it('a website page: the same four, at once, and the page is the store’s', async () => {
    const w = heldWorld()
    const answer = door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)
    await w.settle()
    expect(w.asked()).toEqual(EVERY_READ)
    w.release()
    expect(await (await answer).text()).toBe('site-only store')
    expect(w.asked()).toEqual(EVERY_READ)
  })

  it('a tap between pages also starts its own switch', async () => {
    const w = heldWorld()
    const answer = door.fetch(get('https://wear-run.com/faq', { rsc: '1' }), w.env, w.ctx)
    await w.settle()
    expect(w.asked()).toEqual([...EVERY_READ, RSC_STORE_KEY].sort())
    w.release()
    await answer
  })

  it('a file starts nothing extra: it reads the switch and no other key', async () => {
    const w = heldWorld()
    const answer = door.fetch(get('https://wear-run.com/_next/static/chunks/a.js'), w.env, w.ctx)
    await w.settle()
    expect(w.asked()).toEqual([DOOR_SWITCH_KEY])
    w.release()
    expect(await (await answer).text()).toBe('site-only Worker: GET /_next/static/chunks/a.js')
    expect(w.asked()).toEqual([DOOR_SWITCH_KEY])
  })

  it('a form post starts nothing extra either, and still reaches the CMS Worker', async () => {
    const w = heldWorld()
    const sent = new Request(`https://wear-run.com${FORM_PATH}`, { method: 'POST', body: 'a=b' })
    const answer = door.fetch(sent, w.env, w.ctx)
    await w.settle()
    expect(w.asked()).not.toContain(CONTENT_VERSION_KEY)
    expect(w.asked()).not.toContain(STORE_MODE_KEY)
    w.release()
    expect(await (await answer).text()).toBe(`CMS Worker: POST ${FORM_PATH}`)
  })

  it('a KV that fails every read never fails the page: it is handed on', async () => {
    const w = world()
    w.env.SITE_CACHE.get.mockImplementation(async () => {
      throw new Error('KV is down')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('/faq')
    } finally {
      error.mockRestore()
    }
  })
})

describe('a website page, with the site-only Worker in use', () => {
  it('a kept page comes from the SITE-ONLY Worker’s store, keyed by ITS build, and no Worker starts', async () => {
    const w = world()
    const response = await door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)
    expect(await response.text()).toBe('site-only store')
    expect(w.siteOnlyPages.fetch).toHaveBeenCalledTimes(1)
    const init = w.siteOnlyPages.fetch.mock.calls[0]?.[1] as { cf: { cacheKey: string } }
    expect(init.cf.cacheKey).toContain(SITE_ONLY_BUILD)
    expect(init.cf.cacheKey).not.toContain(CMS_BUILD)
    expect(w.cmsPages.fetch).not.toHaveBeenCalled()
    expect(w.asked(w.cms)).toEqual([])
    expect(w.asked(w.siteOnly)).toEqual([])
    // The other Worker's build file is never read: its name would key the wrong store.
    expect(w.cmsFiles.fetch).not.toHaveBeenCalled()
  })

  it('negative control: the door as it was (no bindings) asks the CMS Worker’s store, by ITS build', async () => {
    const w = world({ bound: false })
    const response = await door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)
    expect(await response.text()).toBe('CMS store')
    const init = w.cmsPages.fetch.mock.calls[0]?.[1] as { cf: { cacheKey: string } }
    expect(init.cf.cacheKey).toContain(CMS_BUILD)
    expect(w.siteOnly.fetch).not.toHaveBeenCalled()
  })

  it('a page that is never kept (a signed-in visitor) is drawn by the site-only Worker', async () => {
    const w = world()
    const request = get('https://wear-run.com/faq', { cookie: 'payload-token=abc' })
    const response = await door.fetch(request, w.env, w.ctx)
    expect(await response.text()).toBe('site-only Worker: GET /faq')
    expect(w.asked(w.cms)).toEqual([])
  })
})

describe('what still goes to the CMS Worker', () => {
  it.each(['/contact/submit', '/careers/submit', '/guides/tech-pack-template/download'])(
    'a form post to %s, with its body: only that Worker holds the mail and Turnstile secrets',
    async (path) => {
      const w = world()
      const request = new Request(`https://wear-run.com${path}`, { method: 'POST', body: 'name=A' })
      const response = await door.fetch(request, w.env, w.ctx)
      expect(await response.text()).toBe(`CMS Worker: POST ${path}`)
      const sent = w.cms.fetch.mock.calls.at(-1)?.[0]
      expect(await sent?.text()).toBe('name=A')
      expect(w.asked(w.siteOnly)).toEqual([])
      expect(w.siteOnlyPages.fetch).not.toHaveBeenCalled()
    },
  )

  it('the garment data: asked of the CMS Worker’s store, never of the store that cannot draw it', async () => {
    const w = world()
    w.cmsPages.fetch.mockResolvedValueOnce(
      new Response('{"product":{"slug":"rxps"},"colourways":[{"slug":"wine"}]}', {
        headers: keptHeaders(
          new Headers({ 'content-type': 'application/json' }),
          Date.now() - 60_000,
        ),
      }),
    )
    const request = get('https://cms.wear-run.help/api/public/viewer/rxps/wine')
    await door.fetch(request, w.env, w.ctx)
    expect(w.cmsPages.fetch).toHaveBeenCalledTimes(1)
    expect(w.siteOnlyPages.fetch).not.toHaveBeenCalled()
    expect(w.asked(w.siteOnly)).toEqual([])
  })

  it('a card’s warm request on the website asks the CMS Worker’s store too', async () => {
    const w = world()
    const response = await door.fetch(
      get('https://wear-run.com/__warm/garment/rxps/wine'),
      w.env,
      w.ctx,
    )
    expect(response.status).toBe(204)
    expect(w.cmsPages.fetch).toHaveBeenCalledTimes(1)
    expect(w.siteOnlyPages.fetch).not.toHaveBeenCalled()
  })

  it('anything else on the admin host', async () => {
    const w = world()
    const request = get('https://cms.wear-run.help/api/public/viewer/rxps/wine?draft=1')
    const response = await door.fetch(request, w.env, w.ctx)
    expect(await response.text()).toBe('CMS Worker: GET /api/public/viewer/rxps/wine')
    expect(w.asked(w.siteOnly)).toEqual([])
  })

  it('garment pages still go straight to the viewer Worker', async () => {
    const w = world()
    const response = await door.fetch(get('https://wear-run.com/products/rxps/wine'), w.env, w.ctx)
    expect(await response.text()).toBe('viewer Worker')
    expect(w.asked(w.siteOnly)).toEqual([])
    expect(w.asked(w.cms)).toEqual([])
  })
})

describe('a page’s files come from the Worker that drew the page', () => {
  it('a script file is asked of the site-only Worker', async () => {
    const w = world()
    const url = 'https://wear-run.com/_next/static/chunks/only-in-site.js'
    const response = await door.fetch(get(url), w.env, w.ctx)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('site-only Worker')
    expect(w.asked(w.cms)).toEqual([])
  })

  it('negative control: the CMS Worker does not have that file, so sending it there is a 404', async () => {
    const w = world({ door: DOOR_FULL })
    const url = 'https://wear-run.com/_next/static/chunks/only-in-site.js'
    expect((await door.fetch(get(url), w.env, w.ctx)).status).toBe(404)
  })

  it('a script file only the CMS Worker has (a page it drew before the switch) is found there', async () => {
    const w = world()
    const url = 'https://wear-run.com/_next/static/chunks/only-in-cms.js'
    const response = await door.fetch(get(url), w.env, w.ctx)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('CMS Worker')
    expect(w.asked(w.siteOnly)).toEqual(['/_next/static/chunks/only-in-cms.js'])
  })

  it('a missing photo is a 404 once: public/ is the same in both builds, so nothing is asked twice', async () => {
    const w = world()
    const response = await door.fetch(
      get('https://wear-run.com/factory/missing.webp'),
      w.env,
      w.ctx,
    )
    expect(response.status).toBe(404)
    expect(w.asked(w.cms)).toEqual([])
  })
})

describe('the site-only Worker’s off switch (KV `front-door` = `full`)', () => {
  it('every visitor is served by the CMS Worker and its store, exactly as before the split', async () => {
    const w = world({ door: DOOR_FULL })
    expect(await (await door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)).text()).toBe(
      'CMS store',
    )
    const file = await door.fetch(
      get('https://wear-run.com/_next/static/chunks/a.js'),
      w.env,
      w.ctx,
    )
    expect(await file.text()).toContain('CMS Worker')
    const init = w.cmsPages.fetch.mock.calls[0]?.[1] as { cf: { cacheKey: string } }
    expect(init.cf.cacheKey).toContain(CMS_BUILD)
    expect(w.siteOnly.fetch).not.toHaveBeenCalled()
    expect(w.siteOnlyPages.fetch).not.toHaveBeenCalled()
  })

  it('the whole door’s switch (`off`) still wins: nothing is asked of any store', async () => {
    const w = world({ door: DOOR_OFF })
    const response = await door.fetch(get('https://wear-run.com/faq'), w.env, w.ctx)
    expect(await response.text()).toBe('CMS Worker: GET /faq')
    expect(w.siteOnly.fetch).not.toHaveBeenCalled()
    expect(w.siteOnlyPages.fetch).not.toHaveBeenCalled()
    expect(w.cmsPages.fetch).not.toHaveBeenCalled()
  })

  it('says so: on without a value, off for `full` and `off`, off without the bindings', async () => {
    expect(await siteOnlyOn(world().env)).toBe(true)
    forgetKvMemo()
    expect(await siteOnlyOn(world({ door: DOOR_FULL }).env)).toBe(false)
    forgetKvMemo()
    expect(await siteOnlyOn(world({ door: DOOR_OFF }).env)).toBe(false)
    forgetKvMemo()
    expect(await siteOnlyOn(world({ bound: false }).env)).toBe(false)
    expect(hasSiteOnly(world({ bound: false }).env)).toBe(false)
  })

  it('a build name read from one Worker is never used for the other when the switch is thrown', async () => {
    const on = world()
    await door.fetch(get('https://wear-run.com/faq'), on.env, on.ctx)
    // The same copy of the door, a moment later, with the switch thrown (the KV memo has run out).
    forgetKvMemo()
    const off = world({ door: DOOR_FULL })
    await door.fetch(get('https://wear-run.com/faq'), off.env, off.ctx)
    const init = off.cmsPages.fetch.mock.calls[0]?.[1] as { cf: { cacheKey: string } }
    expect(init.cf.cacheKey).toContain(CMS_BUILD)
    expect(init.cf.cacheKey).not.toContain(SITE_ONLY_BUILD)
  })
})

describe('a deploy’s pre-live check (the version-overrides header)', () => {
  const checked = { [VERSION_OVERRIDES_HEADER]: 'run-apparel-site-only="new"' }

  it.each([null, DOOR_FULL, DOOR_OFF])(
    'reaches the site-only Worker whole, header and all, whatever the switch says (%s)',
    async (mode) => {
      const w = world({ door: mode })
      const response = await door.fetch(get('https://wear-run.com/faq', checked), w.env, w.ctx)
      expect(await response.text()).toBe('site-only Worker: GET /faq')
      const sent = w.siteOnly.fetch.mock.calls.at(-1)?.[0] as Request
      expect(sent.headers.get(VERSION_OVERRIDES_HEADER)).toBe('run-apparel-site-only="new"')
      // Never a kept answer: it would pass the check without the new version running.
      expect(w.siteOnlyPages.fetch).not.toHaveBeenCalled()
      expect(w.cmsPages.fetch).not.toHaveBeenCalled()
      expect(w.asked(w.cms)).toEqual([])
    },
  )

  it('sees the site-only Worker’s own failure: a check is never quietly answered by the other Worker', async () => {
    const w = world({ siteOnly: () => new Response('broken', { status: 500 }) })
    const response = await door.fetch(get('https://wear-run.com/faq', checked), w.env, w.ctx)
    expect(response.status).toBe(500)
    expect(w.asked(w.cms)).toEqual([])
  })

  it('a checked form post and a checked admin-host request still go to the CMS Worker', async () => {
    const w = world()
    const post = new Request('https://wear-run.com/contact/submit', {
      method: 'POST',
      headers: checked,
    })
    expect(await (await door.fetch(post, w.env, w.ctx)).text()).toBe(
      'CMS Worker: POST /contact/submit',
    )
    const api = get('https://cms.wear-run.help/api/public/viewer/rxps/wine', checked)
    expect(await (await door.fetch(api, w.env, w.ctx)).text()).toContain('CMS Worker')
    expect(w.asked(w.siteOnly)).toEqual([])
  })
})

describe('the site-only Worker must never be the reason a page fails', () => {
  it.each([
    ['answers 500', () => new Response('broken', { status: 500 })],
    ['answers 503', () => new Response('over limits', { status: 503 })],
    [
      'throws',
      () => {
        throw new Error('the Worker could not be loaded')
      },
    ],
  ] as const)(
    'when it %s, the CMS Worker draws the page, and the logs say so',
    async (_name, siteOnly) => {
      const w = world({ siteOnly })
      const loud = vi.spyOn(console, 'error').mockImplementation(() => {})
      const request = get('https://wear-run.com/faq', { cookie: 'payload-token=abc' })
      const response = await door.fetch(request, w.env, w.ctx)
      expect(await response.text()).toBe('CMS Worker: GET /faq')
      expect(loud.mock.calls.flat().join(' ')).toContain('site-only Worker')
      loud.mockRestore()
    },
  )

  it('negative control: a 404 page is the site-only Worker’s own answer, and stays', async () => {
    const w = world({ siteOnly: () => new Response('no such page', { status: 404 }) })
    const request = get('https://wear-run.com/nope', { cookie: 'payload-token=abc' })
    const response = await door.fetch(request, w.env, w.ctx)
    expect(response.status).toBe(404)
    expect(w.asked(w.cms)).toEqual([])
  })
})

describe('which requests may go to the site-only Worker', () => {
  it('a GET or HEAD on the website’s own host, and nothing else', () => {
    expect(forSiteOnly(get('https://wear-run.com/faq'))).toBe(true)
    expect(forSiteOnly(new Request('https://wear-run.com/faq', { method: 'HEAD' }))).toBe(true)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(forSiteOnly(new Request('https://wear-run.com/faq', { method })), method).toBe(false)
    }
    expect(forSiteOnly(get('https://cms.wear-run.help/admin'))).toBe(false)
    expect(forSiteOnly(get('https://www.wear-run.com/faq'))).toBe(false)
  })
})

/**
 * One file, two Workers: worker.mjs says which it is from `WORKER_NAME`, and the deploy's version
 * check (scripts/version-overrides.mjs) fails unless each Worker answers under its own name.
 */
describe('which Worker the shared entry is running as', () => {
  it('the site-only Worker by its variable; the CMS Worker by default, as before the split', () => {
    expect(workerName({ WORKER_NAME: SITE_ONLY_WORKER })).toBe(SITE_ONLY_WORKER)
    expect(workerName({})).toBe(CMS_WORKER)
    expect(workerName(undefined)).toBe(CMS_WORKER)
    expect(workerName({ WORKER_NAME: 'something-else' })).toBe(CMS_WORKER)
  })

  it('each answers its own name at the version address', async () => {
    const url = new URL('https://wear-run.com/__worker/version')
    const site = workerVersionResponse(url, { id: 'v1' }, SITE_ONLY_WORKER)
    expect(await site?.json()).toEqual({ worker: SITE_ONLY_WORKER, version: 'v1' })
    expect(await workerVersionResponse(url, { id: 'v2' })?.json()).toEqual({
      worker: CMS_WORKER,
      version: 'v2',
    })
  })
})

/**
 * The three wrangler files that make the split, read side by side. A fault here ships silently:
 * a route on the site-only Worker would take visitors past the door and its off switch; a second
 * cron would delete template records twice; a setting that differs between two Workers running
 * the same code on the same data shows up as one page behaving two ways.
 */
describe('the site-only Worker’s configuration', () => {
  const cms = join(import.meta.dirname, '..')
  const parse = (file: string) =>
    JSON.parse(
      readFileSync(join(cms, file), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n'),
    )
  const site = parse('wrangler.site.jsonc')
  const doorConfig = parse('wrangler.door.jsonc')
  const cmsText = readFileSync(join(cms, 'wrangler.jsonc'), 'utf8')

  it('has no address of any kind, and no cron', () => {
    expect(site.name).toBe(SITE_ONLY_WORKER)
    expect(site.routes).toBeUndefined()
    expect(site.triggers).toBeUndefined()
    expect(site.workers_dev).toBe(false)
    expect(site.preview_urls).toBe(false)
  })

  it('runs the same entry on the same data as the CMS Worker', () => {
    expect(site.main).toBe('worker.mjs')
    expect(cmsText).toContain('"main": "worker.mjs"')
    for (const key of ['compatibility_date', 'minify', 'upload_source_maps']) {
      expect(cmsText, key).toContain(`"${key}": ${JSON.stringify(site[key])}`)
    }
    expect(cmsText).toContain(`"compatibility_flags": ${JSON.stringify(site.compatibility_flags)}`)
    expect(cmsText).toContain(`"database_id": "${site.d1_databases[0].database_id}"`)
    expect(cmsText).toContain(`"id": "${site.kv_namespaces[0].id}"`)
    for (const bucket of site.r2_buckets) {
      expect(cmsText, bucket.binding).toContain(`"binding": "${bucket.binding}"`)
      expect(cmsText, bucket.binding).toContain(`"bucket_name": "${bucket.bucket_name}"`)
    }
    // Every bucket the CMS Worker binds, none left out: Payload names each one when it starts.
    expect(site.r2_buckets.length).toBe([...cmsText.matchAll(/"bucket_name": "/g)].length)
    for (const [name, value] of Object.entries(site.vars)) {
      if (name === 'WORKER_NAME') continue
      expect(cmsText, name).toContain(`"${name}": "${value}"`)
    }
    expect(site.vars.WORKER_NAME).toBe(SITE_ONLY_WORKER)
  })

  it('keeps pages in front of SitePages only, never in front of the default entrypoint', () => {
    expect(site.exports.SitePages.cache.enabled).toBe(true)
    expect(site.exports.default.cache.enabled).toBe(false)
    expect(site.cache).toEqual({ enabled: false, cross_version_cache: true })
    expect(site.assets.run_worker_first).toEqual(['/film/*'])
  })

  it('asks the CMS Worker’s store for the garment data', () => {
    expect(site.services).toContainEqual({
      binding: 'CMS_PAGES',
      service: CMS_WORKER,
      entrypoint: 'SitePages',
    })
    expect(site.services).toContainEqual({ binding: 'VIEWER', service: 'run-apparel-viewer-site' })
  })

  it('the door binds both of its entrypoints, and still binds the CMS Worker’s', () => {
    expect(doorConfig.services).toContainEqual({ binding: 'SITE_ONLY', service: SITE_ONLY_WORKER })
    expect(doorConfig.services).toContainEqual({
      binding: 'SITE_ONLY_PAGES',
      service: SITE_ONLY_WORKER,
      entrypoint: 'SitePages',
    })
    expect(doorConfig.services).toContainEqual({
      binding: 'SITE_PAGES',
      service: CMS_WORKER,
      entrypoint: 'SitePages',
    })
  })

  it('the CMS Worker binds the site-only Worker’s page store, to tell it of a save', () => {
    expect(cmsText).toMatch(
      /"binding": "SITE_ONLY_PAGES",\s*"service": "run-apparel-site-only",\s*"entrypoint": "SitePages"/,
    )
  })

  it('the CMS Worker keeps every address and the cron: the split moves none of them', () => {
    for (const pattern of ['cms.wear-run.help', 'wear-run.com', 'www.wear-run.com']) {
      expect(cmsText).toContain(`{ "pattern": "${pattern}", "custom_domain": true }`)
    }
    expect(cmsText).toContain('"triggers": { "crons": ["35 0 * * *"] }')
  })
})
