import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { colourwaysField } from '../fields/colourways'
import { Media } from './Media'
import { Products } from './Products'
import { RawUploads } from './RawUploads'
import { IMAGE_MIME_TYPES, MODEL_MIME_TYPES } from './mediaRules'

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

  // Removed 2026-07-28. It was believed to be load-bearing; it never was. With
  // `mimeTypes` unset, checkFileRestrictions takes its `else` branch and tests
  // `file.name.toLowerCase().endsWith(ext)` against an executable blocklist — and
  // no restricted extension is a suffix of "…glb", so a GLB always passed
  // regardless. Setting the flag only disabled that blocklist for the whole
  // collection. Keeping the assertion inverted so it is not quietly re-added.
  it('does NOT disable the executable blocklist — it was never needed for GLB', () => {
    expect(uploadOf(RawUploads).allowRestrictedFileTypes).toBeUndefined()
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

  it('accepts exactly what the pickers offer, so upload and select cannot drift', () => {
    // Both lists are built from MODEL_MIME_TYPES + IMAGE_MIME_TYPES. Before
    // 2026-08-09 they were separate literals: a type could have been uploadable
    // and then invisible in every picker, with nothing to catch it.
    const types = uploadOf(Media).mimeTypes as string[]
    for (const type of [...MODEL_MIME_TYPES, ...IMAGE_MIME_TYPES]) {
      expect(types).toContain(type)
    }
  })
})

/** Walk tabs/rows/collapsibles to find a named field wherever it is nested. */
const findField = (fields: Field[], name: string): Record<string, unknown> | undefined => {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field as unknown as Record<string, unknown>
    if ('tabs' in field) {
      for (const tab of field.tabs) {
        const hit = findField(tab.fields, name)
        if (hit) return hit
      }
    }
    if ('fields' in field && Array.isArray(field.fields)) {
      const hit = findField(field.fields, name)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * Which media each picker may offer — a config-level guard, like the two above,
 * because the defect lived entirely in config.
 *
 * Until 2026-08-09 none of these fields had `filterOptions`, so the "Finished 3D
 * file" picker listed every poster alongside every model and the publish gate
 * only tests that *something* is attached — a JPEG here published a page with an
 * empty 3D stage and nothing objected. Payload enforces filterOptions
 * server-side too (validateFilterOptions in payload/dist/fields/validations.js),
 * so these are gates, not conveniences.
 */
describe('media picker filters', () => {
  const mimeIn = (field: Record<string, unknown> | undefined): string[] => {
    const where = field?.filterOptions as { mimeType?: { in?: string[] } } | undefined
    return where?.mimeType?.in ?? []
  }

  it('the finished 3D file offers models and NOT pictures', () => {
    const types = mimeIn(findField(Products.fields, 'glbAsset'))
    expect(types).toEqual([...MODEL_MIME_TYPES])
    expect(types).not.toContain('image/webp')
  })

  it('the backup picture offers pictures and NOT models', () => {
    const types = mimeIn(findField(Products.fields, 'posterFallback'))
    expect(types).toEqual([...IMAGE_MIME_TYPES])
    expect(types).not.toContain('model/gltf-binary')
  })

  it("a colour's photo offers pictures and NOT models", () => {
    const types = mimeIn(findField(colourwaysField.fields, 'posterPreview'))
    expect(types).toEqual([...IMAGE_MIME_TYPES])
  })

  it("a colour's own 3D file offers models and NOT pictures", () => {
    const types = mimeIn(findField(colourwaysField.fields, 'glbAsset'))
    expect(types).toEqual([...MODEL_MIME_TYPES])
  })

  it('keeps application/octet-stream selectable as a model', () => {
    // Browsers commonly report a hand-picked .glb that way, and checkMediaUpload
    // rejects an octet-stream whose name does not end in .glb — so anything
    // stored under it is a GLB. Dropping it would make a hand-uploaded model
    // invisible in the picker with no explanation.
    expect(MODEL_MIME_TYPES).toContain('application/octet-stream')
  })
})

/**
 * The colours array must stay saveable while empty.
 *
 * `minRows: 1` was here until 2026-08-09 and fired at the one moment the answer
 * cannot be known: a new product could not be SAVED until the owner had typed a
 * colour name and a slug, but the join field on the "3D file" tab does not even
 * render an upload button until the document has an id — so the CLO file that
 * knows the real colours could not have been uploaded yet.
 */
describe('colours array', () => {
  it('does NOT require a row (the publish gate does that instead)', () => {
    expect(colourwaysField.minRows).toBeUndefined()
  })

  // UPDATED 2026-08-11. Until then this asserted `required: true` on both
  // fields, reasoned "a colour with no name would reach the colour buttons
  // blank" — correct for its time, but task 8 needs a row that IS saveable
  // blank: the shrink robot's automated colour import (planColourImport in
  // apps/shrink/src/colourImport.ts) writes a swatch-only row — displayName
  // and slug both '' — for any colour it could not match with high confidence,
  // reusing buildImportedRow rather than inventing a name. `required: true`
  // made that write fail outright: Payload rejects the WHOLE colourways array
  // if one row fails validation, so the entire import silently failed the
  // moment any file colour matched with low confidence (verified against a
  // real local Payload+D1 instance before this changed). The risk this test
  // originally guarded against — a nameless colour reaching a live page — is
  // now closed one level up: the publish gate refuses to publish a switched-on
  // colour with no name or no slug (`noName`/`noSlug` in
  // publishGating.ts's collectPublishProblems, pinned in publishGating.test.ts),
  // exactly the same pattern this file already used for posterPreview/variantId.
  it('does NOT require a name or a slug on a row (the publish gate does that instead)', () => {
    for (const name of ['displayName', 'slug']) {
      expect(findField(colourwaysField.fields, name)?.required).not.toBe(true)
    }
  })
})
