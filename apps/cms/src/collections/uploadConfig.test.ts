import { describe, expect, it } from 'vitest'
import { Media } from './Media'
import { RawUploads } from './RawUploads'

/**
 * Config-level regression guards for the upload defect fixed on 2026-07-27.
 *
 * These assert the *collection configuration*, not a pure function, because the
 * bug lived entirely in config: setting `upload.mimeTypes` on a clientUploads
 * collection silently breaks every upload over 50 MB. The unit tests for
 * checkRawUpload/checkMediaUpload cannot catch that — only these can.
 */

const uploadOf = (c: typeof RawUploads) =>
  (typeof c.upload === 'object' ? c.upload : {}) as Record<string, unknown>

describe('RawUploads upload config', () => {
  it('does NOT set mimeTypes (this is what broke >50 MB uploads)', () => {
    // storage-r2 returns an empty body >50 MB with clientUploads, so Payload's
    // checkFileRestrictions sniffs 0 bytes, falls back to the extension map
    // (which has no `glb`), guesses text/plain and rejects the file. An empty
    // allow-list makes validateMimeType short-circuit to true instead.
    expect(uploadOf(RawUploads).mimeTypes).toBeUndefined()
  })

  it('sets allowRestrictedFileTypes so checkFileRestrictions returns early', () => {
    expect(uploadOf(RawUploads).allowRestrictedFileTypes).toBe(true)
  })
})

describe('Media upload config', () => {
  it('lists .glb as an extension so the macOS file picker does not grey it out', () => {
    // @payloadcms/ui joins mimeTypes verbatim into the input's `accept`
    // attribute, and macOS has no UTI for model/gltf-binary.
    expect(uploadOf(Media).mimeTypes).toContain('.glb')
  })

  it('still restricts to the intended media types', () => {
    const types = uploadOf(Media).mimeTypes as string[]
    expect(types).toContain('model/gltf-binary')
    expect(types).toContain('image/webp')
    expect(types).not.toContain('application/pdf')
  })
})
