import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `initErrorTracking()` — the half of lib/sentry.ts that `sentry.test.ts` cannot
 * reach, because it dynamically imports @sentry/browser and is gated on a build-time
 * environment variable.
 *
 * WHY IT IS WORTH THE MOCKING. Every privacy guarantee this project makes about
 * third-party error tracking is expressed as an OPTION OBJECT here, and the module's
 * own comment block is the only thing currently asserting any of it. Three of those
 * options fail silently and irreversibly:
 *
 *   - `dataCollection` — unset since the Sentry 11 upgrade (2026-09-26, owner's call), so
 *     Sentry records the visitor's IP address and the privacy page says so. Changing it
 *     changes what a third party receives while nothing in the app looks different.
 *   - Session Replay — @sentry/browser SHIPS it, and enabling it records the DOM.
 *     The comment says it is "deliberately not enabled"; a comment cannot stop
 *     someone adding `replayIntegration()` while following a Sentry tutorial.
 *   - `beforeSend` → `scrub` — `scrub` is thoroughly tested and completely inert if
 *     it is not wired up. A test of a sanitiser that nothing calls is the exact
 *     shape of failure CLAUDE.md warns about: it can pass while the property it
 *     describes is false.
 *
 * `tracesSampleRate: 0` is asserted for a different reason — it is what keeps this
 * inside Sentry's free tier, and the project's entire budget is $5/month, already
 * spent on Cloudflare.
 */

const init = vi.fn()
const setTag = vi.fn()
const addEventProcessor = vi.fn()

vi.mock('@sentry/browser', () => ({ init, setTag, addEventProcessor }))
vi.mock('./capabilities', () => ({ canRender3D: () => true }))
vi.mock('./router', () => ({ currentRoute: () => ({ productSlug: 'n001', colourSlug: 'wine' }) }))

const loadWithDsn = async (dsn: string | undefined) => {
  vi.stubEnv('VITE_SENTRY_DSN', dsn as string)
  vi.resetModules()
  const mod = await import('./sentry')
  mod.initErrorTracking()
  // The SDK is loaded through a dynamic import; let its microtask settle.
  await vi.waitFor(() => {
    if (dsn && init.mock.calls.length === 0) throw new Error('not initialised yet')
  })
  return mod
}

beforeEach(() => {
  init.mockClear()
  setTag.mockClear()
  addEventProcessor.mockClear()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('initErrorTracking', () => {
  it('does nothing at all without a DSN', async () => {
    await loadWithDsn(undefined)
    // Not merely "does not report" — with no DSN the `if` is dead code and Vite
    // eliminates the dynamic import, so @sentry/browser never enters the bundle.
    // That zero-cost default is the reason this is safe to ship unconfigured.
    expect(init).not.toHaveBeenCalled()
  })

  it('initialises the SDK when a DSN is present', async () => {
    await loadWithDsn('https://key@example.ingest.sentry.io/1')
    expect(init).toHaveBeenCalledOnce()
    expect(init.mock.calls[0]?.[0]).toMatchObject({
      dsn: 'https://key@example.ingest.sentry.io/1',
    })
  })

  it('leaves dataCollection at the Sentry 11 defaults the privacy page describes', async () => {
    await loadWithDsn('https://key@example.ingest.sentry.io/1')
    const options = init.mock.calls[0]?.[0] as Record<string, unknown>
    // Owner's decision at the v11 upgrade (2026-09-26): defaults, IP address included, and
    // the privacy page says so. Either change here must move with that page's wording.
    expect(options.dataCollection).toBeUndefined()
    // Removed in v11 and ignored if passed — its presence would read as a guarantee it no
    // longer gives.
    expect('sendDefaultPii' in options).toBe(false)
  })

  it('sends no performance traffic, so the free tier is not consumed by traces', async () => {
    await loadWithDsn('https://key@example.ingest.sentry.io/1')
    expect(init.mock.calls[0]?.[0]?.tracesSampleRate).toBe(0)
  })

  it('enables no Session Replay integration', async () => {
    await loadWithDsn('https://key@example.ingest.sentry.io/1')
    const options = init.mock.calls[0]?.[0] as { integrations?: unknown }

    // Replay records the DOM — the one thing on this page that could amount to a
    // screenshot of a visitor's session. Default integrations do not include it;
    // this fails the moment someone passes an explicit list containing one.
    const names = JSON.stringify(options.integrations ?? [])
    expect(names.toLowerCase()).not.toContain('replay')
  })

  it('routes every event through scrub before sending', async () => {
    const mod = await loadWithDsn('https://key@example.ingest.sentry.io/1')
    const beforeSend = init.mock.calls[0]?.[0]?.beforeSend as (e: unknown) => unknown

    expect(typeof beforeSend).toBe('function')

    // Asserted by BEHAVIOUR rather than by identity: `beforeSend === scrub` would
    // pass for a wrapper that discards the result, which is the realistic mistake.
    const scrubbed = beforeSend({
      user: { id: 'someone' },
      request: { url: 'https://viewer.example/n001/wine?utm=x', cookies: { a: 'b' } },
    }) as { user?: unknown; request: { url: string; cookies?: unknown } }

    expect(scrubbed.user).toBeUndefined()
    expect(scrubbed.request.cookies).toBeUndefined()
    expect(scrubbed.request.url).toBe('https://viewer.example/n001/wine')
    expect(mod.scrub, 'scrub stays exported for its own unit tests').toBeTypeOf('function')
  })

  it('tags the environment and release from build-time variables', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production')
    vi.stubEnv('VITE_SENTRY_RELEASE', 'abc123')
    await loadWithDsn('https://key@example.ingest.sentry.io/1')

    // The release MUST match what the source maps were uploaded under (vite.config.ts
    // passes the same variable to sentryVitePlugin) or every frame stays minified —
    // the most common cause of an unreadable trace.
    expect(init.mock.calls[0]?.[0]).toMatchObject({
      environment: 'production',
      release: 'abc123',
    })
  })

  it('defaults the environment to development rather than production', async () => {
    await loadWithDsn('https://key@example.ingest.sentry.io/1')
    // NOT `import.meta.env.MODE`: that is 'production' for every `vite build`, so a
    // local production build would otherwise pollute the live issue stream.
    expect(init.mock.calls[0]?.[0]?.environment).toBe('development')
  })

  it('tags capability context, and route context at send time rather than at init', async () => {
    await loadWithDsn('https://key@example.ingest.sentry.io/1')

    expect(setTag).toHaveBeenCalledWith('webglAvailable', 'true')
    expect(setTag).toHaveBeenCalledWith('coarsePointer', 'false')

    // Route is read inside the processor, not captured at init — a visitor switches
    // colourway without a page load, so an init-time capture is stale exactly when
    // it matters.
    const processor = addEventProcessor.mock.calls[0]?.[0] as (e: {
      tags?: Record<string, string>
    }) => { tags: Record<string, string> }
    expect(processor({}).tags).toMatchObject({ product: 'n001', colourway: 'wine' })
  })
})

/**
 * The send policy, asserted as BEHAVIOUR through the real `beforeSend`.
 *
 * `sentry.test.ts` proves the two predicates classify correctly; nothing there can
 * prove they are wired to the right branch. Getting that backwards is silent and
 * expensive in both directions: budget the HTTP half and a repeat of the
 * 2026-08-06 cached-404 disappears, budget neither and the free plan's 5,000
 * errors/month goes to scanners — which is the state these tests were written in.
 */
describe('beforeSend network policy', () => {
  const DSN = 'https://key@example.ingest.sentry.io/1'
  const transport = () => ({ exception: { values: [{ value: 'TypeError: Failed to fetch' }] } })
  const http = () => ({
    exception: {
      values: [
        {
          type: 'HttpError',
          value:
            'fetch for "https://media.wear-run.help/rxps/wine.glb" responded with 404: Not Found',
        },
      ],
    },
  })
  const policy = async () => {
    await loadWithDsn(DSN)
    return init.mock.calls[0]?.[0]?.beforeSend as (e: unknown) => unknown
  }

  it('never budgets an HTTP error, however many arrive', async () => {
    const beforeSend = await policy()
    // Ten in a row: a genuinely unreachable asset must not be rate-limited into
    // looking like a one-off. This is the branch that catches an incident.
    for (let i = 0; i < 10; i += 1) expect(beforeSend(http()), `call ${i}`).not.toBeNull()
  })

  it('reports the first transport failure of a page-load and drops the rest', async () => {
    const beforeSend = await policy()
    expect(beforeSend(transport()), 'first is the signal').not.toBeNull()
    expect(beforeSend(transport()), 'second is duplication').toBeNull()
    expect(beforeSend(transport()), 'third is duplication').toBeNull()
  })

  it('drops a transport failure raised once the page is going away', async () => {
    const beforeSend = await policy()
    window.dispatchEvent(new Event('pagehide'))
    expect(beforeSend(transport())).toBeNull()
  })

  it('drops a transport failure raised while the tab is hidden', async () => {
    const beforeSend = await policy()
    // The case `pagehide` cannot cover: a backgrounded or headless context that is
    // destroyed without ever unloading, which is what the datacentre traffic is.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      expect(beforeSend(transport())).toBeNull()
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    }
  })

  it('never budgets a code fault (negative control)', async () => {
    const beforeSend = await policy()
    const fault = () => ({ exception: { values: [{ value: 'TypeError: x is not a function' }] } })
    // A real bug looping in a render frame must keep reporting every time.
    for (let i = 0; i < 5; i += 1) expect(beforeSend(fault()), `call ${i}`).not.toBeNull()
  })
})
