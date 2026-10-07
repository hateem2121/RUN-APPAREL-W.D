import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  ValidationError,
} from 'payload'
import { JOURNAL_RELATED_PAGES } from './journal'
import { reportCaught } from './reportCaught'
import { SITE_ORIGIN } from './seo'

/**
 * The rules a Journal post and a case study are saved under (PLAN.md E7, E10). Both are
 * written in the CMS and published by the owner; these hooks keep the published address
 * stable, the share picture large enough, and tell search engines when something new is up.
 */

type Doc = Record<string, unknown>

/** The id of an upload value, whether Payload hands it over bare or populated. */
const uploadId = (value: unknown): unknown =>
  value && typeof value === 'object' ? (value as { id?: unknown }).id : value

/**
 * A post's address: lowercase words and numbers joined by single hyphens, up to 80
 * characters. A field `validate` (true, or the message the editor sees).
 */
export function validSlug(value: unknown): true | string {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80
    ? true
    : 'Use lowercase letters, numbers and single hyphens, up to 80 characters.'
}

/**
 * ⚠️ "EVER PUBLISHED" NEEDS ITS OWN MARK, BECAUSE `_status` FORGETS. Payload hands a draft
 * saved over a published post the latest DRAFT as `originalDoc` (read in payload 3.90.2,
 * `collections/operations/updateByID.js`: `getLatestCollectionVersion`), so its `_status` is
 * 'draft'. Checking the status alone would let an editor rename a published post as a draft
 * and then publish it under the new address. This stamp is set once, at the first publish, and
 * travels with every later version.
 */
export const markFirstPublished = ({
  data,
  originalDoc,
  now,
}: {
  data: Doc
  originalDoc?: Doc
  /** For tests only; Payload never passes it. */
  now?: Date
}): Doc => {
  const already = originalDoc?.firstPublishedAt
  if (typeof already === 'string' && already) data.firstPublishedAt = already
  else if (data._status === 'published') data.firstPublishedAt = (now ?? new Date()).toISOString()
  // ⚠️ NULL, NEVER LEFT OUT: Payload gives every date column a `strftime('now')` default
  // (`generate:db-schema`, 2026-10-07), so an omitted value would stamp a new draft as published.
  else data.firstPublishedAt = null
  return data
}

/**
 * A post that was ever published keeps its address (E7): links to it are already shared and
 * printed, and a changed slug would break every one of them.
 */
export const lockPublishedSlug: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  collection,
  req,
}) => {
  if (operation !== 'update' || !originalDoc) return data
  const everPublished =
    originalDoc._status === 'published' ||
    (typeof originalDoc.firstPublishedAt === 'string' && originalDoc.firstPublishedAt !== '')
  if (everPublished && data.slug !== undefined && data.slug !== originalDoc.slug) {
    throw new ValidationError({
      collection: collection?.slug,
      errors: [
        {
          path: 'slug',
          message: 'A published post’s address cannot change: links to it would break.',
        },
      ],
      req,
    })
  }
  return data
}

/** The share picture's minimum (T8): LinkedIn asks for 1200 × 627, the site's cards are 1200 × 630. */
export const SHARE_IMAGE_MIN = { width: 1200, height: 630 } as const

/**
 * Refuses a share picture under 1200 × 630, reading the size Payload measured when the file
 * was uploaded. A file with no measured size is refused too: it is not a picture a link
 * preview can show. Checked on every save that has a picture, so a draft hears it early.
 */
export const requireShareImageSize: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  collection,
  req,
}) => {
  const id = uploadId(data.shareImage !== undefined ? data.shareImage : originalDoc?.shareImage)
  if (id === null || id === undefined || id === '') return data
  const media = (await req.payload.findByID({
    collection: 'media',
    id: id as number | string,
    depth: 0,
    req,
  })) as { width?: unknown; height?: unknown } | null
  const width = typeof media?.width === 'number' ? media.width : 0
  const height = typeof media?.height === 'number' ? media.height : 0
  if (width >= SHARE_IMAGE_MIN.width && height >= SHARE_IMAGE_MIN.height) return data
  throw new ValidationError({
    collection: collection?.slug,
    errors: [
      {
        path: 'shareImage',
        message: `The share picture must be at least ${SHARE_IMAGE_MIN.width} × ${SHARE_IMAGE_MIN.height} pixels; this one is ${width} × ${height}.`,
      },
    ],
    req,
  })
}

/** `checkedBy`'s validate: required when the post was drafted with AI help (T14). */
export function checkedByRequired(value: unknown, siblingData: Doc | undefined): true | string {
  if (!siblingData?.aiAssisted) return true
  return typeof value === 'string' && value.trim() !== ''
    ? true
    : 'Name the person who checked this post.'
}

/**
 * "Read more" holds at least one buyer guide and one buyer page (D7), each from the fixed list.
 * Payload skips field validation on a draft save, so this binds at publish.
 */
export function relatedPagesRequired(value: unknown): true | string {
  const chosen = Array.isArray(value) ? value : []
  const kinds = new Set(
    chosen.map((path) => JOURNAL_RELATED_PAGES.find((page) => page.path === path)?.kind),
  )
  return kinds.has('guide') && kinds.has('buyer') && !kinds.has(undefined)
    ? true
    : 'Choose at least one buyer guide and one “What we make” page.'
}

/** An author is saved only once their written consent is recorded (G19, F24). */
export function consentRecorded(value: unknown): true | string {
  return value === true ? true : 'Tick this only when the signed consent form is on file.'
}

/** An author's link: empty, or a LinkedIn page over https (nothing else is ever linked). */
export function linkedinUrl(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  return typeof value === 'string' && value.startsWith('https://www.linkedin.com/')
    ? true
    : 'Use a LinkedIn address starting https://www.linkedin.com/'
}

/**
 * A case study shows the client's name or words only with their permission (E7): saving with
 * a shown name or a quote is refused until `clientPermission` is ticked. A name typed while
 * "named" is off is never shown, so it needs no permission yet.
 */
export function clientPermissionRequired(
  value: unknown,
  siblingData: Doc | undefined,
): true | string {
  const text = (key: string) =>
    typeof siblingData?.[key] === 'string' && (siblingData[key] as string).trim() !== ''
  const needsPermission =
    (siblingData?.clientNamed === true && text('clientName')) || text('clientQuote')
  return !needsPermission || value === true
    ? true
    : 'Tick this only when the client has agreed to be named or quoted.'
}

// ---------------------------------------------------------------------------------------------
// IndexNow (E10, T10): tell Bing and the other IndexNow engines when a post is published.

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/**
 * The site's IndexNow key. ⚠️ PUBLIC BY DESIGN, NOT A SECRET: the protocol verifies it by
 * fetching `https://wear-run.com/<key>.txt`, which `apps/cms/public/` serves. It is the key
 * `scripts/ping-indexnow.mjs` sends on deploy; `journalHooks.test.ts` holds the two and the
 * file together.
 */
export const INDEXNOW_KEY = 'c7e4b2d9a1f83c5e6d0a7b4f2e9c1a3d'

/** The addresses a publish changed: the page itself and its hub. None for a draft. */
export function indexNowUrls(basePath: string, doc: Doc, origin: string): string[] {
  if (doc._status !== 'published' || typeof doc.slug !== 'string' || !doc.slug) return []
  return [`${origin}${basePath}/${doc.slug}`, `${origin}${basePath}`]
}

/**
 * ⚠️ ONLY FROM THE LIVE ADMIN, ON A SITE OPEN TO SEARCH ENGINES. `next dev`, the browser
 * suite's `next start` and a local preview all carry wrangler's vars (SITE_INDEXING is
 * `visible` there too), so the vars alone would let a local test post tell Bing about a
 * wear-run.com address that does not exist. The save's own host is what differs: the live
 * admin's requests arrive on `CMS_PUBLIC_URL`'s host, a local one on localhost.
 */
export function shouldPingIndexNow({
  siteIndexing,
  requestHost,
  cmsPublicUrl,
}: {
  siteIndexing: unknown
  requestHost: string | null | undefined
  cmsPublicUrl: unknown
}): boolean {
  if (siteIndexing !== 'visible' || !requestHost || typeof cmsPublicUrl !== 'string') return false
  try {
    return new URL(cmsPublicUrl).host === requestHost
  } catch {
    return false
  }
}

/** The protocol's JSON body (indexnow.org/documentation, read 2026-10-07). */
export function indexNowBody(host: string, urlList: readonly string[]) {
  return {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
    urlList: [...urlList],
  }
}

type Post = (url: string, init: RequestInit) => Promise<Response>
type Report = (where: string, error: unknown) => Promise<void>

/**
 * Sends the list. 200 and 202 are success (202: the key is still being checked). Anything
 * else, and any network failure, is reported and answered `false`. ⚠️ NEVER THROWS: it runs
 * after the owner's save has already succeeded, and a search engine being unreachable must
 * never look like a failed publish.
 */
export async function sendIndexNow(
  urlList: readonly string[],
  post: Post = fetch,
  report: Report = reportCaught,
): Promise<boolean> {
  try {
    const host = new URL(urlList[0] ?? SITE_ORIGIN).host
    const res = await post(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowBody(host, urlList)),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 200 || res.status === 202) return true
    await report('indexnow.publish', new Error(`IndexNow answered ${res.status}`))
    return false
  } catch (error) {
    await report('indexnow.publish', error)
    return false
  }
}

/**
 * The afterChange hook: on a publish, sends the page and its hub inside `waitUntil`, after
 * the response, so a publish is never slowed or failed by it.
 */
export const pingIndexNowWhenPublished =
  (basePath: string): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    try {
      const urls = indexNowUrls(basePath, doc as Doc, SITE_ORIGIN)
      if (urls.length === 0) return doc
      const context = await getCloudflareContext({ async: true }).catch(() => null)
      const env = context?.env as Record<string, unknown> | undefined
      const requestHost = req.headers?.get?.('host') ?? null
      if (!context?.ctx || !shouldPingIndexNow({ ...pickEnv(env), requestHost })) return doc
      context.ctx.waitUntil(sendIndexNow(urls))
    } catch (error) {
      void reportCaught('indexnow.publish', error)
    }
    return doc
  }

const pickEnv = (env: Record<string, unknown> | undefined) => ({
  siteIndexing: env?.SITE_INDEXING,
  cmsPublicUrl: env?.CMS_PUBLIC_URL,
})
