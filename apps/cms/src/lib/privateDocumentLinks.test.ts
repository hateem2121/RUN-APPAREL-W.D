import { describe, expect, it } from 'vitest'
import { DOCUMENTS } from '../../../../infra/apex-404/documents.js'
import { Products } from '../collections/Products'
import { CatalogueDefaults } from '../globals/CatalogueDefaults'
import { SiteSettings } from '../globals/SiteSettings'
import {
  PRIVATE_DOCUMENT_HOSTS,
  PRIVATE_LINK_MESSAGE,
  privateDocumentLinkError,
  validateCatalogueUrl,
} from './privateDocumentLinks'

/**
 * The three "Catalogue link" fields are PUBLIC: the product API
 * (`/api/public/viewer/:product/:colourway`) emits `catalogueUrl` twice, measured
 * 2026-09-11. The most likely way a private document link leaks is not an attacker — it
 * is someone pasting the new link into the field whose label says "Catalogue link".
 * These tests keep that from saving.
 */
type Field = {
  name?: string
  validate?: (value: unknown) => unknown
  fields?: Field[]
  tabs?: { fields: Field[] }[]
}

/** A named field anywhere in a Payload field tree, tabs and groups included. */
function findField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if (field.name === name) return field
    const nested = [...(field.fields ?? []), ...(field.tabs ?? []).flatMap((tab) => tab.fields)]
    const found = nested.length > 0 ? findField(nested, name) : undefined
    if (found) return found
  }
  return undefined
}

const PRIVATE = 'https://catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv-uuuu'

describe('privateDocumentLinkError', () => {
  it('guards exactly the hosts the Worker serves', () => {
    expect([...PRIVATE_DOCUMENT_HOSTS].sort()).toEqual(
      Object.values(DOCUMENTS)
        .map((doc) => doc.host)
        .sort(),
    )
  })

  it.each([
    PRIVATE,
    'http://PROFILE.wear-run.help/tttt-ssss-rrrr-qqqq-pppp-oooo',
    'catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv-uuuu',
    'https://catalogue.wear-run.help./anything',
    '  https://profile.wear-run.help  ',
  ])('refuses %j', (value) => {
    expect(privateDocumentLinkError(value)).toBe(PRIVATE_LINK_MESSAGE)
  })

  it.each([
    'https://wear-run.help/catalogue',
    'https://viewer.wear-run.help/rxps/wine',
    'https://catalogue.wear-run.help.example.com/',
    '',
    42,
    undefined,
  ])('lets %j through to the other rules', (value) => {
    expect(privateDocumentLinkError(value)).toBeNull()
  })
})

describe('validateCatalogueUrl', () => {
  it('keeps the rules the fields already had', () => {
    expect(validateCatalogueUrl('https://wear-run.help/catalogue')).toBe(true)
    expect(validateCatalogueUrl('')).toBe('A catalogue link is required.')
    expect(validateCatalogueUrl(undefined)).toBe('A catalogue link is required.')
    expect(validateCatalogueUrl('/catalogue')).toContain('https://')
  })

  it('refuses a private document link before anything else', () => {
    expect(validateCatalogueUrl(PRIVATE)).toBe(PRIVATE_LINK_MESSAGE)
  })
})

describe('all three public catalogue link fields use it', () => {
  it.each([
    ['Products', () => findField(Products.fields as Field[], 'catalogueUrl')],
    ['CatalogueDefaults', () => findField(CatalogueDefaults.fields as Field[], 'catalogueUrl')],
    ['SiteSettings', () => findField(SiteSettings.fields as Field[], 'catalogueUrl')],
  ])('%s refuses a private link and accepts an ordinary one', (_name, find) => {
    const validate = find()?.validate
    expect(validate, 'the catalogueUrl field has no validate').toBeTypeOf('function')
    expect(validate?.(PRIVATE)).toBe(PRIVATE_LINK_MESSAGE)
    expect(validate?.('https://wear-run.help/contact')).toBe(true)
  })

  it('the field finder can actually fail (negative control)', () => {
    expect(findField([{ name: 'a', tabs: [{ fields: [{ name: 'b' }] }] }], 'b')?.name).toBe('b')
    expect(findField([{ name: 'a' }], 'catalogueUrl')).toBeUndefined()
  })
})
