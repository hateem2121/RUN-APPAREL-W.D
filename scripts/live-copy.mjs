/**
 * The decisions behind scripts/smoke-live-copy.mjs, kept free of network and process state
 * so apps/cms/src/liveCopy.test.ts can prove each one both ways.
 */
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  findPlaceholders,
  GARMENT_TERMS,
} from './copy-rules.mjs'

/** `<title>` and `<meta name="description">` from served HTML; '' when absent. */
export function readHead(html) {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
  const description =
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim() ?? ''
  return { title, description }
}

/**
 * Every page's title and description must exist, differ from every other page's, and differ
 * from the static shell's — the shell is what a crawler got from the edge cache on
 * 2026-09-10, on two pages, while the per-garment rewrite worked everywhere else.
 */
export function headProblems(pages, shell) {
  const problems = []
  const seen = { title: new Map(), description: new Map() }
  for (const page of pages) {
    for (const key of ['title', 'description']) {
      const value = page[key]
      if (!value) {
        problems.push(`${page.url}: empty ${key}`)
        continue
      }
      if (value === shell[key]) problems.push(`${page.url}: ${key} is the generic shell's`)
      const first = seen[key].get(value)
      if (first) problems.push(`${page.url}: same ${key} as ${first}`)
      else seen[key].set(value, page.url)
    }
  }
  return problems
}

const PLAIN_FIELDS = [
  'productName',
  'fabricComposition',
  'gsm',
  'garmentFit',
  'shortDescription',
  'retiredMessage',
]

/**
 * The CMS-authored text of one `GET /api/public/viewer/<slug>` payload, against the copy
 * rules. Garment text may say "seamless" and mean the knitting method (GARMENT_TERMS).
 */
export function payloadCopyProblems(slug, payload) {
  const product = payload?.product ?? {}
  const texts = PLAIN_FIELDS.map((key) => [key, String(product[key] ?? '')])
  for (const [i, feature] of (product.performanceFeatures ?? []).entries()) {
    texts.push([`performanceFeatures[${i}]`, String(feature)])
  }
  texts.push([
    'customisationIntroHtml',
    String(product.customisationIntroHtml ?? '').replace(/<[^>]+>/g, ' '),
  ])
  for (const [i, step] of (product.customisationSteps ?? []).entries()) {
    texts.push([`customisationSteps[${i}].title`, String(step.title ?? '')])
    texts.push([`customisationSteps[${i}].body`, String(step.body ?? '')])
  }
  for (const [i, colourway] of (payload?.colourways ?? []).entries()) {
    texts.push([`colourways[${i}].displayName`, String(colourway.displayName ?? '')])
    texts.push([`colourways[${i}].altText`, String(colourway.altText ?? '')])
  }

  const problems = []
  for (const [field, text] of texts) {
    for (const word of findBritishSpellings(text))
      problems.push(`${slug} ${field}: British spelling "${word}"`)
    for (const word of findBuzzwords(text, { allow: GARMENT_TERMS }))
      problems.push(`${slug} ${field}: buzzword "${word}"`)
    for (const mark of findEmoji(text)) problems.push(`${slug} ${field}: emoji ${mark}`)
    for (const mark of findPlaceholders(text))
      problems.push(`${slug} ${field}: placeholder "${mark}"`)
  }
  if (texts.every(([, text]) => !text.trim()))
    problems.push(`${slug}: the payload had no text at all`)
  return problems
}

/**
 * What a whole run means, as ONE decision in one place.
 *
 * ⚠️ PROBLEMS DECIDE FIRST. A refusal explains what could not be measured, never what was.
 * Until 2026-09-16 the runner asked about refusals first, using a single `refusedCount`
 * shared by the viewer-page loop and the CMS-payload loop: so a viewer that bot-blocked our
 * crawler user-agent (403 to a crawler from a datacentre IP is the most challengeable
 * request there is) left `pages` at 0 and `refusedCount` at 80, and the run threw away the
 * 23 genuine CMS findings it had already made and exited 0 saying "inconclusive". The
 * negative control could not catch it: that run had no refusals at all.
 *
 * `refusedCount === -1` means the very first request was refused, so nothing was measured
 * and `problems` is necessarily empty.
 */
export function runVerdict({ problems = [], refusedCount = 0, pages = 0 }) {
  if (problems.length > 0) return 'problems'
  if (refusedCount === -1 || (pages === 0 && refusedCount > 0)) return 'inconclusive'
  return 'clean'
}
