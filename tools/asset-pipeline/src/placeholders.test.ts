import { describe, expect, it } from 'vitest'
import {
  PLACEHOLDER_ARTWORK,
  PLACEHOLDER_COLOURWAYS,
  PLACEHOLDER_DECAL_PLACEMENTS,
  PLACEHOLDER_NORMAL_PX,
  PLACEHOLDER_STITCH_TRIANGLES,
  PLACEHOLDER_WEAVE_PX,
  buildPlaceholderTee,
  decalCorners,
} from './placeholders'

/**
 * The seeded garment must be able to SHOW damage (fix plan Rank 13, audits HR-4 and
 * HE-05). Until 2026-09-03 its six prints were stacked on the chest half a millimetre
 * apart — destroying any of the five behind the front one changed no render — and its
 * fabric carried no picture at all, so half of every shipped preset acted on nothing.
 */

function centre(positions: number[]): [number, number, number] {
  const n = positions.length / 3
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i < positions.length; i += 3) {
    x += positions[i] as number
    y += positions[i + 1] as number
    z += positions[i + 2] as number
  }
  return [x / n, y / n, z / n]
}

describe('the prints are spread over the garment (HR-4)', () => {
  it('every print has a placement, and no two sit within 10 cm of each other', () => {
    const names = ['chest-graphic', ...PLACEHOLDER_ARTWORK.map((a) => a.name)]
    const centres = names.map((name) => {
      const placement = PLACEHOLDER_DECAL_PLACEMENTS[name]
      expect(placement, name).toBeDefined()
      return centre(decalCorners(placement!).positions)
    })
    for (let i = 0; i < centres.length; i++) {
      for (let j = i + 1; j < centres.length; j++) {
        const [a, b] = [centres[i]!, centres[j]!]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        expect(d, `${names[i]} vs ${names[j]}`).toBeGreaterThan(0.1)
      }
    }
  })

  it('uses the front, the back and both sleeves, so a camera on any side sees a print', () => {
    const faces = new Set(Object.values(PLACEHOLDER_DECAL_PLACEMENTS).map((p) => p.face))
    expect([...faces].sort()).toEqual(['back', 'front', 'left', 'right'])
  })

  it('winds every quad to face outward: its normal points the way its face does', () => {
    for (const [name, placement] of Object.entries(PLACEHOLDER_DECAL_PLACEMENTS)) {
      const { positions, normal } = decalCorners(placement)
      // Geometric normal from the first triangle (0,1,2), counter-clockwise.
      const p = (i: number) => positions.slice(i * 3, i * 3 + 3) as [number, number, number]
      const [a, b, c] = [p(0), p(1), p(2)]
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const cross = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ]
      const dot = cross[0]! * normal[0] + cross[1]! * normal[1] + cross[2]! * normal[2]
      expect(dot, name).toBeGreaterThan(0)
    }
  })
})

describe('the fabric gives every shipped flag something to act on (HE-05)', () => {
  it('carries a weave past the 4096 cap, a normal map past the 2048 data cap, and a Topstitch_* mesh', async () => {
    expect(PLACEHOLDER_WEAVE_PX).toBeGreaterThan(4096)
    expect(PLACEHOLDER_NORMAL_PX).toBeGreaterThan(2048)
    const tee = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const root = tee.getRoot()
    const body = root.listMaterials().find((m) => m.getName().endsWith('-BODY'))
    expect(body?.getBaseColorTexture()?.getName()).toBe('fabric-weave')
    expect(body?.getNormalTexture()?.getName()).toBe('fabric-normal')
    const stitch = root.listMeshes().find((m) => /^topstitch/i.test(m.getName()))
    expect(stitch).toBeDefined()
    const triangles = stitch!
      .listPrimitives()
      .reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? 0) / 3, 0)
    expect(triangles).toBe(PLACEHOLDER_STITCH_TRIANGLES)
  }, 60_000)
})
