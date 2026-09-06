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
