import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Pins the link-preview (Open Graph) tags in index.html.
 *
 * These are asserted against the SOURCE index.html rather than a build, so the
 * test needs no `vite build` — same reasoning as csp.test.ts, which was split out
 * of gen-headers.mjs precisely because importing that file ran the build.
 *
 * Why this is a test at all: every failure mode here is SILENT. A relative
 * og:image, a deleted image file, or a well-meaning static og:url all leave a
 * page that looks perfect in a browser and unfurls wrong — and nobody opens a
 * link preview on purpose to check it. The same class of invisible-until-someone-
 * looks failure as the poster/artwork bugs recorded in CLAUDE.md.
 */
const dir = dirname(fileURLToPath(import.meta.url))
const viewerRoot = join(dir, '..')
const rawHtml = readFileSync(join(viewerRoot, 'index.html'), 'utf8')

/**
 * Comments stripped before any assertion — they are not markup a crawler sees.
 *
 * Not a tidiness measure. index.html documents the og:url decision by NAMING the
 * tags it deliberately omits, so the first version of the "no static canonical"
 * test below matched its own explanatory comment and failed. Asserting against
 * raw file text means prose can break the build.
 */
/**
 * Repeat until stable. One pass is not enough: removing a comment can splice a
 * fresh `<!--` out of the text either side of it, and the survivor could then
 * satisfy the very assertion this strip exists to protect — a false PASS, not a
 * false failure. (CodeQL js/incomplete-multi-character-sanitization.)
 */
function stripComments(source: string): string {
  let previous: string
  let current = source
  do {
    previous = current
    current = current.replace(/<!--[\s\S]*?-->/g, '')
  } while (current !== previous)
  return current
}

const html = stripComments(rawHtml)

/** Pull a meta tag's content by its `property=` or `name=` key. */
function meta(key: string): string | null {
  const pattern = new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`, 'i')
  const inline = html.match(pattern)
  if (inline) return inline[1] ?? null

  // Prettier wraps long tags across lines, so the attributes may be separated by
  // newlines. Without this branch the test would pass or fail on formatting.
  const multiline = new RegExp(
    `<meta\\s+(?:property|name)="${key}"\\s*\\n\\s*content="([^"]*)"`,
    'i',
  )
  return html.match(multiline)?.[1] ?? null
}

describe('link preview (Open Graph) tags', () => {
  it('declares the tags a crawler needs to build a card', () => {
    expect(meta('og:type')).toBe('website')
    expect(meta('og:site_name')).toBe('RUN APPAREL')
    expect(meta('og:title')).toBeTruthy()
    expect(meta('og:description')).toBeTruthy()
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  it('uses an ABSOLUTE og:image url', () => {
    // A relative og:image is the single most common way link previews fail: the
    // page renders identically and every crawler silently drops the image,
    // because it has no document base to resolve against.
    const image = meta('og:image')
    expect(image).toBeTruthy()
    expect(image).toMatch(/^https:\/\//)
  })

  it('ships the image file that og:image points at', () => {
    const image = meta('og:image')!
    const file = join(viewerRoot, 'public', image.replace(/^https:\/\/[^/]+\//, ''))
    expect(
      existsSync(file),
      `og:image points at ${image} but ${file} is not in public/ — the preview would 404`,
    ).toBe(true)
  })

  it('declares og:image dimensions that match the actual file', () => {
    // Crawlers that pre-allocate the card use these. A wrong value is not fatal
    // but it is a lie, and it silently goes stale when the poster is regenerated
    // at a different size.
    const file = join(viewerRoot, 'public', 'og-default.jpg')
    const buf = readFileSync(file)

    // Minimal JPEG SOF scan — avoids adding an image dependency for four bytes.
    let width = 0
    let height = 0
    for (let i = 2; i < buf.length - 9; ) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]!
      // SOF0..SOF3 and SOF5..SOF15 carry the frame dimensions; skip SOF4 (0xc4,
      // define-Huffman-table) and 0xc8/0xcc, which are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        height = buf.readUInt16BE(i + 5)
        width = buf.readUInt16BE(i + 7)
        break
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }

    expect(width).toBeGreaterThan(0)
    expect(meta('og:image:width')).toBe(String(width))
    expect(meta('og:image:height')).toBe(String(height))
  })

  it('does NOT declare a static og:url or canonical', () => {
    // Deliberate, and the reason is written in index.html: this one document is
    // served for EVERY route by the SPA fallback, so a static value here would
    // tell crawlers that /n001/wine is the homepage and invite them to collapse
    // every colourway into a single page. Per-page or absent — never static.
    //
    // Both ARE now set, per request, by apps/viewer/worker/index.ts, which
    // appends them to <head>. That is the only form in which they are correct.
    // Adding one here would put two competing canonicals on every crawled page.
    expect(meta('og:url')).toBeNull()
    expect(html).not.toMatch(/<link[^>]+rel="canonical"/i)
  })

  it('keeps the preview image out of the CSP hash path', () => {
    // scripts/csp.mjs hashes every inline <script>. Meta tags are inert to it,
    // but this asserts the outcome rather than trusting the regex: if someone
    // ever adds a preview that needs an inline script, this catches it here
    // instead of as a CSP violation on the live site.
    const inlineScripts = html.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/gi) ?? []
    expect(inlineScripts).toHaveLength(1) // the theme bootstrap, and only that
  })
})

describe('the fallback card', () => {
  /**
   * ⚠️ IT WAS 189,402 BYTES — nearly 5x the mean per-garment card (60,566) at
   * IDENTICAL dimensions (1200x1500), because it was never put through the same
   * encoder. Re-encoded at the pipeline's own `JPEG_QUALITY = 76` with mozjpeg it
   * is 64,306 bytes, a 66% saving, and a side-by-side crop at 500x625 shows no
   * visible difference — the printed slogan and the seam lines are equally crisp.
   *
   * This is the image every link unfurls with when a garment has no card of its
   * own, so it is fetched by crawlers far more often than any single card.
   */
  it('is encoded like the per-garment cards, not left at source quality', () => {
    const bytes = statSync(join(viewerRoot, 'public', 'og-default.jpg')).size
    expect(
      bytes,
      'og-default.jpg is heavier than the per-garment cards at the same dimensions. ' +
        'Re-encode it at the same quality tools/asset-pipeline/scripts/og-cards.mjs uses.',
    ).toBeLessThan(100_000)
    // Floor too: a card that has collapsed to a few KB is a broken render, and
    // "smaller" is not automatically better.
    expect(
      bytes,
      'og-default.jpg is suspiciously small — is it still a real image?',
    ).toBeGreaterThan(20_000)
  })
})
