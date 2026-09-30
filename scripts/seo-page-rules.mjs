/**
 * What a search engine needs from one page, and from the site as a whole.
 *
 * WHY THIS EXISTS (2026-09-30). The owner asked for the free Screaming Frog crawl; it is a
 * desktop program, so the same report is produced here instead, from the sitemap, with
 * nothing to install. `scripts/seo-crawl.mjs` does the fetching; every DECISION is in this
 * file so it can be tested with plain strings (`apps/cms/src/seoPageRules.test.ts`), the
 * same split as `canonical-tags.mjs`.
 *
 * It reads the page the way a search robot first receives it: raw HTML, no JavaScript. That
 * is deliberate. On 2026-09-30 every gate in this repository was green while a garment page
 * handed a robot a complete `<head>` and a body with no heading, no picture and no sentence.
 * Nothing measured the body a robot reads. This does.
 *
 * Two levels, because they need different reactions:
 *   - `error`: the page is wrong for search in a way that costs it (no title, no heading,
 *     a canonical pointing elsewhere, a `noindex` on a page the sitemap offers).
 *   - `warning`: worth a look, not a defect (a title long enough to be cut in results).
 *
 * Plain JavaScript with no imports, so it runs under bare `node`; TypeScript tests import it
 * through `seo-page-rules.d.mts`.
 */

/** Longest title a result usually shows whole; longer ones are cut with an ellipsis. */
export const TITLE_MAX = 60
/** Longest description a result shows whole (the viewer Worker truncates to this too). */
export const DESCRIPTION_MAX = 160
/** Below this a description is too thin to be the snippet; Google writes its own. */
export const DESCRIPTION_MIN = 50

/** Remove HTML comments until none is left (see canonical-tags.mjs for why it loops). */
function stripComments(html) {
  let previous
  let current = html
  do {
    previous = current
    current = current.replace(/<!--[\s\S]*?-->/g, '')
  } while (current !== previous)
  return current
}

/** Text as a reader sees it: entities for the five common characters, whitespace folded. */
function text(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** One attribute's value from a tag's source, quoted with `"` or `'`; `null` when absent. */
function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[1] ?? match[2] ?? '') : null
}

/** A trailing slash and a fragment do not make a different page. */
function sameAddress(a, b) {
  const tidy = (value) => value.replace(/#.*$/, '').replace(/\/+$/, '')
  return tidy(a) === tidy(b)
}

/**
 * Everything the report needs from one page's raw HTML.
 *
 * @param {string} html
 * @returns {{ title: string, description: string | null, h1: string[], canonicals: string[],
 *   robots: string | null, lang: string | null, images: number, imagesWithoutAlt: number,
 *   ogImage: string | null, jsonLdTypes: string[] }}
 */
export function readPage(html) {
  const source = stripComments(html)
  const tags = (pattern) => source.match(pattern) ?? []

  const metas = tags(/<meta\b[^>]*>/gi)
  const meta = (key) => {
    const tag = metas.find(
      (candidate) =>
        (attribute(candidate, 'name') ?? attribute(candidate, 'property') ?? '').toLowerCase() ===
        key,
    )
    return tag ? attribute(tag, 'content') : null
  }

  const images = tags(/<img\b[^>]*>/gi)
  const jsonLdTypes = []
  for (const block of source.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    for (const type of block[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      if (!jsonLdTypes.includes(type[1])) jsonLdTypes.push(type[1])
    }
  }

  return {
    title: text(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: meta('description'),
    h1: [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => text(match[1])),
    canonicals: tags(/<link\b[^>]*>/gi)
      .filter((tag) =>
        (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'),
      )
      .map((tag) => attribute(tag, 'href') ?? ''),
    robots: meta('robots'),
    lang: attribute(source.match(/<html\b[^>]*>/i)?.[0] ?? '', 'lang'),
    images: images.length,
    // `alt=""` is a deliberate "decorative" and is allowed; a MISSING alt is the defect.
    imagesWithoutAlt: images.filter((tag) => attribute(tag, 'alt') === null).length,
    ogImage: meta('og:image'),
    jsonLdTypes,
  }
}

/**
 * The findings for one page a sitemap offers to search engines.
 *
 * @param {{ url: string, status: number, html: string, xRobotsTag?: string | null }} page
 * @returns {Array<{ level: 'error' | 'warning', rule: string, message: string }>}
 */
export function checkPage(page) {
  const findings = []
  const add = (level, rule, message) => findings.push({ level, rule, message })

  if (page.status !== 200) {
    add('error', 'status', `answers ${page.status}; a page in the sitemap must answer 200`)
    return findings
  }
  const read = readPage(page.html)

  if (!read.title) add('error', 'title-missing', 'has no <title>')
  else if (read.title.length > TITLE_MAX) {
    add(
      'warning',
      'title-long',
      `title is ${read.title.length} characters; over ${TITLE_MAX} is cut in results`,
    )
  }

  if (read.description === null || !read.description.trim()) {
    add('error', 'description-missing', 'has no meta description')
  } else if (read.description.length > DESCRIPTION_MAX) {
    add(
      'warning',
      'description-long',
      `description is ${read.description.length} characters; over ${DESCRIPTION_MAX} is cut`,
    )
  } else if (read.description.length < DESCRIPTION_MIN) {
    add('warning', 'description-short', `description is only ${read.description.length} characters`)
  }

  if (read.h1.length === 0) add('error', 'h1-missing', 'has no <h1> in the HTML a robot receives')
  else if (read.h1.length > 1)
    add('error', 'h1-many', `has ${read.h1.length} <h1> elements, expected 1`)
  else if (!read.h1[0]) add('error', 'h1-empty', 'has an empty <h1>')

  if (read.canonicals.length === 0) add('error', 'canonical-missing', 'has no canonical link')
  else if (read.canonicals.length > 1) {
    add('error', 'canonical-many', `has ${read.canonicals.length} canonical links, expected 1`)
  } else if (!sameAddress(read.canonicals[0], page.url)) {
    add(
      'error',
      'canonical-elsewhere',
      `canonical is ${read.canonicals[0] || '(empty)'}, not this page`,
    )
  }

  const robots = `${read.robots ?? ''},${page.xRobotsTag ?? ''}`.toLowerCase()
  if (/\bnoindex\b/.test(robots)) {
    add('error', 'noindex', 'is in the sitemap but tells search engines not to index it')
  }

  if (!read.lang) add('warning', 'lang-missing', 'declares no language on <html>')
  if (read.imagesWithoutAlt > 0) {
    add('error', 'image-alt', `${read.imagesWithoutAlt} of ${read.images} images have no alt text`)
  }
  if (!read.ogImage) add('warning', 'og-image-missing', 'has no og:image for link previews')
  else if (!/^https:\/\//.test(read.ogImage)) {
    add(
      'error',
      'og-image-relative',
      `og:image is "${read.ogImage}", not an absolute https address`,
    )
  }
  if (read.jsonLdTypes.length === 0)
    add('warning', 'structured-data-missing', 'carries no structured data')

  return findings
}

/**
 * Findings that only show across pages: two pages competing with one title or description.
 *
 * @param {Array<{ url: string, status: number, html: string }>} pages
 * @returns {Array<{ level: 'error' | 'warning', rule: string, message: string, urls: string[] }>}
 */
export function checkSite(pages) {
  const findings = []
  const group = (pick) => {
    const seen = new Map()
    for (const page of pages) {
      if (page.status !== 200) continue
      const value = pick(readPage(page.html))
      if (!value) continue
      seen.set(value, [...(seen.get(value) ?? []), page.url])
    }
    return [...seen.entries()].filter(([, urls]) => urls.length > 1)
  }
  for (const [title, urls] of group((read) => read.title)) {
    findings.push({
      level: 'error',
      rule: 'title-duplicate',
      message: `${urls.length} pages share the title "${title}"`,
      urls,
    })
  }
  for (const [description, urls] of group((read) => (read.description ?? '').trim())) {
    findings.push({
      level: 'warning',
      rule: 'description-duplicate',
      message: `${urls.length} pages share the description "${description.slice(0, 60)}…"`,
      urls,
    })
  }
  return findings
}

/**
 * Every `<loc>` in a sitemap, in order.
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function sitemapUrls(xml) {
  // `<loc>` only: an image entry's address is `<image:loc>` and is not a page.
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) =>
    match[1].replace(/&amp;/g, '&'),
  )
}
