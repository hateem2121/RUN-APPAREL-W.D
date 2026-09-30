import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { Products } from './collections/Products'

/**
 * The help text under a product's fields shows people what their link will look like.
 * Garment pages moved to wear-run.com/products/<product>/<colour> on 2026-09-28, but two
 * of those examples still said "wear-run.help/n001/navy" on 2026-09-30 — a host that now
 * only forwards, and a product that no longer exists. This walks the REAL collection
 * config, every tab and the colour rows inside it, rather than searching source files.
 */

/** Every string `admin.description` in a field tree, with the field's name. */
function descriptions(fields: Field[]): Array<{ name: string; text: string }> {
  const found: Array<{ name: string; text: string }> = []
  for (const field of fields) {
    const description = (field as { admin?: { description?: unknown } }).admin?.description
    const name = 'name' in field ? String(field.name) : field.type
    if (typeof description === 'string') found.push({ name, text: description })
    if ('fields' in field && Array.isArray(field.fields)) {
      found.push(...descriptions(field.fields as Field[]))
    }
    if (field.type === 'tabs') {
      for (const tab of field.tabs) found.push(...descriptions(tab.fields))
    }
  }
  return found
}

/** A product-and-colour link on the old host, e.g. wear-run.help/n001/navy. */
const OLD_GARMENT_LINK = /\bwear-run\.help\/[a-z0-9-]+\/[a-z0-9-]+/i

describe('the link examples in a product’s help text', () => {
  const all = descriptions(Products.fields)

  it('finds the help text it is meant to check — negative control for the walk', () => {
    // Both web-address fields, the product's and the colour row's, must be reached.
    expect(all.filter((entry) => entry.name === 'slug')).toHaveLength(2)
    expect(OLD_GARMENT_LINK.test('link and QR codes: wear-run.help/n001/navy.')).toBe(true)
  })

  it('shows no garment link on the old wear-run.help address', () => {
    expect(all.filter((entry) => OLD_GARMENT_LINK.test(entry.text))).toEqual([])
  })

  it('shows the current shape, wear-run.com/products/<product>/<colour>', () => {
    for (const entry of all.filter((item) => item.name === 'slug')) {
      expect(entry.text).toMatch(/wear-run\.com\/products\/[a-z0-9-]+\/[a-z0-9-]+/)
    }
  })
})
