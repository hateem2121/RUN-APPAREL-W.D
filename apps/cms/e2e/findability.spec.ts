import { expect, test } from '@playwright/test'

/**
 * Findability and no-JavaScript guards for `docs/AUDIT-BETA-WEBSITE-2026-09-06.md`.
 *
 * ⚠️ EVERY ONE OF THESE IS INVISIBLE IN A BROWSER. A missing canonical, an og:image that
 * stopped resolving, a JSON-LD block that no longer parses, a page that renders only
 * after hydration — none of them changes what a developer sees, and all of them change
 * what a search engine, a link unfurler or a reader on a failed script load gets. The
 * audit found four 1/10 findings in exactly this area on exactly these pages.
 */

const PAGES = [
  { path: '/', name: 'home', ld: 'Organization' },
  { path: '/products', name: 'products', ld: 'ItemList' },
  { path: '/contact', name: 'contact', ld: 'ContactPage' },
] as const

/** The head, as a crawler that does not run scripts sees it. */
const headOf = (html: string) => html.slice(0, html.indexOf('</head>') + 1)

test.describe('FA-N-04 — every page names itself', () => {
  /**
   * MEASURED 2026-09-06: `/` carries 62 characters of title and 264 of description,
   * `/contact` 25 and 143, and both canonicals are self-referential and path-correct.
   *
   * ⚠️ THE CANONICAL IS THE ONE THAT HAS ALREADY GONE WRONG HERE, AT 1/10 (FA-N-01):
   * every canonical named a host that 404'd. A canonical is inert until it is wrong, and
   * then it tells every search engine to index a page that does not exist. This asserts
   * the shape — absolute, https, and ending in this page's own path — not the hostname,
   * which is environment-dependent.
   */
  for (const page of PAGES) {
    test(`${page.name} has a title, a description and a self-referential canonical`, async ({
      request,
    }) => {
      const response = await request.get(page.path)
      expect(response.status()).toBe(200)
      const head = headOf(await response.text())

      const title = head.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
      expect(title.length, `${page.path} has no <title> in the head`).toBeGreaterThan(10)
      expect(title.length, `${page.path} title is too long to survive a SERP`).toBeLessThan(120)

      const description =
        head.match(/<meta name="description" content="([^"]*)"/)?.[1] ??
        head.match(/<meta content="([^"]*)" name="description"/)?.[1] ??
        ''
      expect(description.length, `${page.path} has no meta description`).toBeGreaterThan(50)

      const canonical =
        head.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ??
        head.match(/<link href="([^"]*)" rel="canonical"/)?.[1] ??
        ''
      expect(canonical, `${page.path} has no canonical`).toMatch(/^https:\/\//)
      const suffix = page.path === '/' ? '' : page.path
      expect(
        new URL(canonical).pathname.replace(/\/$/, ''),
        `${page.path} canonical points somewhere else`,
      ).toBe(suffix)
    })
  }
})

test.describe('FA-N-06 — nine real crawlers get a card, in the head', () => {
  /**
   * MEASURED 2026-09-06 by changing nothing but the `User-Agent`: `og:title` appears
   * before `</head>` for every one of these agents. "In the head" is the whole assertion
   * — FA-N-05 records that `/products` streams its metadata into the BODY for an ordinary
   * browser, which unfurlers that stop at `</head>` never see.
   *
   * ⚠️ THIS IS THE `Sec-Fetch-Mode` CLASS OF BUG, WHICH THIS DOMAIN HAS ALREADY HAD
   * TWICE. A request header nobody thinks about decides which branch renders, so the
   * page a developer loads and the page a crawler gets are different documents — and the
   * only way to find out is to send the header. `curl` reported one of those fixed while
   * it was still broken.
   */
  const CRAWLERS = [
    'facebookexternalhit/1.1',
    'WhatsApp/2.23.20.0',
    'Slackbot-LinkExpanding 1.0',
    'Twitterbot/1.0',
    'LinkedInBot/1.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'Discordbot/2.0',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ]

  for (const path of ['/', '/products'] as const) {
    test(`${path} unfurls for all nine`, async ({ playwright }) => {
      const missing: string[] = []
      for (const agent of CRAWLERS) {
        const context = await playwright.request.newContext({
          baseURL: test.info().project.use.baseURL,
          extraHTTPHeaders: {
            'user-agent': agent,
            // The header that decides the branch on this domain. A crawler fetching a
            // link sends `navigate`, and that is the case that has broken before.
            'sec-fetch-mode': 'navigate',
          },
        })
        const head = headOf(await (await context.get(path)).text())
        for (const property of ['og:title', 'og:description', 'og:image']) {
          if (!head.includes(`property="${property}"`) && !head.includes(`"${property}"`)) {
            missing.push(`${agent.slice(0, 28)} → ${property}`)
          }
        }
        await context.dispose()
      }
      expect(missing, `${path} did not unfurl for every crawler`).toEqual([])
    })
  }
})

test.describe('FA-N-07 — the social card resolves and is the right size', () => {
  /**
   * MEASURED 2026-09-06: `og-default.png` → 200, `image/png`, 64,448 bytes, **1200 × 630**,
   * matching the declared `og:image:width`/`og:image:height`, with `og:image:alt` present.
   *
   * ⚠️ THE DECLARED SIZE AND THE REAL SIZE ARE ASSERTED AGAINST EACH OTHER, because
   * either one can move alone. A card whose declared dimensions do not match the file is
   * cropped or letterboxed by every platform, and the person who replaces the artwork is
   * not the person who wrote the meta tags.
   */
  test('the file is there, is a PNG, and is 1200 x 630 as declared', async ({ page, request }) => {
    await page.goto('/')
    const declared = await page.evaluate(() => ({
      url: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
      width: document.querySelector('meta[property="og:image:width"]')?.getAttribute('content'),
      height: document.querySelector('meta[property="og:image:height"]')?.getAttribute('content'),
      alt: document.querySelector('meta[property="og:image:alt"]')?.getAttribute('content'),
    }))
    expect(declared.url, 'no og:image at all').toMatch(/^https?:\/\//)
    expect(declared.alt, 'the card has no alt text').toBeTruthy()

    /*
     * ⚠️ THE PATH IS FETCHED FROM THIS SERVER, NOT THE DECLARED ABSOLUTE URL. The tag
     * correctly names the production origin, which this fixture is not; fetching it would
     * make the gate depend on the live site being up, and CI has already learned that a
     * `wear-run.help` fetch from a runner can 403 for reasons that are not a defect.
     */
    const response = await request.get(new URL(declared.url).pathname)
    expect(response.status(), `${declared.url} does not resolve on this origin`).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')

    // PNG IHDR: width and height are big-endian uint32 at byte offsets 16 and 20.
    const bytes = await response.body()
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    expect({ width, height }, 'the social card is no longer 1200 x 630').toEqual({
      width: 1200,
      height: 630,
    })
    expect(Number(declared.width), 'og:image:width disagrees with the file').toBe(width)
    expect(Number(declared.height), 'og:image:height disagrees with the file').toBe(height)
  })
})

test.describe('FA-N-08 — the structured data parses and says what it should', () => {
  /**
   * MEASURED 2026-09-06: every block parses; `/` carries `Organization`, `/contact` adds
   * a `ContactPage` whose `mainEntity` `@id`-references it, `/products` adds an
   * `ItemList`.
   *
   * ⚠️ JSON-LD FAILS SILENTLY AND COMPLETELY. One unescaped quote in a CMS-authored
   * field — an address, a company name with an apostrophe — makes the whole block
   * unparseable, and the page looks perfect. `structuredData.test.ts` covers the builder;
   * this covers what the server actually emitted, which is where the escaping happens.
   */
  for (const page of PAGES) {
    test(`${page.name} emits parseable ${page.ld}`, async ({ request }) => {
      const html = await (await request.get(page.path)).text()
      const blocks = [
        ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
      ].map((match) => match[1] ?? '')
      expect(blocks.length, `${page.path} emits no JSON-LD at all`).toBeGreaterThan(0)

      const types: string[] = []
      for (const [index, block] of blocks.entries()) {
        let parsed: unknown
        expect(
          () => {
            parsed = JSON.parse(block)
          },
          `${page.path} JSON-LD block ${index} does not parse: ${block.slice(0, 80)}`,
        ).not.toThrow()
        const collect = (node: unknown) => {
          if (Array.isArray(node)) return node.forEach(collect)
          if (node && typeof node === 'object') {
            const type = (node as Record<string, unknown>)['@type']
            if (typeof type === 'string') types.push(type)
            if (Array.isArray((node as Record<string, unknown>)['@graph'])) {
              collect((node as Record<string, unknown>)['@graph'])
            }
          }
        }
        collect(parsed)
      }
      expect(types, `${page.path} no longer declares ${page.ld}`).toContain(page.ld)
    })
  }
})

test.describe('FA-N-11 — the heading outline is real', () => {
  /**
   * MEASURED 2026-09-06 in the SERVER-RENDERED HTML: exactly one `<h1>` per page with
   * sensible `h2`/`h3` beneath — `/` = h1 + 4×h2 + 6×h3, `/products` = h1 + 11×h2,
   * `/contact` = h1 + 2×h2 + h3.
   *
   * The counts are not asserted — they move whenever the catalogue does. The two
   * properties that must not move are: one h1, and no level skipped. A jump from h1 to
   * h3 is how a screen-reader user loses the structure of a page that looks fine.
   */
  for (const page of PAGES) {
    test(`${page.name} has one h1 and skips no level`, async ({ request }) => {
      const html = await (await request.get(page.path)).text()
      const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
      expect(levels.filter((level) => level === 1).length, `${page.path} h1 count`).toBe(1)
      expect(levels[0], `${page.path} starts below h1`).toBe(1)
      let previous = 1
      const skips: string[] = []
      for (const level of levels) {
        if (level > previous + 1) skips.push(`h${previous} → h${level}`)
        previous = level
      }
      expect(skips, `${page.path} skips a heading level`).toEqual([])
    })
  }
})

test.describe('FA-P-02 / FA-W-04 — the pages work with scripting off', () => {
  test.use({ javaScriptEnabled: false })

  /**
   * MEASURED 2026-09-06: all three real pages render fully with JavaScript disabled, and
   * navigation works. This is the CONTROL that made FA-P-01 a finding rather than a
   * property of the framework — the branded 404 rendered nothing at all without scripts,
   * at 1/10, while these three were fine.
   *
   * ⚠️ THIS IS ONE `'use client'` AWAY FROM UNTRUE, and nothing about that diff looks
   * dangerous. navbar.spec.ts already covers the two nav links at two widths; what is
   * added here is that the page CONTENT survives — the gallery, the structured data, and
   * the footer's routes out — because a page that renders its chrome and none of its
   * substance still passes a link check.
   */
  for (const page of PAGES) {
    test(`${page.name} renders its content and its structured data`, async ({ page: browser }) => {
      const response = await browser.goto(page.path)
      expect(response?.status()).toBe(200)

      await expect(browser.locator('h1')).toHaveCount(1)
      const text = (await browser.locator('main').innerText()).trim()
      expect(text.length, `${page.path} rendered almost nothing without scripts`).toBeGreaterThan(
        200,
      )
      await expect(browser.locator('.site-footer')).toBeVisible()
      // The structured data is markup, not script execution — it must be there too.
      expect(
        await browser.locator('script[type="application/ld+json"]').count(),
        `${page.path} lost its JSON-LD without scripts`,
      ).toBeGreaterThan(0)
    })
  }

  test('the footer tab and the gallery are reachable without scripts', async ({ page }) => {
    await page.goto('/')
    // The one call to action in the footer is a real link with a real href.
    const tab = page.locator('.site-footer__tab')
    await expect(tab).toHaveAttribute('href', /\/contact$|^mailto:/)

    // and a link out of the home page navigates for real
    await page.locator('a.btn', { hasText: /3D references/i }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.locator('h1')).toHaveCount(1)
  })
})
