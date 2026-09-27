# CLAUDE.md — apps/cms

🔴 = stops here, do not proceed. 🟡 = read before acting. 🟢 = context.

Split out of the repo-root `CLAUDE.md` on 2026-08-15 by `/doctor`, for the same
reason the viewer traps moved on 2026-08-10 and the pipeline's on 2026-08-12: the
root file is loaded into *every* session in this repo, and these are only ever
needed by a session actually touching the CMS. They load automatically the moment
you touch `apps/cms/`. Paths below are repo-root-relative, as they were before the
move.

The cross-cutting CMS material moved from the root `CLAUDE.md` into path rules on
2026-09-26, because each one spans more than this directory: the D1 pragma trap
(`.claude/rules/d1-migrations.md`), `fileColours` being deliberately outside
`GATED_FIELDS` (`.claude/rules/products-and-colours.md`), and **"Before you delete
anything in the CMS"** (`.claude/rules/cms-media-deletion.md`), which also governs
`apps/shrink/src/cms.ts` and `scripts/find-orphan-media.mjs`. Read the root file first.

## Traps

- **🟡 Running the CMS dev server DIRTIES the working tree and then `pnpm lint` fails.**
  Found 2026-08-09. `next dev` rewrites two committed generated files —
  `apps/cms/src/app/(payload)/admin/importMap.js` (Payload regenerates it, in its
  own formatting, not Biome's) and `apps/cms/next-env.d.ts` (`./.next/types/…` →
  `./.next/dev/types/…`). The import map's *content* is unchanged — same 27 keys,
  verified — but the quote style and line wrapping are not, so `biome check .`
  fails on formatting alone and the diff looks alarming. **Stop the dev server
  first, then `git checkout --` both files**; restoring while it is still running
  just loses the race, which is how this cost a cycle. Do not "fix" it by
  reformatting the generated file into the repo. *(Moved from the root 2026-09-26.)*
- **🟢 `admin.hidden` on a collection gates the admin ROUTES, not just the sidebar
  entry.** Measured 2026-08-09 on payload 3.86.0: with `hidden: true`,
  `/admin/collections/raw-uploads` renders the "Nothing found" page; with the
  admin-only function it renders the normal list — same URL, same user. The REST
  API is unaffected (`/api/raw-uploads` → 200), so a robot is never at risk, but
  `docs/RUNBOOK.md` → "Re-processing a garment" links straight to
  `/admin/collections/raw-uploads/<id>` and calls it *"the only way to start a
  re-run"*. Hiding that collection removes the documented recovery path while
  reading as a tidy-up. See the comment in `RawUploads.ts`. *(Moved from the root
  2026-09-26.)*
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

- **`apps/viewer/src/styles/tokens.test.ts` scans JSX as well as CSS**, so a literal
  `style={{ padding: '20px' }}` in a `.tsx` fails the build — three had walked past a
  CSS-only scan. A `var()` or computed value is fine.

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

## Where the rest of the CMS notes live

Moved on 2026-09-26, word for word, into path rules that load with the files they govern:
the website's look, footer and browser tests in `.claude/rules/cms-site.md`; writing
products, media and colours from a script in `.claude/rules/cms-scripted-writes.md`; and
changing a migration or reading production D1 in `.claude/rules/d1-migrations.md`.
