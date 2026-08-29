import { describe, expect, it } from 'vitest'
import { MAX_QUOTED_ISSUES, specRefusal } from './specGate'

/**
 * The gate that refuses an invalid 3D file.
 *
 * ⚠️ WHAT THESE ASSERT IS THE WORDS, NOT THE NUMBERS. The audience is one non-technical
 * person deciding whether to publish a garment. "44 errors" is not actionable; "your file
 * was not saved, browsers would show it but other software may refuse it" is.
 */
describe('specRefusal', () => {
  const verdict = (over: Partial<Parameters<typeof specRefusal>[0]> = {}) => ({
    validatorVersion: '2.0.0-dev.3.10',
    errors: 0,
    warnings: 0,
    issues: [],
    ...over,
  })

  it('lets a clean file through', () => {
    expect(specRefusal(verdict())).toBeNull()
  })

  it('lets warnings through — they are reported, never blocking', () => {
    expect(specRefusal(verdict({ warnings: 12 }))).toBeNull()
  })

  it('refuses a file the validator calls invalid, and says it was not saved', () => {
    const message = specRefusal(verdict({ errors: 44 }))

    expect(message).toContain('44 errors')
    expect(message).toContain('not saved')
    expect(message).toContain('2.0.0-dev.3.10')
  })

  it('tells the owner the honest nuance: a browser will probably still show it', () => {
    /*
     * Without this the owner sees a garment that renders perfectly in the viewer and a
     * robot claiming it is broken, concludes the robot is wrong, and stops trusting the
     * gate. The whole defect is that browsers sniff the bytes and render anyway.
     */
    const message = specRefusal(verdict({ errors: 1 }))
    expect(message).toContain('browser would probably still show it')
    expect(message).toContain('entitled to refuse it')
  })

  it('gets the singular right, because "1 errors" reads like a bug in the tool', () => {
    expect(specRefusal(verdict({ errors: 1 }))).toContain('1 error from')
    expect(specRefusal(verdict({ errors: 2 }))).toContain('2 errors from')
  })

  it('quotes the actual problems rather than only a count', () => {
    const message = specRefusal(
      verdict({ errors: 2, issues: ["IMAGE_NON_ENABLED_MIME_TYPE at /images/0: 'image/webp'…"] }),
    )
    expect(message).toContain('IMAGE_NON_ENABLED_MIME_TYPE')
  })

  it(`quotes at most ${MAX_QUOTED_ISSUES}, because a broken file can carry hundreds`, () => {
    const issues = Array.from({ length: 40 }, (_, i) => `PROBLEM_${i}`)
    const message = specRefusal(verdict({ errors: 300, issues })) ?? ''

    expect(message).toContain('300 errors')
    expect((message.match(/PROBLEM_/g) ?? []).length).toBe(MAX_QUOTED_ISSUES)
  })

  it('still refuses when the container sent no issue list, only a count', () => {
    // Counts and the quoted list are independent; a refusal must not depend on the list.
    const message = specRefusal(verdict({ errors: 7, issues: [] }))
    expect(message).toContain('7 errors')
    expect(message).not.toContain('The first problems are')
  })

  it('refuses even when the container omitted the issue list entirely', () => {
    // Not the same as an empty array: an older container may send a count and no list.
    const message = specRefusal({ validatorVersion: '2.0.0', errors: 3, warnings: 0 })
    expect(message).toContain('3 errors')
    expect(message).not.toContain('The first problems are')
  })

  it('⚠️ FAILS OPEN on an absent verdict, so an old container does not refuse every job', () => {
    /*
     * THE MOST IMPORTANT TEST HERE, and the one most likely to be "tidied" away by
     * someone who thinks failing closed is safer. `spec` is missing from every container
     * image built before 2026-08-29. If absent read as invalid, deploying this would
     * refuse EVERY garment until the image rolled forward — turning a reporting gap into
     * a full outage of the upload path. The artwork gates make the same choice.
     */
    expect(specRefusal(undefined)).toBeNull()
  })
})
