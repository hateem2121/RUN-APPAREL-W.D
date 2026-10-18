import { describe, expect, it } from 'vitest'
import { isInconclusiveStatus } from '../../../scripts/inconclusive-statuses.mjs'
import {
  checkCardPicture,
  evaluateCardImage,
  evaluatePreconnect,
  extractPreconnectHosts,
  FETCH_TIMEOUT_MS,
  firstCardImage,
  MEDIA_HOST,
  UNEXPECTED_HOST,
} from '../../../scripts/preconnect-probe.mjs'

/**
 * SO-05, rewritten 2026-09-29 when the /products cards moved to Cloudflare-resized pictures on
 * the page's own address (`apps/cms/src/lib/cardImage.ts`). See the script's header for why this
 * is a LIVE check: no local runtime serves `/cdn-cgi/image/`, and the resizing depends on a
 * dashboard setting and a monthly free quota that no code can see.
 */
describe('extractPreconnectHosts', () => {
  it('reads every preconnect host from a page', () => {
    const html =
      `<link rel="preconnect" href="https://media.wear-run.help">` +
      '<link rel="icon" href="/icon.svg">'
    expect(extractPreconnectHosts(html)).toEqual(['media.wear-run.help'])
  })

  it('is empty when the page declares none', () => {
    expect(extractPreconnectHosts('<link rel="icon" href="/icon.svg">')).toEqual([])
  })

  it('ignores an unparseable href rather than throwing', () => {
    expect(extractPreconnectHosts('<link rel="preconnect" href="not a url">')).toEqual([])
  })
})

describe('evaluatePreconnect', () => {
  it('accepts a page with no media preconnect', () => {
    expect(evaluatePreconnect([]).ok).toBe(true)
  })

  // The cards no longer fetch from media.wear-run.com, so a hint to it is a wasted connection.
  it('flags a preconnect to the media host the cards no longer fetch from', () => {
    const r = evaluatePreconnect([MEDIA_HOST])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain(MEDIA_HOST)
  })

  it('flags a wasted preconnect to the viewer host, which is only ever linked to', () => {
    const r = evaluatePreconnect([UNEXPECTED_HOST])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain(UNEXPECTED_HOST)
  })
})

describe('the first card picture is a resized one', () => {
  const card = (src: string) =>
    `<ul><li><img class="product-card__img" src="${src}" alt="x" width="1200" height="1500"/></li></ul>`
  const RESIZED =
    '/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/https://media.wear-run.com/r-xmp-wine-render.webp'

  it('finds the first card picture', () => {
    expect(firstCardImage(card(RESIZED) + card('/second.webp'))).toBe(RESIZED)
    expect(firstCardImage('<p>no cards</p>')).toBeNull()
  })

  it('accepts a resized picture', () => {
    expect(evaluateCardImage(RESIZED).ok).toBe(true)
  })

  // NEGATIVE CONTROL: the full render straight from the media host is the 0.67 page again.
  it('flags a card that draws the full-size picture', () => {
    const r = evaluateCardImage('https://media.wear-run.com/r-xmp-wine-render.webp')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/not resized/)
  })

  it('flags a page with no card picture at all', () => {
    expect(evaluateCardImage(null).ok).toBe(false)
  })
})

describe('a preconnect is found however the tag is written', () => {
  it('finds a preconnect written href-first', () => {
    expect(
      extractPreconnectHosts('<link href="https://media.wear-run.com" rel="preconnect">'),
    ).toEqual([MEDIA_HOST])
  })

  it('finds preconnect among several rel words, and ignores other links', () => {
    expect(
      extractPreconnectHosts(
        '<link rel="dns-prefetch preconnect" href="https://media.wear-run.com" crossorigin>' +
          '<link rel="stylesheet" href="https://media.wear-run.com/x.css">',
      ),
    ).toEqual([MEDIA_HOST])
  })
})

/**
 * F-07 (2026-10-18): from 2026-10-05 this step took 6 min 40 s in every run although its answer
 * was printed in the first second. It read the picture's headers and never its body, and Node's
 * fetch keeps the connection — and so the whole process — alive until the body is read or
 * cancelled (undici docs; reproduced: the process was still alive at 600 s).
 */
describe('checkCardPicture', () => {
  const picture = (status: number, headers: Record<string, string>) => {
    const state = { cancelled: false }
    const body = new ReadableStream({
      pull() {
        // Never delivers and never ends: only a cancel lets go of it.
      },
      cancel() {
        state.cancelled = true
      },
    })
    const fetchImpl = async () => new Response(body, { status, headers })
    return { state, fetchImpl }
  }
  const SRC =
    '/cdn-cgi/image/fit=scale-down,width=720/https://media.wear-run.com/r-xmp-wine-render.webp'

  it('cancels the body it does not read', async () => {
    const { state, fetchImpl } = picture(200, {
      'content-type': 'image/avif',
      'cf-resized': 'internal=ok/m',
    })
    const result = await checkCardPicture(SRC, fetchImpl)
    expect(state.cancelled).toBe(true)
    expect(result).toMatchObject({ status: 200, type: 'image/avif', problems: [] })
  })

  // NEGATIVE CONTROL: a 307 is Cloudflare's fallback to the full-size file.
  it('flags a picture that fell back to the original', async () => {
    const { state, fetchImpl } = picture(307, { 'cf-resized': 'err=9403' })
    const result = await checkCardPicture(SRC, fetchImpl)
    expect(state.cancelled).toBe(true)
    expect(result.problems[0]).toMatch(/fell back to the original/)
  })

  it('gives up on a fetch after 30 seconds', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000)
  })
})

describe('the same answers are inconclusive as in the robot', () => {
  it('a 503 is inconclusive, a 500 is an answer', () => {
    expect([403, 429, 503].map(isInconclusiveStatus)).toEqual([true, true, true])
    expect([200, 404, 500].map(isInconclusiveStatus)).toEqual([false, false, false])
  })
})
