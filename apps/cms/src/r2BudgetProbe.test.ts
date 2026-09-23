import { describe, expect, it } from 'vitest'
import {
  classifyOperations,
  evaluateR2Budget,
  FAIL_AT_FRACTION,
  FREE_TIER,
  WARN_AT_FRACTION,
} from '../../../scripts/r2-budget-probe.mjs'

/**
 * SO-15 — both functions are pure (bytes/operation counts in, a verdict out), so this
 * suite never touches the network; the live GraphQL query is `main()`'s job only.
 */
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

describe('evaluateR2Budget', () => {
  it('passes on negligible usage', () => {
    const r = evaluateR2Budget({ storageBytes: 121_217_033, classA: 1_457, classB: 55_377 })
    expect(r.verdict).toBe('PASS')
  })

  it('warns at the 50% threshold on any single dimension', () => {
    const r = evaluateR2Budget({
      storageBytes: FREE_TIER.storageBytes * WARN_AT_FRACTION,
      classA: 0,
      classB: 0,
    })
    expect(r.verdict).toBe('WARN')
  })

  it('fails at the 80% threshold on any single dimension', () => {
    const r = evaluateR2Budget({
      storageBytes: 0,
      classA: FREE_TIER.classA * FAIL_AT_FRACTION,
      classB: 0,
    })
    expect(r.verdict).toBe('FAIL')
  })

  it('judges by the WORST dimension, not an average', () => {
    // Storage negligible, but Class B alone is already over the fail line.
    const r = evaluateR2Budget({
      storageBytes: 1,
      classA: 0,
      classB: FREE_TIER.classB * 0.9,
    })
    expect(r.verdict).toBe('FAIL')
  })
})
