import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { ASSET_COPYRIGHT, stripRootExtras, type StripRootExtrasResult } from './strip-root-extras'

/**
 * The fixture carries the shape the live files actually carry — root `MetaData`
 * AND material-level `depthBias` — because the whole risk of this transform is
 * taking the second while removing the first.
 */
function garment(): Document {
  const doc = new Document()
  doc.getRoot().setExtras({
    MetaData: {
      PhysicalPropertyList: [
        { PhysicalPropertyName: 'Polyester_Taffeta_0', 'Stretch-Warp': 605146 },
      ],
      MeshList: [{ MeshName: 'Body_Front_5' }],
      SeamLinePairList: [[1, 2]],
      globalMap: { FilePath: 'D:/New File/THE AGGRESSOR JERSEY -/base.png' },
    },
  })
  const material = doc.createMaterial('Material_Graphic__overlay')
  material.setExtras({ depthBias: { factor: -8, units: -8, detector: 'overlay-depth@1' } })
  const prim = doc.createPrimitive()
  prim.setExtras({ uvRemap: { originalTexCoord: 1 } })
  doc.createMesh('Cloth_mesh').addPrimitive(prim)
  return doc
}

const run = (doc: Document, options = {}) => {
  let result: StripRootExtrasResult | null = null
  stripRootExtras({
    ...options,
    onResult: (r) => {
      result = r
    },
  })(doc)
  return result as unknown as StripRootExtrasResult
}

describe('stripRootExtras', () => {
  it('removes the whole root extras block', () => {
    const doc = garment()
    const result = run(doc)
    expect(doc.getRoot().getExtras()).toEqual({})
    expect(result.removedKeys).toEqual(['MetaData'])
    expect(result.removedBytes).toBeGreaterThan(100)
  })

  it('takes the fabric physics, the seams and the Windows paths with it', () => {
    // Asserted on the SERIALISED root rather than by key, because the point is that
    // none of these strings can still be read out of the shipped file.
    const doc = garment()
    run(doc)
    const serialised = JSON.stringify(doc.getRoot().getExtras())
    for (const leak of ['Stretch-Warp', 'SeamLinePairList', 'D:/New File', 'Polyester_Taffeta_0']) {
      expect(serialised, `${leak} survived the strip`).not.toContain(leak)
    }
  })

  /**
   * ⚠️ THE ASSERTION THIS FILE EXISTS FOR.
   *
   * The audit's first prescription was `prune({ keepExtras: false })`, which does
   * not remove root extras at all AND starts disposing properties that survive on
   * theirs. `extras.depthBias` is read in the browser via three.js
   * `material.userData`; losing it returns the decal z-fighting with no error
   * anywhere. A recursive strip would do the same damage for a different reason.
   */
  it('leaves MATERIAL and PRIMITIVE extras completely alone', () => {
    const doc = garment()
    run(doc)
    const material = doc.getRoot().listMaterials()[0]
    expect(material?.getExtras(), 'depthBias was taken — decals will z-fight again').toEqual({
      depthBias: { factor: -8, units: -8, detector: 'overlay-depth@1' },
    })
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    expect(prim?.getExtras()).toEqual({ uvRemap: { originalTexCoord: 1 } })
  })

  it('stamps ownership, which was absent on all eleven live files', () => {
    const doc = garment()
    const result = run(doc)
    expect(doc.getRoot().getAsset().copyright).toBe(ASSET_COPYRIGHT)
    expect(result.copyrightSet).toBe(true)
  })

  it('never overwrites a copyright somebody set deliberately', () => {
    const doc = garment()
    doc.getRoot().getAsset().copyright = '© Someone Else'
    const result = run(doc)
    expect(doc.getRoot().getAsset().copyright).toBe('© Someone Else')
    expect(result.copyrightSet).toBe(false)
  })

  it('can be told not to touch the copyright at all', () => {
    const doc = garment()
    const result = run(doc, { copyright: null })
    expect(doc.getRoot().getAsset().copyright).toBeUndefined()
    expect(result.copyrightSet).toBe(false)
  })

  it('is a no-op on an already-clean document, and says so', () => {
    // Every garment processed before CLO started writing MetaData takes this path,
    // and so does every garment after this ships. Reporting a saving here would be
    // a lie the run summary then repeats.
    const doc = new Document()
    doc.createMaterial('plain')
    const result = run(doc)
    expect(result.removedKeys).toEqual([])
    expect(result.removedBytes).toBe(0)
    expect(doc.getRoot().getExtras()).toEqual({})
  })

  it('reports the real serialised size, not the size of an empty object', () => {
    // NEGATIVE CONTROL on the measurement itself: `JSON.stringify({})` is 2 bytes,
    // so a naive implementation reports 2 for a document with nothing to remove and
    // the run summary shows a saving that never happened.
    const doc = new Document()
    expect(run(doc).removedBytes).toBe(0)
    const withExtras = new Document()
    withExtras.getRoot().setExtras({ MetaData: { a: 'x'.repeat(500) } })
    expect(run(withExtras).removedBytes).toBeGreaterThan(500)
  })
})
