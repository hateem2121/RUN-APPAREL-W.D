import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHeadersFile, inlineScriptHashes } from './csp.mjs'

/**
 * Generate `dist/_headers` after `vite build`. Honoured by both Cloudflare Pages
 * and Workers Static Assets.
 *
 * The policy and the header rules live in csp.mjs so they can be unit-tested —
 * this file is only the I/O around them. Everything is computed from the BUILT
 * html and the build-time env, so what ships can never drift from what is hashed.
 */
const dir = dirname(fileURLToPath(import.meta.url))
const dist = join(dir, '..', 'dist')
const indexPath = join(dist, 'index.html')

if (!existsSync(indexPath)) {
  console.error('gen-headers: dist/index.html not found — run `vite build` first.')
  process.exit(1)
}

const html = readFileSync(indexPath, 'utf8')

const contents = buildHeadersFile({
  html,
  apiBaseUrl: process.env.VITE_API_BASE_URL,
  sentryDsn: process.env.VITE_SENTRY_DSN,
})

writeFileSync(join(dist, '_headers'), contents)

const connect = contents.match(/connect-src [^;]*/)?.[0] ?? ''
console.log(
  `gen-headers: wrote dist/_headers (${inlineScriptHashes(html).length} inline-script hash(es))\n` +
    `  ${connect}`,
)
