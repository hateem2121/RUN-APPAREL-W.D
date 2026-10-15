import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APIError } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Payload's own error path, `routeError`, answers every REST failure itself, so Next's
 * `onRequestError` (src/instrumentation.ts) never sees one. That is how the public garment
 * API answered 500 twice on 2026-10-14 17:20 UTC and Sentry recorded nothing: the reason was
 * only in the Worker's own log (`D1_ERROR: internal error; reference = …`, issue #189).
 *
 * The error below is that one, shaped as drizzle hands it over: "Failed query" wrapping D1's
 * own error as `cause`.
 */

const ORIGINAL_DSN = process.env.SENTRY_DSN

const sendSpy = vi.fn<(options: Record<string, unknown>) => Promise<boolean>>()

vi.mock('./sentry', async (importOriginal) => ({
  // The real allow-list, so the test proves what actually leaves for Sentry.
  scrubHeaders: (await importOriginal<typeof import('./sentry')>()).scrubHeaders,
  reportToSentry: (options: Record<string, unknown>) => sendSpy(options),
}))

// No Cloudflare context under vitest, as in reportCaught.test.ts: the DSN comes from
// process.env and the report is awaited instead of handed to waitUntil.
vi.mock('@opennextjs/cloudflare', () => {
  throw new Error('no Cloudflare context in this runtime')
})

async function load() {
  vi.resetModules()
  return import('./reportServerError')
}

function d1Blip(): Error {
  const d1 = new Error('D1_ERROR: internal error; reference = ttkook9lnlnea7glqj58a60r')
  const failed = new Error('Failed query: select "id", "status" from "products" where …', {
    cause: d1,
  })
  failed.name = 'DrizzleQueryError'
  return failed
}

function fakeReq(url = 'https://cms.wear-run.help/api/public/viewer/r-xmp/wine?x=1') {
  return {
    method: 'GET',
    pathname: new URL(url).pathname,
    headers: new Headers({
      'user-agent': 'Mozilla/5.0 test',
      cookie: 'payload-token=secret',
      authorization: 'users API-Key secret',
      'cf-ray': 'abc123',
    }),
    context: {},
  }
}

type Hook = Awaited<ReturnType<typeof load>>['reportServerErrors']
const call = (hook: Hook, error: Error, req = fakeReq()) =>
  hook({ error, req, context: {} } as unknown as Parameters<Hook>[0])

beforeEach(() => {
  sendSpy.mockReset()
  sendSpy.mockResolvedValue(true)
  process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/4512006205865984'
})

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.SENTRY_DSN
  else process.env.SENTRY_DSN = ORIGINAL_DSN
})

describe('errorStatus', () => {
  it('reads the status the way routeError does: `err.status || 500`', async () => {
    const { errorStatus } = await load()
    expect(errorStatus(d1Blip())).toBe(500)
    expect(errorStatus(new APIError('nope', 404))).toBe(404)
    expect(errorStatus(Object.assign(new Error('x'), { status: 0 }))).toBe(500)
    expect(errorStatus('a string')).toBe(500)
  })
})

describe('reportServerErrors', () => {
  it('sends the 14 Oct D1 failure to Sentry, unchanged, with the request it broke', async () => {
    const { reportServerErrors } = await load()
    const error = d1Blip()
    const result = await call(reportServerErrors, error)

    // Returning nothing leaves Payload's own answer (status and body) exactly as it was.
    expect(result).toBeUndefined()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    const sent = sendSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sent.error).toBe(error)
    expect((sent.error as Error).cause).toBeInstanceOf(Error)
    expect(sent.dsn).toBe(process.env.SENTRY_DSN)
    expect(sent.logger).toBe('cms.afterError')
    expect(sent.request).toEqual({
      path: '/api/public/viewer/r-xmp/wine',
      method: 'GET',
      // Exactly the allow-list: the session cookie never reaches the reporter at all.
      headers: { 'user-agent': 'Mozilla/5.0 test', 'cf-ray': 'abc123' },
    })
    expect(sent.context).toEqual({
      routerKind: 'payload',
      routePath: '/api/public/viewer/r-xmp/wine',
      routeType: 'rest',
    })
  })

  it('reports every 5xx, a 503 included', async () => {
    const { reportServerErrors } = await load()
    await call(reportServerErrors, new APIError('busy', 503))
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  /*
   * A 4xx is Payload answering a visitor correctly: a wrong password, a validation error, a
   * missing document. Reporting those would bury the next D1 failure under login typos.
   */
  it.each([400, 401, 403, 404, 413, 429])('does not report a %i', async (status) => {
    const { reportServerErrors } = await load()
    await call(reportServerErrors, new APIError('client', status))
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('sends nothing without a DSN, and does not throw', async () => {
    delete process.env.SENTRY_DSN
    const { reportServerErrors } = await load()
    await expect(call(reportServerErrors, d1Blip())).resolves.toBeUndefined()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  /*
   * It runs inside Payload's error handler, while a 500 is already being answered. A throw
   * here would replace that answer with Payload's "error initializing" fallback.
   */
  it('never throws when Sentry is unreachable', async () => {
    sendSpy.mockRejectedValue(new Error('network down'))
    const { reportServerErrors } = await load()
    await expect(call(reportServerErrors, d1Blip())).resolves.toBeUndefined()
  })

  it('never throws on a request it cannot read', async () => {
    const { reportServerErrors } = await load()
    const broken = { error: d1Blip(), req: undefined, context: {} }
    await expect(
      reportServerErrors(broken as unknown as Parameters<Hook>[0]),
    ).resolves.toBeUndefined()
  })
})

describe('registration', () => {
  it('is the root afterError hook in the Payload config', () => {
    // Read as text: the config needs Cloudflare bindings to import (as journalCollections.test.ts).
    const config = readFileSync(join(import.meta.dirname, '..', 'payload.config.ts'), 'utf8')
    expect(config).toMatch(/\n {2}hooks: \{\n {4}afterError: \[reportServerErrors\],\n {2}\},\n/)
    expect(config).toContain("import { reportServerErrors } from './lib/reportServerError'")
  })
})
