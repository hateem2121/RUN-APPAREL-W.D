import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The seed's colourways match the ones `pnpm seed:assets` actually generates.
 *
 * ⚠️ THEY DID NOT, AND IT BROKE THE DOCUMENTED FIRST RUN. `seed.ts` listed navy / black /
 * crimson with variant ids `N001-NAVY` and `N001-CRIMSON`; the pipeline has generated
 * wine / blush / butter / lime / black since commit bc723f7 ("the seeded garment now has
 * five colourways, because production does"), which changed one side and left the other.
 *
 * The result was that `pnpm seed:cms` — step three of `docs/ONBOARDING.md` — DIED on a
 * clean checkout looking for `n001-navy-poster.webp`, a file nothing produces. Two of the
 * three variant ids also matched no variant inside the merged GLB, so even a hand-placed
 * poster would have bound nothing.
 *
 * ⚠️ AND NOTHING NOTICED FOR WEEKS, WHICH IS THE REAL FINDING. A developer seeds once and
 * never again, so a working machine stays working. CI never ran the seed at all — and the
 * CMS browser suite that would have exercised it sits behind the viewer suite in the same
 * job, so every run where the viewer failed meant the CMS step never executed. Both
 * blind spots have to be open at once for this to hide, and both were.
 *
 * ⚠️ THIS READS THE PIPELINE'S SOURCE AS TEXT RATHER THAN IMPORTING IT. `apps/cms` does
 * not depend on `@run-apparel/asset-pipeline`, and biome's `noRestrictedImports` bans the
 * cross-package import that would make it a real dependency for a test. `families.test.ts`
 * parses `Products.ts` the same way and for the same reason: a duplicated constant is
 * only safe when something fails the moment the copies disagree, and the parsing is the
 * price of that.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const PIPELINE = join(REPO_ROOT, 'tools', 'asset-pipeline', 'src', 'placeholders.ts')
const SEED = join(import.meta.dirname, 'seed.ts')
const ROOT_PACKAGE = join(REPO_ROOT, 'package.json')

/** `{ slug, variantId, body }` for every entry in an exported array of object literals. */
function parseColourways(source: string, marker: string) {
  const from = source.indexOf(marker)
  if (from === -1) return []
  const body = source.slice(from)
  const end = body.indexOf('\n]')
  const block = end === -1 ? body : body.slice(0, end)
  return [...block.matchAll(/\{[^{}]*\}/g)].map((entry) => ({
    slug: /slug:\s*'([^']+)'/.exec(entry[0])?.[1] ?? '',
    variantId: /variantId:\s*'([^']+)'/.exec(entry[0])?.[1] ?? '',
    swatch:
      (/body:\s*'([^']+)'/.exec(entry[0]) ?? /hexSwatch:\s*'([^']+)'/.exec(entry[0]))?.[1] ?? '',
  }))
}

const pipeline = parseColourways(
  readFileSync(PIPELINE, 'utf8'),
  'export const PLACEHOLDER_COLOURWAYS',
)
const seed = parseColourways(readFileSync(SEED, 'utf8'), 'const COLOURWAYS: SeedColourway[]')

describe('the parser itself', () => {
  /*
   * Both comparisons below pass if this returns nothing for both files — the shape that
   * would make every assertion vacuous. A regex over source text is exactly the
   * instrument that fails silently, so it is checked before it is trusted.
   */
  it('found colourways on both sides', () => {
    expect(pipeline.length, 'parsed nothing from placeholders.ts').toBeGreaterThan(1)
    expect(seed.length, 'parsed nothing from seed.ts').toBeGreaterThan(1)
    for (const entry of [...pipeline, ...seed]) {
      expect(entry.slug).not.toBe('')
      expect(entry.variantId).not.toBe('')
    }
  })
})

describe('the seed matches the assets it will look for', () => {
  it('the same slugs, in the same order', () => {
    expect(
      seed.map((c) => c.slug),
      'seed.ts and placeholders.ts disagree. `pnpm seed:cms` reads ' +
        '`n001-<slug>-poster.webp` from the pipeline output, so a slug here that the ' +
        'pipeline does not generate makes the documented first run die on ENOENT.',
    ).toEqual(pipeline.map((c) => c.slug))
  })

  /*
   * ORDER, not just membership. The array order IS the colourway order and the first is
   * the DEFAULT — the one `/n001/<slug>` resolves to with no colourway, and the one
   * apps/viewer/e2e fixtures as `/n001/wine`.
   */
  it('the same variant ids, which is what binds a colour to the merged GLB', () => {
    expect(
      seed.map((c) => c.variantId),
      'a variantId here that is not in the merged GLB binds nothing, and the colourway ' +
        'renders the default body — silently.',
    ).toEqual(pipeline.map((c) => c.variantId))
  })

  it('the swatch shows the cloth colour the pipeline paints', () => {
    expect(seed.map((c) => c.swatch.toLowerCase())).toEqual(
      pipeline.map((c) => c.swatch.toLowerCase()),
    )
  })
})

describe('and the merge command builds exactly those', () => {
  /*
   * The third copy. `seed:assets` in the root package.json names each placeholder GLB and
   * its variant id on the command line, and `pipeline validate --expect` checks the
   * result — so a slug missing THERE fails the build rather than the seed. Asserted here
   * so all three are pinned together rather than two of three.
   */
  it('names every colourway the seed expects', () => {
    const script = (
      JSON.parse(readFileSync(ROOT_PACKAGE, 'utf8')) as {
        scripts: Record<string, string>
      }
    ).scripts['seed:assets']
    expect(script, 'no seed:assets script to check').toBeTruthy()
    for (const { slug, variantId } of seed) {
      expect(script, `seed:assets never builds n001-${slug}`).toContain(`n001-${slug}.glb`)
      expect(script, `seed:assets never binds ${variantId}`).toContain(variantId)
    }
  })
})
