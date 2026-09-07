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

/**
 * FA-N-16, FA-N-17, FA-N-18 — what a machine reader gets.
 *
 * The unit suites already pin the CONTENT of `/robots.txt`, `/llms.txt` and the
 * `htmlLimitedBots` pattern. What they cannot say is that any of it is SERVED: a route
 * handler under a route group would answer the same URL wrapped in the site's HTML
 * document, and `robots.ts` in the wrong directory serves nothing at all with no error.
 * This is the half that only a request can answer.
 */
test.describe('FA-N-16 / FA-N-17 — the machine-readable files are served as text', () => {
  for (const path of ['/robots.txt', '/llms.txt']) {
    test(`${path} is plain text, not a web page`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status(), `${path} did not answer`).toBe(200)
      expect(res.headers()['content-type']).toContain('text/plain')

      const body = await res.text()
      /*
       * ⚠️ THE ASSERTION THAT MATTERS. apps/viewer/public/robots.txt carries the account:
       * with no file present, the SPA fallback answered /robots.txt with index.html as
       * `text/plain` — 46 lines of markup that a crawler parses line by line as
       * directives. A 200 and a content-type prove nothing on their own.
       */
      expect(body, `${path} is serving HTML`).not.toMatch(/<\/(html|body|div)>/i)
      expect(body.length).toBeGreaterThan(80)
    })
  }

  test('robots.txt names the AI crawlers AND still refuses them the admin', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text()
    /*
     * ⚠️ CASE-INSENSITIVE, BECAUSE A CRAWLER IS. Field names in robots.txt are
     * case-insensitive per RFC 9309, and the spelling here has already changed once:
     * Next's `robots.ts` convention emitted `User-Agent:` and the hand-built file that
     * replaced it writes `User-agent:`, which is the spelling the RFC and Google's own
     * documentation use. A literal match failed against a file no crawler would read any
     * differently.
     */
    expect(body).toMatch(/^user-agent:\s*GPTBot$/im)
    expect(body).toMatch(/^user-agent:\s*ClaudeBot$/im)
    // The two sides of the owner's decision, on the served file.
    expect(body, 'the training-only crawlers are no longer refused').toMatch(/^disallow:\s*\/$/im)
    expect(body, 'OAI-SearchBot must stay welcome — it is what cites you in ChatGPT').toMatch(
      /^user-agent:\s*OAI-SearchBot$/im,
    )

    /*
     * A named group REPLACES the wildcard group for that agent, so every group must carry
     * the refusals. This is what catches the welcoming, wide-open version of this file.
     *
     * ⚠️ SPLIT ON THE BLANK LINE, NOT ON `User-Agent:`. Per RFC 9309 a run of consecutive
     * user-agent lines forms ONE group covering all of them, which is exactly the shape
     * Next emits for a `userAgent` array. The first version of this test split per line,
     * decided `User-Agent: GPTBot` was a group with no rules in it, and failed against a
     * file that is correct — a parser bug reported as a policy bug.
     */
    const groups = body.split(/\n\s*\n/).filter((block) => /^user-agent:/im.test(block))
    expect(groups.length, 'expected a wildcard group and a named AI group').toBeGreaterThan(1)
    for (const group of groups) {
      /*
       * ⚠️ THE REFUSED GROUP IS THE EXCEPTION, AND IT IS EXEMPT FOR A REASON RATHER THAN
       * BY OMISSION. The training-only crawlers get `Disallow: /`, which already covers
       * the admin and the API — and it must NOT carry an `Allow:` line, because most
       * crawlers resolve a conflict by longest match and `Allow: /` ties with
       * `Disallow: /`, quietly re-opening the crawl in a file that still reads as a
       * refusal. Asserted here rather than skipped.
       */
      if (/^disallow:\s*\/$/im.test(group)) {
        expect(group, `a refused group that also allows:\n${group}`).not.toMatch(/^allow:/im)
        continue
      }
      expect(group, `a group with no admin Disallow:\n${group}`).toMatch(/^disallow:\s*\/admin$/im)
      expect(group).toMatch(/^disallow:\s*\/api\/$/im)
      /*
       * ⚠️ THE REUSE POLICY IS PER GROUP TOO, AND ITS ABSENCE IS SILENT. A named group
       * replaces the wildcard one, so a `Content-Signal` written only in `*` never
       * reaches the AI crawlers it is addressed to — the file still parses, still allows
       * what it should, and simply stops carrying the owner's objection to training
       * (decision 2026-09-07).
       */
      expect(group, `a group with no Content-Signal:\n${group}`).toMatch(
        /^content-signal:\s*search=yes,\s*ai-input=yes,\s*ai-train=no$/im,
      )
    }
  })

  test('llms.txt points at both hosts and states the real capacity', async ({ request }) => {
    const body = await (await request.get('/llms.txt')).text()
    expect(body).toContain('100,000')
    expect(body).toContain('/products?family=outerwear')
    expect(body).toMatch(/viewer\.[\w.-]+\/llms\.txt/)
  })
})

test.describe('FA-N-18 — an AI crawler gets a finished head', () => {
  /*
   * ⚠️ THIS PASSES WITH AND WITHOUT THE FIX TODAY, AND IS KEPT ANYWAY. Measured
   * 2026-09-07: metadata currently resolves before the shell flushes, so every user agent
   * receives a complete head regardless of `htmlLimitedBots`. The guard that can fail is
   * `src/htmlLimitedBots.test.ts`, which asserts the contract through Next's own decision
   * function and against the built config. This one asserts the OUTCOME a crawler cares
   * about, so that if the mechanism is ever replaced the requirement still has a witness.
   */
  const CRAWLERS = {
    GPTBot:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
    ClaudeBot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    PerplexityBot:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  }

  for (const [name, ua] of Object.entries(CRAWLERS)) {
    test(`${name} receives a title and a canonical inside </head>`, async ({ playwright }) => {
      const context = await playwright.request.newContext({
        baseURL: test.info().project.use.baseURL,
        extraHTTPHeaders: { 'user-agent': ua },
      })
      try {
        for (const page of PAGES) {
          const html = await (await context.get(page.path)).text()
          const head = headOf(html)
          expect(head, `${name} got no <title> in the head of ${page.path}`).toMatch(/<title[^>]*>/)
          expect(head, `${name} got no canonical in the head of ${page.path}`).toContain(
            'rel="canonical"',
          )
        }
      } finally {
        await context.dispose()
      }
    })
  }
})
