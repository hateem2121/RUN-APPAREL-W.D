import { describe, expect, it } from 'vitest'
import { formResult } from './formResult'
import { PROGRESS_HEADER } from './inquiryForm'

const RESULT = new URL('https://wear-run.com/contact?sent=1#inquiry-done')
const post = (headers: Record<string, string> = {}) =>
  new Request('https://wear-run.com/contact/submit', { method: 'POST', headers })

describe('formResult', () => {
  it('redirects a plain form post with 303, anchor and all', () => {
    const res = formResult(post(), RESULT)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(RESULT.href)
  })

  it("gives the page's own upload the same address as data, anchor kept", async () => {
    const res = formResult(post({ [PROGRESS_HEADER]: '1' }), RESULT)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ to: '/contact?sent=1#inquiry-done' })
  })

  it('keeps a refusal code, so the page lands on the problem panel', async () => {
    const refused = new URL('https://wear-run.com/contact?error=files&reason=type#inquiry-problem')
    const res = formResult(post({ [PROGRESS_HEADER]: '1' }), refused)
    expect(await res.json()).toEqual({ to: '/contact?error=files&reason=type#inquiry-problem' })
  })

  // NEGATIVE CONTROL: only the exact value switches it, so a stray header cannot.
  it('treats any other value of the header as a plain post', () => {
    expect(formResult(post({ [PROGRESS_HEADER]: 'yes' }), RESULT).status).toBe(303)
  })
})
