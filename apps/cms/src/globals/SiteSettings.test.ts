import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { SiteSettings } from './SiteSettings'

/**
 * The global's field defaults and `DEFAULT_SITE_SETTINGS` (`packages/shared/src/defaults.ts`) say
 * the same thing twice: what a new CMS starts with, and what the website, the garment pages, the
 * error page and the 404 show when the CMS cannot be read. That file asked for the two to be kept
 * in sync by hand. On 2026-10-11 the contact address changed in both (partner@ → inquiry@, owner),
 * and this is what makes a change to one copy without the other fail.
 */
describe('SiteSettings global', () => {
  const defaults = new Map(
    (SiteSettings.fields as { name?: string; defaultValue?: unknown }[]).map((field) => [
      field.name,
      field.defaultValue,
    ]),
  )

  it.each([
    'companyName',
    'email',
    'whatsappNumber',
    'temporaryWordmark',
    'footerLine',
    'legalLine',
  ] as const)('starts %s where the site falls back to when the CMS is unreachable', (key) => {
    expect(defaults.get(key)).toBe(DEFAULT_SITE_SETTINGS[key])
  })

  // Retired in place (owner, 2026-10-24): the column is NOT NULL, so the field and its default
  // stay, hidden; it is no longer published, so it has no fallback to agree with.
  it('keeps the retired catalogue link, hidden, with its old default', () => {
    const field = (
      SiteSettings.fields as {
        name?: string
        defaultValue?: unknown
        admin?: { hidden?: boolean }
      }[]
    ).find((f) => f.name === 'catalogueUrl')
    expect(field?.defaultValue).toBe('https://wear-run.help/catalogue')
    expect(field?.admin?.hidden).toBe(true)
    expect(DEFAULT_SITE_SETTINGS).not.toHaveProperty('catalogueUrl')
  })
})
