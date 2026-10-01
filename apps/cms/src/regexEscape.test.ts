import { describe, expect, it } from 'vitest'
import { escapeRegExp } from '../regexEscape.mjs'
import { hostPattern } from '../siteHostRules.mjs'

/**
 * Text turned into a regular expression must have EVERY special character escaped, not
 * only the dot. GitHub's code scan (CodeQL, js/incomplete-sanitization) flagged the two
 * dot-only escapes on 2026-10-01: today's hosts hold only letters, digits, dots and
 * hyphens, so nothing was exploitable, but the next host or pattern added might not.
 */
describe('escapeRegExp', () => {
  it('escapes every character a regular expression treats specially', () => {
    // Built from single characters: a literal `$` followed by `{` trips biome's
    // noTemplateCurlyInString, as the DEPLOY_MESSAGE control in workflowHardening records.
    const special = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'].join('')
    expect(new RegExp(`^${escapeRegExp(special)}$`).test(special)).toBe(true)
    expect(escapeRegExp(special)).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
  })

  it('leaves a plain hostname readable, so built patterns do not change', () => {
    expect(escapeRegExp('cms.wear-run.help')).toBe('cms\\.wear-run\\.help')
  })
})

describe('hostPattern', () => {
  it('matches exactly one host, even one holding a regex character', () => {
    expect(hostPattern('wear-run.com')).toBe('^wear-run\\.com$')
    const pattern = new RegExp(hostPattern('a+b.com'))
    expect(pattern.test('a+b.com')).toBe(true)
    expect(pattern.test('aab.com')).toBe(false)
  })
})
