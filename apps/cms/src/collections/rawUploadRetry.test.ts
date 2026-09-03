import { describe, expect, it } from 'vitest'
import {
  EXPIRED_UPLOAD_REPORT,
  RETRYABLE_STATUSES,
  retryBoxVisible,
  retryDecision,
} from './rawUploadRetry'

describe('retryDecision (fix plan Rank 12, Q-07)', () => {
  const ticked = (status: string) => ({
    operation: 'update',
    doc: { retry: true, status },
    previousDoc: { retry: false, status },
  })

  it('a create always enqueues', () => {
    expect(
      retryDecision({ operation: 'create', doc: { status: 'queued' }, previousDoc: undefined }),
    ).toBe('create')
  })

  it('ticking the box on a finished row is a retry', () => {
    for (const status of RETRYABLE_STATUSES) expect(retryDecision(ticked(status))).toBe('retry')
  })

  it('ticking the box while a run is queued or processing is refused', () => {
    expect(retryDecision(ticked('queued'))).toBe('retry-while-running')
    expect(retryDecision(ticked('processing'))).toBe('retry-while-running')
  })

  it('a box that was already ticked is not a new retry (the robot un-ticks it itself)', () => {
    expect(
      retryDecision({
        operation: 'update',
        doc: { retry: true, status: 'failed' },
        previousDoc: { retry: true, status: 'failed' },
      }),
    ).toBe('ignore')
  })

  it("the robot's status patches and any other update are ignored", () => {
    expect(
      retryDecision({
        operation: 'update',
        doc: { retry: false, status: 'ready' },
        previousDoc: { retry: false, status: 'processing' },
      }),
    ).toBe('ignore')
    expect(retryDecision({ operation: 'delete', doc: null, previousDoc: null })).toBe('ignore')
  })

  it('a row with no recorded status is let through rather than stuck', () => {
    expect(
      retryDecision({ operation: 'update', doc: { retry: true }, previousDoc: { retry: false } }),
    ).toBe('retry')
  })
})

describe('retryBoxVisible', () => {
  it('shows the box only once the last run has finished', () => {
    expect(retryBoxVisible('failed')).toBe(true)
    expect(retryBoxVisible('ready')).toBe(true)
    expect(retryBoxVisible('queued')).toBe(false)
    expect(retryBoxVisible('processing')).toBe(false)
    expect(retryBoxVisible(undefined)).toBe(false)
  })
})

describe('EXPIRED_UPLOAD_REPORT (CI-01)', () => {
  it('tells the owner what happened and what to do, in their words', () => {
    expect(EXPIRED_UPLOAD_REPORT).toMatch(/14 days/)
    expect(EXPIRED_UPLOAD_REPORT).toMatch(/Nothing was queued/)
    expect(EXPIRED_UPLOAD_REPORT).toMatch(/Upload the CLO export again/)
  })
})
