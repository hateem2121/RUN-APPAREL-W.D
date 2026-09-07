# Beta Website Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the marketing site on `wear-run.help` with one real address, keep it out of search engines behind a deploy-time switch that fails closed, and prove every piece before the owner is asked to merge.

**Architecture:** The CMS Worker takes the `wear-run.help/*` and `www.wear-run.help/*` zone routes next to its `cms.` custom domain; the PDF Worker keeps its two paths on four narrower routes, and Cloudflare's most-specific-route rule does the splitting. Three host-conditioned Next config rules (two redirects, one `beforeFiles` rewrite) give the site one address and keep the admin on `cms.`; they are proven in `.next/routes-manifest.json`, never in a handler. A wrangler var `SITE_INDEXING` (default and absent = hidden) drives `noindex` and an empty sitemap. The deploy job deploys the PDF Worker before the CMS Worker, once, so the route hand-over cannot collide.

**Tech Stack:** Payload 3.88 on Next 16.3 (`apps/cms`), `@opennextjs/cloudflare` 1.20.2 on Workers, wrangler 4.122.0, Vitest 4, Playwright (Chromium + Firefox), GitHub Actions.

**Source spec:** `docs/superpowers/specs/2026-09-06-beta-website-launch-design.md` — every decision in it is the owner's (2026-09-06). Do not re-open one here.

## Global Constraints

- `pnpm` means `npx --yes pnpm@10.33.0` everywhere below. It has been on PATH, absent, and present-but-broken on this machine.
- Run `env | grep -E 'NODE_ENV|PORT'` before believing any build or e2e failure; both leak in from another project and both are fixed at the source.
- **No deploy from this plan.** Nothing runs `wrangler deploy`, `pnpm deploy:apex` or `opennextjs-cloudflare deploy`. The routes change on the owner's merge and not before. `git config --local user.email hateemjamshaid@gmail.com` is set. Commit on `beta-website`; pushing is allowed (PR #69 is open); **no merge**.
- **Host patterns are anchored regexes with escaped dots** (`^wear-run\.help$`). `@opennextjs/aws` tests a `has: host` value with `new RegExp(value).test(host)` — unanchored — so a bare `wear-run.help` also matches `cms.wear-run.help`. Getting this wrong takes the admin down in production while every localhost test stays green.
- **A config rule is proven in `.next/routes-manifest.json`**, the way `apps/cms/publicViewerHeaders.mjs` explains for headers. Never by asserting a handler's return value.
- **`withPayload` wraps only `headers()`** (checked in `@payloadcms/next` 3.88.0, `dist/withPayload/withPayload.js`). `redirects()` and `rewrites()` pass through untouched, so they go straight on `nextConfig`.
- **`pnpm build` passing does not mean the app can be deployed.** After any change to `next.config.mjs` or wrangler config, the gate is `pnpm --filter @run-apparel/cms exec opennextjs-cloudflare build`.
- **Coverage floors are measured, never lowered.** `apps/cms`: lines 84 / functions 80 / branches 74 / statements 84 over `src/**/*.ts`. Pure logic goes in `src/lib/*.ts` with tests; `.mjs` at the app root is tested but not counted, exactly like `publicViewerHeaders.mjs`.
- **The e2e harness skips the rebuild locally** (`apps/cms/e2e/prepare.mjs`): use `CI=1` whenever a source change must reach the suite, and always for a negative control. Local `.env` supplies a secret; CI does not — `apps/cms/e2e/serve.mjs` supplies a throwaway one.
- **A stale build fails the post-build guards.** `apps/viewer/scripts/preload.test.ts` and the new manifest test both read build output. Run `pnpm build` before `pnpm test:coverage` locally, or delete the stale output.
- **Every new gate gets a negative control**: break the thing, watch the test fail, restore it, record it in the commit message.
- **Instruction files are size-gated at 39,000 characters** (`apps/cms/src/claudeMd.test.ts`, code points not bytes). Root `CLAUDE.md` has ~150 of headroom; `apps/viewer/CLAUDE.md` has 21. The root's cross-reference count for `apps/cms/CLAUDE.md` is currently **Ten** and is checked against the bullets under its `## Traps` heading.
- Any `docs/` or `CLAUDE.md` file you touch is citation-checked (`node scripts/doc-citations.mjs`): backticked anchored paths must exist. New files may be named only inside code fences until they exist.
- **Do not change the viewer, the pipeline or the shrink Worker.** They are byte-identical to `main` and stay so.

---

## File structure

```text
apps/cms/src/lib/searchVisibility.ts              CREATE  parse / read / robotsFor / sitemapFor — the switch, pure where it can be
apps/cms/src/lib/searchVisibility.test.ts         CREATE
apps/cms/src/app/(frontend)/layout.tsx            MODIFY  robots derived from the switch; the comment that said "declares no robots at all"
apps/cms/src/app/sitemap.ts                       MODIFY  async, follows the switch
apps/cms/wrangler.jsonc                           MODIFY  vars.SITE_INDEXING = "hidden"; two zone routes beside the custom domain
apps/cms/src/publicSite.test.ts                   MODIFY  the "indexable" block becomes "fails closed"
apps/cms/e2e/pages.spec.ts                        MODIFY  noindex present and sitemap empty under the default
apps/cms/siteHostRules.mjs                        CREATE  hosts, anchored patterns, siteRedirects(), siteRewrites(), routeFor() model
apps/cms/src/siteHostRules.test.ts                CREATE  the model, both ways
apps/cms/src/hostRulesManifest.test.ts            CREATE  the build carries every rule with its host condition (post-build guard)
apps/cms/next.config.mjs                          MODIFY  redirects() and rewrites() from the module
apps/cms/package.json                             MODIFY  "test:routes" script (REQUIRE_BUILD_ARTIFACTS=1)
apps/cms/src/workerConfigs.test.ts                MODIFY  the route split, both Workers
infra/apex-404/wrangler.jsonc                     MODIFY  four narrow routes; comment rewritten
infra/apex-404/index.js                           MODIFY  header comment only — what the Worker is for now
scripts/apex-probe.mjs                            MODIFY  apex root is the SITE: 200, text/html, wordmark in the body
apps/cms/src/apexProbe.test.ts                    MODIFY  fixtures and cases follow
scripts/smoke-post-deploy.sh                      MODIFY  the apex serves the site; www and cms redirect; /admin on the apex is the 404
.github/workflows/ci.yml                          MODIFY  verify: host-rules guard; deploy: PDF Worker BEFORE the CMS Worker, comment rewritten
.github/workflows/uptime.yml                      MODIFY  two comment lines
CLAUDE.md                                         MODIFY  the apex paragraph, size-neutral; the cms count Ten -> Eleven
apps/cms/CLAUDE.md                                MODIFY  one Traps bullet (three hostnames; anchoring; preview Host inference)
docs/CLOUDFLARE-SETUP.md                          MODIFY  §11.4 and the endpoints table
docs/RUNBOOK.md                                   MODIFY  rollback order for routes; the uptime line about the bare apex
```

---

### Task 1: The search-visibility switch, failing closed

**Files:**
- Create: apps/cms/src/lib/searchVisibility.ts
- Create: apps/cms/src/lib/searchVisibility.test.ts
- Modify: `apps/cms/src/app/(frontend)/layout.tsx` (the `generateMetadata` function and the comment block above `DEFAULT_ICON`)
- Modify: `apps/cms/src/app/sitemap.ts`
- Modify: `apps/cms/wrangler.jsonc` (the `vars` block)
- Modify: `apps/cms/src/publicSite.test.ts:48-64`
- Modify: `apps/cms/e2e/pages.spec.ts` (append one describe)

**Interfaces:**
- Produces: `parseSearchVisibility(raw: unknown): 'hidden' | 'visible'`; `searchVisibility(): Promise<'hidden' | 'visible'>`; `robotsFor(v): Metadata['robots'] | undefined`; `sitemapFor(v, origin: string): MetadataRoute.Sitemap`. Task 4's smoke check and Task 6's preview matrix rely on the rendered `<meta name="robots" content="noindex">`.

- [x] **Step 1: Write the failing unit tests**

apps/cms/src/lib/searchVisibility.test.ts:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCloudflareContext = vi.fn()
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))

import {
  parseSearchVisibility,
  robotsFor,
  searchVisibility,
  sitemapFor,
} from './searchVisibility'

/**
 * The switch that keeps a beta out of search engines. Owner decision 2026-09-06: a
 * deploy-time setting, not an admin field, and hidden until the owner calls it final.
 *
 * ⚠️ FAILS CLOSED. Every branch here is a way the site could become indexable by
 * accident — a missing var, a typo, a wrong case — and every one must resolve to hidden.
 */
describe('parseSearchVisibility', () => {
  it.each([undefined, null, '', 'hidden', 'HIDDEN', 'Visible', 'visible ', 'true', 1])(
    'treats %j as hidden',
    (raw) => {
      expect(parseSearchVisibility(raw)).toBe('hidden')
    },
  )

  it('opens only on the exact word', () => {
    expect(parseSearchVisibility('visible')).toBe('visible')
  })
})

describe('searchVisibility reads the Worker first, then the process, then fails closed', () => {
  beforeEach(() => {
    getCloudflareContext.mockReset()
    delete process.env.SITE_INDEXING
  })

  it('takes the Worker binding when there is one', async () => {
    getCloudflareContext.mockResolvedValue({ env: { SITE_INDEXING: 'visible' } })
    process.env.SITE_INDEXING = 'hidden'
    expect(await searchVisibility()).toBe('visible')
  })

  it('falls back to the process when there is no Worker context (next start, tests)', async () => {
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    process.env.SITE_INDEXING = 'visible'
    expect(await searchVisibility()).toBe('visible')
  })

  it('is hidden when nothing says otherwise', async () => {
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    expect(await searchVisibility()).toBe('hidden')
  })
})

describe('what the switch does', () => {
  it('hidden means noindex; visible means the layout declares nothing', () => {
    // `undefined`, not `{ index: true }`: declaring index in the layout broke the 404's
    // own noindex after hydration (measured 2026-09-05, recorded in layout.tsx).
    expect(robotsFor('hidden')).toEqual({ index: false })
    expect(robotsFor('visible')).toBeUndefined()
  })

  it('hidden means an empty sitemap; visible lists the three pages on the given origin', () => {
    expect(sitemapFor('hidden', 'https://wear-run.help')).toEqual([])
    expect(sitemapFor('visible', 'https://wear-run.help').map((e) => e.url)).toEqual([
      'https://wear-run.help',
      'https://wear-run.help/products',
      'https://wear-run.help/contact',
    ])
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/lib/searchVisibility.test.ts`
Expected: FAIL — cannot resolve `./searchVisibility`.

- [x] **Step 3: Write the module**

apps/cms/src/lib/searchVisibility.ts:

```ts
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Metadata, MetadataRoute } from 'next'

/**
 * Whether search engines may index the public site.
 *
 * Owner decision 2026-09-06: the site launches as a beta on its real address and stays
 * OUT of search results until the owner calls it final. The switch is a deploy-time
 * setting — `vars.SITE_INDEXING` in wrangler.jsonc — because the owner asked for one
 * that cannot be flipped by a click in the admin. Flipping it is a code change, a PR
 * and a deploy, and the value is read at request time so no rebuild is needed.
 *
 * ⚠️ FAILS CLOSED. Only the exact word `visible` opens the site. Unset, blank, a typo
 * or a wrong case all mean hidden, so a Worker deployed without the var, or a local
 * server that never sees wrangler's vars, can never advertise a half-finished site.
 */
export type SearchVisibility = 'hidden' | 'visible'

export function parseSearchVisibility(raw: unknown): SearchVisibility {
  return raw === 'visible' ? 'visible' : 'hidden'
}

/**
 * The Worker's own bindings first, then the process (`next start` for the browser
 * suite, vitest), then hidden. Same order payload.config.ts uses for its vars.
 */
export async function searchVisibility(): Promise<SearchVisibility> {
  const context = await getCloudflareContext({ async: true }).catch(() => null)
  const fromWorker = (context?.env as Record<string, unknown> | undefined)?.SITE_INDEXING
  return parseSearchVisibility(fromWorker ?? process.env.SITE_INDEXING)
}

/**
 * `undefined` when visible, deliberately — NOT `{ index: true }`. Declaring `index`
 * in the layout replaced the 404 page's own `noindex` after hydration (measured
 * 2026-09-05; the account is in layout.tsx). A crawler indexes by default; only the
 * hidden case needs saying.
 */
export function robotsFor(visibility: SearchVisibility): Metadata['robots'] | undefined {
  return visibility === 'hidden' ? { index: false } : undefined
}

/**
 * Three pages and never the garments — those live on viewer.wear-run.help, which has
 * its own sitemap, and a sitemap may only speak for the host that serves it.
 * No `lastModified`: a date nobody updates is worse than none.
 */
export function sitemapFor(visibility: SearchVisibility, origin: string): MetadataRoute.Sitemap {
  if (visibility === 'hidden') return []
  return [
    { url: origin, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/products`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${origin}/contact`, changeFrequency: 'yearly', priority: 0.5 },
  ]
}
```

- [x] **Step 4: Run the unit tests to verify they pass**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/lib/searchVisibility.test.ts`
Expected: PASS, 14 tests.

- [x] **Step 5: Wire the layout and the sitemap**

In `apps/cms/src/app/(frontend)/layout.tsx`, add the import beside the others:

```ts
import { robotsFor, searchVisibility } from '../../lib/searchVisibility'
```

Replace the body of `generateMetadata` so it reads:

```ts
export async function generateMetadata(): Promise<Metadata> {
  const [settings, visibility] = await Promise.all([getSiteSettings(), searchVisibility()])
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      template: '%s — RUN APPAREL',
      default: 'RUN APPAREL — Custom B2B Sportswear & Team Wear Manufacturer',
    },
    // `noindex` while the beta is hidden; NOTHING when visible — see searchVisibility.ts
    // and the paragraph above about why `index: true` must never be declared here.
    robots: robotsFor(visibility),
    icons: {
      icon: settings.logoUrl
        ? [{ url: settings.logoUrl, type: settings.logoMimeType ?? undefined }]
        : [{ url: DEFAULT_ICON, type: 'image/svg+xml' }],
    },
  }
}
```

In the comment block that begins `⚠️ AND IT NOW DECLARES NO \`robots\` AT ALL`, replace that first sentence with:

```text
 * ⚠️ IT DECLARES `noindex` WHILE THE BETA IS HIDDEN, AND NOTHING WHEN VISIBLE — the
 * switch is `SITE_INDEXING` (src/lib/searchVisibility.ts). Declaring `index` here was
 * tried and is what the rest of this paragraph is about:
```

Keep the rest of that paragraph as it is — it is the measurement that justifies `undefined`.

Replace `apps/cms/src/app/sitemap.ts`'s function with:

```ts
import { searchVisibility, sitemapFor } from '../lib/searchVisibility'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Empty while the beta is hidden — see searchVisibility.ts. An empty urlset is
  // valid XML and is what a crawler should see for a site carrying noindex.
  return sitemapFor(await searchVisibility(), SITE_ORIGIN)
}
```

(keep the file's header comment; it still holds — three pages, never the garments).

In `apps/cms/wrangler.jsonc`, inside `vars`, before `CMS_PUBLIC_URL`:

```jsonc
    // Search engines. `hidden` = every public page carries noindex and the sitemap is
    // empty; ONLY the exact word `visible` opens the site. Absent also means hidden.
    // Owner decision 2026-09-06: a deploy-time switch, not an admin field. To launch
    // for real: change this to "visible", PR, merge. See src/lib/searchVisibility.ts.
    "SITE_INDEXING": "hidden",
```

- [x] **Step 6: Replace the "indexable" assertions in `publicSite.test.ts`**

Replace the whole `it('the frontend layout asks to be indexed', …)` block (lines 49–64) with:

```ts
  it('the frontend layout derives robots from the switch and never hard-codes index', () => {
    // Until 2026-09-06 this asserted the ABSENCE of noindex: the pages exist to be
    // found. They still do — but the owner launches them as a hidden beta first, so the
    // layout now derives `robots` from SITE_INDEXING and must never state `index` itself
    // (declaring it broke the 404's own noindex after hydration, measured 2026-09-05).
    const layout = code(FRONTEND, 'layout.tsx')
    expect(layout).toMatch(/robots:\s*robotsFor\(visibility\)/)
    expect(layout).not.toMatch(/index:\s*true/)
    // and the 404 must still declare its own, which SSR renders correctly
    expect(code(FRONTEND, 'not-found.tsx')).toMatch(/robots:\s*\{\s*index:\s*false/)
  })

  it('the switch ships HIDDEN in wrangler.jsonc, and the sitemap follows it', () => {
    // A Worker deployed with this var missing is ALSO hidden (the parser fails closed),
    // but the file must say so explicitly, or the next reader assumes the default is open.
    expect(read(CMS_ROOT, 'wrangler.jsonc')).toMatch(/"SITE_INDEXING":\s*"hidden"/)
    expect(code(join(CMS_ROOT, 'src', 'app'), 'sitemap.ts')).toMatch(
      /sitemapFor\(await searchVisibility\(\), SITE_ORIGIN\)/,
    )
  })
```

`join`, `CMS_ROOT`, `FRONTEND`, `read` and `code` already exist in that file.

- [x] **Step 7: Add the browser assertions**

Append to `apps/cms/e2e/pages.spec.ts`:

```ts
test.describe('search visibility defaults to hidden', () => {
  /*
   * SITE_INDEXING is unset for this server — exactly as in CI's cold checkout — and
   * absent means hidden. Owner decision 2026-09-06: the beta launches on its real
   * address and stays out of search results until called final.
   */
  for (const page of PAGES) {
    test(`${page.name} carries noindex`, async ({ page: browser }) => {
      await browser.goto(page.path)
      await expect(browser.locator('meta[name="robots"]').first()).toHaveAttribute(
        'content',
        /noindex/,
      )
    })
  }

  test('the sitemap lists nothing', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)
    expect(await response.text()).not.toContain('<loc>')
  })
})
```

- [x] **Step 8: Run the unit suite and the browser suite**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms test`
Expected: PASS (856 + 14 new).

Run: `CI=1 npx --yes pnpm@10.33.0 --filter @run-apparel/cms test:e2e`
Expected: PASS, 108 (100 + 4 new × 2 engines).

- [x] **Step 9: Negative control — the switch reaches the server**

Run: `SITE_INDEXING=visible CI=1 npx --yes pnpm@10.33.0 --filter @run-apparel/cms test:e2e -g "search visibility"`
Expected: FAIL — the three `carries noindex` tests fail in both engines and `the sitemap lists nothing` fails with `<loc>` present. Run once more without the var and confirm PASS. Record both results in the commit message.

- [x] **Step 10: Commit**

```bash
git add apps/cms/src/lib/searchVisibility.ts apps/cms/src/lib/searchVisibility.test.ts 'apps/cms/src/app/(frontend)/layout.tsx' apps/cms/src/app/sitemap.ts apps/cms/wrangler.jsonc apps/cms/src/publicSite.test.ts apps/cms/e2e/pages.spec.ts
git commit -m "feat(cms): SITE_INDEXING — a deploy-time switch that keeps the beta out of search engines, failing closed"
```

---

### Task 2: The host rules, modelled, wired, and proven in the build

**Files:**
- Create: apps/cms/siteHostRules.mjs
- Create: apps/cms/src/siteHostRules.test.ts
- Create: apps/cms/src/hostRulesManifest.test.ts
- Modify: `apps/cms/next.config.mjs` (`nextConfig`)
- Modify: `apps/cms/package.json` (scripts)
- Modify: `.github/workflows/ci.yml` (the `verify` job, after `Bundle preload guard`)

**Interfaces:**
- Consumes: `sourceMatches(source, pathname)` from `apps/cms/publicViewerHeaders.mjs`.
- Produces: `SITE_HOST`, `WWW_HOST`, `CMS_HOST`, `hostPattern(host)`, `CMS_PUBLIC_PATHS`, `BLOCKED_PREFIX`, `siteRedirects()`, `siteRewrites()`, `routeFor(host, pathname)` → `{ kind: 'redirect' | 'rewrite' | 'serve', to?: string }`. Tasks 4 and 6 use the exact statuses: redirects are `permanent` (308); the rewrite yields the branded 404.

- [x] **Step 1: Write the failing model tests**

apps/cms/src/siteHostRules.test.ts:

```ts
import { describe, expect, it } from 'vitest'
import {
  BLOCKED_PREFIX,
  CMS_HOST,
  SITE_HOST,
  WWW_HOST,
  hostPattern,
  routeFor,
  siteRedirects,
  siteRewrites,
} from '../siteHostRules.mjs'

/**
 * The site answers on three hostnames and only these rules tell them apart.
 * Owner decisions 2026-09-06: www -> the main address; the cms host's public pages ->
 * the main address; /admin and /api typed on the main address -> the site's 404.
 *
 * ⚠️ THE ANCHORING TESTS ARE THE IMPORTANT ONES. @opennextjs/aws evaluates a
 * `has: host` value with `new RegExp(value).test(host)` — unanchored — so a pattern of
 * `wear-run.help` also matches `cms.wear-run.help`, and the admin rewrite would then
 * take the admin down. Every localhost test would stay green while it did.
 */
describe('host patterns are anchored and escaped', () => {
  it('matches exactly the host, as OpenNext evaluates it', () => {
    const apex = new RegExp(hostPattern(SITE_HOST))
    expect(apex.test('wear-run.help')).toBe(true)
    for (const other of ['cms.wear-run.help', 'www.wear-run.help', 'xwear-run.help', 'wear-runxhelp', 'wear-run.help.evil']) {
      expect(apex.test(other), `${other} must not match the apex pattern`).toBe(false)
    }
  })

  it('every rule carries exactly one host condition', () => {
    for (const rule of [...siteRedirects(), ...siteRewrites().beforeFiles]) {
      expect(rule.has).toHaveLength(1)
      expect(rule.has[0].type).toBe('host')
      expect(rule.has[0].value).toMatch(/^\^.*\$$/)
    }
  })

  it('every redirect is permanent', () => {
    for (const rule of siteRedirects()) expect(rule.permanent).toBe(true)
  })
})

describe('routeFor — what each hostname does with a path', () => {
  it('www sends everything to the main address, same path', () => {
    expect(routeFor(WWW_HOST, '/products')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}/products` })
    expect(routeFor(WWW_HOST, '/')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}/` })
    // Never reached in production — the PDF Worker's narrower www route wins first —
    // but if it were, it would still land on the PDF.
    expect(routeFor(WWW_HOST, '/catalogue')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}/catalogue` })
  })

  it('the cms host redirects its public pages and keeps everything else', () => {
    for (const path of ['/', '/products', '/contact', '/sitemap.xml']) {
      expect(routeFor(CMS_HOST, path).kind, path).toBe('redirect')
    }
    expect(routeFor(CMS_HOST, '/products')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}/products` })
    expect(routeFor(CMS_HOST, '/')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}` })
    for (const path of ['/admin', '/admin/collections/products', '/api/media', '/api/public/viewer/rxps/wine', '/robots.txt', '/og-default.png', '/icon.svg']) {
      expect(routeFor(CMS_HOST, path), path).toEqual({ kind: 'serve' })
    }
  })

  it('the main address serves the site and hides the admin and the API behind the 404', () => {
    for (const path of ['/', '/products', '/contact', '/robots.txt', '/sitemap.xml', '/nope']) {
      expect(routeFor(SITE_HOST, path), path).toEqual({ kind: 'serve' })
    }
    expect(routeFor(SITE_HOST, '/admin')).toEqual({ kind: 'rewrite', to: `${BLOCKED_PREFIX}/admin` })
    expect(routeFor(SITE_HOST, '/admin/collections/products')).toEqual({ kind: 'rewrite', to: `${BLOCKED_PREFIX}/admin/collections/products` })
    expect(routeFor(SITE_HOST, '/api/media')).toEqual({ kind: 'rewrite', to: `${BLOCKED_PREFIX}/api/media` })
    // and a path that merely STARTS with the word is not the admin
    expect(routeFor(SITE_HOST, '/administration')).toEqual({ kind: 'serve' })
  })

  it('localhost matches no rule at all — the browser suite assumes this', () => {
    for (const path of ['/', '/products', '/admin', '/api/media', '/sitemap.xml']) {
      expect(routeFor('localhost:4174', path), path).toEqual({ kind: 'serve' })
    }
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/siteHostRules.test.ts`
Expected: FAIL — cannot resolve `../siteHostRules.mjs`.

- [x] **Step 3: Write the module**

apps/cms/siteHostRules.mjs:

```js
import { sourceMatches } from './publicViewerHeaders.mjs'

/**
 * One site, three hostnames, and the rules that give it ONE address.
 *
 * Owner decisions 2026-09-06 (docs/superpowers/specs/2026-09-06-beta-website-launch-design.md):
 *
 *   www.wear-run.help/*         -> 308 https://wear-run.help/<same path>
 *   cms.wear-run.help/<page>    -> 308 https://wear-run.help/<page>   (the four public paths only;
 *                                  the admin, the API, robots.txt and the static files stay)
 *   wear-run.help/admin, /api   -> rewritten under BLOCKED_PREFIX, an unrouted path in the
 *                                  frontend group, so its catch-all calls notFound() and the
 *                                  branded 404 renders with status 404. The admin has exactly
 *                                  one login hostname, as it did before the site existed.
 *
 * WHY CONFIG RULES AND NOT A HANDLER. publicViewerHeaders.mjs carries the account: a
 * header set in a handler shipped green and inert. Config rules land in
 * .next/routes-manifest.json, and src/hostRulesManifest.test.ts reads that file back
 * after every build. `withPayload` wraps only headers(), so these pass through untouched.
 *
 * ⚠️ PATTERNS ARE ANCHORED WITH ESCAPED DOTS, AND THAT IS NOT PEDANTRY. @opennextjs/aws
 * (dist/core/routing/matcher.js) evaluates a `has: host` value as
 * `new RegExp(value).test(host)` — no anchors. A bare `wear-run.help` therefore also
 * matches `cms.wear-run.help`, and the admin rewrite would take the admin down in
 * production while every localhost test stayed green. Next itself anchors; OpenNext
 * does not; the pattern satisfies both.
 */
export const SITE_HOST = 'wear-run.help'
export const WWW_HOST = 'www.wear-run.help'
export const CMS_HOST = 'cms.wear-run.help'

export const hostPattern = (host) => `^${host.replace(/\./g, '\\.')}$`

/** The public paths the cms host hands to the main address. robots.txt deliberately stays. */
export const CMS_PUBLIC_PATHS = ['/', '/products', '/contact', '/sitemap.xml']

/**
 * Unrouted on purpose. Anything under it reaches the frontend group's catch-all
 * (src/app/(frontend)/[...unmatched]/page.tsx), which calls notFound().
 */
export const BLOCKED_PREFIX = '/_not-here'

const onHost = (host) => [{ type: 'host', value: hostPattern(host) }]

export function siteRedirects() {
  return [
    {
      source: '/:path*',
      has: onHost(WWW_HOST),
      destination: `https://${SITE_HOST}/:path*`,
      permanent: true,
    },
    ...CMS_PUBLIC_PATHS.map((path) => ({
      source: path,
      has: onHost(CMS_HOST),
      destination: `https://${SITE_HOST}${path === '/' ? '' : path}`,
      permanent: true,
    })),
  ]
}

export function siteRewrites() {
  return {
    // beforeFiles: evaluated before public/ files and app routes, which is the only
    // phase that can intercept /admin and /api before Payload's own routes claim them.
    beforeFiles: ['/admin', '/admin/:path*', '/api', '/api/:path*'].map((source) => ({
      source,
      has: onHost(SITE_HOST),
      destination: `${BLOCKED_PREFIX}${source}`,
    })),
  }
}

/** Fill `:path*` from the request path, the way Next does for the rules above. */
function fill(destination, source, pathname) {
  if (!source.endsWith('/:path*')) return destination
  const prefix = source.slice(0, -'/:path*'.length)
  const rest = pathname.slice(prefix.length)
  return destination.replace('/:path*', rest === '/' ? (prefix ? '' : '/') : rest)
}

/**
 * A model of the rules for tests — the same shape effectiveHeader() gives headers.
 * Next evaluates redirects before beforeFiles rewrites, and the first match wins.
 */
export function routeFor(host, pathname) {
  const hostOf = (rule) => new RegExp(rule.has[0].value).test(host)
  for (const rule of siteRedirects()) {
    if (hostOf(rule) && sourceMatches(rule.source, pathname)) {
      return { kind: 'redirect', to: fill(rule.destination, rule.source, pathname) }
    }
  }
  for (const rule of siteRewrites().beforeFiles) {
    if (hostOf(rule) && sourceMatches(rule.source, pathname)) {
      return { kind: 'rewrite', to: fill(rule.destination, rule.source, pathname) }
    }
  }
  return { kind: 'serve' }
}
```

Note on `fill`: for the www rule (`source: '/:path*'`, prefix `''`), `/` maps to `https://wear-run.help/` and `/products` to `https://wear-run.help/products`; for `/admin/:path*` (prefix `/admin`), `/admin/x` maps to `/_not-here/admin/x`. `sourceMatches` treats `/:path*` as "this prefix, then optionally a slash and anything", so `/administration` does not match `/admin/:path*` and is served — the test above pins that.

- [x] **Step 4: Run the model tests**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/siteHostRules.test.ts`
Expected: PASS, 8 tests. If `sourceMatches` rejects `/:path*` at the root (`source: '/:path*'` → pattern `^(?:/.*)?$`), `/` and `/products` both match — confirm by the passing test rather than by reading.

- [x] **Step 5: Wire the rules into Next**

In `apps/cms/next.config.mjs`, add the import:

```js
import { siteRedirects, siteRewrites } from './siteHostRules.mjs'
```

and inside `nextConfig`, after `headers()`:

```js
  /*
   * ONE ADDRESS. www -> the main address; the cms host's public pages -> the main
   * address; /admin and /api on the main address -> the branded 404. siteHostRules.mjs
   * carries the decisions and the anchoring warning; src/hostRulesManifest.test.ts
   * reads .next/routes-manifest.json after every build and fails if any rule did not
   * land — a rule that reads fine here and never reaches the build is the same failure
   * shape the Vary header had. withPayload wraps only headers(), so these are untouched.
   */
  async redirects() {
    return siteRedirects()
  },
  async rewrites() {
    return siteRewrites()
  },
```

- [x] **Step 6: Write the failing manifest guard**

apps/cms/src/hostRulesManifest.test.ts:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { siteRedirects, siteRewrites } from '../siteHostRules.mjs'

/**
 * The host rules, read back from the BUILD.
 *
 * publicViewerHeaders.mjs records why this is the only proof that counts: a header set
 * in a handler was tested, green, merged, deployed — and overridden in production by a
 * rule appended after it. A config rule that does not reach .next/routes-manifest.json
 * does not exist, however correct next.config.mjs reads.
 *
 * Same shape as apps/viewer/scripts/preload.test.ts: skipped locally when there is no
 * build, so `pnpm test` stays fast; REQUIRED in CI's post-build guard step, where a
 * missing build is a hard failure rather than a silent skip.
 */
const CMS_ROOT = join(import.meta.dirname, '..')
const MANIFEST = join(CMS_ROOT, '.next', 'routes-manifest.json')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
const HAS_BUILD = existsSync(MANIFEST)

type HostRule = { source: string; destination: string; has?: { type: string; value: string }[] }
const describeRule = (r: HostRule) =>
  `${r.has?.find((h) => h.type === 'host')?.value} ${r.source} -> ${r.destination}`

describe('the build carries every host rule', () => {
  it('a CI step that forgot to build cannot pass this file', () => {
    expect(REQUIRE_BUILD && !HAS_BUILD, 'REQUIRE_BUILD_ARTIFACTS=1 but .next has no routes-manifest.json').toBe(false)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('every redirect landed, with its host condition', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      redirects: (HostRule & { statusCode?: number })[]
    }
    const built = manifest.redirects.filter((r) => r.has?.some((h) => h.type === 'host'))
    expect(built.map(describeRule).sort()).toEqual(siteRedirects().map(describeRule).sort())
    for (const rule of built) expect(rule.statusCode, describeRule(rule)).toBe(308)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('every beforeFiles rewrite landed, with its host condition', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      rewrites: { beforeFiles: HostRule[] } | HostRule[]
    }
    const beforeFiles = Array.isArray(manifest.rewrites) ? [] : manifest.rewrites.beforeFiles
    const built = beforeFiles.filter((r) => r.has?.some((h) => h.type === 'host'))
    expect(built.map(describeRule).sort()).toEqual(siteRewrites().beforeFiles.map(describeRule).sort())
  })
})
```

- [x] **Step 7: Build and run the guard**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms build && cd apps/cms && REQUIRE_BUILD_ARTIFACTS=1 npx --yes pnpm@10.33.0 exec vitest run src/hostRulesManifest.test.ts`
Expected: PASS, 3 tests. If Next stores `statusCode` as 308 under a different key (older manifests use `permanent: true`), read the manifest once and assert on what is there — the property is the redirect being permanent, not the key name.

- [x] **Step 8: Negative control — a rule removed from the config fails the guard**

Temporarily delete the `'/api'` entry from the `beforeFiles` list in `siteHostRules.mjs`, rebuild, run the guard: the rewrite test must FAIL naming the missing rule. Restore, rebuild, PASS. Then a second control: change `hostPattern` to return the bare host (no anchors) — the model test `matches exactly the host` must FAIL naming `cms.wear-run.help`. Restore.

- [x] **Step 9: The post-build guard script and the CI step**

`apps/cms/package.json`, in `scripts`, after `"test:e2e"`:

```json
    "test:routes": "REQUIRE_BUILD_ARTIFACTS=1 vitest run src/hostRulesManifest.test.ts",
```

`.github/workflows/ci.yml`, in the `verify` job directly after the `Bundle preload guard (needs the build above)` step:

```yaml
      # The three host rules that give the marketing site ONE address, read back from
      # .next/routes-manifest.json. Same reason as the preload guard: a config rule that
      # did not reach the build is the Vary failure shape, and only the build can say.
      - name: Host rules guard (needs the build above)
        run: pnpm --filter @run-apparel/cms test:routes
```

`apps/cms/src/workflowHardening.test.ts` requires every invoked pnpm script to exist — it does now.

- [x] **Step 10: The Cloudflare build, then commit**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec opennextjs-cloudflare build`
Expected: `OpenNext build complete.` (redirects and rewrites with `has` are routed by the OpenNext layer; a config it cannot express fails HERE, not in `next build`).

```bash
git add apps/cms/siteHostRules.mjs apps/cms/src/siteHostRules.test.ts apps/cms/src/hostRulesManifest.test.ts apps/cms/next.config.mjs apps/cms/package.json .github/workflows/ci.yml
git commit -m "feat(cms): one address — www and the cms host's public pages redirect to wear-run.help; /admin and /api there answer the branded 404; proven in the build"
```

---

### Task 3: The route split between the two Workers

**Files:**
- Modify: `apps/cms/wrangler.jsonc` (`routes`)
- Modify: `infra/apex-404/wrangler.jsonc` (`routes` and the comment above it)
- Modify: `infra/apex-404/index.js` (header comment only)
- Modify: `apps/cms/src/workerConfigs.test.ts` (append a describe)

**Interfaces:**
- Produces: the route sets Task 4's deploy order depends on. Nothing in code reads them; Cloudflare does.

- [x] **Step 1: Write the failing config tests**

Append to `apps/cms/src/workerConfigs.test.ts`:

```ts
/**
 * The marketing site lives on the apex, and the PDFs keep their two paths.
 *
 * Cloudflare hands a request to the MOST SPECIFIC matching route, so the CMS Worker can
 * hold `wear-run.help/*` while the PDF Worker holds `wear-run.help/catalogue*` and the
 * PDFs never notice the site arriving. A route pattern belongs to ONE Worker at a time —
 * which is why ci.yml deploys the PDF Worker before the CMS Worker (see the deploy job).
 *
 * ⚠️ A WILDCARD RESTORED TO THE PDF WORKER TAKES THE SITE DOWN, and a wildcard removed
 * from the CMS Worker does the same. Both are one-line edits that read as tidying.
 */
describe('the apex route split (2026-09-06)', () => {
  const cms = settings(read('apps/cms/wrangler.jsonc'))
  const apex = settings(read('infra/apex-404/wrangler.jsonc'))
  const patterns = (source: string) =>
    [...source.matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]).sort()

  it('the CMS Worker holds the custom domain AND both wildcards', () => {
    expect(patterns(cms)).toEqual(['cms.wear-run.help', 'wear-run.help/*', 'www.wear-run.help/*'])
    expect(cms).toMatch(/"pattern":\s*"wear-run\.help\/\*",\s*"zone_name":\s*"wear-run\.help"/)
    expect(cms).toMatch(/"pattern":\s*"www\.wear-run\.help\/\*",\s*"zone_name":\s*"wear-run\.help"/)
  })

  it('the PDF Worker holds exactly the four PDF routes and no wildcard', () => {
    expect(patterns(apex)).toEqual([
      'wear-run.help/catalogue*',
      'wear-run.help/profile*',
      'www.wear-run.help/catalogue*',
      'www.wear-run.help/profile*',
    ])
  })

  it('the pattern reader can actually fail (negative control)', () => {
    expect(patterns('{ "routes": [{ "pattern": "a/*" }, { "pattern": "b" }] }')).toEqual(['a/*', 'b'])
    expect(patterns('{ "routes": [] }')).toEqual([])
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/workerConfigs.test.ts`
Expected: FAIL — the CMS holds one pattern, the PDF Worker holds two wildcards.

- [x] **Step 3: Change the two configs**

`apps/cms/wrangler.jsonc` — replace the `routes` line and its comment with:

```jsonc
  // THREE HOSTNAMES, ONE WORKER (2026-09-06). The custom domain is the admin and the
  // API; the two zone routes are the public marketing site on its real address. The
  // PDF Worker (infra/apex-404) keeps `/catalogue*` and `/profile*` on both hosts —
  // Cloudflare sends a request to the MOST SPECIFIC route, so those four never reach
  // this Worker. Only host-conditioned rules in next.config.mjs tell the hostnames
  // apart; see siteHostRules.mjs. The apex DNS record must stay proxied: zone routes
  // require it, and it is the same record the PDFs have always needed.
  "routes": [
    { "pattern": "cms.wear-run.help", "custom_domain": true },
    { "pattern": "wear-run.help/*", "zone_name": "wear-run.help" },
    { "pattern": "www.wear-run.help/*", "zone_name": "wear-run.help" }
  ],
```

`infra/apex-404/wrangler.jsonc` — replace the `// Apex AND www …` comment and the `routes` array with:

```jsonc
  // FOUR NARROW ROUTES, DELIBERATELY NO WILDCARD (2026-09-06). Until then this Worker
  // held `wear-run.help/*` and `www.wear-run.help/*` and 404'd everything but the two
  // PDFs. The marketing site now lives on those wildcards, served by the CMS Worker
  // (apps/cms/wrangler.jsonc); Cloudflare hands `/catalogue*` and `/profile*` here
  // because the most specific route wins. index.js is unchanged — its own 404 for any
  // other path is simply no longer reachable in production.
  //
  // ⚠️ A ROUTE PATTERN BELONGS TO ONE WORKER AT A TIME. Restoring a wildcard here
  // collides with the CMS Worker's, and ci.yml deploys THIS Worker before the CMS
  // Worker for exactly that reason. Neither pattern matches viewer./cms./media.
  "routes": [
    { "pattern": "wear-run.help/catalogue*", "zone_name": "wear-run.help" },
    { "pattern": "wear-run.help/profile*", "zone_name": "wear-run.help" },
    { "pattern": "www.wear-run.help/catalogue*", "zone_name": "wear-run.help" },
    { "pattern": "www.wear-run.help/profile*", "zone_name": "wear-run.help" }
  ],
```

`infra/apex-404/index.js` — after the paragraph beginning `WHAT THIS WORKER IS FOR, ORIGINALLY.`, add:

```js
 * WHAT IT IS FOR NOW (2026-09-06). Two PDFs, on four narrow routes. The apex itself
 * serves the marketing site from the CMS Worker; this Worker is reached only for
 * `/catalogue*` and `/profile*` on the apex and on www. The 404 branch below still
 * exists and still tests the allowlist property, and no production request reaches it.
```

- [x] **Step 4: Run the config tests and the wrangler dry run**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/workerConfigs.test.ts`
Expected: PASS.

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/viewer exec wrangler deploy --dry-run --config "$PWD/infra/apex-404/wrangler.jsonc"` and `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec wrangler deploy --dry-run`
Expected: both parse and print their bindings and routes; no upload happens (`--dry-run`). If wrangler rejects mixing a custom domain with zone routes in one `routes` array, STOP and report — that is a design change, not a fix.

- [x] **Step 5: Commit**

```bash
git add apps/cms/wrangler.jsonc infra/apex-404/wrangler.jsonc infra/apex-404/index.js apps/cms/src/workerConfigs.test.ts
git commit -m "infra: the apex belongs to the site — the CMS Worker takes the wildcards, the PDF Worker keeps four narrow routes"
```

---

### Task 4: The deploy order, the apex probe, and the post-deploy smoke

**Files:**
- Modify: `.github/workflows/ci.yml` (the `deploy` job: move the `Deploy apex worker` step before `Deploy CMS worker`; leave `Post-deploy apex assertion` last)
- Modify: `.github/workflows/uptime.yml:17-18` and the comment above `node scripts/apex-probe.mjs || ok=false`
- Modify: `scripts/apex-probe.mjs`
- Modify: `apps/cms/src/apexProbe.test.ts`
- Modify: `scripts/smoke-post-deploy.sh` (append a section before the final summary)

**Interfaces:**
- Consumes: the redirect statuses (308) and the 404 from Task 2; `noindex` from Task 1.
- Produces: `evaluate()` accepts `kind: 'pdf' | 'site'` observations, with `wordmark?: boolean` for `site`.

- [x] **Step 1: Write the failing probe tests**

In `apps/cms/src/apexProbe.test.ts`, change the `Observation` type and the `apexRoot` fixture:

```ts
type Observation = {
  name: string
  kind: 'pdf' | 'site'
  status: number
  contentType?: string
  totalBytes?: number
  magic?: string
  wordmark?: boolean
  cache?: string
  error?: string
}

/** The apex serving the marketing site — measured shape after 2026-09-06. */
const apexRoot = (over: Partial<Observation> = {}): Observation => ({
  name: 'apex root',
  kind: 'site',
  status: 200,
  contentType: 'text/html; charset=utf-8',
  wordmark: true,
  ...over,
})
```

Then replace the two `evaluate` cases that mention 404ing with:

```ts
  it('passes when both PDFs serve and the apex serves the site', () => {
    const result = evaluate([pdf(), pdf({ name: 'profile', totalBytes: 16_891_515 }), apexRoot()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('FAILS if the apex stops serving the site — a 404 there is the OLD behaviour', () => {
    // Until 2026-09-06 the bare apex 404'd by design and this test asserted that. The
    // site lives there now; a 404 means the CMS Worker lost its wildcard route.
    const result = evaluate([apexRoot({ status: 404 })])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('expected 200')
    expect(result.failures[0]).toContain('wildcard')
  })

  it('FAILS a 200 that is not the site — wrong type, or no wordmark in the body', () => {
    expect(evaluate([apexRoot({ contentType: 'application/pdf' })]).ok).toBe(false)
    expect(evaluate([apexRoot({ wordmark: false })]).ok).toBe(false)
    expect(evaluate([apexRoot({ wordmark: false })]).failures[0]).toContain('RUN APPAREL')
  })
```

and in the `TARGETS` describe add:

```ts
  it('asserts the apex root as the SITE, not a 404', () => {
    expect((TARGETS as { name: string; kind: string }[]).find((t) => t.name === 'apex root')?.kind).toBe('site')
  })
```

- [x] **Step 2: Run to verify it fails**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/apexProbe.test.ts`
Expected: FAIL — `evaluate` still expects 404 and `TARGETS` still says `not-found`.

- [x] **Step 3: Change the probe**

In `scripts/apex-probe.mjs`:

The typedef: `kind: 'pdf' | 'site'`. The target:

```js
  // The apex serves the MARKETING SITE since 2026-09-06 (it 404'd by design before).
  // A 404 here now means the CMS Worker lost its wildcard route to the PDF Worker.
  { name: 'apex root', url: 'https://wear-run.help/', kind: 'site' },
```

In `evaluate`, replace the `if (o.kind === 'not-found') { … }` block with:

```js
    if (o.kind === 'site') {
      const problems = []
      if (o.status !== 200) {
        problems.push(
          `HTTP ${o.status}, expected 200 — the marketing site should answer here. A 404 means ` +
            'the CMS Worker no longer holds the wear-run.help/* wildcard route.',
        )
      } else {
        if (!String(o.contentType ?? '').includes('text/html')) {
          problems.push(`content-type is "${o.contentType ?? '(none)'}", expected text/html`)
        }
        if (o.wordmark !== true) problems.push('the body does not contain "RUN APPAREL"')
      }
      if (problems.length > 0) {
        failures.push(`${o.name}: ${problems.join('; ')}.`)
        lines.push(`  ${label} ${o.status}    FAIL  ${problems.join('; ')}`)
      } else {
        lines.push(`  ${label} 200    ok  the site  cf-cache-status: ${o.cache ?? '(none)'}`)
      }
      continue
    }
```

In `probe()`, after `magic` is computed, add the body check (the CMS ignores `Range`, so the whole page arrives — about 30 KB):

```js
    const wordmark =
      target.kind === 'site' ? new TextDecoder().decode(buffer).includes('RUN APPAREL') : undefined
```

and include `wordmark,` in the returned object. Change the final log line to `'[apex-probe] both PDFs serve, and the apex serves the site.'` and the header's first line to `Assert the apex serves the marketing site and the two customer-facing PDFs.`

- [x] **Step 4: Run the probe tests**

Run: `cd apps/cms && npx --yes pnpm@10.33.0 exec vitest run src/apexProbe.test.ts`
Expected: PASS.

Run the probe against production once: `node scripts/apex-probe.mjs`
Expected: **exit 1** — `apex root 404 FAIL (expected 200 …)` while both PDFs pass. That is the calibration: the probe fails before the deploy and passes after. Record the output in the commit message.

- [x] **Step 5: Reorder the deploy job**

In `.github/workflows/ci.yml`, cut the whole `Deploy apex worker (catalogue + profile PDFs)` step together with its comment block (`# THE APEX WORKER, WHICH NOTHING DEPLOYED UNTIL NOW.` through the `run: pnpm deploy:apex` line) and paste it **immediately before** `- name: Deploy CMS worker`. Replace the paragraph that begins `# LAST, AFTER the viewer smoke tests` with:

```yaml
      # FIRST, BEFORE THE CMS WORKER, SINCE 2026-09-06 — and not merely "early".
      # A route pattern belongs to one Worker at a time. This Worker used to hold
      # `wear-run.help/*` and `www.wear-run.help/*`; the marketing site now lives on
      # them, served by the CMS Worker. So this deploy must give the wildcards UP
      # before the CMS deploy claims them, or the CMS deploy is refused for a route
      # that is still taken. The four PDF routes stay attached throughout; the only
      # window is the seconds between the two deploys on `wear-run.help/` itself.
      # Its assertion stays LAST in this job, after the site is up, so a bad apex
      # deploy is still caught in this run rather than by tomorrow's uptime cron.
```

Leave `Post-deploy apex assertion (both PDFs, ranged GET)` where it is, and rename it `Post-deploy apex assertion (the site, both PDFs)`.

In `.github/workflows/uptime.yml`, change line 17's `apex-probe.mjs asserts the catalogue` clause to `apex-probe.mjs asserts the marketing site answers on the apex and the catalogue` (keep the sentence's grammar), and in the comment above `node scripts/apex-probe.mjs || ok=false` add one line: `# Since 2026-09-06 it also asserts the apex root serves the SITE (200, HTML, wordmark).`

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/workflowHardening.test.ts`
Expected: PASS — the eleven rules, incl. "only invokes pnpm scripts that exist" and "gates the deploy on every job".

- [x] **Step 6: The post-deploy smoke**

In `scripts/smoke-post-deploy.sh`, after the `nothtml()` helper is defined and before the final summary lines, add:

```bash
echo "── Beta Website (2026-09-06): the apex serves the site, with one address ──"
# ⚠️ WRITTEN TO FAIL FIRST. Against production before the merge every line here fails
# (the apex 404s, nothing redirects); after the deploy all six pass. Calibrated, not
# assumed — the header of this file says why that matters.
chk "GET / on the apex is the site"        200 "$(code https://wear-run.help/)"
chk "apex / is HTML, not a PDF or a 404"   ok  "$(case "$(ctype https://wear-run.help/)" in *text/html*) echo ok;; *) echo nothtml;; esac)"
chk "apex / carries noindex while hidden"  ok  "$(curl -s https://wear-run.help/ | grep -q 'name="robots" content="noindex"' && echo ok || echo missing)"
chk "www -> apex, same path"               "308 https://wear-run.help/products" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://www.wear-run.help/products)"
chk "cms public page -> apex"              "308 https://wear-run.help/products" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://cms.wear-run.help/products)"
chk "apex /admin is the site's 404"        404 "$(code https://wear-run.help/admin)"
chk "apex /admin shows no login"           ok  "$(curl -s https://wear-run.help/admin | grep -q '404 · PAGE NOT FOUND' && echo ok || echo login)"
chk "cms /admin is still the admin"        200 "$(code https://cms.wear-run.help/admin)"
chk "www /catalogue is still the PDF"      ok  "$(case "$(ctype https://www.wear-run.help/catalogue)" in *application/pdf*) echo ok;; *) echo notpdf;; esac)"
```

Run: `bash scripts/smoke-post-deploy.sh`
Expected: exit 1, with the nine new lines failing and every earlier line unchanged. Paste the nine failing lines into the commit message as the pre-deploy calibration.

- [x] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/uptime.yml scripts/apex-probe.mjs apps/cms/src/apexProbe.test.ts scripts/smoke-post-deploy.sh
git commit -m "ci: deploy the PDF Worker before the CMS Worker, and expect the site on the apex — probe, smoke and tests follow"
```

---

### Task 5: The documents that would otherwise lie

**Files:**
- Modify: `CLAUDE.md:560-569` and the `Ten more traps` line
- Modify: `apps/cms/CLAUDE.md` (one bullet at the end of `## Traps`, before `## Browser tests for the public site`)
- Modify: `docs/CLOUDFLARE-SETUP.md` (§11.4 and the `## Live endpoints` table)
- Modify: `docs/RUNBOOK.md` (the `## Undoing a bad deploy (rollback)` section and the bullet beginning `**The bare apex \`wear-run.help\` returns 404`)

- [ ] **Step 1: Root `CLAUDE.md`, size-neutral**

Replace the paragraph from `**The apex serves TWO PDFs and 404s everything else` through `reporting success.` with:

```markdown
**The apex serves the SITE and two PDFs — two Workers, split by route (2026-09-06).**
`wear-run.help/*` and `www.` go to the CMS Worker (the marketing site); `/catalogue`
(54.3 MB) and `/profile` (16.9 MB) go to `infra/apex-404/index.js` on four NARROWER
routes, from the **shared** `run-assets` bucket the separate `run-apparel` site also
binds — most-specific route wins. **Do not delete the apex DNS record**: zone routes
need it proxied, or the site AND both PDFs stop resolving. Before 2026-09-06 the apex
404'd everything else (and 522'd after 20.2 s before 2026-08-19 — the DURATION was the
finding); `scripts/apex-probe.mjs` now expects the site there. The PDF Worker DRIFTED
from the repo for two days in 2026-08 after a dashboard edit; CI deploys it now, FIRST.
```

Change `**Ten more traps live in \`apps/cms/CLAUDE.md\`**` to `**Eleven more traps live in \`apps/cms/CLAUDE.md\`**`.

Measure: `python3 -c "print(len(open('CLAUDE.md',encoding='utf-8').read()))"` — must be ≤ 39,000. If it is over, shorten the new paragraph (drop the 522 clause first); never touch another section to make room.

- [ ] **Step 2: `apps/cms/CLAUDE.md` — the eleventh trap**

Insert as the last bullet under `## Traps` (immediately before the blank line and `## Browser tests for the public site`):

```markdown
- **THE SITE ANSWERS ON THREE HOSTNAMES AND ONLY `has: host` RULES TELL THEM APART.**
  `wear-run.help` is the site; `www.` 308s to it; `cms.wear-run.help` is the admin and
  the API and 308s its four public paths to the apex; `/admin` and `/api` on the apex
  rewrite to the branded 404 so the login has ONE hostname. The rules live in
  `siteHostRules.mjs` and are proven in `.next/routes-manifest.json` by
  `src/hostRulesManifest.test.ts`, never in a handler. ⚠️ OpenNext tests a host value
  UNANCHORED — a bare `wear-run.help` also matches `cms.wear-run.help` and the admin
  rewrite takes the admin down — so every pattern is `^…$` with escaped dots.
  ⚠️ `wrangler dev`, and therefore `opennextjs-cloudflare preview`, rewrites the Host
  to the FIRST configured route unless `--infer-origin-from-routes=false` is passed:
  a preview without it wears the wrong hostname and the rules fire for the wrong reason
  (Task 6 of the launch plan records what was measured).
```

- [ ] **Step 3: `docs/CLOUDFLARE-SETUP.md`**

Replace §11.4's body with:

```markdown
`infra/apex-404/` is a deployed Worker (`run-apparel-apex-404`) that serves exactly
two paths from the **shared** `run-assets` bucket — `/catalogue` and `/profile` — on
four narrow routes (`wear-run.help/catalogue*`, `/profile*`, and the `www.` pair).
Since 2026-09-06 the apex itself — `wear-run.help/*` and `www.wear-run.help/*` — is the
marketing site, served by the CMS Worker; Cloudflare hands a request to the most
specific route, so the PDFs are untouched. CI deploys this Worker BEFORE the CMS Worker
because a route pattern belongs to one Worker at a time.

⚠️ **The apex DNS record must stay proxied.** Zone routes require it; deleting it
takes the site and both PDFs offline.
```

In the `## Live endpoints` table add, as the first two rows:

```markdown
| Marketing site (CMS Worker on zone routes) | `https://wear-run.help` — `www.` redirects here; `/admin` and `/api` here answer the site's 404 |
| Catalogue and profile PDFs (`run-apparel-apex-404`) | `https://wear-run.help/catalogue`, `https://wear-run.help/profile` |
```

- [ ] **Step 4: `docs/RUNBOOK.md`**

In `## Undoing a bad deploy (rollback)`, after the `### The commands` block's closing fence, add:

```markdown
### Routes are not versions — rolling back the site's address

`wrangler rollback` restores a Worker's CODE and leaves its ROUTES where they are. To
put the apex back the way it was before 2026-09-06 (the PDF Worker answering everything):

1. remove the two wildcard routes from `apps/cms/wrangler.jsonc` and deploy the CMS
   Worker — the site stops answering on the apex;
2. restore `wear-run.help/*` and `www.wear-run.help/*` on `infra/apex-404/wrangler.jsonc`
   and deploy the PDF Worker.

**That order, not the reverse** — a pattern belongs to one Worker at a time, and the
second deploy is refused while the first still holds it. `scripts/apex-probe.mjs` will
then FAIL on the apex root (it expects the site), which is correct and is the reminder to
revert this section's steps in the repo too.
```

Replace the bullet that begins `**The bare apex \`wear-run.help\` returns 404` with:

```markdown
- **The bare apex `wear-run.help` serves the marketing site since 2026-09-06** (it
  404'd in ~0.7 s from 2026-08-19, and 522'd after 20.2 s before that). The CMS Worker
  answers it on zone routes; `infra/apex-404/index.js` keeps `/catalogue` and `/profile`
  on four narrower routes. All three are asserted by `scripts/apex-probe.mjs`, run from
  `uptime.yml`, and the site's redirects by `scripts/smoke-post-deploy.sh`.
```

- [ ] **Step 5: Verify every gate that reads documents, then commit**

Run: `node scripts/doc-citations.mjs && npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts`
Expected: `0 unresolved`; the trap count for `apps/cms/CLAUDE.md` is Eleven; every instruction file under 39,000.

```bash
git add CLAUDE.md apps/cms/CLAUDE.md docs/CLOUDFLARE-SETUP.md docs/RUNBOOK.md
git commit -m "docs: the apex is the site now — root notes, the cms traps, the Cloudflare setup and the rollback order for routes"
```

---

### Task 6: Prove the host rules in the real runtime, then run every gate

**Files:** none modified except by the gates' own outputs. Findings go into the commit message of a `docs:` commit that appends a dated "Measured" paragraph to the spec's §8 table.

- [ ] **Step 1: Build for Cloudflare and start the preview with the Host preserved**

Run, in the background with its own log: `cd apps/cms && npx --yes pnpm@10.33.0 exec opennextjs-cloudflare build && npx --yes pnpm@10.33.0 exec opennextjs-cloudflare preview -- --port 8788 --infer-origin-from-routes=false`
Expected: `Ready on http://localhost:8788`. If the flag is not accepted (it is a `wrangler dev` flag and the preview command forwards its arguments), try `--host wear-run.help` and record which worked.

- [ ] **Step 2: The matrix, with the Host header set by curl**

```bash
for h in wear-run.help www.wear-run.help cms.wear-run.help; do
  for p in / /products /admin /api/media?limit=1 /sitemap.xml /robots.txt; do
    printf '%-20s %-22s ' "$h" "$p"
    curl -s -o /dev/null -w '%{http_code} %{content_type} %{redirect_url}\n' -H "Host: $h" "http://localhost:8788$p"
  done
done
```

Expected (record the actual table in the commit message):

| Host | Path | Expect |
|---|---|---|
| wear-run.help | `/`, `/products` | 200 text/html, body has `content="noindex"` |
| wear-run.help | `/admin`, `/api/media?limit=1` | 404 text/html, body has `404 · PAGE NOT FOUND`, no `<form` |
| wear-run.help | `/sitemap.xml` | 200, no `<loc>` |
| www.wear-run.help | every path | 308 → `https://wear-run.help<path>` |
| cms.wear-run.help | `/`, `/products`, `/sitemap.xml` | 308 → `https://wear-run.help<path>` |
| cms.wear-run.help | `/admin` | 200 (the login) |
| cms.wear-run.help | `/api/media?limit=1` | 403 JSON |
| cms.wear-run.help | `/robots.txt` | 200 |

- [ ] **Step 3: Negative control — start the preview WITHOUT the flag and observe the Host inference**

Stop the preview, restart it without `--infer-origin-from-routes=false`, repeat the `wear-run.help /admin` and `cms.wear-run.help /products` lines. Record what the app saw (which hostname the rules fired for). Whatever the outcome, it is what `apps/cms/CLAUDE.md`'s new bullet must state; edit that bullet's last sentence to match the measurement if it differs.

- [ ] **Step 4: Every gate, in CI's order**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 seed:assets && npx --yes pnpm@10.33.0 build && npx --yes pnpm@10.33.0 test:coverage && bash scripts/test-alert-shell.sh && node scripts/check-bundle-budget.mjs && node scripts/doc-citations.mjs && npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:preload && npx --yes pnpm@10.33.0 --filter @run-apparel/cms test:routes
```

then `npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e`, then `CI=1 npx --yes pnpm@10.33.0 --filter @run-apparel/cms test:e2e`, then the CMS suite once more with the two local env files (apps/cms/.env and apps/cms/.dev.vars — gitignored, so never cited in backticks) moved aside and wrangler's local state folder apps/cms/.wrangler removed (CI's cold conditions; restore both files after), then `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec opennextjs-cloudflare build`.

Expected: all green. The build runs BEFORE `test:coverage` above on purpose — both post-build guards read build output and a stale one fails them.

- [ ] **Step 5: Record and commit**

Append to the spec's §8 a paragraph `**Measured 2026-09-06:**` with the matrix from Step 2 and the Host-inference result from Step 3, then:

```bash
git add docs/superpowers/specs/2026-09-06-beta-website-launch-design.md apps/cms/CLAUDE.md
git commit -m "docs: the host rules measured in workerd — the matrix, and what wrangler dev does to the Host"
git push
```

CI on PR #69 is the last measurement; read each job's `conclusion`, never the exit code, and the `e2e` job's time against its 20-minute budget (14.7 on the previous run).

---

### Task 7: The pre-launch audit (Phase 2)

**Files:**
- Create (named here only, so this document's citations stay valid): the report, at

```text
docs/AUDIT-BETA-WEBSITE-2026-09-06.md
```

**Method, fixed before measuring** — the spec's §10 verbatim: workerd preview with `Host: wear-run.help`, `next start` for the browser suites, Playwright and `curl` for every number, the Browser pane for looking only.

- [ ] **Step 1: The checklist, each item measured and scored 0–10 with the measurement beside it**

1. Every page and state: `/`, `/products` (populated and empty), `/contact`, the 404 — light/dark, reduced motion, forced colours, no-JS, touch, print, 320/375/390/414/768/1024/1280/1440/1920 px, keyboard-only through every control, the footer's claim blocks empty and filled (fill them through the local admin, then empty them again).
2. Security headers on all three hostnames, read from the workerd preview with the Host set: HSTS, CSP on the three pages, `frame-ancestors` on the admin, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; the 403 on `/api/media`; the rewrite on `/admin`.
3. SEO under both switch states: canonical, OG and Twitter tags with the social card reachable, JSON-LD parses, `robots.txt` on each host, `sitemap.xml` empty then full, `noindex` present then absent — flip `SITE_INDEXING` in the preview by passing `--var SITE_INDEXING:visible` to the preview command, or record that the flag does not reach vars and how it was flipped instead.
4. Performance: page weight per page (HTML, CSS, JS, fonts, images) from the network log; first paint under a throttled profile; the Lighthouse job's configuration and whether it covers these pages (it was written for the viewer — read `.github/workflows/ci.yml`'s `lighthouse` job before claiming coverage).
5. Accessibility: axe on every page and state (the suite already runs it; record the counts), focus order, the skip link on a screen reader's terms (`document.activeElement` after activation), every image's alt, every link's name, the footer clock's live region.
6. Error reporting: throw one error in a server component on a scratch branch of the preview and confirm it reaches the CMS Sentry project (`docs/CLOUDFLARE-SETUP.md` §11.6 says the CMS reported to nothing on 2026-08-30; ci.yml applies `SENTRY_DSN` since — establish which is true now).
7. Broken links: every `href` on every page fetched (`viewer.wear-run.help` ones included) — status and content type.
8. The deploy itself: which migrations are pending against production (`pnpm --filter @run-apparel/cms migrate:remote` is NOT run; read `apps/cms/src/migrations/index.ts` against the last deployed list), what the backup step covers, what the probe and the smoke assert after.

- [ ] **Step 2: Write the report** in the same form as `docs/AUDIT-SITE-PAGES-2026-09-05.md`: a score table, one section per area with the measurement, a "found false" section for any first-draft finding that did not survive re-measurement, and a "not covered" list stated plainly.

- [ ] **Step 3: Commit the report**

```bash
git add docs/AUDIT-BETA-WEBSITE-2026-09-06.md
git commit -m "docs: the Beta Website pre-launch audit — measured on the merged branch in workerd and a real browser"
```

- [ ] **Step 4: Stop.** Fixes are a separate plan written from the report, per the spec (§10: "not guessed before it"). Present the score table to the owner and ask which findings to fix before the merge.

---

## Self-review (run after writing, fixed inline)

- **Spec coverage.** §3 config → Task 3; §4 rules → Task 2; §5 switch → Task 1; §6 deploy order and rollback → Tasks 4 and 5; §7 probe/smoke/monitors → Task 4; §8 tests → Tasks 1, 2, 3, 6; §9 docs → Task 5; §10 audit → Task 7; §11 risks → Task 3 Step 4 (mixed routes), Task 6 Step 3 (Host inference).
- **Placeholders.** None: every test and every rule is written out; the two "record what you measured" steps (Task 6 Step 3, Task 7) are measurements by design.
- **Type consistency.** `SearchVisibility`, `robotsFor`, `sitemapFor`, `searchVisibility` (Task 1) match their uses in the layout, the sitemap and `publicSite.test.ts`; `siteRedirects`, `siteRewrites`, `routeFor`, `hostPattern`, `BLOCKED_PREFIX` (Task 2) match the model test and the manifest guard; `kind: 'site'` and `wordmark` (Task 4) match the probe and its tests.
