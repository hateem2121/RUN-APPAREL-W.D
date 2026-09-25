import { describe, expect, it } from 'vitest'
import {
  billedStorageBytes,
  classifyOperations,
  currentStorageBytes,
  estimateMonthlyCost,
  evaluateR2Budget,
  FREE_TIER,
  WARN_AT_FRACTION,
} from '../../../scripts/r2-budget-probe.mjs'

/**
 * SO-15 — every function here is pure (readings and counts in, bytes, dollars or a
 * verdict out), so this suite never touches the network; the live GraphQL query is
 * `main()`'s job only. Measured live 2026-09-25 with the CI token: 0.38 GB now, 12.54
 * GB-month billed (the deleted archive bucket), 1,524 Class A, 74,937 Class B → WARN,
 * $0.00 at today's usage, $0.04 over the last 30 days.
 */
const GB = 1e9
describe('classifyOperations', () => {
  it('sums known Class A and Class B action types separately', () => {
    const r = classifyOperations([
      { actionType: 'PutObject', requests: 100 },
      { actionType: 'GetObject', requests: 5000 },
      { actionType: 'HeadObject', requests: 200 },
      { actionType: 'ListObjects', requests: 10 },
    ])
    expect(r.classA).toBe(110)
    expect(r.classB).toBe(5200)
    expect(r.unclassified).toEqual([])
  })

  it('does not count free operations at all', () => {
    const r = classifyOperations([
      { actionType: 'DeleteObject', requests: 50 },
      { actionType: 'AbortMultipartUpload', requests: 3 },
    ])
    expect(r.classA).toBe(0)
    expect(r.classB).toBe(0)
  })

  /**
   * The conservative default: an action type this file does not recognise is counted
   * as Class A (the more expensive class) rather than silently dropped, so a real cost
   * this script has not been taught about yet is still visible in the total rather than
   * invisible.
   */
  it('counts an unrecognised action type as Class A, and names it', () => {
    const r = classifyOperations([{ actionType: 'SomeNewR2Action', requests: 42 }])
    expect(r.classA).toBe(42)
    expect(r.classB).toBe(0)
    expect(r.unclassified).toEqual(['SomeNewR2Action'])
  })

  it('is empty for no operations', () => {
    expect(classifyOperations([])).toEqual({ classA: 0, classB: 0, unclassified: [] })
  })
})

describe('currentStorageBytes', () => {
  it('sums the NEWEST reading of every bucket, whatever order the rows arrive in', () => {
    const bytes = currentStorageBytes([
      { bucketName: 'media', datetime: '2026-09-25T06:30:00Z', bytes: 5 },
      { bucketName: 'media', datetime: '2026-09-25T06:40:00Z', bytes: 7 },
      { bucketName: 'archive', datetime: '2026-09-25T06:40:00Z', bytes: 0 },
      { bucketName: 'archive', datetime: '2026-09-25T06:10:00Z', bytes: 13 },
    ])
    // media's newest is 7; the archive's newest is 0 (emptied), not its older 13.
    expect(bytes).toBe(7)
  })

  it('is 0 for no readings', () => {
    expect(currentStorageBytes([])).toBe(0)
  })
})

describe('billedStorageBytes', () => {
  it("averages each day's peak, summed across buckets, as the bill does", () => {
    const bytes = billedStorageBytes([
      { bucketName: 'a', date: '2026-09-01', bytes: 10 },
      { bucketName: 'b', date: '2026-09-01', bytes: 2 },
      { bucketName: 'a', date: '2026-09-02', bytes: 4 },
      { bucketName: 'a', date: '2026-09-02', bytes: 6 }, // the day's PEAK counts
    ])
    // day 1: 10 + 2 = 12; day 2: peak 6. Average (12 + 6) / 2 = 9.
    expect(bytes).toBe(9)
  })

  it('is 0 for no days', () => {
    expect(billedStorageBytes([])).toBe(0)
  })
})

describe('estimateMonthlyCost', () => {
  it('is $0 inside every free allowance', () => {
    expect(estimateMonthlyCost({ storageBytes: 9 * GB, classA: 999_999, classB: 9_999_999 })).toBe(
      0,
    )
  })

  it('charges only the part over each allowance, at the published prices', () => {
    // 2 GB over at $0.015, 1M Class A over at $4.50, 1M Class B over at $0.36.
    const dollars = estimateMonthlyCost({
      storageBytes: 12 * GB,
      classA: 2_000_000,
      classB: 11_000_000,
    })
    expect(dollars).toBeCloseTo(0.03 + 4.5 + 0.36, 10)
  })
})

describe('evaluateR2Budget', () => {
  it('passes on usage like the account after the archive was deleted, minus its history', () => {
    const r = evaluateR2Budget({
      currentBytes: 0.38 * GB,
      billedBytes: 0.38 * GB,
      classA: 1_524,
      classB: 74_937,
    })
    expect(r.verdict).toBe('PASS')
    expect(r.atCurrentRate).toBe(0)
  })

  it('WARNS, not fails, when only the last 30 days carry a bill (measured 2026-09-25)', () => {
    const r = evaluateR2Budget({
      currentBytes: 0.38 * GB,
      billedBytes: 12.54 * GB,
      classA: 1_524,
      classB: 74_937,
    })
    expect(r.verdict).toBe('WARN')
    expect(r.atCurrentRate).toBe(0)
    expect(r.trailing).toBeGreaterThan(0)
  })

  it("FAILS when today's storage would be billed", () => {
    const r = evaluateR2Budget({
      currentBytes: FREE_TIER.storageBytes + GB,
      billedBytes: 0,
      classA: 0,
      classB: 0,
    })
    expect(r.verdict).toBe('FAIL')
  })

  it('FAILS when 30 days of requests are over an allowance', () => {
    const r = evaluateR2Budget({
      currentBytes: 0,
      billedBytes: 0,
      classA: 0,
      classB: FREE_TIER.classB + 1,
    })
    expect(r.verdict).toBe('FAIL')
  })

  it('warns at 80% of any single allowance, before a cent is billed', () => {
    const r = evaluateR2Budget({
      currentBytes: 0,
      billedBytes: 0,
      classA: FREE_TIER.classA * WARN_AT_FRACTION,
      classB: 0,
    })
    expect(r.verdict).toBe('WARN')
    expect(r.atCurrentRate).toBe(0)
  })
})
