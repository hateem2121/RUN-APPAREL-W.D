# CLAUDE.md — apps/cms

🔴 = stops here, do not proceed. 🟡 = read before acting. 🟢 = context.

Split out of the repo-root `CLAUDE.md` on 2026-08-15 by `/doctor`, for the same
reason the viewer traps moved on 2026-08-10 and the pipeline's on 2026-08-12: the
root file is loaded into *every* session in this repo, and these are only ever
needed by a session actually touching the CMS. They load automatically the moment
you touch `apps/cms/`. Paths below are repo-root-relative, as they were before the
move. Nothing below was reworded.

Root `CLAUDE.md` still holds the cross-cutting CMS material — the D1 pragma trap,
`fileColours` being deliberately outside `GATED_FIELDS`, and
**"Before you delete anything in the CMS"**, which stayed there on purpose because
it governs `apps/shrink/src/cms.ts` and `scripts/find-orphan-media.mjs` as well as
this app, and would stop loading for the shrink half if it moved here. Read the
root file first.

## Traps

- **🔴 Any Payload CLI task touching production D1 must set `NODE_ENV=production`**,
  or Payload runs a dev-mode schema push against it. Incident 2026-07-22: a dev-mode schema push ran against production D1 during the first gated deploy (`docs/HARDENING-LOG.md`).
- **Put nothing but migrations in `apps/cms/src/migrations/`.** Payload's
  `readMigrationFiles` imports *every* `.ts`/`.js` there except `index.ts` and
  treats each as a migration. A test file added there on 2026-07-31 was imported
  during `migrate:remote`, ran `describe()` with no vitest runner, and stopped
  the production deploy. `src/migrationReplay/migrations.test.ts` now guards it.
- **🟡 `withPayload` appends its OWN `headers()` rule after yours, and Next lets the
  LAST matching rule win** — so a header set on a route handler's `Response`, or
  added to `SECURITY_HEADERS`, can be silently overridden. Measured 2026-08-18: L1
  set `Vary: Origin, Sec-CH-Prefers-Color-Scheme` in `src/endpoints/publicViewer.ts`,
  its test asserted the returned `Response` carried it and passed, the change merged
  and deployed — and production answered `vary: Sec-CH-Prefers-Color-Scheme` the
  whole time it was believed fixed. Ordering inside `nextConfig.headers()` cannot win
  either; that array is spread first by construction. The rule must be appended to
  the config `withPayload` **returns** — `publicViewerHeaders.mjs`, pinned by
  `src/publicViewerHeaders.test.ts`, which asserts which rule WINS and carries a
  negative control reproducing the inert state. **Verify a header change in
  `.next/routes-manifest.json`, never in a handler.**
  The public pages' Content-Security-Policy uses the same wrapper for the same reason
  (`publicPageCspRules`), scoped to `/`, `/products`, `/contact` — an explicit list, not a
  negative lookahead, because a wrong lookahead fails OPEN onto `/admin` and the symptom
  is a broken Payload login rather than an error.

- **🟡 Error reporting is `src/instrumentation.ts` + a hand-rolled envelope, and BOTH
  halves are load-bearing.** 🟡 Next resolves `instrumentation.ts` from the project
  root or `src/` and NOWHERE ELSE — move it into `src/lib/` for tidiness and the hook
  simply stops firing, with no warning and no error. `src/instrumentation.test.ts`
  pins the path for that reason. 🟡 **Do NOT "upgrade" this to `@sentry/nextjs`.**
  It was rejected on measured evidence, not preference: `Sentry.captureRequestError`
  inside `onRequestError` throws AsyncLocalStorage errors on Workers
  (sentry-javascript#18842), OpenTelemetry does not bundle on Next 16 + OpenNext
  (opennextjs-cloudflare#969), and `withSentryConfig` would have to join the
  next.config wrapper chain that `publicViewerHeaders.mjs` documents as having
  already shipped one green-but-inert fix. 🟡 A missing `SENTRY_DSN` is a deliberate
  NO-OP — it has to be, since every build, test and Payload CLI run has none — so a
  secret that fails to apply yields a silent, green, blind deploy. `ci.yml` asserts
  the Worker holds it; keep that step. And when changing the event shape, verify the
  INGESTED event in Sentry, not the payload: the first version passed every unit
  test, got a 200, and displayed "No stacktrace available" because an empty `frames`
  array is valid and `raw` is not a field Sentry knows.

- **🟡 The publish gate and the public API are DIFFERENT gates, and relaxing one
  without the other saved a product the API then refused to serve.** A poster
  requirement lived in three places — `publishGating.ts` (may I save it?),
  `Stage.tsx` (do I draw it?), `projectViewer.ts` (may I serve it?). PR #39 relaxed
  the first two; the third still dropped poster-less colourways, so detaching a
  published garment's five posters left zero colourways and the endpoint **404'd it
  live** (2026-08-21, fixed in PR #40). Before relaxing any per-colourway
  requirement, grep all three. 🟡 `uptime.yml` cannot catch this — it probes an SPA
  that returns 200 HTML for any path, so it stayed green throughout.

- **🟡 A PATCH NAMING A PROJECTED FIELD RETURNS 200 AND STORES NOTHING.** 2026-09-04: a
  script wrote `customisationIntroHtml` on all eleven live products, printed `✓ written`
  eleven times and stored ten of eleven intros nowhere — while the `customisationSteps`
  in the same body landed, which is what hid it. That field does not exist on the
  collection; `endpoints/publicViewer.ts` COMPUTES it at read time from the real column,
  `customisationIntro` (Lexical). Payload drops an unknown key and answers 200. **Verify
  a write by READING IT BACK** (`?depth=0`, compare), never by the status code —
  `scripts/apply-customisation-copy.mjs` now does. And **do not escape text bound for a
  Lexical field**: `convertLexicalToHTML` escapes text nodes itself (measured,
  `Teamwear & Uniforms` → `Teamwear &amp; Uniforms`), so escaping first ships a literal
  `&amp;`.

- **🟡 The `build-process` global is RETIRED — do not reconnect it.** It held one "How we
  build your product" text for the whole catalogue and won over a product's own copy the
  moment it was saved, the discriminator being `id` ("has anyone opened this screen"),
  not content — so one save replaced the copy on all eleven live garments, and saving it
  EMPTY served zero steps everywhere (`Array.isArray([])` is true). Once the owner chose
  per-garment copy on 2026-09-04 its only available effect was destroying that work in a
  click. `buildViewerResponse` no longer takes it as a parameter, so passing one is a
  TYPE error rather than a silently-ignored argument; the global is `admin.hidden`; the
  per-product tab is visible again. The table stays — D1 rebuild hazard,
  `presentation_mode` precedent.

- **`pnpm build` PASSING DOES NOT MEAN THE APP CAN BE DEPLOYED.** `opennextjs-cloudflare
  build` is a second, stricter build and nothing in `pnpm test` runs it. Measured
  2026-09-05: a `proxy.ts` (Next 16's renamed middleware) compiled fine under `next build`,
  `tsc --noEmit` and 2,000 tests, and failed the Cloudflare build outright — *"Node.js
  middleware is not currently supported"*; adding `runtime: 'edge'` failed earlier still —
  *"Proxy does not support Edge runtime"*. **There is no middleware/proxy on this stack, so
  Next itself cannot make a per-request CSP nonce — `worker.mjs` does it instead, outside
  Next (SE-04, decided 2026-09-18).** Run
  `pnpm --filter @run-apparel/cms exec opennextjs-cloudflare build` before trusting any
  change to routing, middleware, headers or `next.config.mjs`. Same shape as the TypeScript
  pin in the root file, one level deeper.

- **🟡 Public page content is cached in-process for 60 seconds** (`src/lib/content.ts`), which
  took `/products` from 302 ms to 5.7 ms in workerd. It is NOT shared between isolates and
  NOT cleared on save, so a CMS edit can take a minute to appear — owner's decision
  2026-09-05 over an R2 incremental cache plus a D1 tag table. Failures are never cached.

- **`apps/viewer/src/styles/tokens.test.ts` now scans JSX too**, so a literal
  `style={{ padding: '20px' }}` in a `.tsx` fails the build. It previously read only `.css`
  and three such values had walked past it. A `var()` or computed value is still fine.
  (Documented here because that file's own CLAUDE.md has 59 characters of headroom.)

- **🟡 THE SITE ANSWERS ON THREE HOSTNAMES AND ONLY `has: host` RULES TELL THEM APART.**
  `wear-run.help` is the site; `www.` 308s to it; `cms.wear-run.help` is the admin and
  the API and 308s its four public paths to the apex; `/admin` and `/api` on the apex
  rewrite to the branded 404 so the login has ONE hostname. The rules live in
  `siteHostRules.mjs` and are proven in `.next/routes-manifest.json` by
  `src/hostRulesManifest.test.ts`, never in a handler. 🟡 OpenNext tests a host value
  UNANCHORED — a bare `wear-run.help` also matches `cms.wear-run.help` and the admin
  rewrite takes the admin down — so every pattern is `^…$` with escaped dots.
  🟡 **`opennextjs-cloudflare preview` REWRITES THE HOST AND IGNORES YOUR `-H Host:`.**
  Measured 2026-09-07 on wrangler 4.122.0: with no flag, all three hostnames AND
  `localhost` behaved as `cms.wear-run.help` — the FIRST route in `wrangler.jsonc` —
  so `/admin` answered 200 and `/products` 308'd, whatever Host was sent. A preview
  read that way tells you nothing about the apex. `--infer-origin-from-routes=false`
  does NOT exist on this wrangler (`Unknown arguments: infer-origin-from-routes`);
  **`--local-upstream <host>` is the one that works**, and it pins every request to
  that host, so proving all three takes three previews, one per hostname.

## Browser tests for the public site

`pnpm --filter @run-apparel/cms test:e2e` — 100 tests, Chromium + Firefox, added 2026-09-05
because nothing loaded `/`, `/products` or `/contact` in a browser and three blank pages
would have passed every gate. Runs in CI as a **step inside the existing `e2e` job**, not a
job of its own: a new job would need adding to `deploy.needs` AND the required-checks list,
and `.github/CLAUDE.md` records that splitting those silently stops a red gate blocking.

🟡 **`e2e/prepare.mjs` SKIPS THE REBUILD LOCALLY**, so a source edit does not reach
`next start` and a negative control passes without testing anything. Use `CI=1` when
breaking something on purpose.

🟢 The port is owned by `playwright.config.ts` (4174) and `e2e/serve.mjs` THROWS if it is
unset.

🟢 **FIREFOX RUNS WITH `Cross-Origin-Opener-Policy` SWITCHED OFF, ON PURPOSE (2026-09-18).**
Every page sends that header, and it makes Playwright's Firefox driver lose a navigation
(microsoft/playwright#42731): `page.goto` times out waiting for "load" on a page that has
finished loading. That hit 25 of 40 CI runs; the retry hid it until PR #17 failed on it.
`e2e/firefoxPrefs.mjs` has the mechanism and the numbers, and `src/firefoxPrefs.test.ts`
pins it. Keep it until `node e2e/firefox-coop-hang.mjs --prefs=none` shows 0 stuck on a
newer Playwright.

🟡 **`next start` NEVER RUNS `worker.mjs`, THE SCRIPT GUARD (SE-04, 2026-09-18).** This suite
therefore tests the fallback policy (`PUBLIC_PAGE_CSP`, still with `'unsafe-inline'`) and never
the nonce. To see the guard:
1. Run `opennextjs-cloudflare build`.
2. Put a throwaway `PAYLOAD_SECRET` in a `.dev.vars` (gitignored) and run
   `opennextjs-cloudflare preview --local-upstream wear-run.help`.
3. Run `node e2e/csp-nonce-edge.mjs`: 3 engines × 6 page types.

After a deploy, run it with `--origin=https://wear-run.help`. 🟡 A control that skips the nonce
on an EXTERNAL script proves nothing: `'self'` still admits it, correctly. Only a missing nonce
on an INLINE script breaks a page, so plant the fault there. 🟡 A local `curl` without
`--compressed` counts ZERO scripts: the local runtime gzips a page the way Cloudflare's edge
does, AFTER the guard (measured 2026-09-22). OpenNext hands the guard plain text.

🟡 **CI's `e2e` job has NO `PAYLOAD_SECRET`, and local runs always do** (`.env`). So a
"passes locally" run proves nothing about the CI step: measured 2026-09-06 with `.env`
moved aside, Payload never initialised, `/admin` and `/api/*` answered 500, and four tests
failed while every page test stayed green. `e2e/serve.mjs` now supplies a throwaway
secret when the environment has none. To reproduce CI here, move `.env` and `.dev.vars`
aside and run with `CI=1`. And `/api/media` answers **403** to anonymous requests since
main narrowed `Media.read` — the catch-all test expects that, not 200.

## Writing products from a script

🟡 **Go through the REST API, never D1.** `Authorization: users API-Key <key>` — the
same header `apps/shrink/src/cms.ts` already uses. Every product write has to pass
`Products.beforeChange` (it derives `variantsVerified`, runs `assertPublishable`,
and writes an Events row when a live product loses its colour mapping), plus the
`beforeValidate` hooks that uppercase a code and derive a slug. A direct INSERT
skips all of it. `scripts/import-catalogue-products.mjs` is the worked example:
dry-run by default, idempotent by `productCode`, and it prints Payload's INNER
validation error (`errors[0].data.errors[]`) because the outer message is the
useless "The following field is invalid" with no field named.

🟡 **A Payload API key cannot be read back after it is created.** It is encrypted
in D1 with `PAYLOAD_SECRET`, and the robot's copy lives in a Cloudflare secret
(`CMS_ROBOT_API_KEY` on `apps/shrink`) which Cloudflare will not return.
🟡 **Regenerating the robot's key breaks the shrink pipeline** — issue a key on a
different user instead, and untick it afterwards.
🟡 **Rotating `PAYLOAD_SECRET` kills EVERY API key, the robot's included**, and
*Generate new API key* stores nothing until **Save**. Follow `docs/RUNBOOK.md` →
"Rotating PAYLOAD_SECRET" (2026-09-10: skipping either stranded a job on Queued).

🟡 **Never send `slug` when updating an existing product.** It is printed on
physical QR tags; `Products.ts` and `fields/colourways.ts` both enforce
suggest-never-correct. `productCode` and `sortOrder` are safe — neither is in a
URL. Send `sortOrder` too, or a re-run will not converge on your dataset.

**The whole printed catalogue is imported as of 2026-08-17** — the CMS holds
🟢 **67 products, not one**. 66 are drafts with no colourways, deliberately: the CLO
file names the colours (`ImportColoursFromFile`), so guessing 335 tag slugs was
refused. Three defects are in the PDF itself, not the data: its product codes are
unusable (67 products share 26; `R-XPB` alone is printed on 26 garments, so the
CMS codes are generated and do NOT match the book), pages 66/67 have their
material blocks crossed (which dropped a genuine-leather claim from a polyurethane
jacket — unsettled), and the index contradicts the artwork on two garments.
`scripts/catalogue-products.json` carries `sourcePage` on every row so any value
can be checked against the spread rather than trusted.

🟢 **The PDF text layer drops ligatures** — `ti`, `fl`, `fi` all vanish, so
"Athletic" extracts as "Athle c" and "flatlock" as "atlock". Anything that
diffs that text against real copy must normalise, or it reports dozens of
phantom differences. No `pdftotext`/`mutool` on this machine; `pip install
--target ./pylibs pypdf` works.

## Uploading media and writing array fields

`POST /api/media` is **multipart**, not JSON: `-F "file=@x.webp;type=image/webp"` plus
`-F '_payload={"alt":"…"}'` for the other fields. The filename becomes the R2 key, so
name it the way the existing objects are named (`<product>-<colour>-poster.webp`).
`altText` on a colourway auto-fills from `productName` + `displayName` via a
`beforeValidate` hook, so leave it out rather than retyping it.

🟡 **A PATCH to an array field REPLACES THE WHOLE ARRAY.** Fetch the product first,
change only the field you mean to, and send **every row back with its `id`** — or
Payload drops the rows you omitted. Row order decides the default colourway and each
`slug` is printed on a physical QR tag, so a partial send is silent data loss. Print
the before/after per row and assert the order is unchanged *before* sending.

🟡 **zsh globs `[` in a URL.** `where[slug][equals]=x` dies with
`curl: (3) bad range in URL`. Percent-encode (`where%5Bslug%5D%5Bequals%5D=`) or quote it.

After an upload, fetch the object with a 🟡 **plain GET, never HEAD** — see the cached-404
trap in the root file. A fresh upload answers `200` with `cf-cache-status: MISS`.

## Before you change a migration

Run `apps/cms/src/migrationReplay/replay.test.ts`. It replays every migration against
real SQLite with foreign keys **on**, seeds every table, and fails if any table
that had rows ends up empty. It exists because a migration once reported success
while cascade-deleting two tables nobody was watching.

The assertion is deliberately **generic**. The ad-hoc check run at the time
looked only at the table the migration was about, which is precisely why it
passed.

## `down()` migrations are tested for errors, not for data loss

`apps/cms/src/migrationReplay/replay.test.ts` guards the two directions unevenly. `up()`
is checked per migration: it seeds every table, counts rows before and after, asserts
`emptiedTables` is empty, and carries a negative control that reproduces the 2026-07-29
loss to prove the check can fail. The `down()` test seeds every table and then asserts
only `.resolves.not.toThrow()` — no row count, no emptied-table check, no negative
control.

The original incident was a migration that **reported success while cascade-deleting**.
That is precisely what a does-not-throw assertion cannot see, on the path
`migrate:remote:down` runs against production. Every `down()` in the tree today is
correctly ordered; the gap is in the guard, not in the migrations that exist.

## Reading production D1 without the wrangler CLI

`wrangler d1 execute --remote` is refused by Claude Code's auto-mode classifier, which
cannot tell a `SELECT` from a `DELETE`. Use the Cloudflare MCP connector's
`d1_database_query` instead — database `run-apparel-viewer-db`, id
`41e20361-1a5f-4c87-b5ca-781c57c9b3f4`. Its response carries `rows_written` and
`changed_db`, so "this was read-only" is provable rather than asserted.

Measured 2026-08-17 as a baseline worth having: `events` held **754 rows over 28 days**
(668 analytics, 84 diagnostic, 2 error) and the whole database was **790,528 bytes** —
0.015% of D1's included storage. That number downgraded a High finding to Low in
the 2026-08-17 audit (kept privately since 2026-09-10); re-measure before assuming the
events endpoint is under load.

## Writing to a product from a script — four things measured 2026-09-04

- **🟡 The shrink robot REFUSES to attach a model or import colours to a PUBLISHED product** —
  "swapping the model under a published page is your decision, not the robot's"
  (`apps/shrink/src/colourImport.ts`, and the same refusal for `glbAsset`). So a republish is
  TWO acts: the robot produces the Media doc, then a human PATCHes `glbAsset`. Do not read a
  `ready` raw upload as "the live page changed" — eleven garments went through on 2026-09-04
  and not one attached itself.
- **`retry` only fires on a false → true TRANSITION** (`rawUploadRetry.ts` → `retryDecision`:
  `doc.retry === true && previousDoc.retry !== true`). PATCHing `{retry:true}` onto a row that
  is already `true` returns **200 and does nothing at all**. Reset it to `false`, then tick it.
- **`sortOrder` is a plain `number` with no uniqueness rule**, so **10.5** inserts a product
  between 10 and 11 without renumbering the other 67. That is how `R-AJM` landed directly
  after `R-AJ`.
- **🟢 A corrected export is usually already in R2** under
  `run-apparel-archive/fixed-glbs/…`, so `scripts/ingest-from-archive.mjs` starts a shrink
  from an S3 `CopyObject` — measured 16.9 MB in 4.9 s and 1.71 GiB in 110 s, inside
  Cloudflare — instead of a browser re-upload up a link measured at ~300 kB/s. 🟢 Its
  `clientUploadContext` must be TRUTHY, or `@payloadcms/storage-r2` skips its own >50 MB
  short-circuit and the CMS Worker tries to buffer the whole object to satisfy a create.

## The public site footer

Built 2026-09-05 from an approved design — `docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md`.
Four things that bit while building it:

- **The CTA tab sits ON the slab's top edge, OUTSIDE the clipped box.** `<footer>` is
  unclipped; the inner slab carries `overflow: hidden` for the cropped wordmark. Put the
  tab inside the clipped element and it is invisible — the first draft did, and the fillets
  curved into an edge that was already behind them.
- **The wordmark is fitted by measuring the rendered text**, after `document.fonts.ready`.
  Two fixed sizes both ran the name off the edge; the name is a CMS field, so its length is
  an input. `apps/cms/src/lib/wordmarkFit.ts`.
- **🟡 The cursor honours `navigator.webdriver`** (as the viewer's does), so Playwright never
  sees it unless the test lifts the flag with `addInitScript`. `apps/cms/e2e/footer.spec.ts`
  does, and also asserts the honest default — absent under automation.
- **🟡 The footer's light is positioned from the cursor ring's TRAILED point** (`apps/cms/src/lib/cursorBus.ts`),
  never the raw pointer, and its 180ms linger needs its own timer tick: the bus publishes
  only while the ring moves, so without one a hand-off caught inside the window stayed lit
  over empty ground for good. The browser suite found that on its first run.

🟡 Two gates to know about here: `navbar.spec.ts` measures EVERY link on every page against
the 44px touch floor (the first footer shipped 16px rows — real 44px rows, never a
padding/negative-margin trick, which overlaps neighbours and hides the miss); and
`publicSite.test.ts` forbids `data-open` anywhere in the site's CSS, so the clock's light
is `data-state`. The seven claim fields (`capacity.*`, `worksCoordinates`, `certifications`,
`socialLinks`) carry **no defaults on purpose**; `projectFooter()` renders nothing for a
blank claim. `vitest.config.ts` compiles JSX through **oxc** — Vite 8 ignores the `esbuild`
option when both are set, and the first attempt changed nothing.
