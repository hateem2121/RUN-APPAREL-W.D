import { describe, expect, it } from 'vitest'
import { CONSENT_COPY } from './consent'
import { SITE_NAV_LINKS } from './siteBar'
import { CHROME_EN, isRussianPath, localeOf, ruHref, ruPath } from './siteChrome'
import {
  CHROME,
  CHROME_RU,
  FAMILY_RU,
  FOOTER_RU,
  ruFooter,
  RU_MENU_LINKS,
  RU_NAV_LINKS,
} from './siteChrome.ru'
import { SITE_FOOTER_WORDS } from './siteFooter'

const CYRILLIC = /[Ѐ-ӿ]/

/** The site's two languages and its own words in both (moved here from apps/cms on 2026-11-16). */
describe('the site chrome in two languages', () => {
  it('tells a Russian path from an English one, and not /rugby', () => {
    expect(isRussianPath('/ru')).toBe(true)
    expect(isRussianPath('/ru/products/rxps/wine')).toBe(true)
    expect(isRussianPath('/rugby')).toBe(false)
    expect(isRussianPath(null)).toBe(false)
    expect(localeOf('/ru/contact')).toBe('ru')
    expect(localeOf('/contact')).toBe('en')
  })

  it('builds the Russian twin of a path, keeping a #fragment', () => {
    expect(ruPath('/')).toBe('/ru')
    expect(ruPath('/guides')).toBe('/ru/guides')
    expect(ruHref('/privacy#cookies')).toBe('/ru/privacy#cookies')
    expect(ruHref('/')).toBe('/ru')
  })

  it('English is the shared constants; Russian has the same keys and Russian words', () => {
    expect(CHROME.en).toBe(CHROME_EN)
    expect(CHROME.ru).toBe(CHROME_RU)
    expect(CHROME_EN.navLinks).toBe(SITE_NAV_LINKS)
    expect(CHROME_EN.consent).toBe(CONSENT_COPY)
    expect(Object.keys(CHROME_RU).sort()).toEqual(Object.keys(CHROME_EN).sort())
    expect(CHROME_RU.consent.text).toMatch(CYRILLIC)
    for (const link of [...RU_NAV_LINKS, ...RU_MENU_LINKS, ...CHROME_RU.company]) {
      expect(link.href).toMatch(/^\/ru\//)
      expect(link.label).toMatch(CYRILLIC)
    }
    expect(FAMILY_RU.Sportswear).toBe('Спортивная одежда')
  })

  it('writes the loading and opening lines in each language', () => {
    expect(CHROME_EN.loadingPage('Contact')).toBe('Loading Contact…')
    expect(CHROME_RU.loadingPage('Контакты')).toBe('Загрузка: Контакты…')
    expect(CHROME_EN.opensAt('08:00')).toBe(`Opens 08:00 ${SITE_FOOTER_WORDS.clockZone}`)
    expect(CHROME_EN.opensAt('08:00', 'Mon')).toBe(`Opens Mon 08:00 ${SITE_FOOTER_WORDS.clockZone}`)
    expect(CHROME_RU.opensAt('08:00', 'Mon')).toBe(
      `Откроемся пн в 08:00 ${SITE_FOOTER_WORDS.clockZone}`,
    )
    expect(CHROME_RU.opensAt('08:00')).toBe(`Откроемся в 08:00 ${SITE_FOOTER_WORDS.clockZone}`)
  })

  it('translates a CMS footer line only when its exact English is known', () => {
    const [english, russian] = Object.entries(FOOTER_RU)[0]!
    expect(ruFooter(english)).toBe(russian)
    expect(ruFooter('A line typed today')).toBe('A line typed today')
  })
})
