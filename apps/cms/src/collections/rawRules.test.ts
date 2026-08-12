import { APIError } from 'payload'
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
    expect(() => checkRawUpload(facts({ filename: 'velocity.zprj', mimeType: '' }))).toThrow(
      /\.zprj/,
    )
  })

  it('rejects a non-GLB upload', () => {
    expect(() => checkRawUpload(facts({ filename: 'poster.png', mimeType: 'image/png' }))).toThrow(
      /must be GLB/,
    )
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

  // Regression: the >50 MB client-upload path. storage-r2 hands Payload an EMPTY
  // buffer above 50 MB, so any mimeType-based check upstream of us sees nothing
  // (or a browser-reported ''). Our gate must stand on the extension alone.
  // See the long comment on RawUploads.upload — do not reintroduce `mimeTypes`.
  it('accepts a >50 MB .glb whose mimeType is empty (browser reported nothing)', () => {
    expect(() =>
      checkRawUpload(facts({ filename: 'raw.glb', mimeType: '', filesize: 350 * 1024 * 1024 })),
    ).not.toThrow()
  })

  it('still rejects a non-GLB when the mimeType is empty', () => {
    expect(() => checkRawUpload(facts({ filename: 'notes.txt', mimeType: '' }))).toThrow(
      /must be GLB/,
    )
  })

  // Every rejection must carry an explicit non-500 status. Payload's generic
  // handler replaces anything else with "Something went wrong." — the dead end
  // that cost a full diagnostic round-trip on the guard's first live test.
  it('throws APIError(400) so the message reaches the operator verbatim', () => {
    for (const bad of [
      facts({ filename: 'velocity.zprj', mimeType: '' }),
      facts({ filename: 'poster.png', mimeType: 'image/png' }),
      facts({ filename: 'jacket?.glb' }),
      facts({ filesize: RAW_HARD_MAX_BYTES + 1 }),
    ]) {
      try {
        checkRawUpload(bad)
        throw new Error(`expected a rejection for ${bad.filename}`)
      } catch (error) {
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError).status).toBe(400)
        expect((error as APIError).isPublic).toBe(true)
      }
    }
  })

  // Regression: the R2 object key is built from the raw file.name by
  // `sanitizeFilename` (path + control chars only), but the document filename is
  // built later by `sanitize-filename`, which ALSO strips  / ? < > \ : * |  "
  // and trailing dots/spaces. A name containing one is stored under two
  // different keys, so the beforeChange HEAD guard rejects a good upload with
  // "your file did not finish uploading". Catch it here, where we can say why.
  it.each(['jacket?.glb', 'jack*et.glb', 'a<b.glb', 'a>b.glb', 'a:b.glb', 'a|b.glb', 'a"b.glb'])(
    'rejects %s, whose two sanitisers disagree',
    (filename) => {
      expect(() => checkRawUpload(facts({ filename }))).toThrow(/cannot store reliably/)
    },
  )

  it('rejects a trailing dot or space, which sanitize-filename silently trims', () => {
    expect(() => checkRawUpload(facts({ filename: 'cycling all colours.glb ' }))).toThrow(
      /cannot store reliably/,
    )
  })

  it('still allows the messy-but-safe CLO names this inbox exists for', () => {
    for (const filename of [
      'cycling uniform 2_Colorway 6.glb',
      'WOMEN JACK (all colours).glb',
      'n001 — navy.glb',
    ]) {
      expect(() => checkRawUpload(facts({ filename }))).not.toThrow()
    }
  })

  // Observed live on media.id = 7 ("Maroon", mimeType image/png): macOS reports
  // the type from the file's UTI, so a file with no extension validates fine and
  // Payload then stores the name without one. Flag it, never block it.
  it('reports a missing extension without rejecting the upload', () => {
    expect(checkRawUpload(facts({ filename: 'cycling all colours' }))).toEqual({
      missingExtension: true,
    })
    expect(checkRawUpload(facts({ filename: 'raw.glb' }))).toEqual({ missingExtension: false })
  })
})
