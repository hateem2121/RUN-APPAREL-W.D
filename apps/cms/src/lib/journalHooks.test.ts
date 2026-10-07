import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.hoisted`, as in contentVersion.test.ts: vi.mock's factory runs before module scope.
const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))

import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  checkedByRequired,
  clientPermissionRequired,
  consentRecorded,
  indexNowBody,
  linkedinUrl,
  relatedPagesRequired,
  indexNowUrls,
  lockPublishedSlug,
  markFirstPublished,
  pingIndexNowWhenPublished,
  requireShareImageSize,
  sendIndexNow,
  shouldPingIndexNow,
  validSlug,
} from './journalHooks'

/**
 * The rules a Journal post (and a case study) is saved under (PLAN.md E7, E10).
 *
 * Each hook is called the way Payload calls it, with a stand-in `req`, so what is tested is the
 * decision, not Payload. What would have to break in production for these to fail: a published
 * post's address changing under the links already shared, a share picture too small for
 * LinkedIn's preview, a ping for a draft, or a ping that throws into the owner's save.
 */

type Doc = Record<string, unknown>
const args = (over: {
  data?: Doc
  originalDoc?: Doc
  operation?: 'create' | 'update'
  find?: (id: unknown) => Promise<Doc>
}) =>
  ({
    data: over.data ?? {},
    originalDoc: over.originalDoc,
    operation: over.operation ?? 'update',
    collection: { slug: 'journal-posts' },
    context: {},
    req: {
      payload: {
        findByID: vi.fn(async ({ id }: { id: unknown }) =>
          over.find ? over.find(id) : { id, width: 1200, height: 630 },
        ),
      },
    },
  }) as never

describe('a published post keeps its address', () => {
  const published = { slug: 'made-properly', _status: 'published' }

  it('refuses a new slug on a post that is published', async () => {
    await expect(
      lockPublishedSlug(args({ data: { slug: 'made-well' }, originalDoc: published })),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses it too on a post published once and since drafted again', async () => {
    // Payload hands a draft-over-published save the latest DRAFT as originalDoc, so the
    // status alone would let a renamed draft through and then publish it under a new address.
    await expect(
      lockPublishedSlug(
        args({
          data: { slug: 'made-well', _status: 'published' },
          originalDoc: {
            slug: 'made-properly',
            _status: 'draft',
            firstPublishedAt: '2026-10-07T08:00:00.000Z',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('lets a never-published draft change its slug, and a published post save other edits', async () => {
    const draft = { slug: 'made-properly', _status: 'draft' }
    expect(
      await lockPublishedSlug(args({ data: { slug: 'made-well' }, originalDoc: draft })),
    ).toEqual({ slug: 'made-well' })
    expect(
      await lockPublishedSlug(args({ data: { title: 'New title' }, originalDoc: published })),
    ).toEqual({ title: 'New title' })
    expect(
      await lockPublishedSlug(
        args({ data: { slug: 'made-properly', title: 'x' }, originalDoc: published }),
      ),
    ).toEqual({ slug: 'made-properly', title: 'x' })
  })

  it('a create is never locked', async () => {
    expect(await lockPublishedSlug(args({ data: { slug: 'a' }, operation: 'create' }))).toEqual({
      slug: 'a',
    })
  })
})

describe('the first publication is remembered', () => {
  const at = new Date('2026-10-07T08:00:00.000Z')

  it('is stamped when a post is first published, and never moved after', () => {
    const first = markFirstPublished({
      data: { _status: 'published' },
      originalDoc: { _status: 'draft' },
      now: at,
    } as never)
    expect(first.firstPublishedAt).toBe('2026-10-07T08:00:00.000Z')

    const later = markFirstPublished({
      data: { _status: 'published', firstPublishedAt: '2099-01-01T00:00:00.000Z' },
      originalDoc: { firstPublishedAt: '2026-10-01T00:00:00.000Z' },
      now: at,
    } as never)
    expect(later.firstPublishedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('is not stamped by a draft save', () => {
    const draft = markFirstPublished({
      data: { _status: 'draft' },
      originalDoc: undefined,
      now: at,
    } as never)
    // NULL, written out: left undefined, the column's own default (Payload gives every date
    // column `strftime('now')`, read in `generate:db-schema`) would stamp a draft as published
    // and lock its address before it was ever live.
    expect(draft.firstPublishedAt).toBeNull()
  })
})

describe('the share picture is large enough for a link preview (T8: at least 1200 × 630)', () => {
  it('accepts 1200 × 630 and larger', async () => {
    const data = { shareImage: 7 }
    expect(await requireShareImageSize(args({ data }))).toBe(data)
  })

  it('refuses a picture under either measure, naming its size', async () => {
    for (const size of [
      { width: 1199, height: 630 },
      { width: 1200, height: 629 },
    ]) {
      const call = requireShareImageSize(
        args({ data: { shareImage: 7 }, find: async () => ({ id: 7, ...size }) }),
      )
      await expect(call).rejects.toBeInstanceOf(ValidationError)
      await expect(call).rejects.toMatchObject({
        data: { errors: [expect.objectContaining({ path: 'shareImage' })] },
      })
    }
  })

  it('refuses a file with no measured size (not a picture, or not read)', async () => {
    await expect(
      requireShareImageSize(args({ data: { shareImage: 7 }, find: async () => ({ id: 7 }) })),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('reads the picture from a populated value too, and checks nothing when none is set', async () => {
    const find = vi.fn(async () => ({ width: 2400, height: 1260 }))
    await requireShareImageSize(args({ data: { shareImage: { id: 9 } }, find }))
    expect(find).toHaveBeenCalledWith(9)
    const none = { title: 'x' }
    expect(await requireShareImageSize(args({ data: none }))).toBe(none)
  })

  it('checks the picture already on the post when the save does not name one', async () => {
    const find = vi.fn(async () => ({ width: 600, height: 315 }))
    await expect(
      requireShareImageSize(
        args({ data: { _status: 'published' }, originalDoc: { shareImage: 4 }, find }),
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(find).toHaveBeenCalledWith(4)
  })
})

describe('the AI-help line names the person who checked it (T14)', () => {
  it('is required only when the post was drafted with AI help', () => {
    // The checker is an author row (2026-10-07): an id, or the populated row.
    expect(checkedByRequired(null, { aiAssisted: true })).toEqual(expect.any(String))
    expect(checkedByRequired(undefined, { aiAssisted: true })).toEqual(expect.any(String))
    expect(checkedByRequired(3, { aiAssisted: true })).toBe(true)
    expect(checkedByRequired({ id: 3 }, { aiAssisted: true })).toBe(true)
    // A typed name is not an author: refused, so no unconsented name reaches the page.
    expect(checkedByRequired('A. Writer', { aiAssisted: true })).toEqual(expect.any(String))
    expect(checkedByRequired(null, { aiAssisted: false })).toBe(true)
    expect(checkedByRequired(undefined, {})).toBe(true)
  })
})

describe('the field rules', () => {
  it('Read more holds at least one buyer guide and one buyer page (D7)', () => {
    const guide = '/guides/minimum-order-and-samples'
    const buyer = '/custom-teamwear-manufacturer'
    expect(relatedPagesRequired([guide, buyer])).toBe(true)
    expect(relatedPagesRequired([guide])).toEqual(expect.any(String))
    expect(relatedPagesRequired([buyer])).toEqual(expect.any(String))
    expect(relatedPagesRequired([guide, '/journal'])).toEqual(expect.any(String))
    expect(relatedPagesRequired(null)).toEqual(expect.any(String))
  })

  it('an author is saved only with consent recorded (G19)', () => {
    expect(consentRecorded(true)).toBe(true)
    expect(consentRecorded(false)).toEqual(expect.any(String))
    expect(consentRecorded(undefined)).toEqual(expect.any(String))
  })

  it('an author’s link is a LinkedIn page or nothing', () => {
    expect(linkedinUrl('https://www.linkedin.com/in/someone')).toBe(true)
    expect(linkedinUrl('')).toBe(true)
    expect(linkedinUrl(undefined)).toBe(true)
    for (const bad of [
      'http://www.linkedin.com/in/someone',
      'https://linkedin.com.evil.example/in/x',
      'https://evil.example/https://www.linkedin.com/',
      'javascript:alert(1)',
    ]) {
      expect(linkedinUrl(bad), bad).toEqual(expect.any(String))
    }
  })

  it('a case study names its client or quotes them only with their permission (E7)', () => {
    expect(clientPermissionRequired(false, { clientDescription: 'a club in the UK' })).toBe(true)
    expect(clientPermissionRequired(false, { clientNamed: true, clientName: 'A Club' })).toEqual(
      expect.any(String),
    )
    expect(clientPermissionRequired(false, { clientQuote: 'Great kit.' })).toEqual(
      expect.any(String),
    )
    expect(clientPermissionRequired(true, { clientNamed: true, clientName: 'A Club' })).toBe(true)
    // A name typed but not switched on is not shown, so it needs no permission yet.
    expect(clientPermissionRequired(false, { clientNamed: false, clientName: 'A Club' })).toBe(true)
  })
})

describe('a slug is lowercase words joined by single hyphens, up to 80 characters', () => {
  it('accepts and refuses the right shapes', () => {
    expect(validSlug('made-properly')).toBe(true)
    expect(validSlug('b2-sample-room')).toBe(true)
    for (const bad of ['Made-Properly', 'made--properly', '-made', 'made-', 'made properly', '']) {
      expect(validSlug(bad), bad).toEqual(expect.any(String))
    }
    expect(validSlug('a'.repeat(81))).toEqual(expect.any(String))
    expect(validSlug(null)).toEqual(expect.any(String))
  })
})

describe('IndexNow on publish (E10)', () => {
  it('names the post and its hub, on the site origin', () => {
    expect(
      indexNowUrls(
        '/journal',
        { _status: 'published', slug: 'made-properly' },
        'https://wear-run.com',
      ),
    ).toEqual(['https://wear-run.com/journal/made-properly', 'https://wear-run.com/journal'])
  })

  it('names nothing for a draft, or a post with no slug', () => {
    expect(
      indexNowUrls('/journal', { _status: 'draft', slug: 'a' }, 'https://wear-run.com'),
    ).toEqual([])
    expect(indexNowUrls('/journal', { _status: 'published' }, 'https://wear-run.com')).toEqual([])
  })

  it('pings only from the live admin, on a site open to search engines', () => {
    const live = {
      siteIndexing: 'visible',
      requestHost: 'cms.wear-run.help',
      cmsPublicUrl: 'https://cms.wear-run.help',
    }
    expect(shouldPingIndexNow(live)).toBe(true)
    // `next dev`, `next start` for the browser suite and a local preview all carry
    // wrangler's vars, but the save arrives on localhost: that must not tell Bing about
    // wear-run.com addresses that do not exist yet.
    expect(shouldPingIndexNow({ ...live, requestHost: 'localhost:4174' })).toBe(false)
    expect(shouldPingIndexNow({ ...live, siteIndexing: 'hidden' })).toBe(false)
    expect(shouldPingIndexNow({ ...live, cmsPublicUrl: undefined })).toBe(false)
    expect(shouldPingIndexNow({ ...live, requestHost: null })).toBe(false)
  })

  it('sends the protocol’s body: host, key, the key file’s address and the list', () => {
    expect(indexNowBody('wear-run.com', ['https://wear-run.com/journal'])).toEqual({
      host: 'wear-run.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://wear-run.com/${INDEXNOW_KEY}.txt`,
      urlList: ['https://wear-run.com/journal'],
    })
    expect(INDEXNOW_ENDPOINT).toBe('https://api.indexnow.org/indexnow')
  })

  it('uses the key the deploy script uses, and the file that proves it is served', () => {
    // The key is public by design: the protocol checks it by fetching /<key>.txt.
    const repo = join(import.meta.dirname, '..', '..', '..', '..')
    const script = readFileSync(join(repo, 'scripts', 'ping-indexnow.mjs'), 'utf8')
    expect(script).toContain(`const DEFAULT_KEY = '${INDEXNOW_KEY}'`)
    const file = join(repo, 'apps', 'cms', 'public', `${INDEXNOW_KEY}.txt`)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8').trim()).toBe(INDEXNOW_KEY)
  })

  it('reports a refusal or a failure and never throws', async () => {
    const report = vi.fn(async () => {})
    const refused = vi.fn(async () => new Response('', { status: 403 }))
    await expect(sendIndexNow(['https://wear-run.com/journal'], refused, report)).resolves.toBe(
      false,
    )
    expect(report).toHaveBeenCalledTimes(1)

    const broken = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(sendIndexNow(['https://wear-run.com/journal'], broken, report)).resolves.toBe(
      false,
    )
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('posts JSON to the endpoint and counts 200 and 202 as sent', async () => {
    const report = vi.fn(async () => {})
    for (const status of [200, 202]) {
      const post = vi.fn(async (_url: string, _init: RequestInit) => new Response('', { status }))
      await expect(sendIndexNow(['https://wear-run.com/journal'], post, report)).resolves.toBe(true)
      const [url, init] = post.mock.calls[0]!
      expect(url).toBe(INDEXNOW_ENDPOINT)
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body)).urlList).toEqual(['https://wear-run.com/journal'])
    }
    expect(report).not.toHaveBeenCalled()
  })
})

describe('the publish hook itself', () => {
  const liveEnv = { SITE_INDEXING: 'visible', CMS_PUBLIC_URL: 'https://cms.wear-run.help' }
  const hook = pingIndexNowWhenPublished('/journal')
  const call = (doc: Doc, host: string) =>
    hook({ doc, req: { headers: new Headers({ host }) } } as never)

  beforeEach(() => {
    getCloudflareContext.mockReset()
    vi.unstubAllGlobals()
  })

  it('hands the ping to waitUntil on a publish from the live admin, and returns the doc', async () => {
    const waitUntil = vi.fn()
    const post = vi.fn(async () => new Response('', { status: 202 }))
    vi.stubGlobal('fetch', post)
    getCloudflareContext.mockResolvedValue({ env: liveEnv, ctx: { waitUntil } })
    const doc = { _status: 'published', slug: 'made-properly' }
    expect(await call(doc, 'cms.wear-run.help')).toBe(doc)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0]![0]
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('sends nothing for a draft, from localhost, or with no Worker context', async () => {
    const waitUntil = vi.fn()
    getCloudflareContext.mockResolvedValue({ env: liveEnv, ctx: { waitUntil } })
    await call({ _status: 'draft', slug: 'a' }, 'cms.wear-run.help')
    await call({ _status: 'published', slug: 'a' }, 'localhost:4174')
    expect(waitUntil).not.toHaveBeenCalled()

    getCloudflareContext.mockRejectedValue(new Error('no context under payload run'))
    const doc = { _status: 'published', slug: 'a' }
    expect(await call(doc, 'cms.wear-run.help')).toBe(doc)
  })
})
