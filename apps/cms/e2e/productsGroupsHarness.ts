/**
 * The real `FamilyChips` and `FamilyGroup`, every stylesheet the site's layout loads with the fonts
 * they name, and all five of /products' families on a page of their own, with the live counts of
 * 11 Oct 2026 (the 19 Teamwear garments among them).
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
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const CMS = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(CMS, '..', '..')

/**
 * Every stylesheet the site's layout loads, in its order (`app/(frontend)/layout.tsx`): the two font
 * sheets, the design system's five, then the site's own. Until the review of 11 Oct 2026 this was 3
 * of the 8 and no font loaded at all, so names wrapped at a stand-in's widths rather than Archivo's,
 * and a card's height, and where its links sit, are the font's.
 */
const STYLESHEETS = [
  'packages/ui/src/archivo.css',
  'apps/cms/node_modules/@fontsource/instrument-serif/400-italic.css',
  'packages/ui/src/tokens.css',
  'packages/ui/src/base.css',
  'packages/ui/src/notch.css',
  'packages/ui/src/footer.css',
  'packages/ui/src/footer-prompt.css',
  'apps/cms/src/app/(frontend)/site.css',
]

/** Where the harness page asks for its fonts; the spec answers each with `harnessFontFile`. */
export const HARNESS_FONTS = '**/__products-groups/fonts/*'
const fontFiles = new Map<string, string>()

/**
 * Points each font file a stylesheet names at an address the spec serves from disk. Both shapes
 * Next's build resolves: a path relative to the sheet (`./files/x.woff2` beside a fontsource sheet,
 * `../fonts/x.woff2` from packages/ui's archivo.css), and site.css's package paths
 * (`@fontsource/<name>/files/x.woff2`, `@run-apparel/ui/fonts/x.woff2`). Only the files named here are ever served.
 */
function withServedFonts(css: string, sheet: string): string {
  return css.replace(/url\("?([^")]+\.woff2?)"?\)/g, (_, ref: string) => {
    const named = ref.startsWith('.') ? join(dirname(sheet), ref) : join(CMS, 'node_modules', ref)
    if (!existsSync(named))
      throw new Error(`[products-groups-harness] no font file ${ref} (${sheet})`)
    // The real path: archivo.css names packages/ui/fonts/ and site.css the same file through the
    // workspace link in node_modules, which is one font, not two (2026-10-21).
    const file = realpathSync(named)
    const address = `/__products-groups/fonts/${basename(file)}`
    const known = fontFiles.get(address)
    if (known && known !== file)
      throw new Error(`[products-groups-harness] two fonts at ${address}`)
    fontFiles.set(address, file)
    return `url("${address}")`
  })
}

/** The file on disk for a font address the harness page asks for, or nothing. */
export function harnessFontFile(pathname: string): string | undefined {
  return fontFiles.get(pathname)
}

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
 * The complete HTML page: the chips and groups inside the same section, with the same
 * `data-site-reveal`, and the same container /products uses.
 *
 * ⚠️ THREE SCREENS OF SPACE COME FIRST, ON PURPOSE, standing in for the header and the film. A
 * browser draws an element skipped by `content-visibility: auto` anyway once it is within a margin
 * of the screen. Live, the header, film and chips put Teamwear 1,603px below a phone's screen, out
 * of that margin, so it was skipped and it spilled. Here, with nothing above the groups, Teamwear
 * started inside the margin and was drawn, and the harness hid the live case. That was measured:
 * only the 7-garment Outerwear spilled, by 120px. With the space, every group after the first
 * starts out of reach, as Teamwear does live, so the test holds every group to "never larger than
 * its own box while undrawn".
 */
export function productsGroupsHarnessHtml(): Promise<string> {
  cached ??= bundle().then((code) => {
    const css = STYLESHEETS.map((file) =>
      withServedFonts(readFileSync(join(REPO, file), 'utf8'), join(REPO, file)),
    ).join('\n')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>products groups harness</title><style>${css}</style></head><body><main><div aria-hidden="true" style="height: 300vh"></div><section class="site-section" data-site-reveal><div class="site-container" id="root"></div></section></main><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  })
  return cached
}
