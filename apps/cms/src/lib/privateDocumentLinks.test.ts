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
    // 2026-09-15: parsing the trimmed text as ONE url missed every one of these — the
    // private host was still in the text, just not where a single `new URL()` looked.
    'Catalogue: https://catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv-uuuu',
    'https://example.com/go?next=https://catalogue.wear-run.help/zzzz-yyyy',
    'https://wear-run.help/contact https://profile.wear-run.help/tttt-ssss-rrrr',
    'catalogue.wear-run.help:443/zzzz-yyyy-xxxx-wwww-vvvv-uuuu',
    // 2026-09-16 (re-review, New Breakage — this fix's own regression). Each of these
    // four is a host-NORMALISATION look-alike: a browser's `new URL()` resolves every
    // one to the exact private hostname, but the plain lower-cased text scan above
    // never sees "catalogue.wear-run.help" as a literal substring, so all four saved
    // once the earlier `new URL(text).hostname` parse was removed in favour of the
    // text scan alone.
    'https://catalogue%2ewear-run.help/x',
    'https://catalogue。wear-run.help/x',
    'https://cata­logue.wear-run.help/x',
    'https://ｃatalogue.wear-run.help/x',
    // The Outlook Safe Links shape: the private host is percent-encoded inside
    // ANOTHER host's query string. One percent-decode pass turns %3A%2F%2F back into
    // "://", and the literal private host then matches the plain text scan.
    'https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcatalogue.wear-run.help%2Fx&data=1',
  ])('refuses %j', (value) => {
    expect(privateDocumentLinkError(value)).toBe(PRIVATE_LINK_MESSAGE)
  })

  /**
   * A negative control MUST run both ways (root CLAUDE.md). The "refuses %j" case
   * above proves the REAL guard catches the Safe Links shape; this proves a guard
   * reduced to text-scan-only (a) — without percent-decoding (b) or URL-token
   * hostname parsing (c) — would NOT: it recreates pattern (a) alone, locally, rather
   * than reaching into the module's internals.
   */
  describe('negative control: text-scan-only would let the Safe Links shape save', () => {
    it('the plain host pattern, with no decoding and no URL-token parse, does not match it', () => {
      const textScanOnly = new RegExp(
        `(?<![a-z0-9.-])(?:${PRIVATE_DOCUMENT_HOSTS.map((host) => host.replace(/\./g, '\\.')).join('|')})\\.?(?![a-z0-9.-])`,
      )
      const safeLinks =
        'https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcatalogue.wear-run.help%2Fx&data=1'
      expect(textScanOnly.test(safeLinks.toLowerCase())).toBe(false)
    })
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
