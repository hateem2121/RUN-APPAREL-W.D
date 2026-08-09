import { GLB_HARD_MAX_BYTES as SHARED_GLB_HARD_MAX_BYTES } from '@run-apparel/shared'
import { APIError } from 'payload'
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
    expect(() => checkMediaUpload(facts({ filename: 'n001(navy).glb' }))).toThrow(
      /unsafe characters/,
    )
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
      checkMediaUpload(
        facts({
          filename: 'huge-poster.webp',
          mimeType: 'image/webp',
          filesize: GLB_HARD_MAX_BYTES + 1,
        }),
      ),
    ).toEqual({ sizeWarning: true })
  })

  // Payload's generic handler turns any error without a non-500 status into
  // "Something went wrong." — useless to the operator, and exactly the trap that
  // was closed in RawUploads.beforeChange but left open here until 2026-07-28.
  it('throws APIError(400) so the message reaches the operator verbatim', () => {
    for (const bad of [
      facts({ filename: 'mystery.bin', mimeType: 'application/octet-stream' }),
      facts({ filename: 'velocity.zprj', mimeType: '' }),
      facts({ filename: 'WOMEN JACK_Colorway A.glb' }),
      facts({ filesize: GLB_HARD_MAX_BYTES + 1 }),
    ]) {
      try {
        checkMediaUpload(bad)
        throw new Error(`expected a rejection for ${bad.filename}`)
      } catch (error) {
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError).status).toBe(400)
        expect((error as APIError).isPublic).toBe(true)
      }
    }
  })

  // The shrink Worker pre-flights the same number before it POSTs, so the two
  // must be one constant. If this import ever stops resolving to the shared
  // package, the Worker and the CMS can drift apart silently.
  it('uses the shared ceiling, not a local copy', () => {
    expect(GLB_HARD_MAX_BYTES).toBe(SHARED_GLB_HARD_MAX_BYTES)
  })
})
