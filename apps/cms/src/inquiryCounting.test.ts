import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * An inquiry is COUNTED as well as stored — audit FA-I-16.
 *
 * The finding was "the viewer counts, the site does not": every enquiry button on a
 * garment page raises a `run:analytics` event that `apps/viewer/src/lib/telemetry.ts`
 * ships to `POST /api/public/events`, and the marketing site recorded nothing at all.
 * Since the contact form landed (D3) that is no longer true of the substance — an inquiry
 * is a row in `inquiries`, which is strictly more than a count — but the two surfaces
 * still reported into different places, so "did the website produce any leads this
 * month?" had two answers in two systems. The submit route now writes an `events` row
 * too.
 *
 * ⚠️ THIS IS A SOURCE SCAN, AND THE REASON IS WORTH STATING RATHER THAN APOLOGISING FOR.
 * The behaviour is one `payload.create` inside a route handler that also opens D1, sends
 * email and redirects. The browser suite can submit the form — `e2e/inquiry.spec.ts` does
 * — but cannot read the row back: `Events.read` refuses anonymous requests, which is
 * correct and is not going to change for a test. What is left that can be checked
 * mechanically is the SHAPE of what is written, and that happens to be the half where the
 * mistake would matter.
 *
 * ⚠️ SO THE LOAD-BEARING ASSERTION IS THE NEGATIVE ONE. `inquiries` is behind
 * authentication; `Events` is read by anyone who can read events. Copying the name, the
 * email or the message into the count — the obvious "while we're here" edit — would move
 * a visitor's details from the guarded collection into the open one, and nothing about
 * that would look wrong in a diff.
 */

const ROUTE = join(import.meta.dirname, 'app', '(frontend)', 'contact', 'submit', 'route.ts')

/** Comments blanked, for the reason publicSite.test.ts records: prose is not code. */
function code(): string {
  return readFileSync(ROUTE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the submit route counts an inquiry', () => {
  it('writes an events row', () => {
    const source = code()
    expect(
      source,
      'the submit route no longer writes to `events`. An inquiry is still STORED, so ' +
        'nothing is lost — but the site stops reporting alongside the viewer and ' +
        '"how many leads did the website produce" needs two systems again (FA-I-16).',
    ).toMatch(/collection:\s*'events'/)
  })

  it('files it as analytics, from the form, under a stable event name', () => {
    const source = code()
    const block = /collection:\s*'events',\s*data:\s*\{([^}]*)\}/.exec(source)?.[1] ?? ''
    expect(block, 'no events payload found to check').not.toBe('')
    expect(block).toMatch(/type:\s*'analytics'/)
    expect(block).toMatch(/event:\s*'inquiry_submitted'/)
    expect(block).toMatch(/placement:\s*'site-contact-form'/)
  })

  /*
   * The one that matters. See the file header: `inquiries` is authenticated and `Events`
   * is not, so a field copied across here is a disclosure, not a duplication.
   */
  it.each(['name', 'email', 'message', 'company'])(
    'never copies the visitor’s %s into the open Events collection',
    (field) => {
      const block = /collection:\s*'events',\s*data:\s*\{([^}]*)\}/.exec(code())?.[1] ?? ''
      expect(block).not.toMatch(new RegExp(`\\b${field}\\b`))
      expect(block).not.toMatch(/result\.value/)
    },
  )

  /*
   * The count runs AFTER the inquiry is stored and the visitor has been served, so it can
   * never be the reason a lead is lost. Without the catch, a D1 wobble on this one write
   * would turn a successfully-stored inquiry into a 500 and tell the visitor to try again
   * — the worst possible outcome for the one action this whole site exists to produce.
   */
  it('cannot fail the request', () => {
    const source = code()
    const at = source.search(/collection:\s*'events'/)
    expect(at).toBeGreaterThan(0)
    const before = source.slice(0, at)
    // The inquiry is stored first...
    expect(before).toMatch(/collection:\s*'inquiries'/)
    // ...and the count sits inside a try, whose catch does not rethrow.
    const tail = source.slice(before.lastIndexOf('try {'))
    expect(tail).toMatch(/catch\s*\(?\w*\)?\s*\{/)
    expect(tail.slice(0, tail.indexOf('return'))).not.toMatch(/throw\b/)
  })
})
