import { describe, expect, it } from 'vitest'
import { DEAD_LETTER_QUEUE, deadLetterReport } from './deadLetter'

/**
 * `glb-shrink-dlq` was configured on 2026-07-24 and never consumed by anything.
 * A job that failed three times therefore left the raw-upload row saying
 * "Automatic shrink failed" with whatever the LAST transient error happened to
 * be — usually a timeout — and no indication that the system had given up
 * entirely. The owner's only clue that retrying was pointless was that nothing
 * ever changed again.
 */
describe('deadLetterReport', () => {
  it('says plainly that the system has stopped trying', () => {
    const text = deadLetterReport('Container returned 500: out of memory')
    expect(text).toMatch(/stopped trying|gave up|no longer/i)
  })

  it('keeps the underlying error, because that is what a developer needs', () => {
    expect(deadLetterReport('Container returned 500: out of memory')).toContain('out of memory')
  })

  it('tells the owner the one thing they can actually do', () => {
    expect(deadLetterReport('boom')).toMatch(/Retry/i)
  })

  it('survives a missing error without printing "undefined" at someone', () => {
    const text = deadLetterReport(undefined)
    expect(text).not.toMatch(/undefined/)
    expect(text.length).toBeGreaterThan(40)
  })

  it('names the queue it is configured against, so the two cannot drift', () => {
    expect(DEAD_LETTER_QUEUE).toBe('glb-shrink-dlq')
  })
})
