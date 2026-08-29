import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SPEC_MAX_BYTES,
  SPEC_NOISE,
  checkGltfSpec,
  checkGltfSpecFileGuarded,
  describeSpecIssues,
} from './gltf-spec'
import { createIO } from './io'
import { optimizeGlb } from './optimize'
import { PLACEHOLDER_COLOURWAYS, buildPlaceholderTee } from './placeholders'
import { readJsonChunk } from './repair-dead-textures'

/** The optimised placeholder — i.e. a file this pipeline actually produced. */
async function ourOutput(): Promise<{ bytes: Uint8Array; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'spec-'))
  const io = await createIO()
  const raw = join(dir, 'raw.glb')
  const out = join(dir, 'out.glb')
  await io.write(raw, await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!))
  await optimizeGlb(raw, out, { texture: 'webp', opaque: true })
  const { readFile } = await import('node:fs/promises')
  return { bytes: new Uint8Array(await readFile(out)), file: out }
}

describe('checkGltfSpec', () => {
  it('passes a file this pipeline produced', async () => {
    /*
     * ⚠️ THIS FAILED THE FIRST TIME IT RAN, AND THAT IS WHY THE CHECK EXISTS.
     * Every processed garment carried IMAGE_NON_ENABLED_MIME_TYPE +
     * TEXTURE_INVALID_IMAGE_MIME_TYPE in pairs — p001 44 errors, arisan 38,
     * n001 42, geovent 45 — because the WebP pass wrote `image/webp` without
     * declaring EXT_texture_webp. <model-viewer> sniffs the bytes and renders
     * anyway, so every gate in this repo was green while the output was invalid
     * glTF that a stricter runtime is entitled to refuse.
     */
    const { bytes } = await ourOutput()
    const spec = await checkGltfSpec(bytes)
    expect(describeSpecIssues(spec.errors)).toEqual([])
    expect(spec.counts.errors).toBe(0)
  }, 60_000)

  it('⚠️ NEGATIVE CONTROL — it CATCHES undeclared WebP', async () => {
    // Strip EXT_texture_webp back out and the errors must return, or the test
    // above is passing for some reason other than the fix.
    const { bytes } = await ourOutput()
    const chunk = readJsonChunk(bytes)
    expect(chunk).not.toBeNull()
    const json = chunk!.json as { extensionsUsed?: string[] }
    expect(json.extensionsUsed).toContain('EXT_texture_webp')
    json.extensionsUsed = (json.extensionsUsed ?? []).filter((e) => e !== 'EXT_texture_webp')

    // Same length or shorter, so the BIN chunk cannot move.
    const encoded = new TextEncoder().encode(JSON.stringify(json))
    const broken = bytes.slice()
    broken.set(encoded, chunk!.start)
    broken.fill(0x20, chunk!.start + encoded.byteLength, chunk!.start + chunk!.length)

    const spec = await checkGltfSpec(broken)
    expect(spec.counts.errors).toBeGreaterThan(0)
    expect(spec.errors.map((e) => e.code)).toContain('IMAGE_NON_ENABLED_MIME_TYPE')
  }, 60_000)

  it('drops the codes every CLO export trips in bulk', async () => {
    // Leaving these in gives 8 warnings and 32 hints in the first 40 messages of
    // ARISAN alone and buries everything else. None indicates a defect.
    expect(SPEC_NOISE).toContain('BUFFER_VIEW_TARGET_MISSING')
    expect(SPEC_NOISE).toContain('MESH_PRIMITIVE_GENERATED_TANGENT_SPACE')
    expect(SPEC_NOISE).toContain('IMAGE_NPOT_DIMENSIONS')
    const { bytes } = await ourOutput()
    const spec = await checkGltfSpec(bytes)
    for (const code of SPEC_NOISE) {
      expect([...spec.errors, ...spec.warnings].map((m) => m.code)).not.toContain(code)
    }
  }, 60_000)
})

describe('checkGltfSpecFileGuarded', () => {
  it('SKIPS a file too large to hold in memory, and says why', async () => {
    // Memory runs ~3.4x the file size — measured 573 MB in, 1,955 MB resident. A
    // skip must never be mistakable for a pass, so it carries its own reason.
    const result = await checkGltfSpecFileGuarded('/does/not/matter.glb', SPEC_MAX_BYTES + 1)
    expect(result.spec).toBeNull()
    expect(result.skipped).toMatch(/over the \d+ MB spec-check ceiling/)
  })

  it('reports an unreadable file rather than throwing mid-run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spec-bad-'))
    const file = join(dir, 'not-a-glb.glb')
    await writeFile(file, 'this is not a GLB at all')
    const result = await checkGltfSpecFileGuarded(file, 24)
    // Either the validator reports errors, or it refuses the file — both are
    // findings. What must NOT happen is a 28-garment run aborting on file 3.
    expect(result.spec === null || result.spec.counts.errors > 0).toBe(true)
  })
})
