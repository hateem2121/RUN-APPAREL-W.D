import { describe, expect, it } from 'vitest'
import { stripUntilStable } from '../../../scripts/strip-until-stable.mjs'

/**
 * Removing markup in ONE pass can leave markup behind: taking out an inner comment can
 * join the pieces around it into a new one. GitHub's code scan flags that
 * (js/incomplete-multi-character-sanitization, 2026-10-01). Repeating until the text
 * stops changing cannot leave a match.
 */
describe('stripUntilStable', () => {
  const COMMENT = /<!--[\s\S]*?-->/g

  it('removes a comment that a single pass would leave behind', () => {
    // One pass over '<!-<!-- a -->- b -->c' removes the inner comment and leaves
    // '<!-- b -->c' — a brand-new comment. (Not re-run here: a one-pass strip in the
    // code is the very pattern the code scan flags.) Both must end as plain text.
    expect(stripUntilStable('<!-<!-- a -->- b -->c', COMMENT, '')).toBe('c')
    expect(stripUntilStable('<!-- b -->c', COMMENT, '')).toBe('c')
  })

  it('leaves ordinary text alone', () => {
    expect(stripUntilStable('MOQ <!-- -->50', COMMENT, '')).toBe('MOQ 50')
    expect(stripUntilStable('no markup here', COMMENT, '')).toBe('no markup here')
  })
})
