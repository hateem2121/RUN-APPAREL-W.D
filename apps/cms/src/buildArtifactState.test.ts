import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyBuildArtifacts, readBuiltBuildId } from './buildArtifactState'

/**
 * The guard for the build-artifact tests (hostRulesManifest.test.ts, notFoundCsp.test.ts).
 *
 * The incident it must never repeat: on 9 Nov 2026 the local gates run failed the `test`
 * gate with 79 built redirects against 82 source rules and a missing rule for
 * /guides/aql-inspection — while CI was green on the same commit, because a clean checkout
 * has no `.next` and the tests skip. A build present but stale must classify as stale, and
 * "cannot prove fresh" must never read as fresh.
 */
describe('classifyBuildArtifacts', () => {
  it('a missing manifest is missing, whatever the ids say', () => {
    expect(
      classifyBuildArtifacts(false, 'site-11112222333344445555', 'site-11112222333344445555'),
    ).toEqual({
      kind: 'missing',
    })
    expect(classifyBuildArtifacts(false, null, null)).toEqual({ kind: 'missing' })
  })

  it('equal source fingerprints are fresh', () => {
    const id = 'site-11112222333344445555'
    expect(classifyBuildArtifacts(true, id, id)).toEqual({ kind: 'fresh' })
  })

  it('a build from an older commit is stale — the 9 Nov gates failure, recorded', () => {
    // e8b47f26 was this Mac's .next when HEAD was 6d81c4d3: one redirect wave behind.
    expect(
      classifyBuildArtifacts(true, 'site-e8b47f260a16e393b211', 'site-6d81c4d3000000000000'),
    ).toEqual({
      kind: 'stale',
      built: 'site-e8b47f260a16e393b211',
      current: 'site-6d81c4d3000000000000',
    })
  })

  it('uncommitted source cannot be proven fresh, even against a real build id', () => {
    // siteSourceBuildId() returns null on uncommitted changes: HEAD's ids would describe
    // code that is not the code being built, so nothing can match it.
    expect(classifyBuildArtifacts(true, 'site-11112222333344445555', null)).toEqual({
      kind: 'stale',
      built: 'site-11112222333344445555',
      current: null,
    })
  })

  it('an unfingerprinted build (a dirty-tree random id) is stale', () => {
    expect(
      classifyBuildArtifacts(true, 'some-random-next-id', 'site-11112222333344445555'),
    ).toEqual({
      kind: 'stale',
      built: 'some-random-next-id',
      current: 'site-11112222333344445555',
    })
  })
})

describe('readBuiltBuildId', () => {
  let dir = ''
  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
      dir = ''
    }
  })

  const makeTree = (buildId: string | null) => {
    dir = mkdtempSync(join(tmpdir(), 'build-id-'))
    if (buildId !== null) {
      mkdirSync(join(dir, '.next'), { recursive: true })
      writeFileSync(join(dir, '.next', 'BUILD_ID'), buildId)
    }
    return dir
  }

  it('reads the id next build stamped into BUILD_ID', () => {
    expect(readBuiltBuildId(makeTree('site-abc123def456abc12345\n'))).toBe(
      'site-abc123def456abc12345',
    )
  })

  it('no BUILD_ID file means null, and so does an empty one', () => {
    expect(readBuiltBuildId(makeTree(null))).toBe(null)
    expect(readBuiltBuildId(makeTree(''))).toBe(null)
  })
})
