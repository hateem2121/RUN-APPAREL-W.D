import { describe, expect, it } from 'vitest'
import { PermanentJobError } from './permanentJobError'
import {
  criticalDeadLetterFailure,
  criticalReportFailure,
  detailOf,
  failureReport,
  outcomeFor,
} from './queueDecisions'

/**
 * The queue consumer's decisions, which nothing tested until 2026-08-29.
 *
 * ⚠️ THE DENOMINATOR PROBLEM. This package declares 100%/100%/98%/100% — the strictest
 * thresholds in the repo — over 75 lines, because `src/index.ts` (760 lines) is
 * excluded. Its config justified that by claiming "every decision it makes is delegated
 * to the tested modules beside it". It was not: the ack-versus-retry decision, the
 * failure report and both CRITICAL fallbacks were all inside the excluded file. The
 * gate read as the strongest in the repo while measuring almost none of the code that
 * decides what happens to a customer's garment.
 *
 * These tests exist so that claim is true rather than aspirational.
 */

describe('outcomeFor — stop, or try again?', () => {
  it('stops on a failure retrying cannot fix', () => {
    /*
     * Retrying a permanent failure costs several minutes of standard-4 container time,
     * three times over, for a guaranteed identical result — then dead-letters anyway.
     * On a $5/month budget that is the difference between a bill and a surprise.
     */
    expect(outcomeFor(new PermanentJobError('the model is 46 MB'))).toBe('ack')
  })

  it('retries anything else', () => {
    // A container 5xx or a dropped CMS call usually succeeds on the next attempt.
    expect(outcomeFor(new Error('container returned 502'))).toBe('retry')
  })

  it('⚠️ retries a non-Error throw rather than swallowing it', () => {
    /*
     * `catch` gives `unknown`, and a thrown string or object is not an Error. Treating
     * an unrecognised throw as permanent would silently abandon a garment that a retry
     * would have fixed — failing CLOSED on the one path where failing open is right.
     */
    expect(outcomeFor('something odd')).toBe('retry')
    expect(outcomeFor(undefined)).toBe('retry')
    expect(outcomeFor({ message: 'not a real Error' })).toBe('retry')
  })

  it('recognises the class by instance, not by a duck-typed flag', () => {
    // An object merely carrying `permanent: true` is not one of ours.
    expect(outcomeFor({ permanent: true })).toBe('retry')
  })
})

describe('detailOf', () => {
  it('reads an Error message', () => {
    expect(detailOf(new Error('boom'))).toBe('boom')
  })

  it('stringifies anything else rather than losing it', () => {
    // The alternative is "[object Object]" in the one field the owner reads.
    expect(detailOf('plain string')).toBe('plain string')
    expect(detailOf(404)).toBe('404')
  })
})

describe('failureReport', () => {
  it('labels the failure so the field is readable at a glance', () => {
    expect(failureReport('the model is 46 MB')).toBe('Automatic shrink failed:\nthe model is 46 MB')
  })
})

describe('the CRITICAL fallbacks — the last thing before total silence', () => {
  it('carries BOTH errors when the failure report itself could not be written', () => {
    /*
     * If this write fails, the upload sits on "processing" forever and the owner is told
     * nothing at all. The original error is otherwise lost completely — which is what
     * happened while this path ended in a bare `.catch(() => {})`, twelve lines from the
     * machinery written to prevent exactly that.
     */
    const line = criticalReportFailure(42, 'artwork was torn', 'D1 unavailable')

    expect(line).toContain('CRITICAL')
    expect(line).toContain('42')
    expect(line).toContain('artwork was torn')
    expect(line).toContain('D1 unavailable')
    expect(line).toContain('appear stuck')
  })

  it('says a dead-lettered job will look stuck forever', () => {
    const line = criticalDeadLetterFailure('abc', 'CMS 500')

    expect(line).toContain('CRITICAL')
    expect(line).toContain('abc')
    expect(line).toContain('CMS 500')
    expect(line).toContain('stuck forever')
  })

  it('handles a numeric and a string id alike', () => {
    // Payload ids are `number | string` depending on the adapter.
    expect(criticalReportFailure('abc', 'x', 'y')).toContain('abc')
    expect(criticalReportFailure(7, 'x', 'y')).toContain('7')
  })
})
