/**
 * The real `ContactGlobe`, the real stylesheets and the real cobe, on a page of their own.
 *
 * ⚠️ WHY A HARNESS AND NOT THE CONTACT PAGE. The globe only mounts when the site settings hold
 * `worksCoordinates`, a claim field with NO default on purpose (`projectFooter()`), and this
 * suite's database has no site settings at all — locally there is no D1, and CI's holds none —
 * so on `/contact` the canvas can never appear here. Faking the coordinates in production code
 * would defeat the rule; skipping every canvas test would leave the whole animated half of the
 * feature unwatched. So the spec loads the SAME component and the SAME CSS with coordinates
 * passed in, bundled here with the Vite that Vitest already ships. The `/contact` page itself
 * is still tested for what it does without coordinates.
 *
 * Nothing here is served by the app: the spec fulfils `/__globe-harness` from memory.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const CMS = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(CMS, '..', '..')

let cached: Promise<string> | null = null

async function bundle(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    root: CMS,
    oxc: { jsx: { runtime: 'automatic', development: false } },
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: true,
      lib: {
        entry: join(CMS, 'e2e', 'fixtures', 'globeHarness.entry.tsx'),
        formats: ['iife'],
        name: 'GlobeHarness',
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    'output' in r ? r.output : [],
  )
  const chunk = outputs.find((o) => o.type === 'chunk')
  if (chunk?.type !== 'chunk') throw new Error('[globe-harness] the bundle has no chunk')
  return chunk.code
}

/** The complete HTML page. Built once per worker; the bundle is a few hundred KB of React + cobe. */
export function globeHarnessHtml(): Promise<string> {
  cached ??= bundle().then((code) => {
    const css = [
      'packages/ui/src/tokens.css',
      'packages/ui/src/base.css',
      'apps/cms/src/app/(frontend)/site.css',
    ]
      .map((file) => readFileSync(join(REPO, file), 'utf8'))
      .join('\n')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>globe harness</title><style>${css}</style></head><body><main class="site-container"><div id="root"></div></main><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  })
  return cached
}
