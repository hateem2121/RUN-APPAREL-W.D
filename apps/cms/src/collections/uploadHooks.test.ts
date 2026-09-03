import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The upload gates' WIRING, and the two hooks nobody had looked at.
 *
 * ⚠️ THE SHAPE OF THIS GAP. `rawRules.ts` and `mediaRules.ts` are at 94-100% coverage
 * and every test calls them directly. The hooks that CALL them were never invoked by
 * anything: `Media.ts` sat at 14.28% lines and **0% functions** — not one function in
 * that file had ever executed in a test — and `RawUploads.ts` at 4.76%.
 *
 * Two of the four hooks here were not even named in the audit, and they are arguably
 * the most consequential:
 *   - `Media.beforeDelete` is the hole that left a live product with an empty 3D stage
 *   - `RawUploads.beforeChange` is what stops a document being created for bytes that
 *     never arrived, after a 382 MB export did exactly that
 *
 * What is tested is the glue, not the rules: the `if (data?.filename)` guard that lets
 * the robot's own writes through, the warn-vs-throw split, and the APIError rethrows.
 */

const head = vi.fn()
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { R2_INGEST: { head } } })),
}))

const { Media } = await import('./Media')
const { RawUploads } = await import('./RawUploads')
const { getCloudflareContext } = await import('@opennextjs/cloudflare')

/**
 * ⚠️ beforeValidate here is SYNCHRONOUS and beforeChange/beforeDelete are not. That
 * distinction is invisible from a test written against the rules module, and it is
 * real: a sync hook THROWS where an async one REJECTS, so `.rejects.toThrow()` silently
 * fails to assert anything against the sync pair.
 */
type SyncHook = (args: Record<string, unknown>) => unknown
type AsyncHook = (args: Record<string, unknown>) => Promise<unknown>
const mediaValidate = Media.hooks?.beforeValidate?.[0] as SyncHook
const mediaDelete = Media.hooks?.beforeDelete?.[0] as AsyncHook
const rawValidate = RawUploads.hooks?.beforeValidate?.[0] as SyncHook
const rawChange = RawUploads.hooks?.beforeChange?.[0] as AsyncHook
const rawAfterChange = RawUploads.hooks?.afterChange?.[0] as AsyncHook

type ProductDoc = { productName: string }
type FindArgs = Record<string, unknown>

/**
 * Typed on purpose. A loosely-typed `Record<string, unknown>` helper compiles at
 * runtime and then fails `tsc` on every `.mock.calls` read — and `apps/cms` typecheck
 * is a separate CI gate from the suite, so a test file can be green and still break the
 * build.
 */
const logger = () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() })
const reqWith = (over: { find?: ReturnType<typeof makeFind> } = {}) => ({
  payload: { logger: logger(), find: over.find ?? makeFind([]) },
})
const makeFind = (docs: ProductDoc[]) => vi.fn(async (_args: FindArgs) => ({ docs }))

beforeEach(() => {
  head.mockReset()
  vi.mocked(getCloudflareContext).mockResolvedValue({
    env: { R2_INGEST: { head } },
  } as never)
})

describe('every hook under test is actually wired to the collection', () => {
  it('exists, so a Payload shape change cannot silently empty this file', () => {
    expect(typeof mediaValidate).toBe('function')
    expect(typeof mediaDelete).toBe('function')
    expect(typeof rawValidate).toBe('function')
    expect(typeof rawChange).toBe('function')
  })
})

describe('Media.beforeValidate', () => {
  it('warns about a heavy file but never blocks it', () => {
    /*
     * The size guideline is advice, not a limit — the hard 40 MB ceiling is enforced
     * elsewhere. A gate that refused here would block legitimate large garments.
     */
    const req = reqWith()
    const data = { filename: 'big.glb', mimeType: 'model/gltf-binary', filesize: 30 * 1024 * 1024 }

    expect(mediaValidate({ data, req })).toBeDefined()
    expect(req.payload.logger.warn).toHaveBeenCalledOnce()
    expect(String(req.payload.logger.warn.mock.calls[0]?.[0] ?? '')).toContain('big.glb')
  })

  it('stays quiet about a small file', () => {
    const req = reqWith()
    mediaValidate({
      data: { filename: 'ok.webp', mimeType: 'image/webp', filesize: 1024 },
      req,
    })
    expect(req.payload.logger.warn).not.toHaveBeenCalled()
  })

  it('throws on a filename that caused a live outage', () => {
    // Spaces in a media filename broke serving once already. NOTE these hooks are
    // SYNCHRONOUS — they throw rather than reject, which is exactly the distinction a
    // test written against the rules module instead of the hook cannot notice.
    const req = reqWith()
    expect(() =>
      mediaValidate({
        data: { filename: 'my garment.glb', mimeType: 'model/gltf-binary', filesize: 10 },
        req,
      }),
    ).toThrow(/spaces or unsafe characters/)
  })
})

describe('Media.beforeDelete — the hole that left a live product with an empty stage', () => {
  it('refuses to delete a file a published product is still using', async () => {
    /*
     * ⚠️ THIS HOOK HAD 0% FUNCTION COVERAGE. The publish gate only runs when the PRODUCT
     * is saved, and the database sets the reference to NULL on delete — so deleting a
     * model from the media library walked past every check. The product stayed
     * "published" and "colours checked" while pointing at nothing, and the only symptom
     * was a blank box for anyone scanning the QR code.
     */
    const req = reqWith({ find: makeFind([{ productName: 'X-MILO PRO BIB' }]) })

    await expect(mediaDelete({ id: 42, req })).rejects.toThrow(/X-MILO PRO BIB/)
  })

  it('allows the delete when nothing published references it', async () => {
    const req = reqWith({ find: makeFind([]) })
    await expect(mediaDelete({ id: 42, req })).resolves.toBeUndefined()
  })

  it('names every product and tells the owner what to do instead', async () => {
    /*
     * A refusal the owner cannot act on is the failure mode this repo keeps hitting.
     * "It is in use" is useless; naming the products and the two ways out is not.
     */
    const req = reqWith({ find: makeFind([{ productName: 'A' }, { productName: 'B' }]) })
    const error = (await mediaDelete({ id: 1, req }).catch((e: unknown) => e)) as Error

    expect(error.message).toContain('“A”, “B”')
    expect(error.message).toContain('are published')
    expect(error.message).toMatch(/Draft/)
    expect((error as { status?: number }).status).toBe(400)
  })

  it('searches every place a product can point at media', async () => {
    /*
     * Four reference paths, and missing one reopens the hole for that field. This
     * asserts the query shape rather than trusting the list.
     */
    const find = makeFind([])
    await mediaDelete({ id: 7, req: reqWith({ find }) })

    const where = JSON.stringify(find.mock.calls[0]?.[0]?.where)
    for (const path of [
      'glbAsset',
      'posterFallback',
      'colourways.posterPreview',
      'colourways.glbAsset',
    ])
      expect(where).toContain(path)
    expect(where).toContain('published')
  })
})

describe('RawUploads.beforeValidate', () => {
  it('⚠️ skips the GLB checks when the write carries no filename', () => {
    /*
     * THE ROBOT'S OWN WRITES. Its status/report/resultGlb updates carry no filename; if
     * they were validated they would be rejected as "not a GLB" and the shrink pipeline
     * could never report back. That guard is one `if` and nothing tested it.
     */
    const req = reqWith()
    expect(
      rawValidate({ data: { status: 'failed', report: 'something broke' }, req }),
    ).toBeDefined()
    expect(req.payload.logger.warn).not.toHaveBeenCalled()
  })

  it('warns about a missing extension but never repairs it', () => {
    /*
     * Repairing the name here would desync the R2 key, which was set at multipart-init
     * from the ORIGINAL name. The record would then point at an object that is not
     * there — the exact failure the beforeChange hook below exists to catch.
     */
    const req = reqWith()
    const data = { filename: 'MinecutMotion', mimeType: 'model/gltf-binary', filesize: 10 }

    const result = rawValidate({ data, req }) as Record<string, unknown>

    expect(req.payload.logger.warn).toHaveBeenCalledOnce()
    expect(result.filename).toBe('MinecutMotion')
  })

  it('rejects a CLO project file, which is not a garment', () => {
    expect(() =>
      rawValidate({
        data: { filename: 'garment.zprj', mimeType: 'application/octet-stream', filesize: 10 },
        req: reqWith(),
      }),
    ).toThrow(/\.zprj/)
  })
})

describe('RawUploads.beforeChange — did the bytes actually arrive?', () => {
  const create = (data: Record<string, unknown>, req = reqWith()) =>
    rawChange({ data, operation: 'create', req })

  it('accepts an upload whose object IS in the ingest bucket', async () => {
    head.mockResolvedValue({ size: 1000 })
    await expect(create({ filename: 'x.glb', prefix: 'raw/2026' })).resolves.toBeDefined()
    expect(head).toHaveBeenCalledWith('raw/2026/x.glb')
  })

  it('⚠️ REFUSES one whose object is missing, in words the owner can act on', async () => {
    /*
     * Payload does NOT check this. With clientUploads the browser puts the file in R2
     * first and the document is created afterwards from client metadata — and a 404 when
     * fetching it back is treated as SUCCESS, producing a record with a correct-looking
     * name and size pointing at nothing. That happened on 2026-07-27 with a 382 MB
     * export, surfacing minutes later as an opaque shrink failure.
     */
    head.mockResolvedValue(null)
    const req = reqWith()

    const error = (await create({ filename: 'x.glb', prefix: 'raw' }, req).catch(
      (e: unknown) => e,
    )) as Error

    expect(error.message).toContain('did not finish uploading')
    expect(error.message).toContain('Nothing was saved')
    // MUST be an APIError, or Payload shows "Something went wrong." — which is exactly
    // what happened on this guard's first live test, costing a diagnostic round-trip.
    expect((error as { status?: number }).status).toBe(400)
    expect(req.payload.logger.error).toHaveBeenCalledOnce()
  })

  it('treats a head() that throws as missing, rather than letting it through', async () => {
    head.mockRejectedValue(new Error('R2 unavailable'))
    await expect(create({ filename: 'x.glb', prefix: 'raw' })).rejects.toThrow(
      /did not finish uploading/,
    )
  })

  it('only runs on create, so the robot can update the record afterwards', async () => {
    const result = await rawChange({
      data: { filename: 'x.glb', status: 'done' },
      operation: 'update',
      req: reqWith(),
    })
    expect(result).toBeDefined()
    expect(head).not.toHaveBeenCalled()
  })

  it('no-ops without the R2 binding, so local dev is not blocked', async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as never)
    await expect(create({ filename: 'x.glb', prefix: 'raw' })).resolves.toBeDefined()
    expect(head).not.toHaveBeenCalled()
  })

  it('survives getCloudflareContext throwing entirely', async () => {
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error('no context'))
    await expect(create({ filename: 'x.glb', prefix: 'raw' })).resolves.toBeDefined()
  })
})

/**
 * The Retry tick-box (fix plan Rank 12, audits Q-07 and CI-01). Every case asserts what
 * reached the queue: nothing, or exactly one job. A test that only checked the report text
 * could pass while a duplicate run was still being enqueued underneath it.
 */
describe('RawUploads.afterChange — Retry only when it can work', () => {
  const send = vi.fn(async (_message: Record<string, unknown>) => {})
  const update = vi.fn(async (_args: Record<string, unknown>) => ({}))
  const firstUpdate = () => (update.mock.calls[0]?.[0] ?? {}) as { data?: Record<string, unknown> }
  const reqFor = () => ({ payload: { logger: logger(), update, find: makeFind([]) } })
  const row = (over: Record<string, unknown>) => ({
    id: 9,
    filename: 'X-MILO PRO BIB.glb',
    prefix: 'uploads',
    filesize: 59_555_468,
    status: 'failed',
    retry: true,
    ...over,
  })

  beforeEach(() => {
    send.mockClear()
    update.mockClear()
    head.mockReset()
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { R2_INGEST: { head }, SHRINK_QUEUE: { send } },
    } as never)
  })

  it('exists, so a Payload shape change cannot silently empty this block', () => {
    expect(typeof rawAfterChange).toBe('function')
  })

  it('ticking Retry while the upload is still PROCESSING enqueues nothing and un-ticks the box (Q-07)', async () => {
    await rawAfterChange({
      doc: row({ status: 'processing' }),
      previousDoc: row({ status: 'processing', retry: false }),
      operation: 'update',
      req: reqFor(),
      context: {},
    })
    expect(send).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: { retry: false },
      context: { skipShrinkEnqueue: true },
    })
    expect(head).not.toHaveBeenCalled()
  })

  it('ticking Retry while QUEUED is refused the same way', async () => {
    await rawAfterChange({
      doc: row({ status: 'queued' }),
      previousDoc: row({ status: 'queued', retry: false }),
      operation: 'update',
      req: reqFor(),
      context: {},
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('a retry on a FAILED row whose file has expired says re-upload and enqueues nothing (CI-01)', async () => {
    head.mockResolvedValue(null)
    await rawAfterChange({
      doc: row({}),
      previousDoc: row({ retry: false }),
      operation: 'update',
      req: reqFor(),
      context: {},
    })
    expect(head).toHaveBeenCalledWith('uploads/X-MILO PRO BIB.glb')
    expect(send).not.toHaveBeenCalled()
    const written = firstUpdate()
    expect(written.data).toMatchObject({ retry: false, status: 'failed' })
    expect(String(written.data?.report)).toMatch(/expired from the upload store/)
    expect(String(written.data?.report)).toMatch(/Upload the CLO export again/)
  })

  it('a retry on a FAILED row whose file is still there enqueues exactly one job and resets the row', async () => {
    head.mockResolvedValue({ size: 59_555_468 })
    await rawAfterChange({
      doc: row({}),
      previousDoc: row({ retry: false }),
      operation: 'update',
      req: reqFor(),
      context: {},
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      rawUploadId: 9,
      filename: 'X-MILO PRO BIB.glb',
      prefix: 'uploads',
    })
    expect(update.mock.calls[0]?.[0]).toMatchObject({ data: { retry: false, status: 'queued' } })
  })

  it('a retry on a READY row is allowed too — re-running a finished garment after a pipeline fix', async () => {
    head.mockResolvedValue({ size: 1 })
    await rawAfterChange({
      doc: row({ status: 'ready' }),
      previousDoc: row({ status: 'ready', retry: false }),
      operation: 'update',
      req: reqFor(),
      context: {},
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('a fresh upload enqueues without the existence check (beforeChange already made it)', async () => {
    await rawAfterChange({
      doc: row({ status: 'queued', retry: false }),
      previousDoc: undefined,
      operation: 'create',
      req: reqFor(),
      context: {},
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(head).not.toHaveBeenCalled()
  })

  it("the robot's own status patches never enqueue", async () => {
    await rawAfterChange({
      doc: row({ status: 'ready', retry: false }),
      previousDoc: row({ status: 'processing', retry: false }),
      operation: 'update',
      req: reqFor(),
      context: {},
    })
    expect(send).not.toHaveBeenCalled()
  })
})
