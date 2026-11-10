import { describe, expect, it } from 'vitest'
import { mailboxKey, RECEIPTS_PER_DAY, receiptAllowed } from './inquiryReceipt'

describe('mailboxKey — one key per inbox', () => {
  it.each([
    ['Victim@Example.com', 'victim@example.com'],
    ['victim+1@example.com', 'victim@example.com'],
    ['victim+a+b@EXAMPLE.com', 'victim@example.com'],
    ['V.Ic.Tim@gmail.com', 'victim@gmail.com'],
    ['victim@googlemail.com', 'victim@gmail.com'],
    [' victim@example.com ', 'victim@example.com'],
  ])('%j → %j', (email, key) => {
    expect(mailboxKey(email)).toBe(key)
  })

  // The control: dots are folded ONLY at Gmail, where Google ignores them. Elsewhere a dot can be
  // a different person's mailbox.
  it('keeps the dots at any other provider', () => {
    expect(mailboxKey('j.smith@company.example')).not.toBe(mailboxKey('jsmith@company.example'))
  })
})

describe('receiptAllowed', () => {
  it('the first inquiry from a mailbox in a day gets one', () => {
    expect(receiptAllowed('dana@northfield.example', [])).toBe(true)
    expect(receiptAllowed('dana@northfield.example', ['other@example.com'])).toBe(true)
  })

  it('no second one, however the address is spelt', () => {
    for (const earlier of ['Dana@Northfield.example', 'dana+quote@northfield.example']) {
      expect(receiptAllowed('dana@northfield.example', [earlier]), earlier).toBe(false)
    }
    expect(receiptAllowed('d.a.n.a@gmail.com', ['dana+1@googlemail.com'])).toBe(false)
  })

  it('none at all once the site has had a day’s ceiling of inquiries', () => {
    const many = Array.from({ length: RECEIPTS_PER_DAY }, (_, i) => `robot${i}@example.com`)
    expect(receiptAllowed('fresh@example.com', many)).toBe(false)
    expect(receiptAllowed('fresh@example.com', many.slice(1))).toBe(true)
  })

  it('none when the earlier inquiries could not be read', () => {
    expect(receiptAllowed('dana@northfield.example', null)).toBe(false)
  })
})
