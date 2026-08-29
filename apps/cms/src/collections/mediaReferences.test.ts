import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEDIA_REFERENCE_PATHS } from '../../../shrink/src/cms'
import { Products } from './Products'
import { RawUploads } from './RawUploads'

/**
 * Pin every field in the CMS that can point at a Media document.
 *
 * WHY. Two places decide whether a Media file is "unused" — `isMediaReferenced` in
 * apps/shrink/src/cms.ts, and scripts/find-orphan-media.mjs — and one of them issues
 * an irreversible DELETE against production media. A relationship added without
 * updating both makes a LIVE asset look unreferenced.
 *
 * ⚠️ THIS TEST WAS UNABLE TO CATCH THE CASE IT EXISTS FOR, until 2026-08-29.
 *
 * It compared BARE FIELD NAMES (`posterPreview`) against a hand-written list, while
 * both real consumers use DOTTED PATHS (`colourways.posterPreview`). So adding a new
 * relationship at an already-known NAME — say a `heroShots` array also containing a
 * `posterPreview` — produced no new bare name, the test stayed green, and both
 * consumers remained blind to it. A Media file referenced only from there would be
 * reported as an orphan and deleted.
 *
 * It also kept a THIRD copy of the list, so the failure message told you to update two
 * consumers while the test itself only checked its own copy. The root CLAUDE.md
 * describes this test wrongly in both directions as a result: it does not fail because
 * you forgot a consumer, and it does not read either consumer file.
 *
 * Now it: builds dotted paths by walking the real collection configs (not a regex over
 * source), compares them against the list `apps/shrink/src/cms.ts` actually EXPORTS,
 * and cross-checks the script's copy against that same export.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

type Field = {
  name?: string
  type?: string
  relationTo?: string
  fields?: Field[]
  tabs?: { fields?: Field[] }[]
}

/**
 * Every dotted path from a collection's root to a `relationTo: 'media'` field.
 *
 * Walks the real config rather than the source text. A regex cannot tell whether a
 * field sits inside an array, which is exactly the distinction that made the old
 * version blind — and it is the distinction the consumers' queries encode.
 */
function mediaPaths(fields: Field[] | undefined, prefix = ''): string[] {
  const found: string[] = []
  for (const field of fields ?? []) {
    // Tabs and rows carry fields without contributing a path segment of their own.
    for (const tab of field.tabs ?? []) found.push(...mediaPaths(tab.fields, prefix))

    // Narrowed via the value, not a boolean: TypeScript does not carry a
    // `typeof x === 'string'` result through an intermediate variable.
    const name = field.name
    if (typeof name !== 'string' || name.length === 0) {
      found.push(...mediaPaths(field.fields, prefix))
      continue
    }
    const path = prefix ? `${prefix}.${name}` : name
    if (field.relationTo === 'media') found.push(path)
    // An array or group contributes its name as a segment, which is what produces
    // `colourways.posterPreview` — the form both consumers query with.
    found.push(...mediaPaths(field.fields, path))
  }
  return found
}

/** The script calls main() at import, so its list is read as text rather than imported. */
async function scriptReferencePaths(): Promise<string[]> {
  const source = await readFile(join(REPO_ROOT, 'scripts', 'find-orphan-media.mjs'), 'utf8')
  const block = /const REFERENCE_PATHS = \[([^\]]*)\]/.exec(source)?.[1]
  if (!block) throw new Error('REFERENCE_PATHS not found in find-orphan-media.mjs')
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
}

describe('Media relationships are all accounted for', () => {
  /**
   * `resultGlb` on RawUploads is deliberately NOT in the Products path list: it is the
   * pointer being replaced rather than a third-party reference, and both consumers
   * handle it separately with their own query.
   */
  const HANDLED_SEPARATELY = ['resultGlb']

  it('every Media relationship on Products is one the consumers query for', async () => {
    const actual = mediaPaths(Products.fields as Field[]).sort()

    expect(
      actual,
      'A Media relationship was added to Products. Add its DOTTED path to ' +
        'MEDIA_REFERENCE_PATHS in apps/shrink/src/cms.ts AND to REFERENCE_PATHS in ' +
        'scripts/find-orphan-media.mjs — otherwise the orphan reaper treats assets in ' +
        'this field as unused and DELETES them.',
    ).toEqual([...MEDIA_REFERENCE_PATHS].sort())
  })

  it('the deleting script agrees with the Worker, path for path', async () => {
    /*
     * The two consumers must not drift. `find-orphan-media.mjs --delete` removes files;
     * `isMediaReferenced` decides whether the robot may replace one. A path in one and
     * not the other means the two disagree about what "in use" means, and the
     * destructive one is the one that would be wrong.
     */
    expect((await scriptReferencePaths()).sort()).toEqual([...MEDIA_REFERENCE_PATHS].sort())
  })

  it('RawUploads exposes only the relationship both consumers handle separately', async () => {
    expect(mediaPaths(RawUploads.fields as Field[]).sort()).toEqual([...HANDLED_SEPARATELY].sort())
  })

  it('⚠️ CONTROL: the walker produces DOTTED paths, not bare names', () => {
    /*
     * THE BUG THIS TEST HAD. If the walker ever returns `posterPreview` instead of
     * `colourways.posterPreview`, every assertion above still compares two lists and
     * still passes — while a nested relationship becomes invisible again. So assert the
     * shape, not just the equality.
     */
    const actual = mediaPaths(Products.fields as Field[])
    expect(actual.some((p) => p.includes('.'))).toBe(true)
    expect(actual).toContain('colourways.posterPreview')
  })

  it('⚠️ CONTROL: a NESTED relationship at a known name is detected', () => {
    /*
     * The exact case the old version could not see: a new array field that also contains
     * a `posterPreview`. It adds no new bare NAME, so the old test stayed green. Run
     * against a synthetic config so it needs no repository change.
     */
    const withHeroShots: Field[] = [
      { name: 'glbAsset', type: 'upload', relationTo: 'media' },
      {
        name: 'heroShots',
        type: 'array',
        fields: [{ name: 'posterPreview', type: 'upload', relationTo: 'media' }],
      },
    ]
    const actual = mediaPaths(withHeroShots)

    expect(actual).toContain('heroShots.posterPreview')
    // ...and it is NOT already covered, so the assertions above would fail on it.
    expect([...MEDIA_REFERENCE_PATHS]).not.toContain('heroShots.posterPreview')
  })

  it('⚠️ CONTROL: the walker finds something at all', () => {
    // A walker that silently returned [] would make every comparison above pass for
    // the wrong reason — the failure shape this repo keeps paying for.
    expect(mediaPaths(Products.fields as Field[]).length).toBeGreaterThanOrEqual(4)
  })
})
