import { describe, expect, it, vi } from 'vitest'
import { ARCHIVE_MAX_BYTES, ARCHIVE_PREFIX, archiveRawExport } from './archiveRaw'

/**
 * The auto-archive (fix plan Rank 12, audit CI-01): after a successful run the raw
 * export is copied into the archive bucket, idempotently, and NOTHING here can fail the
 * job. Each outcome is asserted with what went over the wire — a put that did not happen
 * is as important as one that did.
 */

function stream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })
}

function buckets(over: {
  source?: { size: number; httpMetadata?: unknown } | null
  existing?: { size: number } | null
  putThrows?: string
}) {
  const body = stream()
  const cancel = vi.spyOn(body, 'cancel')
  const put = vi.fn(
    async (_key: string, _body: ReadableStream | null, _options?: Record<string, unknown>) => {
      if (over.putThrows) throw new Error(over.putThrows)
      return {}
    },
  )
  const ingest = {
    get: vi.fn(async () =>
      over.source === null
        ? null
        : { size: over.source?.size ?? 3, body, httpMetadata: over.source?.httpMetadata },
    ),
  }
  const archive = { head: vi.fn(async () => over.existing ?? null), put }
  return { ingest, archive, put, cancel, body }
}

describe('archiveRawExport', () => {
  it('streams the export into the archive under the robot prefix, with metadata that explains it', async () => {
    const b = buckets({
      source: { size: 31_653_964, httpMetadata: { contentType: 'model/gltf-binary' } },
    })
    const result = await archiveRawExport(b, 'uploads/X-MILO PRO SKIN-SUIT.glb', {
      rawUploadId: 42,
      now: new Date('2026-09-03T12:00:00Z'),
    })
    expect(result.outcome).toBe('archived')
    expect(result.key).toBe(`${ARCHIVE_PREFIX}/uploads/X-MILO PRO SKIN-SUIT.glb`)
    expect(b.put).toHaveBeenCalledTimes(1)
    const [key, body, options] = b.put.mock.calls[0] as [
      string,
      ReadableStream,
      Record<string, unknown>,
    ]
    expect(key).toBe(result.key)
    expect(body).toBe(b.body) // the stream itself, never a buffered copy
    expect(options).toMatchObject({
      httpMetadata: { contentType: 'model/gltf-binary' },
      customMetadata: {
        source: 'ingest',
        rawUploadId: '42',
        archivedAt: '2026-09-03T12:00:00.000Z',
      },
    })
    expect(result.note).toMatch(/30\.2 MB/)
    expect(result.note).toMatch(/survives the 14-day/)
  })

  it('leaves an existing copy of the same size alone — a re-run costs no storage', async () => {
    const b = buckets({ source: { size: 100 }, existing: { size: 100 } })
    const result = await archiveRawExport(b, 'a.glb', { rawUploadId: 1 })
    expect(result.outcome).toBe('already')
    expect(b.put).not.toHaveBeenCalled()
    expect(b.cancel).toHaveBeenCalled()
  })

  it('re-copies when the archived copy is a different size (a truncated earlier copy)', async () => {
    const b = buckets({ source: { size: 100 }, existing: { size: 60 } })
    const result = await archiveRawExport(b, 'a.glb', { rawUploadId: 1 })
    expect(result.outcome).toBe('archived')
    expect(b.put).toHaveBeenCalledTimes(1)
  })

  it('says the export has expired when the upload store no longer has it', async () => {
    const b = buckets({ source: null })
    const result = await archiveRawExport(b, 'a.glb', { rawUploadId: 1 })
    expect(result.outcome).toBe('missing')
    expect(result.note).toMatch(/kept for 14 days/)
    expect(b.put).not.toHaveBeenCalled()
  })

  it('refuses an export over the single-put ceiling instead of attempting it', async () => {
    const b = buckets({ source: { size: ARCHIVE_MAX_BYTES + 1 } })
    const result = await archiveRawExport(b, 'huge.glb', { rawUploadId: 1 })
    expect(result.outcome).toBe('too-large')
    expect(b.put).not.toHaveBeenCalled()
    expect(b.cancel).toHaveBeenCalled()
  })

  it('reports a failed copy in a sentence and never throws — the shrink already succeeded', async () => {
    const b = buckets({ source: { size: 100 }, putThrows: 'R2 put: internal error' })
    const result = await archiveRawExport(b, 'a.glb', { rawUploadId: 1 })
    expect(result.outcome).toBe('failed')
    expect(result.note).toMatch(/R2 put: internal error/)
    expect(result.note).toMatch(/model is unaffected/)
  })

  it('writes no httpMetadata when the source carries none, and shrugs off a cancel() that rejects', async () => {
    const b = buckets({ source: { size: 10 }, existing: { size: 10 } })
    b.cancel.mockRejectedValue(new Error('already closed'))
    await expect(archiveRawExport(b, 'a.glb', { rawUploadId: 1 })).resolves.toMatchObject({
      outcome: 'already',
    })
    const c = buckets({ source: { size: ARCHIVE_MAX_BYTES + 1 } })
    c.cancel.mockRejectedValue(new Error('already closed'))
    await expect(archiveRawExport(c, 'a.glb', { rawUploadId: 1 })).resolves.toMatchObject({
      outcome: 'too-large',
    })
    const d = buckets({ source: { size: 5 } })
    await archiveRawExport(d, 'a.glb', { rawUploadId: 1 })
    const options = d.put.mock.calls[0]?.[2]
    expect(options).toBeDefined()
    expect(options).not.toHaveProperty('httpMetadata')
  })

  it('the ceiling sits under R2’s 4.995 GiB single-put limit', () => {
    expect(ARCHIVE_MAX_BYTES).toBeLessThan(4.995 * 1024 ** 3)
    expect(ARCHIVE_MAX_BYTES).toBeGreaterThan(1.5 * 1024 ** 3) // the biggest export seen: 1.31 GB
  })
})
