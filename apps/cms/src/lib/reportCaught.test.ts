import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The reporting path for errors the site RECOVERS from (audit FA-P-04, FA-S-08).
 *
 * ⚠️ MEASURED IN SENTRY, 2026-09-07. The `cms` project holds exactly two events, CMS-1
 * and CMS-2, both sent on 2026-09-01 from a scratchpad script as deliberate "L6-03 live
 * proof" probes, both since resolved. So the DSN, the envelope shape and the stack-frame
 * parsing are proven END TO END against real ingestion — and no error the RUNNING CMS
 * caught has ever reached it, because until 2026-09-07 nothing called this function.
 *
 * That last half cannot be closed from here: the DSN is a Cloudflare Worker secret and
 * is deliberately unreadable, so the only proof available before a deploy is that the
 * wiring is correct and cannot fail quietly. That is what this file asserts.
 *
 * ⚠️ THE PROPERTY THAT MATTERS MOST IS THE ONE THAT IS EASIEST TO OMIT: this runs on a
 * render path, from a `catch` whose whole purpose is to keep a page alive. If it can
 * throw, a database wobble stops degrading gracefully and starts taking the page down —
 * and it would do so only when the database is ALREADY unhealthy, which is the worst
 * possible time to discover it. Every assertion below about not throwing is that.
 */

const ORIGINAL_DSN = process.env.SENTRY_DSN

const sendSpy = vi.fn<(options: Record<string, unknown>) => Promise<boolean>>()

vi.mock('./sentry', () => ({
  reportToSentry: (options: Record<string, unknown>) => sendSpy(options),
}))

// No Cloudflare context under vitest: the dynamic import throws and `resolveDsn` falls
// through to `process.env`, which is the path `next start` and the browser suite take.
vi.mock('@opennextjs/cloudflare', () => {
  throw new Error('no Cloudflare context in this runtime')
})

async function load() {
  vi.resetModules()
  return import('./reportCaught')
}

beforeEach(() => {
  sendSpy.mockReset()
  sendSpy.mockResolvedValue(true)
})

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.SENTRY_DSN
  else process.env.SENTRY_DSN = ORIGINAL_DSN
})

describe('with no DSN', () => {
  /*
   * A missing DSN has to be a no-op, not an error: every build, every test and every
   * Payload CLI run has none. `ci.yml` asserts the Worker holds the secret precisely
   * because this silence is intentional here — without that step, a secret that failed
   * to apply would yield a silent, green, blind deploy.
   */
  it('sends nothing and does not throw', async () => {
    delete process.env.SENTRY_DSN
    const { reportCaught, resolveDsn } = await load()
    await expect(resolveDsn()).resolves.toBeUndefined()
    await expect(
      reportCaught('content.site-settings', new Error('D1 is down')),
    ).resolves.toBeUndefined()
    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe('with a DSN', () => {
  const DSN = 'https://abc123@o1.ingest.sentry.io/42'

  it('reports the error under a stable label', async () => {
    process.env.SENTRY_DSN = DSN
    const { reportCaught } = await load()
    const error = new Error('D1 is down')

    await reportCaught('content.products', error)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const sent = sendSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sent.dsn).toBe(DSN)
    expect(sent.error).toBe(error)
    /*
     * `where` is a stable LABEL, not a message. It is what groups these in Sentry, and a
     * label that varied per occurrence would produce one issue per error rather than one
     * issue with a count — which is the difference between a signal and a flood.
     */
    expect(sent.context).toMatchObject({
      routerKind: 'caught',
      routePath: 'content.products',
      routeType: 'degraded',
    })
  })

  /*
   * ⚠️ THE ONE THAT PROTECTS THE PAGE. `getSiteSettings` calls this from a catch block
   * that exists so a database failure degrades to defaults instead of showing a visitor
   * an error. A throw from here would convert every such degradation into a broken page,
   * and only while the database was already unhealthy.
   */
  it.each([
    ['rejects', () => sendSpy.mockRejectedValue(new Error('Sentry is unreachable'))],
    [
      'throws synchronously',
      () =>
        sendSpy.mockImplementation(() => {
          throw new Error('bad envelope')
        }),
    ],
  ])('never throws when the transport %s', async (_name, arrange) => {
    process.env.SENTRY_DSN = DSN
    arrange()
    const { reportCaught } = await load()
    await expect(reportCaught('content.products', new Error('D1 is down'))).resolves.toBeUndefined()
  })

  /*
   * The control for the two above: they pass whether the transport was called and its
   * failure swallowed, or never called at all. This proves the swallow is doing work.
   */
  it('the swallow tests are not vacuous — the transport really is invoked', async () => {
    process.env.SENTRY_DSN = DSN
    sendSpy.mockRejectedValue(new Error('Sentry is unreachable'))
    const { reportCaught } = await load()
    await reportCaught('content.products', new Error('D1 is down'))
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('reports a non-Error throw rather than dropping it', async () => {
    process.env.SENTRY_DSN = DSN
    const { reportCaught } = await load()
    await reportCaught('content.site-settings', 'a string was thrown')
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })
})
