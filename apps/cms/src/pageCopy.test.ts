import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY_READ_TIMEOUT_MS, copyKey, copyOn, readCopy, writeCopy } from '../pageCopy.mjs'

const BUILD = 'site-0123456789abcdef0123.0123456789ab'

/** A fake R2 bucket: a Map, plus switches to make it fail or stall the way R2 can. */
function fakeBucket({ throwOnGet = false, throwOnPut = false, getDelayMs = 0 } = {}) {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string) {
      if (throwOnGet) throw new Error('R2 down')
      if (getDelayMs) await new Promise((resolve) => setTimeout(resolve, getDelayMs))
      const value = store.get(key)
      return value === undefined ? null : { text: async () => value }
    },
    async put(key: string, value: string) {
      if (throwOnPut) throw new Error('R2 down')
      store.set(key, value)
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('copyKey', () => {
  it('names the host, the build, the content version and the path, never the query', () => {
    expect(copyKey('https://wear-run.com/guides?utm_source=x', BUILD, '42')).toBe(
      `pages/wear-run.com/${BUILD}/42/guides`,
    )
  })

  it('names a missing content version "none", as the page store does', () => {
    expect(copyKey('https://wear-run.com/faq/quality', BUILD, null)).toBe(
      `pages/wear-run.com/${BUILD}/none/faq/quality`,
    )
  })

  it('gives the home page a name of its own', () => {
    expect(copyKey('https://wear-run.com/', BUILD, '7')).toBe(`pages/wear-run.com/${BUILD}/7/index`)
  })

  it('keeps a new build and a new save apart from the old copy', () => {
    const before = copyKey('https://wear-run.com/about', BUILD, '41')
    expect(copyKey('https://wear-run.com/about', BUILD, '42')).not.toBe(before)
    expect(copyKey('https://wear-run.com/about', `${BUILD.slice(0, -1)}c`, '41')).not.toBe(before)
  })
})

describe('copyOn', () => {
  it('is on when the bucket is bound and the switch is not "off"', () => {
    expect(copyOn({ PAGE_COPIES: fakeBucket(), PAGE_COPY: 'on' })).toBe(true)
    expect(copyOn({ PAGE_COPIES: fakeBucket() })).toBe(true)
  })

  it('is off with the switch at "off", or with no bucket', () => {
    expect(copyOn({ PAGE_COPIES: fakeBucket(), PAGE_COPY: 'off' })).toBe(false)
    expect(copyOn({ PAGE_COPY: 'on' })).toBe(false)
    expect(copyOn(undefined)).toBe(false)
  })
})

describe('writeCopy and readCopy', () => {
  it('reads back the text and the headers it wrote, without a cookie', async () => {
    const bucket = fakeBucket()
    const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'a=1' })
    expect(await writeCopy(bucket, 'k', headers, '<html></html>')).toBe(true)
    const copy = await readCopy(bucket, 'k')
    expect(copy?.text).toBe('<html></html>')
    expect(copy?.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(copy?.headers.has('set-cookie')).toBe(false)
  })

  it('finds nothing where nothing was written', async () => {
    expect(await readCopy(fakeBucket(), 'missing')).toBeNull()
  })

  it('never throws: a failing bucket reads as no copy and writes as false', async () => {
    expect(await readCopy(fakeBucket({ throwOnGet: true }), 'k')).toBeNull()
    expect(await writeCopy(fakeBucket({ throwOnPut: true }), 'k', new Headers(), 'x')).toBe(false)
  })

  it('reads a damaged copy as no copy', async () => {
    const bucket = fakeBucket()
    bucket.store.set('k', '{not json')
    expect(await readCopy(bucket, 'k')).toBeNull()
  })

  it('gives up on a slow bucket after the read timeout, so the page is drawn instead', async () => {
    vi.useFakeTimers()
    const bucket = fakeBucket({ getDelayMs: COPY_READ_TIMEOUT_MS + 100 })
    bucket.store.set('k', JSON.stringify({ v: 1, headers: [], text: 'late' }))
    const read = readCopy(bucket, 'k')
    await vi.advanceTimersByTimeAsync(COPY_READ_TIMEOUT_MS + 1)
    expect(await read).toBeNull()
  })

  it('reads within 400 ms, the plan’s ceiling', () => {
    expect(COPY_READ_TIMEOUT_MS).toBe(400)
  })
})
