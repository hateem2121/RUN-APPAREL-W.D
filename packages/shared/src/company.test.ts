import { describe, expect, it } from 'vitest'
import { formatAddress, POSTAL_ADDRESS } from './company'

describe('formatAddress', () => {
  it('prints the one-line address both footers show', () => {
    expect(formatAddress()).toBe('13 Km Daska Road, Sialkot, 51040, Pakistan')
  })

  it('is built from POSTAL_ADDRESS, not typed twice', () => {
    expect(formatAddress()).toContain(POSTAL_ADDRESS.street)
    expect(formatAddress()).toContain(POSTAL_ADDRESS.postalCode)
    expect(POSTAL_ADDRESS.country).toBe('PK')
  })
})
