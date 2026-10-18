import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJobDir, summariseBaseline } from '../../../scripts/lighthouse-baseline.mjs'
import { type Run, readRun } from '../../../scripts/lighthouse-robot.mjs'

/**
 * Re-taking the runner baseline (investigation of 2026-10-18, F-01/F-02): the floors were set
 * from nine medians of one afternoon on ubuntu-24.04 and Chrome 152, and the runner has since
 * moved to ubuntu-26.04 and Chrome 155. This summarises the kept reports of many jobs per
 * page/device, so new floors come from a sample big enough to hold the runner's own spread.
 */

const URL = 'https://wear-run.com/products'

/** A report cut to what the robot reads: version, status, one performance score, timings. */
const report = (
  performance: number,
  timings: { fcp: number; dcl: number; load: number } = { fcp: 400, dcl: 260, load: 900 },
) => ({
  lighthouseVersion: '13.5.0',
  configSettings: { formFactor: 'mobile' },
  mainDocumentUrl: URL,
  environment: { benchmarkIndex: 1450 },
  categories: { performance: { score: performance, auditRefs: [] } },
  audits: {
    'network-requests': {
      details: { items: [{ url: URL, resourceType: 'Document', statusCode: 200 }] },
    },
    metrics: {
      details: {
        items: [
          {
            observedFirstContentfulPaint: timings.fcp,
            observedDomContentLoaded: timings.dcl,
            observedLoad: timings.load,
          },
        ],
      },
    },
  },
})

const job = (scores: number[], stalled = 0) =>
  scores.map((score, index) => ({
    page: 'products',
    formFactor: 'mobile',
    run: readRun(
      report(score, index < stalled ? { fcp: 2330, dcl: 260, load: 300 } : undefined),
    ) as Run,
  }))

/** The products phone summary, or a clear failure when it is missing. */
const productsMobile = (jobs: Parameters<typeof summariseBaseline>[0]) => {
  const summary = summariseBaseline(jobs)['products.mobile']
  if (!summary) throw new Error('no products.mobile summary')
  return summary
}

describe('summariseBaseline', () => {
  it('takes one median per job, then the spread of those medians', () => {
    const summary = productsMobile([
      job([0.86, 0.86, 0.86]),
      job([0.9, 0.9, 0.9]),
      job([0.88, 0.88, 0.88], 1),
    ])
    expect(summary.jobs).toBe(3)
    expect(summary.medians).toEqual([0.86, 0.88, 0.9])
    expect(summary.worstMedian).toBe(0.86)
    expect(summary.p10Median).toBe(0.86)
    expect(summary.stallRate).toBeCloseTo(1 / 9, 10)
    expect(summary.cpuMedian).toBe(1450)
  })

  // A job with fewer than three valid runs was "not judged" by the robot, so it says nothing here.
  it('leaves out a job the robot could not judge', () => {
    const thin = [
      ...job([0.5, 0.5]),
      { page: 'products', formFactor: 'mobile', run: readRun(null) },
    ]
    const summary = productsMobile([job([0.9, 0.9, 0.9]), thin])
    expect(summary.jobs).toBe(1)
    expect(summary.medians).toEqual([0.9])
  })

  it('counts how many jobs a candidate floor would have failed', () => {
    const summary = productsMobile([
      job([0.84, 0.84, 0.84]),
      job([0.86, 0.86, 0.86]),
      job([0.9, 0.9, 0.9]),
    ])
    expect(summary.failuresAt(0.85)).toBe(1)
    expect(summary.failuresAt(0.83)).toBe(0)
    expect(summary.failuresAt(0.91)).toBe(3)
  })
})

describe('readJobDir', () => {
  it('reads one artifact folder, measured runs only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baseline-'))
    writeFileSync(join(dir, 'products.mobile.run1.json'), JSON.stringify(report(0.9)))
    writeFileSync(join(dir, 'products.mobile.run2.json'), JSON.stringify(report(0.88)))
    // A warm-up is written and never judged (lighthouse-robot.mjs, WARM_UP_RUNS).
    writeFileSync(join(dir, 'warmup.1.json'), JSON.stringify(report(0.4)))
    const entries = readJobDir(dir)
    expect(entries.map((entry) => `${entry.page}.${entry.formFactor}`)).toEqual([
      'products.mobile',
      'products.mobile',
    ])
    expect(
      entries.map((entry) => (entry.run.missing ? null : entry.run.scores.performance)),
    ).toEqual([0.9, 0.88])
  })
})
