import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkModelTextures } from '../../../packages/shared/src/modelTextureSafety'
import { createIO } from './io'
import { readGltfJson } from './describe'
import { PLACEHOLDER_COLOURWAYS, generatePlaceholders } from './placeholders'

let dir: string
let generated: Awaited<ReturnType<typeof generatePlaceholders>>

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'run-seed-assets-'))
  generated = await generatePlaceholders(join(dir, 'raw'), join(dir, 'seed-colours'))
}, 120_000)

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('fresh CMS seed assets', () => {
  it('processes every separate-colour upload while retaining raw calibration fixtures', async () => {
    expect(generated.uploadGlbFiles).toHaveLength(PLACEHOLDER_COLOURWAYS.length)
    const io = await createIO()
    for (const [i, colour] of PLACEHOLDER_COLOURWAYS.entries()) {
      const rawFile = join(dir, 'raw', `n001-${colour.slug}.glb`)
      const uploadFile = generated.uploadGlbFiles[i]!
      expect(uploadFile).toBe(join(dir, 'seed-colours', `n001-${colour.slug}.glb`))

      // Negative control: these very same raw inputs caused fresh CI seeding to
      // fail on a 4608px image. A passing upload test must still catch that defect.
      const rawCheck = checkModelTextures(await readFile(rawFile))
      expect(rawCheck.ok, colour.slug).toBe(false)
      expect(rawCheck.images.some((image) => image.width === 4608)).toBe(true)
      const uploadCheck = checkModelTextures(await readFile(uploadFile))
      expect(uploadCheck.problems, colour.slug).toEqual([])
      expect(uploadCheck.ok, colour.slug).toBe(true)
      expect(uploadCheck.images.length).toBeGreaterThan(1)

      const json = (await readGltfJson(uploadFile)) as { extensionsRequired?: string[] }
      expect(json.extensionsRequired).toContain('EXT_meshopt_compression')
      const raw = (await io.read(rawFile)).getRoot()
      const upload = (await io.read(uploadFile)).getRoot()
      expect(upload.listMeshes().map((mesh) => mesh.listPrimitives().length)).toEqual(
        raw.listMeshes().map((mesh) => mesh.listPrimitives().length),
      )
      expect(upload.listMaterials().map((material) => material.getBaseColorFactor())).toEqual(
        raw.listMaterials().map((material) => material.getBaseColorFactor()),
      )
      expect(upload.listTextures().map((texture) => texture.getName())).toEqual(
        raw.listTextures().map((texture) => texture.getName()),
      )
      expect(upload.listTextures().every((texture) => texture.getMimeType() === 'image/webp')).toBe(
        true,
      )
    }
  }, 60_000)

  it('refuses to overwrite raw fixtures with processed output', async () => {
    await expect(generatePlaceholders(join(dir, 'raw'), join(dir, 'raw', '.'))).rejects.toThrow(
      'distinct output directory',
    )
  })
})
