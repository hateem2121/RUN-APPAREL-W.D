import path from 'node:path'
import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { seed } from './seed'

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }))

const assetsDir = '/synthetic-seed-assets'

function freshPayload() {
  let id = 0
  return {
    find: vi.fn(async () => ({ docs: [] })),
    updateGlobal: vi.fn(),
    create: vi.fn(async () => ({ id: ++id })),
    logger: { info: vi.fn() },
  }
}

beforeEach(() => {
  vi.mocked(existsSync).mockReset().mockReturnValue(true)
})

describe('fresh seed uploads', () => {
  it('attaches processed files for separate-colour mode and keeps merged variant IDs', async () => {
    const payload = freshPayload()
    await seed(payload as unknown as Payload, assetsDir)
    const calls = payload.create.mock.calls as unknown as [
      { collection: string; filePath?: string; data: Record<string, unknown> },
    ][]
    const uploads = calls.map(([call]) => call).filter((call) => call.collection === 'media')
    const models = uploads.filter((call) => call.filePath?.endsWith('.glb'))
    const slugs = ['wine', 'blush', 'butter', 'lime', 'black']
    expect(models.map((call) => call.filePath)).toEqual([
      path.join(assetsDir, 'n001.glb'),
      ...slugs.map((slug) => path.join(assetsDir, 'seed-colours', `n001-${slug}.glb`)),
    ])
    const product = calls.find(([call]) => call.collection === 'products')![0].data
    expect(product.variantMode).toBe('single-glb-variants')
    expect(product.fileColours).toEqual(slugs.map((slug) => `N001-${slug.toUpperCase()}`))
    const defaultPosterIndex = calls.findIndex(
      ([call]) => call.filePath === path.join(assetsDir, 'placeholders', 'n001-wine-poster.webp'),
    )
    expect(defaultPosterIndex).toBeGreaterThan(-1)
    expect(product.posterFallback).toBe(defaultPosterIndex + 1)
    const colours = product.colourways as { slug: string; glbAsset: number }[]
    expect(colours.map((colour) => colour.slug)).toEqual(slugs)
    // Each separate-colour relationship must point at its OWN uploaded file.
    for (const [i, colour] of colours.entries()) {
      const createIndex = calls.findIndex(([call]) => call === models[i + 1])
      expect(colour.glbAsset).toBe(createIndex + 1)
    }
  })

  it('stops before writing when an upload-ready colour file is missing', async () => {
    vi.mocked(existsSync).mockImplementation(
      (file) => String(file) !== path.join(assetsDir, 'seed-colours', 'n001-black.glb'),
    )
    const payload = freshPayload()
    await expect(seed(payload as unknown as Payload, assetsDir)).rejects.toThrow('pnpm seed:assets')
    expect(payload.updateGlobal).not.toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
  })
})
