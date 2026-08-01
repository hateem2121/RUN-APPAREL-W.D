import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pin every field in the CMS that can point at a Media document.
 *
 * WHY. Two places delete or report on "unused" media — `isMediaReferenced` in
 * apps/shrink/src/cms.ts, and scripts/find-orphan-media.mjs — and both work from
 * a hand-written list of relationship paths. A Media relationship added to a
 * collection without updating those lists makes a LIVE asset look unreferenced,
 * and one of those two paths issues an irreversible DELETE against production
 * media.
 *
 * A test that greps those consumers for strings would only prove the strings
 * exist. This asserts against the collection definitions themselves, which is
 * where a new relationship would actually appear, so adding one fails here first
 * and names what has to be updated.
 */

const SRC = join(import.meta.dirname, '..')

/** Field names declared with `relationTo: 'media'`, across every collection and field file. */
async function findMediaRelationshipFields(): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue
      const source = await readFile(path, 'utf8')
      // Walk back from each `relationTo: 'media'` to the nearest preceding
      // `name: '...'`, which is the field it belongs to.
      for (const match of source.matchAll(/relationTo:\s*'media'/g)) {
        const before = source.slice(0, match.index)
        const names = [...before.matchAll(/name:\s*'([^']+)'/g)]
        const name = names.at(-1)?.[1]
        if (name) found.push(name)
      }
    }
  }
  await walk(SRC)
  return [...new Set(found)].sort()
}

describe('Media relationships are all accounted for', () => {
  /**
   * Every known field, and where each is handled.
   *
   *   glbAsset, posterFallback          — Products, top level
   *   colourways.posterPreview/glbAsset — Products, inside the colourways array
   *   resultGlb                         — RawUploads, handled separately by both
   *                                       consumers (it is the pointer being
   *                                       replaced, not a third-party reference)
   */
  const KNOWN = ['glbAsset', 'posterFallback', 'posterPreview', 'resultGlb'].sort()

  it('has not grown a Media relationship nobody knows about', async () => {
    const actual = await findMediaRelationshipFields()
    expect(
      actual,
      'A new Media relationship was added to a collection. Update BOTH ' +
        'MEDIA_REFERENCE_PATHS in apps/shrink/src/cms.ts AND REFERENCE_PATHS in ' +
        'scripts/find-orphan-media.mjs, then add it here — otherwise the orphan ' +
        'reaper will treat assets in this field as unused and delete them.',
    ).toEqual(KNOWN)
  })

  it('finds the relationships it is supposed to find', async () => {
    // Guards the scanner itself: a regex that silently matched nothing would
    // make the test above pass for the wrong reason.
    const actual = await findMediaRelationshipFields()
    expect(actual.length).toBeGreaterThanOrEqual(4)
  })
})
