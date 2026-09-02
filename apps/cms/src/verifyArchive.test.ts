import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_BUCKET,
  compareArchive,
  formatReport,
  listArchive,
  loadManifest,
  validateManifest,
} from '../../../scripts/verify-archive.mjs'

/**
 * Tests for the archive-bucket verifier (audit CI-02 / CI-08, 2026-09-02).
 *
 * NEGATIVE CONTROLS FIRST, for the reason verifyBackup.test.ts gives: a verifier can
 * only fail at its job by passing, and "0 missing" is what a broken listing and a
 * healthy bucket both say. Each block below hands the comparison a specific broken
 * state — an empty listing, a deleted object, a truncated object — and requires a
 * failure that NAMES the object. The positive case is last.
 */

const sha = (c: string) => c.repeat(64)
const MANIFEST = {
  objects: [
    { key: 'fixed-glbs/A.glb', bytes: 100, sha256: sha('a') },
    { key: 'raw-exports/B.glb', bytes: 2_000_000_000, sha256: sha('b') },
  ],
}
const healthy = () => [
  { key: 'fixed-glbs/A.glb', size: 100 },
  { key: 'raw-exports/B.glb', size: 2_000_000_000 },
]

describe('compareArchive — negative controls', () => {
  it('fails on an EMPTY listing and says so explicitly, not merely "2 missing"', () => {
    const result = compareArchive(MANIFEST, [])
    expect(result.ok).toBe(false)
    expect(result.emptyListing).toBe(true)
    expect(formatReport(result).join('\n')).toMatch(/ZERO objects/)
  })

  it('fails when an object has been deleted, naming it', () => {
    const result = compareArchive(MANIFEST, healthy().slice(0, 1))
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([{ key: 'raw-exports/B.glb', bytes: 2_000_000_000 }])
    expect(formatReport(result).join('\n')).toMatch(/MISSING: raw-exports\/B\.glb/)
  })

  it('fails when an object is truncated, giving both sizes', () => {
    const listing = healthy().map((o) =>
      o.key === 'raw-exports/B.glb' ? { ...o, size: 1_500_000_000 } : o,
    )
    const result = compareArchive(MANIFEST, listing)
    expect(result.ok).toBe(false)
    expect(result.mismatched).toEqual([
      { key: 'raw-exports/B.glb', expected: 2_000_000_000, actual: 1_500_000_000 },
    ])
    expect(formatReport(result).join('\n')).toMatch(
      /WRONG SIZE: raw-exports\/B\.glb — bucket 1500000000 B, manifest 2000000000 B/,
    )
  })

  it('a listing that carries only OTHER objects is a failure, not "extras"', () => {
    const result = compareArchive(MANIFEST, [{ key: 'something-else', size: 5 }])
    expect(result.ok).toBe(false)
    expect(result.missing).toHaveLength(2)
    expect(result.extra).toEqual(['something-else'])
  })
})

describe('compareArchive — the positive case', () => {
  it('passes when every object is present at its exact size, and counts the bytes', () => {
    const result = compareArchive(MANIFEST, healthy())
    expect(result.ok).toBe(true)
    expect(result.verified).toBe(2)
    expect(result.bytesVerified).toBe(2_000_000_100)
    expect(formatReport(result).at(-1)).toMatch(/^\[verify-archive\] OK: 2 of 2 objects/)
  })

  it('reports an object the manifest does not know as unverified, without failing', () => {
    const result = compareArchive(MANIFEST, [...healthy(), { key: 'MANIFEST.json', size: 3000 }])
    expect(result.ok).toBe(true)
    expect(result.extra).toEqual(['MANIFEST.json'])
    expect(formatReport(result).join('\n')).toMatch(
      /not in the manifest \(unverified\): MANIFEST\.json/,
    )
  })
})

describe('validateManifest refuses a manifest that could pass an empty or double-counted bucket', () => {
  it('refuses zero objects', () => {
    expect(() => validateManifest({ objects: [] })).toThrow(/ZERO objects/)
  })
  it('refuses a duplicate key', () => {
    expect(() =>
      validateManifest({ objects: [MANIFEST.objects[0], { ...MANIFEST.objects[0] }] }),
    ).toThrow(/twice/)
  })
  it('refuses a non-positive byte count', () => {
    expect(() => validateManifest({ objects: [{ key: 'k', bytes: 0, sha256: sha('a') }] })).toThrow(
      /positive byte count/,
    )
  })
  it('refuses a missing SHA-256', () => {
    expect(() => validateManifest({ objects: [{ key: 'k', bytes: 1, sha256: 'nope' }] })).toThrow(
      /SHA-256/,
    )
  })
})

describe('listArchive follows the cursor and refuses a partial answer', () => {
  const page = (result: unknown[], cursor?: string) =>
    new Response(
      JSON.stringify({
        success: true,
        errors: [],
        result,
        result_info: { cursor, is_truncated: Boolean(cursor), per_page: 1 },
      }),
      { status: 200 },
    )

  it('concatenates every page and stops when is_truncated is false', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: URL) => {
      calls.push(url.searchParams.get('cursor') ?? '(first)')
      if (!url.searchParams.get('cursor')) return page([{ key: 'a', size: 1 }], 'c1')
      if (url.searchParams.get('cursor') === 'c1') return page([{ key: 'b', size: 2 }], 'c2')
      return page([{ key: 'c', size: 3 }])
    }
    const objects = await listArchive({ token: 't', fetchImpl: fetchImpl as typeof fetch })
    expect(objects.map((o) => o.key)).toEqual(['a', 'b', 'c'])
    expect(calls).toEqual(['(first)', 'c1', 'c2'])
  })

  it('addresses the archive bucket on the account by default', async () => {
    let seen = ''
    const fetchImpl = async (url: URL) => {
      seen = url.toString()
      return page([{ key: 'a', size: 1 }])
    }
    await listArchive({ token: 't', fetchImpl: fetchImpl as typeof fetch })
    expect(seen).toMatch(new RegExp(`/r2/buckets/${ARCHIVE_BUCKET}/objects\\?per_page=1000$`))
  })

  it('throws on a failed response instead of returning the objects it has so far', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10000, message: 'Authentication error' }],
        }),
        {
          status: 403,
        },
      )
    await expect(listArchive({ token: 't', fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      /HTTP 403.*Authentication error/,
    )
  })

  it('refuses to run without a token', async () => {
    await expect(listArchive({ token: '' })).rejects.toThrow(/CLOUDFLARE_API_TOKEN/)
  })
})

describe('the committed manifest', () => {
  it('parses, names the archive bucket, and lists the five FIXED GLBs among its objects', () => {
    const manifest = loadManifest()
    expect(manifest.bucket).toBe(ARCHIVE_BUCKET)
    const keys = manifest.objects.map((o: { key: string }) => o.key)
    for (const name of [
      'AERO-TECH WINDBREAKER.zip.glb',
      'APEX FLEX PULLOVER.glb',
      'ARISAN BRA.glb',
      'ARMOR-TECH JACKET.glb',
      'Minecut Motion.glb',
    ]) {
      expect(keys).toContain(`fixed-glbs/${name}`)
    }
    // The two raw exports Rank 5 (republish the live garments) starts from.
    expect(keys).toContain('raw-exports/3d-products/cycling all colours.glb')
    expect(keys).toContain('raw-exports/3d-products/Cycling-Bib.glb')
    expect(keys).toContain('fixed-glbs/2026-09-02/THE AGGRESSOR MEN JERSEY.glb')
    expect(keys.length).toBeGreaterThanOrEqual(18)
  })
})
