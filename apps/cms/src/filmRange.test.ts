import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { byteRange, FILM_FOLDER, filmResponse, servesFilm } from '../filmRange.mjs'

/**
 * The /products film is served in pieces because the site's static files ignore `Range`, and
 * iPhone Safari plays no video without it (filmRange.mjs has the measurements). `next start` never
 * runs worker.mjs, so the browser suite cannot see any of this: these tests are its proof, with the
 * local Cloudflare preview check described in docs/DESIGN.md ("The products film").
 */

const CMS = join(import.meta.dirname, '..')
const SIZE = 1000
const FILE = Uint8Array.from({ length: SIZE }, (_, index) => index % 251)

/** A stand-in for the static assets binding that records what it was asked for. */
function assets(status = 200) {
  const asked: Request[] = []
  return {
    asked,
    env: {
      ASSETS: {
        fetch: async (request: Request) => {
          asked.push(request)
          return new Response(status === 200 ? FILE.slice() : 'missing', {
            status,
            headers: { 'content-type': 'video/mp4', etag: '"film-v1"' },
          })
        },
      },
    },
  }
}

const ask = (range?: string, method = 'GET') =>
  new Request('https://wear-run.com/film/tie-dye-hoodie-h264.mp4', {
    method,
    headers: range ? { range } : {},
  })

describe('servesFilm', () => {
  it('takes the film folder and nothing beside it', () => {
    expect(FILM_FOLDER).toBe('/film/')
    expect(servesFilm(new URL('https://wear-run.com/film/tie-dye-hoodie-av1.mp4'))).toBe(true)
    expect(servesFilm(new URL('https://wear-run.com/films/x.mp4'))).toBe(false)
    expect(servesFilm(new URL('https://wear-run.com/products'))).toBe(false)
    expect(servesFilm(new URL('https://wear-run.com/factory/packing-400.webp'))).toBe(false)
  })
})

describe('byteRange (RFC 9110 §14.1.2)', () => {
  it('reads the three shapes a browser sends', () => {
    expect(byteRange('bytes=0-99', SIZE)).toEqual({ start: 0, end: 99 })
    expect(byteRange('bytes=0-1', SIZE)).toEqual({ start: 0, end: 1 })
    expect(byteRange('bytes=100-', SIZE)).toEqual({ start: 100, end: 999 })
    expect(byteRange('bytes=-10', SIZE)).toEqual({ start: 990, end: 999 })
  })

  it('shortens an end past the file, and a suffix longer than it', () => {
    expect(byteRange('bytes=990-5000', SIZE)).toEqual({ start: 990, end: 999 })
    expect(byteRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 })
  })

  it('refuses a range outside the file', () => {
    expect(byteRange('bytes=1000-', SIZE)).toBe('unsatisfiable')
    expect(byteRange('bytes=5-4', SIZE)).toBe('unsatisfiable')
    expect(byteRange('bytes=-0', SIZE)).toBe('unsatisfiable')
  })

  it('ignores what it does not understand, so the whole file goes', () => {
    expect(byteRange('items=0-99', SIZE)).toBeNull()
    expect(byteRange('bytes=0-1,5-6', SIZE)).toBeNull()
    expect(byteRange('bytes=-', SIZE)).toBeNull()
    expect(byteRange('bytes=abc', SIZE)).toBeNull()
  })
})

describe('filmResponse', () => {
  it("answers Safari's first question, two bytes, with exactly two bytes", async () => {
    const { env } = assets()
    const response = await filmResponse(ask('bytes=0-1'), env)
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 0-1/${SIZE}`)
    expect(response.headers.get('content-length')).toBe('2')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 1])
  })

  it('cuts the asked-for bytes from the whole file, keeping the type and the tag', async () => {
    const { env, asked } = assets()
    const response = await filmResponse(ask('bytes=100-199'), env)
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 100-199/${SIZE}`)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('etag')).toBe('"film-v1"')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...FILE.slice(100, 200)])
    // The static assets were asked for the WHOLE file: they would answer a range with all of it.
    expect(asked[0]?.headers.get('range')).toBeNull()
  })

  it('sends the whole file, saying pieces are welcome, when no range is asked', async () => {
    const { env } = assets()
    const response = await filmResponse(ask(), env)
    expect(response.status).toBe(200)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect((await response.arrayBuffer()).byteLength).toBe(SIZE)
  })

  it('answers 416 for a range past the end, naming the size', async () => {
    const { env } = assets()
    const response = await filmResponse(ask(`bytes=${SIZE}-`), env)
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe(`bytes */${SIZE}`)
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })

  it('sends headers and no body for HEAD', async () => {
    const { env } = assets()
    const response = await filmResponse(ask('bytes=0-99', 'HEAD'), env)
    expect(response.status).toBe(206)
    expect(response.headers.get('content-length')).toBe('100')
    expect(response.body).toBeNull()
  })

  it('passes a missing file through untouched', async () => {
    const { env } = assets(404)
    const response = await filmResponse(ask('bytes=0-99'), env)
    expect(response.status).toBe(404)
  })
})

describe('the Worker sends the film folder here, and only it', () => {
  const worker = readFileSync(join(CMS, 'worker.mjs'), 'utf8')
  const config = readFileSync(join(CMS, 'wrangler.jsonc'), 'utf8')

  it('worker.mjs answers film requests before OpenNext sees them', () => {
    const film = worker.indexOf('servesFilm(')
    const openNext = worker.indexOf('openNext.fetch(')
    expect(film, 'worker.mjs never asks servesFilm').toBeGreaterThan(-1)
    expect(film, 'the film check comes after OpenNext').toBeLessThan(openNext)
    expect(worker).toContain('return filmResponse(request, env)')
  })

  it('wrangler.jsonc runs the Worker first for the film folder alone', () => {
    // Without this the static assets answer /film/ themselves and the Worker never runs. A broader
    // list (or `true`) would put the Worker in front of every image and script on the site.
    const runFirst = /"run_worker_first":\s*(\[[^\]]*\])/.exec(config)?.[1]
    expect(runFirst, 'apps/cms/wrangler.jsonc has no run_worker_first list').toBeDefined()
    expect(JSON.parse(runFirst ?? '[]')).toEqual([`${FILM_FOLDER}*`])
  })
})
