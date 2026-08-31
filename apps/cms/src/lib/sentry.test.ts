/**
 * Guards for the CMS's server-side error reporting (L6-03).
 *
 * WHAT WOULD HAVE TO BREAK FOR THESE TO FAIL. That question is the reason this
 * file is shaped the way it is — the repo has shipped three production bugs whose
 * common cause was a fixture that could not exhibit the failure.
 *
 *   - The privacy tests fail if a session cookie or an Authorization header ever
 *     reaches an outgoing event. They assert ABSENCE, and each carries a positive
 *     control alongside it so "nothing came through" cannot pass by the scrubber
 *     simply returning an empty object.
 *   - The transport test fails if the envelope stops being something Sentry would
 *     accept: three newline-delimited lines, a trailing newline, the event id
 *     repeated in the envelope header, and the right content type.
 *   - The no-throw tests fail if this module can ever raise. It runs inside
 *     `onRequestError`, i.e. during the handling of another exception.
 */
import { describe, expect, it } from 'vitest'
import {
  buildEnvelope,
  buildEvent,
  envelopeUrl,
  eventId,
  KEPT_HEADERS,
  parseDsn,
  parseStack,
  reportToSentry,
  scrubHeaders,
  scrubPath,
  type StackFrame,
} from './sentry'

/**
 * Narrow an index access without `!`.
 *
 * `noUncheckedIndexedAccess` is on in this workspace, and the non-null assertion
 * it tempts you into would turn "the array was empty" — a real regression in a
 * stack parser — into a confusing property-of-undefined error further down. This
 * fails on the spot, naming what was missing.
 */
function at<T>(items: T[], index: number, what: string): T {
  const value = items.at(index)
  if (value === undefined) throw new Error(`expected ${what} at index ${index}, got nothing`)
  return value
}

/** The real shape, with the key and project id replaced. */
const DSN = 'https://abc123def456@o4511868350496768.ingest.us.sentry.io/4512006205865984'

describe('parseDsn', () => {
  it('pulls the three fields out of a real DSN', () => {
    expect(parseDsn(DSN)).toEqual({
      host: 'o4511868350496768.ingest.us.sentry.io',
      projectId: '4512006205865984',
      publicKey: 'abc123def456',
    })
  })

  /**
   * Every one of these produced a "working" URL in an earlier draft that would
   * have POSTed into nowhere. A DSN is pasted by hand exactly once, and a typo in
   * it is indistinguishable from "no errors happened" for as long as nobody looks.
   */
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['not a url', 'nonsense'],
    ['no public key', 'https://o4511868350496768.ingest.us.sentry.io/4512006205865984'],
    ['no project id', 'https://abc123def456@o4511868350496768.ingest.us.sentry.io'],
    ['non-numeric project id', 'https://abc123def456@sentry.io/not-a-number'],
    ['wrong protocol', 'ftp://abc123def456@sentry.io/1234'],
  ])('refuses a DSN with %s', (_label, value) => {
    expect(parseDsn(value)).toBeNull()
  })
})

describe('envelopeUrl', () => {
  it('targets the envelope endpoint with the key as a query parameter', () => {
    const dsn = parseDsn(DSN)
    expect(dsn).not.toBeNull()
    expect(envelopeUrl(dsn as NonNullable<typeof dsn>)).toBe(
      'https://o4511868350496768.ingest.us.sentry.io/api/4512006205865984/envelope/' +
        '?sentry_key=abc123def456&sentry_version=7',
    )
  })
})

describe('scrubHeaders — an allow-list, not a block-list', () => {
  /**
   * The one that matters. The CMS has a login; the viewer does not. An error in
   * the admin panel is raised on a request carrying a live Payload session.
   */
  it('drops a session cookie and an Authorization header', () => {
    const out = scrubHeaders({
      cookie: 'payload-token=eyJhbGciOi.SECRET.SESSION',
      authorization: 'users API-Key 0123456789abcdef',
      'x-forwarded-for': '203.0.113.9',
      'user-agent': 'Mozilla/5.0',
    })
    expect(out).not.toHaveProperty('cookie')
    expect(out).not.toHaveProperty('authorization')
    expect(out).not.toHaveProperty('x-forwarded-for')
    // POSITIVE CONTROL, in the same assertion block on purpose: without it, a
    // scrubber that returned {} unconditionally would pass every line above.
    expect(out['user-agent']).toBe('Mozilla/5.0')
  })

  it('survives a header name in a different case', () => {
    expect(scrubHeaders({ 'User-Agent': 'curl/8' })['user-agent']).toBe('curl/8')
    expect(scrubHeaders({ Cookie: 'payload-token=SECRET' })).not.toHaveProperty('cookie')
  })

  it('joins repeated header values rather than dropping or object-ifying them', () => {
    expect(scrubHeaders({ 'user-agent': ['a', 'b'] })['user-agent']).toBe('a, b')
  })

  it('is empty for no headers at all', () => {
    expect(scrubHeaders(undefined)).toEqual({})
  })

  /**
   * Pins the list itself. Adding a header here is a privacy decision and should
   * have to be made deliberately, not arrived at by editing a loop.
   */
  it('keeps exactly the four documented headers', () => {
    expect([...KEPT_HEADERS]).toEqual(['user-agent', 'referer', 'cf-ray', 'cf-ipcountry'])
  })
})

describe('scrubPath', () => {
  it('drops the query string, which is where admin search terms live', () => {
    expect(scrubPath('/admin/collections/products?search=unreleased-autumn-range')).toBe(
      '/admin/collections/products',
    )
  })
  it('leaves a bare path alone', () => {
    expect(scrubPath('/api/public/viewer/rxps/wine')).toBe('/api/public/viewer/rxps/wine')
  })
  it('falls back to / when there is no path', () => {
    expect(scrubPath(undefined)).toBe('/')
  })
})

describe('eventId', () => {
  it('is 32 lowercase hex characters', () => {
    expect(eventId()).toMatch(/^[0-9a-f]{32}$/)
  })
  it('is derived from the supplied randomness, so it is testable', () => {
    expect(eventId(() => 0)).toBe('0'.repeat(32))
  })
})

describe('buildEvent', () => {
  /**
   * ⚠️ THIS ASSERTION IS SPECIFIC BECAUSE A VAGUER ONE PASSED WHILE THE FEATURE
   * WAS BROKEN. The first version sent `{ frames: [], raw: [...] }`, and
   * `expect(values[0].stacktrace).toBeDefined()` was true. Sentry took the
   * envelope with a 200 and displayed "No stacktrace available", because an empty
   * `frames` array is valid and `raw` is not a field it knows. So: assert frames
   * are POPULATED and that a real function name survived.
   */
  it('carries the message, the type and a populated stack', () => {
    const error = new TypeError('cannot read colourways of null')
    const event = buildEvent({ error, id: 'a'.repeat(32), timestampSeconds: 1 })
    const values = (event.exception as { values: Record<string, unknown>[] }).values
    const value0 = at(values, 0, 'exception value')
    expect(value0.type).toBe('TypeError')
    expect(value0.value).toBe('cannot read colourways of null')
    const stacktrace = value0.stacktrace as { frames: StackFrame[] } | undefined
    expect(stacktrace?.frames.length).toBeGreaterThan(0)
    expect(stacktrace?.frames.every((f) => typeof f.filename === 'string' && f.filename)).toBe(true)
  })

  it('omits the stacktrace key entirely rather than sending an empty frames array', () => {
    const error = new Error('no stack here')
    error.stack = undefined
    const event = buildEvent({ error })
    const values = (event.exception as { values: Record<string, unknown>[] }).values
    expect(at(values, 0, 'exception value')).not.toHaveProperty('stacktrace')
  })

  it('handles a thrown non-Error without losing it', () => {
    const event = buildEvent({ error: 'a string was thrown', id: 'b'.repeat(32) })
    const values = (event.exception as { values: Record<string, unknown>[] }).values
    const thrown = at(values, 0, 'exception value')
    expect(thrown.value).toBe('a string was thrown')
    expect(thrown.type).toBe('Error')
  })

  /**
   * React replaces the thrown value during Server Component rendering, so on that
   * path the digest can be the only thing identifying the real fault. Next's own
   * instrumentation documentation calls this out.
   */
  it('promotes a React error digest to a tag', () => {
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '1234567890',
    })
    const event = buildEvent({ error })
    expect((event.tags as Record<string, string>).digest).toBe('1234567890')
  })

  it('scrubs the request it is given', () => {
    const event = buildEvent({
      error: new Error('boom'),
      request: {
        path: '/admin/login?next=/admin/collections/users',
        method: 'POST',
        headers: { cookie: 'payload-token=SECRET', 'user-agent': 'Firefox' },
      },
    })
    const request = event.request as Record<string, unknown>
    expect(request.url).toBe('/admin/login')
    expect(request.headers).toEqual({ 'user-agent': 'Firefox' })
  })
})

describe('parseStack', () => {
  const STACK = [
    'TypeError: cannot read colourways of null',
    '    at projectViewer (/app/.open-next/server-functions/default/index.mjs:4821:19)',
    '    at async GET (/app/.open-next/server-functions/default/index.mjs:5011:5)',
    '    at /app/node_modules/next/dist/server/route.js:120:11',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
  ].join('\n')

  it('pulls filename, function, line and column out of a V8 stack', () => {
    const frames = parseStack(STACK)
    expect(frames).toHaveLength(4)
    // Sentry renders oldest-first, so the LAST frame is the innermost call.
    const innermost = at(frames, -1, 'innermost frame')
    expect(innermost.function).toBe('projectViewer')
    expect(innermost.filename).toBe('/app/.open-next/server-functions/default/index.mjs')
    expect(innermost.lineno).toBe(4821)
    expect(innermost.colno).toBe(19)
  })

  it('reverses V8 order, because Sentry renders oldest first', () => {
    const frames = parseStack(STACK)
    expect(at(frames, 0, 'oldest frame').filename).toBe('node:internal/process/task_queues')
    expect(at(frames, -1, 'innermost frame').function).toBe('projectViewer')
  })

  it('marks node internals and node_modules as not-in-app', () => {
    const frames = parseStack(STACK)
    const byFile = Object.fromEntries(frames.map((f) => [f.filename, f.in_app]))
    expect(byFile['/app/.open-next/server-functions/default/index.mjs']).toBe(true)
    expect(byFile['node:internal/process/task_queues']).toBe(false)
    expect(byFile['/app/node_modules/next/dist/server/route.js']).toBe(false)
  })

  it('handles a frame with no function name', () => {
    const frames = parseStack('Error: x\n    at /app/worker.js:10:2')
    const only = at(frames, 0, 'the single frame')
    expect(only).toMatchObject({ filename: '/app/worker.js', lineno: 10, colno: 2 })
    expect(only.function).toBeUndefined()
  })

  it('is empty for no stack and for a stack with no frames', () => {
    expect(parseStack(undefined)).toEqual([])
    expect(parseStack('Error: just a message')).toEqual([])
  })
})

describe('buildEnvelope', () => {
  it('is three newline-delimited lines with a trailing newline', () => {
    const event = buildEvent({ error: new Error('x'), id: 'c'.repeat(32), timestampSeconds: 7 })
    const envelope = buildEnvelope(event, '2026-08-31T00:00:00.000Z')
    expect(envelope.endsWith('\n')).toBe(true)
    const lines = envelope.split('\n')
    // Three content lines plus the empty string after the trailing newline.
    expect(lines).toHaveLength(4)
    expect(JSON.parse(at(lines, 0, 'envelope header'))).toEqual({
      event_id: 'c'.repeat(32),
      sent_at: '2026-08-31T00:00:00.000Z',
    })
    expect(JSON.parse(at(lines, 1, 'item header'))).toEqual({ type: 'event' })
    expect(JSON.parse(at(lines, 2, 'item payload')).event_id).toBe('c'.repeat(32))
  })
})

describe('reportToSentry', () => {
  it('POSTs an envelope to the right URL with the right content type', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const ok = await reportToSentry({
      dsn: DSN,
      error: new Error('the CMS fell over'),
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return { ok: true } as Response
      }) as unknown as typeof fetch,
    })
    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    const call = at(calls, 0, 'the fetch call')
    expect(call.url).toContain('/api/4512006205865984/envelope/')
    expect((call.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-sentry-envelope',
    )
    expect(String(call.init.body)).toContain('the CMS fell over')
  })

  /**
   * The no-DSN path is the DEFAULT everywhere except the live Worker — every
   * test run, every build, every Payload CLI invocation. It has to be silent and
   * it has to send nothing.
   */
  it('sends nothing at all when there is no DSN', async () => {
    let called = false
    const ok = await reportToSentry({
      dsn: undefined,
      error: new Error('x'),
      fetchImpl: (async () => {
        called = true
        return { ok: true } as Response
      }) as unknown as typeof fetch,
    })
    expect(ok).toBe(false)
    expect(called).toBe(false)
  })

  it('reports failure rather than success when Sentry rejects the envelope', async () => {
    const ok = await reportToSentry({
      dsn: DSN,
      error: new Error('x'),
      fetchImpl: (async () => ({ ok: false, status: 429 }) as Response) as unknown as typeof fetch,
    })
    expect(ok).toBe(false)
  })

  /**
   * NEGATIVE CONTROL for the whole design. This runs inside `onRequestError`,
   * during the handling of another exception. If it can throw, a reporting
   * failure becomes a second failure on a request that was still going to return
   * something to the user.
   */
  it('never throws, even when fetch itself does', async () => {
    const ok = await reportToSentry({
      dsn: DSN,
      error: new Error('x'),
      fetchImpl: (() => {
        throw new Error('network is down')
      }) as unknown as typeof fetch,
    })
    expect(ok).toBe(false)
  })

  it('never throws when the DSN is structurally broken', async () => {
    await expect(
      reportToSentry({ dsn: 'https://no-project-id@sentry.io', error: new Error('x') }),
    ).resolves.toBe(false)
  })
})
