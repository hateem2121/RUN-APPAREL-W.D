import { describe, expect, it } from 'vitest'
import { GLB_HARD_MAX_BYTES, type MediaFileFacts, checkMediaUpload } from './mediaRules'

const facts = (o: Partial<MediaFileFacts> = {}): MediaFileFacts => ({
  filename: 'n001-navy.glb',
  mimeType: 'model/gltf-binary',
  filesize: 3 * 1024 * 1024,
  ...o,
})

describe('checkMediaUpload', () => {
  it('accepts a normal pipeline-processed GLB with no warning', () => {
    expect(checkMediaUpload(facts())).toEqual({ sizeWarning: false })
  })

  it('accepts a URL-safe poster', () => {
    expect(
      checkMediaUpload(facts({ filename: 'n001-navy-poster.webp', mimeType: 'image/webp' })),
    ).toEqual({ sizeWarning: false })
  })

  it('rejects filenames with spaces (the live media-outage vector)', () => {
    expect(() => checkMediaUpload(facts({ filename: 'WOMEN JACK_Colorway A.glb' }))).toThrow(
      /spaces or unsafe characters/,
    )
  })

  it('rejects other URL-unsafe characters', () => {
    expect(() => checkMediaUpload(facts({ filename: 'n001(navy).glb' }))).toThrow(/unsafe characters/)
  })

  it('rejects a GLB over the hard ceiling (raw CLO export)', () => {
    expect(() => checkMediaUpload(facts({ filesize: GLB_HARD_MAX_BYTES + 1 }))).toThrow(
      /over the 40 MB limit/,
    )
  })

  it('rejects .zprj CLO source files with the source-file guidance', () => {
    // A non-octet-stream mime reaches the .zprj-specific branch (octet-stream is
    // caught one step earlier as an unsupported type — either way it is rejected).
    expect(() => checkMediaUpload(facts({ filename: 'velocity.zprj', mimeType: '' }))).toThrow(
      /\.zprj/,
    )
  })

  it('rejects a non-GLB octet-stream', () => {
    expect(() =>
      checkMediaUpload(facts({ filename: 'mystery.bin', mimeType: 'application/octet-stream' })),
    ).toThrow(/Unsupported file type/)
  })

  it('flags (but allows) a GLB over the soft mobile guideline', () => {
    expect(checkMediaUpload(facts({ filesize: 9 * 1024 * 1024 }))).toEqual({ sizeWarning: true })
  })

  it('does not apply the GLB ceiling to large images', () => {
    // An image over the GLB ceiling is not blocked (only warned) — the ceiling is model-specific.
    expect(
      checkMediaUpload(facts({
        filename: 'huge-poster.webp',
        mimeType: 'image/webp',
        filesize: GLB_HARD_MAX_BYTES + 1,
      })),
    ).toEqual({ sizeWarning: true })
  })
})
