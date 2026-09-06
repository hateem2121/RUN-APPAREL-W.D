# Beta Website — launch design (routing, search visibility, pre-launch audit)

**Date:** 2026-09-06 · **Branch:** `beta-website` (PR #69) · **Status:** approved by the owner in conversation; written down here so the plan and the build cannot drift from what was agreed.

## 1. What this is

The public marketing site (Home, All Products, Contact, the branded 404, the notch navbar and the Quiet Room footer) is built and verified on this branch, and `main` is merged into it. It has no home address yet: the CMS Worker that renders it is reachable only at `cms.wear-run.help`, while every canonical link, the sitemap and the structured data already assume `https://wear-run.help` — and that address is today a 40-line Worker that serves two PDFs and answers 404 to everything else. Merging as-is would publish pages that tell Google they live somewhere that returns 404.

This record covers the three things the owner asked for before anything deploys: put the site on its real address, keep it out of search engines until it is called final, and audit the finished build.

## 2. Decisions (owner, 2026-09-06)

| Question | Decision |
|---|---|
| Branch and PR name | Branch `beta-website` (git refuses spaces); PR titled "Beta Website" |
| Where the site lives | `wear-run.help`, the main address — not a beta subdomain, not `cms.` |
| `www.wear-run.help` | Sends visitors to `wear-run.help`, same path |
| Public pages on `cms.wear-run.help` | Send visitors to `wear-run.help` |
| `/admin` and `/api` typed on `wear-run.help` | Answer the site's own 404 page. The admin keeps exactly one login hostname |
| Search engines during beta | Hidden: `noindex` on every page and an empty sitemap, until the owner calls it final |
| Where the hide/show switch lives | A deploy-time setting only the maintainer changes — a code change and a deploy, never a click in the admin |
| Scope of "production ready" | The routing above, plus a full pre-launch audit by the maintainer on the merged branch. NOT the owner-only content items (those stay in `docs/OWNER-CHECKLIST.md`) and NOT a separate preview deployment |
| Deploying | Nothing deploys until the owner merges; merging is the deploy |

## 3. Architecture: one Worker per job, split by path

Two Workers already exist and both stay. What changes is which one Cloudflare hands each request to.

| Address | Today | After |
|---|---|---|
| `cms.wear-run.help` (custom domain) | CMS Worker: admin, API, and the site by accident | CMS Worker: admin and API; the three public pages redirect to the main address |
| `wear-run.help/*` and `www.wear-run.help/*` (zone routes) | PDF Worker `run-apparel-apex-404`: `/catalogue`, `/profile`, 404 for the rest | CMS Worker: the site |
| `wear-run.help/catalogue*`, `/profile*` and the `www.` pair | (covered by the wildcard above) | PDF Worker, unchanged code, on these four narrower routes |

**Why this shape.** Cloudflare sends a request to the most specific matching route ("More specific routes take precedence over wildcard routes" — Cloudflare docs, Workers routing), so the PDF Worker keeps its two paths without a line of its code changing, and the site is served by the Worker that renders it, on the hostname it renders for. Static files (`/_next/static/*`) are served by Cloudflare's asset layer before the Worker runs, exactly as on `cms.` today.

**The alternative, rejected.** Keeping the PDF Worker as a front door that fetches pages from the CMS. Measured on the built output: the CMS Worker's own code never touches its assets binding (it relies entirely on Cloudflare serving assets first), so a front door calling it through a service binding would 404 every chunk; a front door fetching `cms.wear-run.help` instead would put the wrong hostname inside every request, which shows up as redirects and `Location` headers pointing at `cms.`. Two Workers in every page's path, carrying the wrong name, for no gain.

### 3.1 Config changes

- `apps/cms/wrangler.jsonc` — `routes` gains `{ "pattern": "wear-run.help/*", "zone_name": "wear-run.help" }` and the `www.` twin, alongside the existing custom domain. `workers_dev` and `preview_urls` stay `false`; `apps/cms/src/workerConfigs.test.ts` keeps asserting both.
- `infra/apex-404/wrangler.jsonc` — `routes` becomes the four PDF patterns. Its comment ("BOTH ROUTES ARE REAL … removing either detaches the Worker") is rewritten to say what is now true: the wildcard is gone on purpose and belongs to the CMS Worker.
- The apex DNS record stays proxied. Zone routes need it (Cloudflare docs: "you must have a Cloudflare proxied DNS record for the hostname before adding a route"); it is the same record the PDFs have always depended on.

## 4. Address rules — in `apps/cms/next.config.mjs`, verified in the manifest

All three rules are Next `redirects()` / `rewrites()` entries with a `has: [{ type: 'host', value: … }]` condition. This is the mechanism to use here and not a handler, for the reason `apps/cms/publicViewerHeaders.mjs` records: config rules land in `.next/routes-manifest.json`, which a test can read, whereas a handler's header shipped green and inert once. Evidence the platform honours host conditions: `@opennextjs/aws`'s router (`dist/core/routing/matcher.js`) implements `has`/`missing` with `case "host"` by regex-testing the request's Host header.

| Rule | Kind | Match | Result |
|---|---|---|---|
| www → main | redirect, permanent (308) | host `www.wear-run.help`, any path | `https://wear-run.help/<same path>` |
| cms public pages → main | redirect, permanent | host `cms.wear-run.help`, paths `/`, `/products`, `/contact`, `/sitemap.xml` | `https://wear-run.help/<same path>` |
| admin/API on main → 404 | rewrite, `beforeFiles` | host `wear-run.help`, paths `/admin` and below, `/api` and below | an unrouted path under the frontend group, so the catch-all route calls `notFound()` and the branded 404 renders with status 404 |

Notes that shape the tests:

- `robots.txt` stays served on both hosts (it disallows `/admin` and `/api/` on each). `og-default.png` and `icon.svg` are static files and stay reachable on both.
- The `www.` redirect also carries the PDFs' `www.` paths, but those never reach the CMS Worker: the PDF Worker's narrower `www.` routes win first, so `www.wear-run.help/catalogue` keeps serving the PDF directly.
- Local `next start` (the e2e server on `localhost:4174`) matches none of the host conditions, so it behaves as the main address. That is what the existing 100 browser tests already assume.
- Nothing about the viewer changes. It calls `cms.wear-run.help/api/…` directly, and its crawler path uses a service binding to the CMS by name, not by hostname.

## 5. Search visibility — a deploy-time switch, default hidden

- **The setting:** a wrangler var `SITE_INDEXING` on the CMS Worker, values `hidden` or `visible`, committed in `apps/cms/wrangler.jsonc` as `"hidden"`. Read at request time the way the rest of the app reads its vars (`getCloudflareContext` with a `process.env` fallback), and **absent means hidden** — a missing var fails closed.
- **While hidden:** the frontend layout's `generateMetadata` returns `robots: { index: false }` (rendered as `<meta name="robots" content="noindex">`) on every public page; `sitemap.xml` returns no URLs. `robots.txt` keeps allowing crawling, deliberately — a crawler can only obey a `noindex` it is allowed to read, and `Disallow: /` would let a linked URL be indexed with no content.
- **When visible:** the layout declares no `robots` at all, exactly as it does today (declaring `index` explicitly broke the 404's `noindex` after hydration — measured 2026-09-05, recorded in the layout), and the sitemap lists the three pages.
- **To flip it:** change the value in `apps/cms/wrangler.jsonc`, open a PR, merge. Live on the next deploy. Search Console will show the pages as "Excluded by noindex" until then; that is the expected state, not a fault.
- **Unchanged while hidden:** link previews (WhatsApp, LinkedIn) still render the social card, so the beta can be shared; the structured data still ships.

`apps/cms/src/publicSite.test.ts` currently asserts the layout source contains no `noindex`. That assertion is replaced by ones on behaviour: the switch defaults to hidden, hidden yields `index: false`, visible yields no `robots` key, and the sitemap follows the same switch.

## 6. The switch-over, inside one normal deploy

The deploy job in `.github/workflows/ci.yml` currently deploys the PDF Worker **last**, after the viewer's smoke tests. For this change it must deploy **before** the CMS Worker, once, because a route pattern belongs to one Worker at a time: the PDF Worker has to give up `wear-run.help/*` before the CMS Worker can claim it.

Order after the change: D1 migrate → **PDF Worker (narrowed routes)** → CMS Worker (new routes) → secrets → viewer → smoke tests → apex probe. The apex probe already runs last, so a bad site deploy is still caught in the same run.

The only window is the seconds between the two deploys, on `wear-run.help/` itself, which answers 404 today. The PDF paths are routed to the PDF Worker throughout. The workflow comment that justified "last" is rewritten to justify "first", with this reason, so the next reader does not "fix" the order back.

**Rollback** is the reverse order, and a Worker version rollback does not touch routes: to return to the old shape, remove the two wildcard routes from the CMS Worker's config and deploy it, then restore the wildcard routes on the PDF Worker and deploy that. `docs/RUNBOOK.md` → "Undoing a bad deploy" gains this paragraph.

## 7. What watches the apex, and what changes

- `scripts/apex-probe.mjs` (post-deploy in CI, and daily from `.github/workflows/uptime.yml`) asserts the bare apex returns **404**. Its `apex root` target becomes kind `site`: expect 200, `text/html`, and the wordmark in the body. `apps/cms/src/apexProbe.test.ts` follows: "FAILS if the bare apex stops 404ing" becomes "FAILS if the bare apex stops serving the site", and a 404 at the root is a failure.
- `scripts/smoke-post-deploy.sh` gains four live checks: the root serves the site (200, HTML, `noindex` present while hidden); `www.` redirects to the main address; `cms.wear-run.help/products` redirects to the main address; `wear-run.help/admin` answers 404 with the site's page and no login form.
- `apps/cms/src/apexWorker.test.ts` is unchanged — it tests the PDF Worker's code, which is unchanged. Its "404s `/`" cases stay true of the code and simply stop being reached in production.
- The three external monitors (UptimeRobot) watch the catalogue PDF, the viewer and the API. None expects the apex to 404. No change.

## 8. Tests, and what each would catch

| Test | Catches |
|---|---|
| Config: CMS wrangler declares the two wildcard routes with `zone_name`; PDF wrangler declares only PDF patterns and no wildcard | A route quietly restored to the wrong Worker |
| Manifest: after `next build`, `.next/routes-manifest.json` holds the www redirect, the cms-page redirects and the admin/API rewrite, each with its host condition | A rule that reads fine in `next.config.mjs` and never reached the build — the `Vary` failure shape |
| Unit: the switch reader defaults to hidden; metadata and sitemap follow it both ways | A future refactor that makes the site indexable by accident |
| e2e in `next start` (existing 100): unchanged behaviour on localhost, plus `noindex` present and the sitemap empty under the default | The default state as CI runs it |
| e2e in workerd (`opennextjs-cloudflare preview`): requests with `Host: www.wear-run.help`, `cms.wear-run.help` and `wear-run.help` for `/`, `/products`, `/admin`, `/api/media` | The host rules as the real runtime evaluates them. ⚠️ `wrangler dev` rewrites the Host to the first configured route unless `--infer-origin-from-routes=false` is passed; the preview command forwards wrangler flags, and the plan passes it explicitly |
| Negative controls, each run once and recorded | A gate that passes because it measures nothing: a wrong host value, a removed rewrite, a flipped default |

## 9. Documents that must change with it

- `CLAUDE.md` (root): the paragraph "The apex serves TWO PDFs and 404s everything else" — now the apex serves the site and two PDFs; the DNS warning stays. The file has ~150 characters of headroom under its gate, so the edit must be size-neutral.
- `docs/CLOUDFLARE-SETUP.md` §11.4 and the "Live endpoints" table.
- `docs/RUNBOOK.md`: the rollback paragraph in §6 above; the uptime section's description of the apex probe.
- `apps/cms/CLAUDE.md`: one trap — the site lives on three hostnames and only host-conditioned config rules separate them; and the `wrangler dev` Host inference.
- `infra/apex-404/index.js` header comment: what the Worker is for now (two PDFs, on four narrow routes).

## 10. Phase 2 — the pre-launch audit

After the routing is built and green, and before the owner is asked to merge:

- **Where measured:** the workerd preview of the merged branch, the Host header set to `wear-run.help`, plus `next start` for the browser suites. Numbers from the Browser pane are not evidence (recorded twice in memory); Playwright and `curl` are.
- **What:** every page (`/`, `/products` populated and empty, `/contact`, the 404) and every state (light/dark, reduced motion, forced colours, no-JS, touch, print, 320–1920 px, keyboard); security headers on all three hostnames; SEO under both switch states (canonical, OG, JSON-LD, robots, sitemap); performance (page weight, fonts, the Lighthouse job's targets); accessibility (axe, focus order, skip link, screen-reader labels); error reporting (does a thrown error reach Sentry from the CMS Worker); broken links (every href on every page fetched); the footer's claim blocks empty and filled; the redirects and the admin 404 on the real hostnames; what the deploy does (migrations, backups, the probe).
- **Deliverable:** a new document, docs/AUDIT-BETA-WEBSITE-2026-09-06.md (not yet written, so not cited), scoring each area against measurements, with every fix made on the branch and every "not covered" item stated plainly — the same form as `docs/AUDIT-SITE-PAGES-2026-09-05.md`. Its remediation is Phase 2's own plan, written after the audit, not guessed before it.

## 11. Residual risks, stated

- **Route ownership behaviour.** If the deploy order were ever reversed, the CMS deploy would try to claim a route the PDF Worker still holds. The plan encodes the order in the workflow and in a comment; the failure, if it happened, is a refused deploy, not an outage.
- **Smart Placement.** The CMS Worker is smart-placed near D1. Serving the site through zone routes does not change that, and assets are still served asset-first at the edge (Cloudflare docs: Smart Placement with assets first "lets you serve assets from as close as possible to your users").
- **Local previews wear the wrong hostname.** `wrangler dev` infers the origin from the first route. Every local measurement of a host rule must pass `--infer-origin-from-routes=false` or set the Host explicitly, or it measures the wrong host and passes for the wrong reason.

## 12. Out of scope

The owner-only content items (facts, footer blocks, logo, analytics token); moving the apex to a Workers custom domain (it would mean deleting the DNS record the PDFs depend on); a separate preview deployment; any change to the viewer, the pipeline or the shrink Worker.
