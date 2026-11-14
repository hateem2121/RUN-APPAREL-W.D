import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Inquiries } from './Inquiries'

/**
 * An inquiry's stage (owner, 2026-11-15): "Qualified", "Sample sent" and "Ordered" join "New",
 * "Replied" and "Archived", so the team can see which inquiries became orders, the one number
 * that says whether the site earns work. Before that day the list stopped at "Replied".
 *
 * What would have to break for these to fail: a stage dropped or renamed (its stored value is
 * what old rows keep), the stages out of an order's order, the spam stage moved off the end, or
 * the generated types not carrying a new value (the admin would refuse to save it).
 */
const status = Inquiries.fields.find((field) => 'name' in field && field.name === 'status')
const options =
  status && 'options' in status
    ? status.options.map((option) => (typeof option === 'string' ? option : option.value))
    : []

describe('an inquiry’s stage (2026-11-15)', () => {
  it('runs from New to Ordered, then Archived, with Spam last', () => {
    expect(options).toEqual([
      'new',
      'replied',
      'qualified',
      'sample-sent',
      'ordered',
      'archived',
      'spam',
    ])
    expect(status && 'defaultValue' in status ? status.defaultValue : null).toBe('new')
  })

  it('names the three new stages in plain words', () => {
    const labels =
      status && 'options' in status
        ? status.options.map((option) => (typeof option === 'string' ? option : option.label))
        : []
    expect(labels).toEqual(expect.arrayContaining(['Qualified', 'Sample sent', 'Ordered']))
  })

  // Plain text in D1 (20260907_120000_add_inquiries.ts), so no migration; the types are by hand.
  it('the generated types carry every stage', () => {
    const types = readFileSync(join(import.meta.dirname, '..', 'payload-types.ts'), 'utf8')
    const line = types.match(/status: 'new' \|[^;]*;/)?.[0] ?? ''
    for (const value of options) expect(line, value).toContain(`'${value}'`)
  })
})
