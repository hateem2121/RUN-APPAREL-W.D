import type { ABOUT, AboutPoint } from './aboutCopy'
import { FACTS } from './companyFacts'

/**
 * Russian twin of `aboutCopy.ts` (`ABOUT`, `LINEAGE_HERE`): same shape, same order; translate prose
 * only. Durus is «родственная компания» (owner, 2026-11-04). Each point's figure is the English
 * one, the floor area read from `FACTS`; "Six" is a word, so it is translated.
 */

const FLOOR = FACTS.find((fact) => fact.label.startsWith('Sq m'))

export const LINEAGE_HERE_RU =
  'Семья непрерывно занимается производством и экспортом с самого начала. Названия компаний ' +
  'за это время менялись; корни — нет.'

type AboutCopy = {
  readonly [K in Exclude<keyof typeof ABOUT, 'points'>]: string
} & { readonly points: readonly AboutPoint[] }

export const ABOUT_RU: AboutCopy = {
  heading: 'Семья производителей,',
  // Tied with a non-breaking space, as the English accent is.
  accent: 'из поколения в поколение.',
  lede: `RUN APPAREL шьёт одежду под брендами заказчиков в Сиалкоте, Пакистан. ${LINEAGE_HERE_RU}`,
  body:
    'Мы шьём ваш заказ в шести зданиях нашей родственной компании DURUS INDUSTRIES в ' +
    'Сиалкоте. Раскрой, печать, пошив, контроль и упаковка — всё в одном месте.',
  points: [
    { value: '1889', label: 'Семейное производство с', labelFirst: true },
    { value: 'Шесть', label: 'Зданий — от первого стежка до запаянного пакета' },
    { value: FLOOR?.value ?? '', label: 'Кв. м под крышей', countUp: true },
    {
      prefix: 'Около',
      value: '83%',
      label: 'Нашей электроэнергии — от солнечных панелей на крыше',
      countUp: true,
    },
  ],
}
