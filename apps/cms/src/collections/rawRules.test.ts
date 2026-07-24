import { describe, expect, it } from 'vitest'
import { RAW_HARD_MAX_BYTES, type RawFileFacts, checkRawUpload } from './rawRules'

const facts = (o: Partial<RawFileFacts> = {}): RawFileFacts => ({
  filename: 'cycling uniform 2_Colorway 6.glb',
  mimeType: 'model/gltf-binary',
  filesize: 350 * 1024 * 1024,
  ...o,
})

describe('checkRawUpload', () => {
  it('accepts a large raw CLO export with a messy name (the whole point of the inbox)', () => {
    // Spaces/brackets and 350 MB would both be rejected by the public Media
    // rules — here they must pass, because this is the un-processed inbox.
    expect(() => checkRawUpload(facts())).not.toThrow()
  })

  it('accepts a .glb uploaded as a generic octet-stream', () => {
    expect(() =>
      checkRawUpload(facts({ filename: 'raw.glb', mimeType: 'application/octet-stream' })),
    ).not.toThrow()
  })

  it('rejects .zprj CLO source files with source-file guidance', () => {
    expect(() => checkRawUpload(facts({ filename: 'velocity.zprj', mimeType: '' }))).toThrow(/\.zprj/)
  })

  it('rejects a non-GLB upload', () => {
    expect(() =>
      checkRawUpload(facts({ filename: 'poster.png', mimeType: 'image/png' })),
    ).toThrow(/must be GLB/)
  })

  it('rejects an octet-stream that is not a .glb', () => {
    expect(() =>
      checkRawUpload(facts({ filename: 'mystery.bin', mimeType: 'application/octet-stream' })),
    ).toThrow(/must be GLB/)
  })

  it('rejects a file over the absolute raw ceiling', () => {
    expect(() => checkRawUpload(facts({ filesize: RAW_HARD_MAX_BYTES + 1 }))).toThrow(
      /over the 600 MB raw ceiling/,
    )
  })

  it('does NOT apply the 40 MB Media cap (a 100 MB raw is fine here)', () => {
    expect(() => checkRawUpload(facts({ filesize: 100 * 1024 * 1024 }))).not.toThrow()
  })
})
