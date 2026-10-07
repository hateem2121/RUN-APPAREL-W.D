import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type APIRequestContext, expect, test } from './offlineMedia'

/**
 * The Journal and the case studies in a real browser (PLAN.md Task 4.7, Task 5.3; review focus 4:
 * "a draft Journal post or a draft case study is readable by the public").
 *
 * The suite writes its own two posts through the REST API, as the seeded dev admin (the
 * credentials `src/seed/seed.ts` prints, which only a local or CI database has), and deletes
 * them afterwards: one PUBLISHED and one DRAFT, so each anonymous read below is asked about a
 * real draft. Slugs carry the browser's name, because the three engines run side by side
 * against one database.
 *
 * ⚠️ ONLY THE POST PAGES ARE ASSERTED STRAIGHT AWAY. The hub, the sitemap and the feed read a
 * list `lib/content.ts` keeps for 60 seconds in memory, so a post written a moment ago can
 * take up to a minute to join them; the feed check polls for 75 seconds. A post's own page
 * reads the database the first time it is asked, and a draft's address is never remembered.
 *
 * ⚠️ THE CASE STUDIES ARE LEFT EMPTY ON PURPOSE: that hub is checked in the state it ships in,
 * 200 with `noindex` and absent from the sitemap and llms.txt (T5). The published state of both
 * hubs is held by the unit suite (`newPagesWiring.test.ts`, `searchVisibility.test.ts`).
 */

const ADMIN = { email: 'admin@wear-run.help', password: 'run-apparel-dev-only' }
const SHARE_CARD = join(import.meta.dirname, '..', 'public', 'share', 'home.jpg')

type Created = { token: string; media: number; published: number; draft: number }

/** A Lexical body with one paragraph, the shape the CMS editor saves. */
const body = (words: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          {
            type: 'text',
            text: words,
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
      },
    ],
  },
})

async function setUp(request: APIRequestContext, suffix: string): Promise<Created> {
  const login = await request.post('/api/users/login', { data: ADMIN })
  expect(login.ok(), 'the seeded dev admin could not sign in — was `pnpm seed:cms` run?').toBe(true)
  const { token } = (await login.json()) as { token: string }
  const auth = { Authorization: `JWT ${token}` }

  const upload = await request.post('/api/media', {
    headers: auth,
    multipart: {
      file: {
        name: `journal-e2e-${suffix}.jpg`,
        mimeType: 'image/jpeg',
        buffer: readFileSync(SHARE_CARD),
      },
      _payload: JSON.stringify({ alt: 'A test picture for the Journal suite' }),
    },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const media = ((await upload.json()) as { doc: { id: number } }).doc.id

  const post = (slug: string, status: 'published' | 'draft') => ({
    title: `Test post ${suffix} ${status}`,
    slug,
    description: 'A post the browser suite writes and removes.',
    cluster: 'company-news',
    publishedAt: '2026-10-08T09:00:00.000Z',
    heroImage: media,
    shareImage: media,
    body: body('A short paragraph in a test post.'),
    relatedPages: ['/guides/minimum-order-and-samples', '/custom-teamwear-manufacturer'],
    _status: status,
  })
  const published = await request.post('/api/journal-posts', {
    headers: auth,
    data: post(`e2e-published-${suffix}`, 'published'),
  })
  expect(published.ok(), await published.text()).toBe(true)
  const draft = await request.post('/api/journal-posts?draft=true', {
    headers: auth,
    data: post(`e2e-draft-${suffix}`, 'draft'),
  })
  expect(draft.ok(), await draft.text()).toBe(true)
  return {
    token,
    media,
    published: ((await published.json()) as { doc: { id: number } }).doc.id,
    draft: ((await draft.json()) as { doc: { id: number } }).doc.id,
  }
}

test.describe('the Journal', () => {
  test.describe.configure({ mode: 'serial' })
  let created: Created | null = null
  let suffix = ''

  test.beforeAll(async ({ playwright }, testInfo) => {
    suffix = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const request = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    created = await setUp(request, suffix)
    await request.dispose()
  })

  test.afterAll(async ({ playwright }, testInfo) => {
    if (!created) return
    const request = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    const auth = { Authorization: `JWT ${created.token}` }
    await request.delete(`/api/journal-posts/${created.published}`, { headers: auth })
    await request.delete(`/api/journal-posts/${created.draft}`, { headers: auth })
    await request.delete(`/api/media/${created.media}`, { headers: auth })
    await request.dispose()
  })

  test('a published post renders on the server, with one h1 and its article data', async ({
    page,
  }) => {
    const response = await page.goto(`/journal/e2e-published-${suffix}`)
    expect(response?.status()).toBe(200)
    const h1 = page.locator('h1')
    await expect(h1).toHaveCount(1)
    await expect(h1).toHaveText(`Test post ${suffix} published`)
    await expect(page.locator('.journal-body')).toContainText('A short paragraph in a test post.')

    const data = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((tags) => tags.map((tag) => JSON.parse(tag.textContent ?? '{}')))
    const article = data.find((entry) => entry['@type'] === 'BlogPosting')
    expect(article?.headline).toBe(`Test post ${suffix} published`)
    expect(article?.datePublished).toBe('2026-10-08T09:00:00.000Z')
    expect(article?.author?.['@id']).toMatch(/\/#organization$/)

    const meta = (key: string) =>
      page.locator(`meta[property="${key}"]`).first().getAttribute('content')
    expect(await meta('og:type')).toBe('article')
    expect(await meta('article:published_time')).toBe('2026-10-08T09:00:00.000Z')
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(
      new RegExp(`/journal/e2e-published-${suffix}$`),
    )
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveCount(1)
    // Read more: one guide and one buyer page, as chosen.
    await expect(page.locator('nav[aria-labelledby="read-more"] a')).toHaveCount(2)
  })

  test('a draft’s address is a 404 for anyone not signed in', async ({ page }) => {
    const response = await page.goto(`/journal/e2e-draft-${suffix}`)
    expect(response?.status()).toBe(404)
    await expect(page.locator('body')).not.toContainText(`Test post ${suffix} draft`)
  })

  test('the API shows an anonymous reader published posts only', async ({ request }) => {
    const drafts = await request.get('/api/journal-posts?where[_status][equals]=draft&depth=0')
    expect(drafts.ok()).toBe(true)
    expect(((await drafts.json()) as { docs: unknown[] }).docs).toEqual([])

    const all = await request.get('/api/journal-posts?depth=0&limit=100')
    const slugs = ((await all.json()) as { docs: { slug: string }[] }).docs.map((doc) => doc.slug)
    expect(slugs).toContain(`e2e-published-${suffix}`)
    expect(slugs).not.toContain(`e2e-draft-${suffix}`)

    const byDraft = await request.get(`/api/journal-posts?draft=true&depth=0&limit=100`)
    const draftSlugs = ((await byDraft.json()) as { docs: { slug: string }[] }).docs.map(
      (doc) => doc.slug,
    )
    expect(draftSlugs, '?draft=true must not open drafts to an anonymous reader').not.toContain(
      `e2e-draft-${suffix}`,
    )
  })

  test('an address that is no post is a 404', async ({ page }) => {
    expect((await page.goto('/journal/no-such-post-anywhere'))?.status()).toBe(404)
  })

  test('the feed is RSS 2.0 and soon carries the published post, never the draft', async ({
    request,
  }) => {
    await expect(async () => {
      const response = await request.get('/journal/rss.xml')
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('application/rss+xml')
      const xml = await response.text()
      expect(xml).toContain('<rss version="2.0"')
      expect(xml).toContain(`/journal/e2e-published-${suffix}</link>`)
      expect(xml).not.toContain(`e2e-draft-${suffix}`)
    }).toPass({ timeout: 75_000 })
  })
})

test.describe('the case studies, before the first one is published', () => {
  test('the hub answers 200 with its words, asks not to be indexed, and is listed nowhere', async ({
    page,
    request,
  }) => {
    const response = await page.goto('/case-studies')
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toHaveText(/Proof, not promises\./)
    await expect(page.getByRole('heading', { name: 'Want to be our first story?' })).toBeVisible()
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((tags) => tags.map((tag) => tag.getAttribute('content') ?? ''))
    expect(robots.some((content) => /noindex/i.test(content))).toBe(true)

    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/case-studies')
    expect(await (await request.get('/llms.txt')).text()).not.toContain('/case-studies')
  })

  test('an address under it is a 404', async ({ page }) => {
    expect((await page.goto('/case-studies/no-such-story'))?.status()).toBe(404)
  })
})
