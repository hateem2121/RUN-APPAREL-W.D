/**
 * The real `ProductGroup`, the real stylesheets and three of /products' families on a page of
 * their own, the 19 live Teamwear garments among them (11 Oct 2026).
 *
 * ⚠️ WHY A HARNESS AND NOT /products. The defect this exists for needs a group after the first
 * that is longer than its 1,200px stand-in, and this suite's database holds one garment, a
 * Sportswear one (CI's seed). Seeding enough garments to fill a group would change what every
 * other spec measures (`sportFilterHarness.ts` says the same of the Teamwear page). So the spec draws
 * the SAME component with the SAME CSS, bundled with the Vite that Vitest already ships. Nothing
 * here is served by the app: the spec fulfils `/__products-groups` from memory.
 *
 * `next/link` becomes a plain `<a>` here (`fixtures/nextLinkShim.tsx`). Next's Link renders the same
 * element, and outside a Next app there is no router for it.
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
    resolve: { alias: { 'next/link': join(CMS, 'e2e', 'fixtures', 'nextLinkShim.tsx') } },
    define: {
      'process.env.NODE_ENV': '"production"',
      // As in sportFilterHarness.ts: undefined, the cards' links fall back to the site's own origin.
      'process.env.NEXT_PUBLIC_SITE_ORIGIN': 'undefined',
    },
    build: {
      write: false,
      minify: true,
      lib: {
        entry: join(CMS, 'e2e', 'fixtures', 'productsGroupsHarness.entry.tsx'),
        formats: ['iife'],
        name: 'ProductsGroupsHarness',
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    'output' in r ? r.output : [],
  )
  const chunk = outputs.find((o) => o.type === 'chunk')
  if (chunk?.type !== 'chunk') throw new Error('[products-groups-harness] the bundle has no chunk')
  return chunk.code
}

/**
 * The complete HTML page, the groups inside the same section and container /products uses.
 *
 * ⚠️ THREE SCREENS OF SPACE COME FIRST, ON PURPOSE. A browser draws an element skipped by
 * `content-visibility: auto` anyway once it is within a margin of the screen. Live, the header,
 * film and chips put Teamwear 1,603px below a phone's screen, out of that margin, so it was skipped
 * and it spilled. Here, with nothing above the groups, Teamwear started inside the margin and was
 * drawn, and the harness hid the live case. That was measured: only the 7-garment Outerwear spilled,
 * by 120px. With the space, every group after the first starts out of reach, as Teamwear does live,
 * so the test holds every group to "never larger than its own box while undrawn".
 */
export function productsGroupsHarnessHtml(): Promise<string> {
  cached ??= bundle().then((code) => {
    const css = [
      'packages/ui/src/tokens.css',
      'packages/ui/src/base.css',
      'apps/cms/src/app/(frontend)/site.css',
    ]
      .map((file) => readFileSync(join(REPO, file), 'utf8'))
      .join('\n')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>products groups harness</title><style>${css}</style></head><body><main><div aria-hidden="true" style="height: 300vh"></div><section class="site-section"><div class="site-container" id="root"></div></section></main><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  })
  return cached
}
