import { describe, expect, it } from 'vitest'
import {
  modelKeyFor,
  PIPELINE_PACKAGES,
  pickSingle,
  pipelineOutputReason,
  sourceReferenceFor,
  squashName,
  versionMismatches,
} from '../../../scripts/process-local-lib.mjs'

/**
 * `scripts/process-local.mjs` runs the robot's pipeline on the owner's Mac (owner decision
 * 2026-09-27, $0 container cost). Its refusals are what keep a Mac-made model identical to
 * a robot-made one; each is tested here against the input that would break that promise.
 */

describe('pipelineOutputReason', () => {
  it('lets a raw CLO export through', () => {
    // The generator every one of the 43 exports carries (census 2026-09-27).
    expect(
      pipelineOutputReason({ asset: { generator: 'CLO Standalone OnlineAuth 2025.2.236' } }),
    ).toBeNull()
  })

  it('refuses a file the pipeline already wrote, by either mark', () => {
    // A second pass silently drops artwork protection (root CLAUDE.md, 🔴).
    expect(pipelineOutputReason({ asset: { copyright: '© RUN Apparel 2026' } })).toContain(
      'copyright',
    )
    expect(pipelineOutputReason({ asset: { generator: 'glTF-Transform v4.5.0' } })).toContain(
      'generator',
    )
  })
})

describe('versionMismatches', () => {
  const lock = {
    packages: Object.fromEntries(
      PIPELINE_PACKAGES.map((name) => [`node_modules/${name}`, { version: '1.0.0' }]),
    ),
  }
  const same = Object.fromEntries(PIPELINE_PACKAGES.map((name) => [name, '1.0.0']))

  it('is empty when the Mac matches the container', () => {
    expect(versionMismatches(same, lock)).toEqual([])
  })

  it('names a package whose version differs, and one that is missing', () => {
    const problems = versionMismatches({ ...same, sharp: '0.35.5', meshoptimizer: null }, lock)
    expect(problems).toHaveLength(2)
    expect(problems.join('\n')).toContain('sharp: 0.35.5 here, 1.0.0 in the container')
    expect(problems.join('\n')).toContain('meshoptimizer: not installed here')
  })

  it('treats a package absent from the lockfile as a mismatch, never a pass', () => {
    const { packages } = lock
    const partial = { packages: { ...packages, 'node_modules/sharp': {} } }
    expect(versionMismatches(same, partial)).toEqual([`sharp: not in the container's lockfile`])
  })
})

describe('pickSingle', () => {
  it('picks the only zip, ignoring macOS debris', () => {
    expect(pickSingle(['A.zprj', 'A.zip', '._A.zip', 'A_Colorway 1.png'], '.zip')).toEqual({
      name: 'A.zip',
    })
  })

  it('refuses none and refuses two', () => {
    expect(pickSingle(['A.zprj'], '.zip')).toEqual({ error: 'no .zip file' })
    expect('error' in pickSingle(['A.zip', 'A (1).zip'], '.zip')).toBe(true)
  })
})

describe('naming', () => {
  it('squashes names the way folders and products are compared', () => {
    expect(squashName("WOMEN'S ATHLETIC TENNIS DRESS")).toBe('womensathletictennisdress')
    expect(squashName('ENDURANCE TRACKSUIT`')).toBe('endurancetracksuit')
  })

  it('keys a model by slug and date, and refuses anything that is not a slug', () => {
    expect(modelKeyFor('r-atw', new Date('2026-09-27T10:00:00Z'))).toBe('r-atw-2026-09-27.glb')
    expect(() => modelKeyFor('../etc/passwd', new Date())).toThrow('not a product slug')
  })

  it('records the export, the date and the commit, and no folder path', () => {
    const text = sourceReferenceFor({
      zipName: 'AERO-TECH WINDBREAKER.zip',
      zipBytes: 19724131,
      sha256: 'a'.repeat(64),
      commit: '0123456789abcdef',
      now: new Date('2026-09-27T10:00:00Z'),
    })
    expect(text).toContain('2026-09-27')
    expect(text).toContain('0123456789ab')
    expect(text).toContain('AERO-TECH WINDBREAKER.zip')
    expect(text).not.toContain('/Users/')
  })
})
