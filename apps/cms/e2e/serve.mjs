/**
 * Serve the built CMS for the e2e suite.
 *
 * ⚠️ THE PORT COMES FROM playwright.config.ts VIA `webServer.env`, NOT FROM THE SHELL.
 * apps/viewer learned this the expensive way: `serve.mjs` there read `process.env.PORT`,
 * a developer had `PORT=5002` exported for an unrelated project, the server bound 5002
 * while Playwright polled 4173, and the suite died as
 * `Timed out waiting 120000ms from config.webServer` with nothing naming the cause. Two
 * dead-end runs went by before anyone ran `echo $PORT`.
 *
 * So the port is asserted, not defaulted: if the config did not set it, fail loudly here
 * rather than bind something arbitrary and time out two minutes later.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.CMS_E2E_PORT
if (!PORT) {
  throw new Error(
    '[cms-e2e] CMS_E2E_PORT is unset. It is supplied by playwright.config.ts through ' +
      'webServer.env so the environment cannot move the server — see the note above.',
  )
}

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const child = spawn('npx', ['--yes', 'pnpm@10.33.0', '--filter', '@run-apparel/cms', 'start'], {
  cwd: REPO,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT,
    NODE_ENV: 'production',
    // Wrangler's local bindings, so Payload has a D1 to talk to. Without it every read
    // throws and the content helpers fall back to defaults — which the suite tolerates
    // by design (see the empty-gallery case), but the richer path would go untested.
    PAYLOAD_LOCAL_D1: '1',
    /*
     * ⚠️ PRODUCTION'S URL SHAPE, NOT PRODUCTION'S HOST — AND NOT THE LOCAL CONVENTION.
     *
     * `.dev.vars` sets this EMPTY on purpose: locally the files live in the emulated R2
     * bucket, so pointing at media.wear-run.help would 404 everything you just seeded,
     * and Payload serving its own media is what makes `next dev` usable for an admin who
     * is logged in.
     *
     * That convention cannot be right for THIS server, because this one serves the
     * PUBLIC site and `Media.read` is `isAuthenticated`. With the var empty, Payload
     * emits `/api/media/file/<name>` — measured anonymous on this exact build, **403
     * application/json** — so every poster the suite saw was a URL no visitor can fetch,
     * and `projectPublic.ts` now correctly refuses to hand one to a page (audit FA-O-10).
     * The result was ten browser tests failing against a fix, because the fixture was
     * the failing case dressed as the passing one.
     *
     * ⚠️ SAME ORIGIN, AND PRODUCTION'S REAL HOST CANNOT BE USED HERE — MEASURED, NOT
     * ASSUMED. Pointing this at `https://media.wear-run.help` was tried and it fails by
     * design: that host answers `Cross-Origin-Resource-Policy: same-site` (read off the
     * live wire 2026-09-07 alongside a 200 and `cf-cache-status: HIT`). `wear-run.help`
     * and `media.wear-run.help` share a registrable domain, so PRODUCTION is same-site
     * and every poster loads; `localhost` is not, so Firefox refuses the image and logs
     *   "blocked due to its Cross-Origin-Resource-Policy header".
     * That is a correct production configuration, not a defect — and it means no local
     * server can ever embed those files.
     *
     * Same origin is then the only option left: the page CSP is
     * `img-src 'self' data: https://media.wear-run.help`, so any OTHER absolute host
     * would be blocked by the policy instead. `navbar.spec.ts` carries the one exemption
     * this forces, with the same account.
     *
     * The seeded files are not served from this origin either, so each poster 404s and
     * the DESIGNED placeholder renders. What the fixture buys is the URL SHAPE — absolute,
     * off Payload's authenticated API route — which is what `projectPublic.ts` now
     * requires and what production emits.
     */
    PUBLIC_MEDIA_BASE_URL: `http://localhost:${PORT}`,
    /*
     * ⚠️ A THROWAWAY SECRET WHEN THE ENVIRONMENT HAS NONE. Payload refuses to
     * initialise without one ("missing secret key"), and CI's e2e job passes none —
     * only the deploy job holds the real PAYLOAD_SECRET. Measured 2026-09-06 by running
     * this suite with .env moved aside, exactly as a cold checkout runs it: the three
     * public pages still rendered (their content falls back to defaults) but `/admin`
     * and `/api/*` answered 500 and four tests failed. Nothing behind this server is
     * worth protecting — there is no database — so a per-process value is correct here,
     * and a literal is deliberately avoided so the secrets scanner has nothing to match.
     */
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? `cms-e2e-${process.pid}`,
  },
})

child.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
