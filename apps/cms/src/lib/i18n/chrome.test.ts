import {
  CONSENT_COPY,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
  SITE_MENU_NAME,
  SITE_NAV_LABEL,
  SITE_NAV_LINKS,
} from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { CHROME, ruHref } from './chrome'

const CYRILLIC = /[Ѐ-ӿ]/

describe('the chrome words in two languages (Russian section, 2026-11-15)', () => {
  it('English is the shared constants themselves, so the English site cannot change', () => {
    expect(CHROME.en.navLinks).toBe(SITE_NAV_LINKS)
    expect(CHROME.en.footer).toBe(SITE_FOOTER_WORDS)
    expect(CHROME.en.footerLinks).toBe(SITE_FOOTER_LINKS)
    expect(CHROME.en.made).toBe(SITE_FOOTER_MADE)
    expect(CHROME.en.consent).toBe(CONSENT_COPY)
    expect(CHROME.en.skipLink).toBe('Skip to main content')
    expect(CHROME.en.navLabel).toBe(SITE_NAV_LABEL)
    expect(CHROME.en.menuName).toBe(SITE_MENU_NAME)
  })

  it('Russian has every key English has, in every group', () => {
    expect(Object.keys(CHROME.ru).sort()).toEqual(Object.keys(CHROME.en).sort())
    expect(Object.keys(CHROME.ru.footer).sort()).toEqual(Object.keys(CHROME.en.footer).sort())
    expect(Object.keys(CHROME.ru.consent).sort()).toEqual(Object.keys(CHROME.en.consent).sort())
  })

  it('every Russian link is its English link’s /ru twin, in the same order', () => {
    for (const group of [
      'navLinks',
      'menuLinks',
      'footerLinks',
      'made',
      'company',
      'learn',
    ] as const) {
      expect(
        CHROME.ru[group].map((link) => link.href),
        group,
      ).toEqual(CHROME.en[group].map((link) => ruHref(link.href)))
    }
    expect(ruHref('/privacy#cookies')).toBe('/ru/privacy#cookies')
    expect(ruHref('/')).toBe('/ru')
  })

  it('every Russian label is Russian, except the time zone and the language link', () => {
    const labels = [
      ...['navLinks', 'menuLinks', 'footerLinks', 'made', 'company', 'learn'].flatMap((group) =>
        CHROME.ru[group as 'navLinks'].map((link) => link.label),
      ),
      ...Object.entries(CHROME.ru.footer)
        .filter(([key]) => key !== 'clockZone')
        .map(([, value]) => value),
      ...Object.values(CHROME.ru.consent),
      CHROME.ru.skipLink,
      CHROME.ru.menuName,
    ]
    for (const label of labels) expect(label, label).toMatch(CYRILLIC)
    expect(CHROME.ru.otherLanguage.label).toBe('English')
  })

  it('names the next opening day in Russian', () => {
    expect(CHROME.ru.opensAt('09:00', 'Mon')).toBe('Откроемся пн в 09:00 PKT')
    expect(CHROME.ru.opensAt('09:00')).toBe('Откроемся в 09:00 PKT')
    expect(CHROME.en.opensAt('09:00', 'Mon')).toBe('Opens Mon 09:00 PKT')
  })
})
