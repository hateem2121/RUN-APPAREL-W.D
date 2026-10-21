import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Both apps draw Archivo from packages/ui's cut copy (width 100-125%, `packages/ui/src/archivo.css`),
 * made from the installed @fontsource-variable/archivo by `packages/ui/scripts/cut-archivo.py`
 * (2026-10-21). What would have to break for these to fail:
 * - the font package moves (a Dependabot bump) and the cut is not made again, so the site keeps an
 *   older Archivo than the one installed;
 * - a cut file is replaced by anything but the recorded cut;
 * - a page goes back to the package's full-width files, paying the 27.6 KB again;
 * - a style asks for a width under 100%, which the cut font cannot draw: the browser would clamp it
 *   to 100% and the text would set wider than designed, silently.
 */

const REPO = join(__dirname, '..', '..', '..')
const FONTS = join(REPO, 'packages', 'ui', 'fonts')
const PACKAGE = join(REPO, 'apps', 'cms', 'node_modules', '@fontsource-variable', 'archivo')
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8')
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

type Manifest = {
  version: string
  wdth: [number, number]
  files: Record<string, { source: string; cut: string }>
}
const manifest = JSON.parse(readFileSync(join(FONTS, 'archivo.json'), 'utf8')) as Manifest

/** Every `font-stretch` value set on an element (not an @font-face range) under 100%. */
function narrowWidths(css: string): string[] {
  const outsideFaces = css.replace(/@font-face\s*\{[^}]*\}/g, '')
  return [...outsideFaces.matchAll(/font-stretch\s*:\s*(\d+(?:\.\d+)?)%/g)]
    .filter((match) => Number(match[1]) < 100)
    .map((match) => match[0])
}

describe('Archivo is the cut copy, made from the installed font package', () => {
  it('was cut from the installed version, file for file, and the committed files are that cut', () => {
    const installed = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as {
      version: string
    }
    const remake = 'run `python3 packages/ui/scripts/cut-archivo.py` (needs fonttools and brotli)'
    expect(installed.version, `the font package moved: ${remake}`).toBe(manifest.version)
    expect(Object.keys(manifest.files).sort()).toEqual(['latin', 'latin-ext', 'vietnamese'])
    for (const [subset, { source, cut }] of Object.entries(manifest.files)) {
      const from = join(PACKAGE, 'files', `archivo-${subset}-wdth-normal.woff2`)
      expect(sha256(from), `${subset} changed in the package: ${remake}`).toBe(source)
      expect(sha256(join(FONTS, `archivo-${subset}-wdth-100-125.woff2`)), subset).toBe(cut)
    }
    expect(manifest.wdth).toEqual([100, 125])
    expect(readFileSync(join(FONTS, 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE')
  })

  it('is what both apps load, and nothing loads the full-width files', () => {
    const sheet = read('packages', 'ui', 'src', 'archivo.css')
    expect(sheet.match(/font-stretch: 100% 125%;/g)).toHaveLength(3)
    for (const subset of Object.keys(manifest.files))
      expect(sheet).toContain(`../fonts/archivo-${subset}-wdth-100-125.woff2`)
    const loaders = [
      ['apps', 'cms', 'src', 'app', '(frontend)', 'layout.tsx'],
      ['apps', 'cms', 'src', 'app', 'not-found.tsx'],
      ['apps', 'viewer', 'src', 'main.tsx'],
    ]
    for (const file of loaders) {
      expect(read(...file), file.join('/')).toContain("import '@run-apparel/ui/archivo.css'")
      expect(read(...file), file.join('/')).not.toContain('@fontsource-variable/archivo')
    }
    const site = read('apps', 'cms', 'src', 'app', '(frontend)', 'site.css')
    expect(site).not.toContain('@fontsource-variable/archivo/files')
    expect(
      site.match(/@run-apparel\/ui\/fonts\/archivo-[a-z-]+-wdth-100-125\.woff2/g),
    ).toHaveLength(3)
  })

  it('no style asks for a width the cut font cannot draw (under 100%)', () => {
    const sheets = [
      ...readdirSync(join(REPO, 'packages', 'ui', 'src'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => read('packages', 'ui', 'src', f)),
      ...readdirSync(join(REPO, 'apps', 'viewer', 'src', 'styles'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => read('apps', 'viewer', 'src', 'styles', f)),
      read('apps', 'cms', 'src', 'app', '(frontend)', 'site.css'),
    ]
    expect(sheets.flatMap(narrowWidths)).toEqual([])
  })

  // NEGATIVE CONTROL: the scan sees a planted narrow width, and ignores a face's own range.
  it('the width scan sees a planted narrow width', () => {
    expect(narrowWidths('.x { font-stretch: 87.5%; } .y { font-stretch: 122%; }')).toEqual([
      'font-stretch: 87.5%',
    ])
    expect(narrowWidths('@font-face { font-stretch: 62% 125%; }')).toEqual([])
  })
})
