/**
 * The real `GarmentGrid`, the real stylesheets and the 19 live Teamwear garments, on a page of
 * their own (polish S7).
 *
 * ⚠️ WHY A HARNESS AND NOT THE TEAMWEAR PAGE. The sport buttons appear only when a page holds
 * garments of two sports or more, and this suite's database holds one garment, a Sportswear one
 * (CI's seed), so `/custom-teamwear-manufacturer` has nothing to filter here. Seeding nineteen
 * garments, each with the model and posters the publish gate demands, would change what every
 * other spec measures. So the spec draws the SAME component with the SAME CSS and the live list
 * (`fixtures/teamwear.ts`), bundled with the Vite that Vitest already ships, as `globeHarness.ts`
 * does for the globe. Nothing here is served by the app: the spec fulfils `/__sport-harness` from
 * memory.
 *
 * React draws the page, but the filter itself is HTML and CSS: the spec also loads the drawn page
 * with scripting off and presses the buttons there.
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
    define: {
      'process.env.NODE_ENV': '"production"',
      // Next writes NEXT_PUBLIC_ values into its own build; this one is not Next's. Undefined, the
      // card's links fall back to the site's own origin (`lib/seo.ts`), as production's do.
      'process.env.NEXT_PUBLIC_SITE_ORIGIN': 'undefined',
    },
    build: {
      write: false,
      minify: true,
      lib: {
        entry: join(CMS, 'e2e', 'fixtures', 'sportFilterHarness.entry.tsx'),
        formats: ['iife'],
        name: 'SportFilterHarness',
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    'output' in r ? r.output : [],
  )
  const chunk = outputs.find((o) => o.type === 'chunk')
  if (chunk?.type !== 'chunk') throw new Error('[sport-harness] the bundle has no chunk')
  return chunk.code
}

/** The complete HTML page. Built once per worker. */
export function sportFilterHarnessHtml(): Promise<string> {
  cached ??= bundle().then((code) => {
    const css = [
      'packages/ui/src/tokens.css',
      'packages/ui/src/base.css',
      'apps/cms/src/app/(frontend)/site.css',
    ]
      .map((file) => readFileSync(join(REPO, file), 'utf8'))
      .join('\n')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>sport filter harness</title><style>${css}</style></head><body><main class="site-container"><div id="root"></div></main><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  })
  return cached
}
