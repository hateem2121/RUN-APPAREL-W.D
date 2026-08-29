import { afterEach, describe, expect, it, vi } from 'vitest'
import { authHeader, buildEnvelope, parseDsn, reportFailure } from './sentry'

const DSN = 'https://abc123def456@o4507.ingest.de.sentry.io/4509876'
const ID = '12c2d058d58442709aa2eca08bf20986'
const AT = '2026-08-29T12:00:00.000Z'

describe('parseDsn', () => {
  it('maps a DSN to the envelope endpoint the spec defines', () => {
    // POST /api/<project_id>/envelope/ — develop.sentry.dev, "Envelopes".
    expect(parseDsn(DSN)).toEqual({
      envelopeUrl: 'https://o4507.ingest.de.sentry.io/api/4509876/envelope/',
      publicKey: 'abc123def456',
    })
  })

  it('returns null when there is no DSN, so the Worker is safe to deploy first', () => {
    /*
     * The whole reason this is nullable. The code ships before the secret exists, and
     * "no alerting" must be the outcome rather than a crash on every job.
     */
    expect(parseDsn(undefined)).toBeNull()
    expect(parseDsn('')).toBeNull()
  })

  it('returns null on a malformed DSN instead of throwing', () => {
    /*
     * A typo in a Worker secret must degrade to "no alerting", never to "every garment
     * fails". This is the failure mode that would be worst: the alerting change itself
     * taking down the upload path.
     */
    expect(parseDsn('not a url')).toBeNull()
    expect(parseDsn('https://o4507.ingest.de.sentry.io/4509876')).toBeNull() // no public key
    expect(parseDsn('https://abc@o4507.ingest.de.sentry.io')).toBeNull() // no project id
  })
})

describe('buildEnvelope', () => {
  it('produces the three newline-delimited parts the spec requires', () => {
    const body = buildEnvelope({ outcome: 'refused', message: 'nope' }, ID, AT)
    const [envelopeHeader, itemHeader, payload] = body.split('\n')

    expect(JSON.parse(envelopeHeader as string)).toEqual({ event_id: ID })
    const item = JSON.parse(itemHeader as string)
    expect(item.type).toBe('event')
    expect(item.content_type).toBe('application/json')
    // The declared length must match the payload, or Relay rejects the envelope.
    expect(item.length).toBe((payload as string).length)
  })

  it('⚠️ groups by OUTCOME, not by message', () => {
    /*
     * THE DETAIL MOST LIKELY TO BE GOT WRONG. Sentry groups by fingerprint; the default
     * derives it from the message, and every message here names a garment. Left alone,
     * 25 re-exported garments failing the same way would open 25 separate issues, each
     * seen once, and the pattern would be invisible — which is close to the current
     * situation of nobody being told at all.
     */
    const a = JSON.parse(
      buildEnvelope(
        { outcome: 'refused', message: 'A failed', filename: 'raw/a.glb' },
        ID,
        AT,
      ).split('\n')[2] as string,
    )
    const b = JSON.parse(
      buildEnvelope(
        { outcome: 'refused', message: 'B failed', filename: 'raw/b.glb' },
        ID,
        AT,
      ).split('\n')[2] as string,
    )
    expect(a.fingerprint).toEqual(b.fingerprint)
    // ...but they must still be tellable apart once you open the issue.
    expect(a.tags.garment).toBe('raw/a.glb')
    expect(b.tags.garment).toBe('raw/b.glb')
  })

  it('carries the garment and the record id, so the owner can act on it', () => {
    /*
     * An alert saying "a shrink failed" is barely better than silence. It must say WHICH
     * garment and WHERE to look, or the owner still has to go hunting.
     */
    const event = JSON.parse(
      buildEnvelope(
        {
          outcome: 'refused',
          message: 'artwork torn',
          rawUploadId: 'abc123',
          filename: 'raw/x.glb',
        },
        ID,
        AT,
      ).split('\n')[2] as string,
    )
    expect(event.extra.rawUploadId).toBe('abc123')
    expect(event.extra.filename).toBe('raw/x.glb')
    expect(event.message.formatted).toBe('artwork torn')
  })

  it('rates a retry as a warning and a refusal as an error', () => {
    /*
     * A retry usually resolves itself; a refusal never will. Filing both at the same
     * severity is how an inbox stops being read.
     */
    const level = (outcome: 'refused' | 'retrying' | 'dead-letter') =>
      JSON.parse(buildEnvelope({ outcome, message: 'x' }, ID, AT).split('\n')[2] as string).level

    expect(level('retrying')).toBe('warning')
    expect(level('refused')).toBe('error')
    expect(level('dead-letter')).toBe('error')
  })

  it('omits absent fields rather than sending nulls', () => {
    const event = JSON.parse(
      buildEnvelope({ outcome: 'dead-letter', message: 'gave up' }, ID, AT).split(
        '\n',
      )[2] as string,
    )
    expect(event.extra).toEqual({})
    expect(event.tags).toEqual({ outcome: 'dead-letter' })
  })
})

describe('authHeader', () => {
  it('is the form the spec defines', () => {
    expect(authHeader('abc123')).toContain('sentry_version=7')
    expect(authHeader('abc123')).toContain('sentry_key=abc123')
  })
})

describe('reportFailure', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the envelope to the right URL with the right headers', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const sent = await reportFailure(DSN, { outcome: 'refused', message: 'nope' }, ID, AT)

    expect(sent).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://o4507.ingest.de.sentry.io/api/4509876/envelope/')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-sentry-envelope',
    )
    expect((init.headers as Record<string, string>)['X-Sentry-Auth']).toContain('abc123def456')
  })

  it('does not call the network at all without a DSN', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await reportFailure(undefined, { outcome: 'refused', message: 'x' }, ID, AT)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('⚠️ NEVER THROWS when Sentry is unreachable', async () => {
    /*
     * THE MOST IMPORTANT TEST IN THIS FILE. This runs on the failure path. If it threw,
     * it would replace the job's real error with a network error and destroy the CMS
     * write that is the mechanism actually working today — turning a missing alert into
     * a lost diagnosis.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    await expect(reportFailure(DSN, { outcome: 'refused', message: 'x' }, ID, AT)).resolves.toBe(
      false,
    )
  })

  it('reports a non-2xx from Sentry as not sent, without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    )
    await expect(reportFailure(DSN, { outcome: 'refused', message: 'x' }, ID, AT)).resolves.toBe(
      false,
    )
  })
})
