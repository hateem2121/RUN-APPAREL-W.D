import { buildImportedRow, type FileColour, type ImportedRow } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import {
  defaultScratchRoot,
  modelKeyFor,
  PIPELINE_PACKAGES,
  pickSingle,
  pipelineOutputReason,
  sourceReferenceFor,
  squashName,
  versionMismatches,
  withNamePlan,
} from '../../../scripts/process-local-lib.mjs'

/**
 * `scripts/process-local.mjs` runs the robot's pipeline on the owner's Mac (owner decision
 * 2026-09-27, $0 container cost). Its refusals are what keep a Mac-made model identical to
 * a robot-made one; each is tested here against the input that would break that promise.
 */

describe('defaultScratchRoot', () => {
  // GitHub's code scan (CodeQL js/insecure-temporary-file, 2026-10-01) flagged a fixed-name
  // folder in the shared temp directory. The name stays fixed so a run can resume; the
  // folder moves to the user's own cache, which no other account can write to.
  it('uses the owner’s private cache folder, never the shared temp folder', () => {
    expect(defaultScratchRoot({}, '/Users/someone')).toBe(
      '/Users/someone/Library/Caches/run-apparel-process-local',
    )
  })

  it('still honours PROCESS_LOCAL_SCRATCH when it is set', () => {
    expect(defaultScratchRoot({ PROCESS_LOCAL_SCRATCH: '/Volumes/x/s' }, '/Users/someone')).toBe(
      '/Volumes/x/s',
    )
  })
})

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

describe('withNamePlan', () => {
  // The real measurement of 2026-09-27: the sampler read THE KINETIC MATRIX JACKET's five
  // colourways (yellow, pink, teal, lime, orange) as "Black #000000", all at high
  // confidence. The import writes a high-confidence slug, and a slug is never changed.
  const kmj: FileColour[] = ['Colorway 1', 'Colorway 2', 'Colorway 3'].map((variantId) => ({
    variantId,
    hex: '#000000',
    name: 'Black',
    slug: 'black',
    deltaE: 3.2,
    confidence: 'high',
  }))
  const plan = {
    colours: [
      { variantId: 'Colorway 3', displayName: 'Teal', slug: 'teal' },
      { variantId: 'Colorway 1', displayName: 'Yellow', slug: 'yellow' },
      { variantId: 'Colorway 2', displayName: 'Pink', slug: 'pink' },
    ],
  }
  /** What the colour import would actually write: the same loop as planColourImport. */
  const rowsFor = (colours: FileColour[]) => {
    const rows: ImportedRow[] = []
    for (const c of colours) rows.push(buildImportedRow(c, rows))
    return rows
  }

  it('leaves the robot alone when there is no plan', () => {
    expect(withNamePlan(kmj, undefined)).toEqual({ colours: kmj })
  })

  it('negative control: without a plan the import really would write black, black-2, black-3', () => {
    expect(rowsFor(kmj).map((r) => r.slug)).toEqual(['black', 'black-2', 'black-3'])
  })

  it('with a plan, the rows carry the planned names and slugs, in FILE order, with the measured hex', () => {
    const result = withNamePlan(kmj, plan)
    if ('error' in result) throw new Error(result.error)
    const rows = rowsFor(result.colours)
    expect(rows.map((r) => [r.variantId, r.displayName, r.slug, r.hexSwatch])).toEqual([
      ['Colorway 1', 'Yellow', 'yellow', '#000000'],
      ['Colorway 2', 'Pink', 'pink', '#000000'],
      ['Colorway 3', 'Teal', 'teal', '#000000'],
    ])
    expect(rows.every((r) => r.active === false)).toBe(true)
  })

  it('names a colour the robot left blank for low confidence', () => {
    const low = kmj.map((c) => ({ ...c, confidence: 'low' as const }))
    const result = withNamePlan(low, plan)
    if ('error' in result) throw new Error(result.error)
    expect(rowsFor(result.colours).map((r) => r.slug)).toEqual(['yellow', 'pink', 'teal'])
  })

  it('refuses a plan that misses a colour, adds one, or names one twice', () => {
    const missing = { colours: plan.colours.slice(1) }
    expect(withNamePlan(kmj, missing)).toHaveProperty(
      'error',
      expect.stringContaining('Colorway 3'),
    )
    const extra = {
      colours: [...plan.colours, { variantId: 'Colorway 9', displayName: 'Red', slug: 'red' }],
    }
    expect(withNamePlan(kmj, extra)).toHaveProperty('error', expect.stringContaining('Colorway 9'))
    const twice = { colours: [...plan.colours.slice(0, 2), { ...plan.colours[0], slug: 'navy' }] }
    expect(withNamePlan(kmj, twice)).toHaveProperty('error')
  })

  it('refuses a duplicate slug, a slug that is not a web-address word, and a blank name', () => {
    const dupe = { colours: plan.colours.map((c) => ({ ...c, slug: 'teal' })) }
    expect(withNamePlan(kmj, dupe)).toHaveProperty('error', expect.stringContaining('teal'))
    const bad = { colours: plan.colours.map((c, i) => (i ? c : { ...c, slug: 'Teal Blue' })) }
    expect(withNamePlan(kmj, bad)).toHaveProperty('error', expect.stringContaining('Teal Blue'))
    const blank = { colours: plan.colours.map((c, i) => (i ? c : { ...c, displayName: ' ' })) }
    expect(withNamePlan(kmj, blank)).toHaveProperty('error')
  })
})
