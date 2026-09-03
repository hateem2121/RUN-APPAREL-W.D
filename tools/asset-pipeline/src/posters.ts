/**
 * Posters from the finished garment, rendered the way the viewer will show it (fix plan
 * Rank 6; audits LIVE-02, LIVE-03).
 *
 * The five live skinsuit posters were captured by a paid browser job deleted on
 * 2026-08-17: they carry the retired caption "[ N001 / WINE ]", the black one is a flat
 * placeholder silhouette, and nothing ever checked a poster against the product. This is
 * the local, free replacement: every colourway of a GLB, from the front, under the
 * PRODUCTION lighting the render harness shares with the review server, on a transparent
 * background, with no burned-in caption — the page prints the code itself.
 *
 * Output: `<out>/<product>-<colour>-poster.webp` (+ `.png`), exactly the names
 * `scripts/og-cards.mjs` reads and the CMS expects for `colourways.posterPreview`.
 */
import { mkdir, readFile, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { readGlb } from './io'
import { renderViews } from './render'

/** The viewer's poster frame: 4:5, the size `e2e/serve.mjs` and the CMS already assume. */
export const POSTER_WIDTH = 1200
export const POSTER_HEIGHT = 1500

/** The viewer's own front camera, with its default field of view — see apps/viewer's product defaults. */
export const POSTER_ORBIT = '0deg 80deg 105%'
export const POSTER_FIELD_OF_VIEW = '30deg'

export interface PosterJob {
  /** The product slug — the first half of every file name. */
  product: string
  /** KHR_materials_variants name → colourway slug. Absent: every variant, slugified. */
  colours?: Record<string, string>
  outDir: string
  orbit?: string
  fieldOfView?: string
  /** Lower for a quick look; the default is the shipped 1200×1500. */
  width?: number
  height?: number
}

export interface PosterResult {
  variant: string
  colour: string
  webp: string
  png: string
  bytes: number
}

/** A colourway slug from a CLO variant name: `Colorway 2` → `colorway-2`. */
export function slugForVariant(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default'
  )
}

/** Parse `--colours "Colorway 2=wine,Colorway 3=black"` into a map. */
export function parseColourMap(spec: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const pair of spec.split(',')) {
    const eq = pair.indexOf('=')
    if (eq === -1) throw new Error(`--colours entry "${pair}" needs the form <variant>=<slug>`)
    const variant = pair.slice(0, eq).trim()
    const slug = pair.slice(eq + 1).trim()
    if (!variant || !slug)
      throw new Error(`--colours entry "${pair}" needs both a variant and a slug`)
    map[variant] = slug
  }
  return map
}

/** Render one poster per colourway. Fails loudly on a variant the file does not have. */
export async function renderPosters(glbFile: string, job: PosterJob): Promise<PosterResult[]> {
  const { document } = await readGlb(glbFile)
  const variants = (
    document
      .getRoot()
      .listExtensionsUsed()
      .find((e) => e.extensionName === 'KHR_materials_variants')
      ? document
          .getRoot()
          .listExtensionsUsed()
          .flatMap((e) => e.listProperties())
          .filter((p) => p.propertyType === 'Variant')
          .map((p) => p.getName())
      : []
  ).filter((name, index, all) => all.indexOf(name) === index)

  const wanted: [string | null, string][] = job.colours
    ? Object.entries(job.colours).map(([variant, slug]) => [variant, slug])
    : variants.length
      ? variants.map((v) => [v, slugForVariant(v)])
      : [[null, 'default']]
  for (const [variant] of wanted) {
    if (variant !== null && !variants.includes(variant)) {
      throw new Error(
        `This file has no colourway "${variant}". It offers: ${variants.join(', ') || '(none)'}`,
      )
    }
  }

  await mkdir(job.outDir, { recursive: true })
  const width = job.width ?? POSTER_WIDTH
  const height = job.height ?? POSTER_HEIGHT
  const results: PosterResult[] = []
  for (const [variant, colour] of wanted) {
    const scratch = join(job.outDir, `.render-${job.product}-${colour}`)
    await rm(scratch, { recursive: true, force: true })
    await renderViews(glbFile, scratch, {
      views: [
        {
          name: 'poster',
          orbit: job.orbit ?? POSTER_ORBIT,
          fieldOfView: job.fieldOfView ?? POSTER_FIELD_OF_VIEW,
        },
      ],
      variant,
      lighting: 'production',
      background: 'transparent',
      width,
      height,
    })
    const rendered = await readFile(join(scratch, 'poster.png'))
    const png = join(job.outDir, `${job.product}-${colour}-poster.png`)
    const webp = join(job.outDir, `${job.product}-${colour}-poster.webp`)
    await sharp(rendered).png().toFile(png)
    const encoded = await sharp(rendered).webp({ quality: 90, alphaQuality: 100 }).toBuffer()
    await sharp(encoded).toFile(webp)
    await rm(scratch, { recursive: true, force: true }).catch(() => unlink(scratch).catch(() => {}))
    results.push({ variant: variant ?? '(default)', colour, webp, png, bytes: encoded.byteLength })
  }
  return results
}
