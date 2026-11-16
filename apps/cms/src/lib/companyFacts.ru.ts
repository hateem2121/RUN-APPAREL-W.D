import { type CompanyFact, FACTS } from './companyFacts'
import { FAMILY_SINCE } from './press'

// Four sentences the FAQ already has are told once, there (faqs.ru.ts), and named here as well.
export {
  CERTIFICATION_LINES_RU,
  CERTIFICATION_PROMISE_RU,
  LEAD_TIME_RU,
  SHIPS_TO_RU,
} from './faqs.ru'

/**
 * Russian twin of `companyFacts.ts`: same names with `_RU`, same shapes, same order; prose
 * translated only. Every figure is the English one, read from the English constant (`FACTS`), so no
 * number is typed twice; the sentences whose figures sit in English words (`LEAD_TIME`,
 * `PAYMENT_TERMS`) read them in `faqs.ru.ts`. `FACTS_RU` keeps each `value` exactly as `FACTS`
 * has it. Durus is «родственная компания» (owner, 2026-11-04), never «материнская» or «дочерняя»;
 * every certificate keeps its holder and SMETA stays an audit. The sentences that `faqs.ru.ts`
 * already says (`SHIPS_TO_RU`, `CERTIFICATION_LINES_RU`, `CERTIFICATION_PROMISE_RU`,
 * `LEAD_TIME_RU`) are word for word the same here, so the site says each one way. Only the twins a
 * Russian page reads are here: `PRECISION_MACHINES`' and `CUTTING_LINES`' labels are written where
 * the about page shows them (`aboutPages.ru.ts`), and `CERTIFICATION` is read only by `llms.txt`,
 * which has no Russian twin (knip, 2026-11-15).
 */

/** The English `FACTS` value whose label starts with `prefix`. Throws if it is gone. */
function factValue(prefix: string): string {
  const found = FACTS.find((entry) => entry.label.startsWith(prefix))
  if (!found) throw new Error(`companyFacts.ru.ts: no fact "${prefix}"`)
  return found.value
}

/** `FACTS`, entry for entry: the English value, a Russian label. */
export const FACTS_RU: CompanyFact[] = [
  { value: factValue('Pieces per month'), label: 'Изделий в месяц' },
  { value: factValue('Minimum order'), label: 'Минимальный заказ на модель' },
  { value: factValue('Working days'), label: 'Рабочих дней до образца, обычно' },
  { value: factValue('People'), label: 'Человек на производстве' },
  { value: factValue('Sq m'), label: 'Кв. м под крышей' },
]

/** `LINEAGE`: a family trade since 1889, not a founding date. */
export const LINEAGE_RU =
  `Семья начала заниматься производством и экспортом в ${FAMILY_SINCE} году и занимается этим до сих пор. ` +
  'Названия компаний за это время менялись; корни — нет.'

/** `WHAT_WE_ARE`, in the nominative, so it reads after «RUN APPAREL —». */
export const WHAT_WE_ARE_RU =
  'производитель спортивной одежды под брендами заказчиков в Сиалкоте, Пакистан'

/** `WHAT_WE_MAKE`: the five families, in the words `families.ru.ts` and the buyer pages use. */
export const WHAT_WE_MAKE_RU =
  'командная форма, одежда для фитнеса, повседневная и верхняя одежда, спортивные аксессуары'

/**
 * The Organization structured data's `description` on a Russian page (owner, 2026-11-16: it carried
 * the English one, seen live on /ru/contact). The Russian twin of the sentence `structuredData.ts`
 * builds from `WHAT_WE_ARE` and `WHAT_WE_MAKE`; the figures are the same ones (50 pieces a style,
 * 100,000 a month, written with a non-breaking space as Russian print has it).
 */
export const ORGANIZATION_DESCRIPTION_RU =
  `RUN APPAREL — ${WHAT_WE_ARE_RU}. ` +
  `${WHAT_WE_MAKE_RU.charAt(0).toUpperCase()}${WHAT_WE_MAKE_RU.slice(1)} шьём под заказ от 50 изделий ` +
  'на модель, мощности — до 100 000 изделий в месяц. 3D-модель, которую заказчик может ' +
  'вращать и осматривать до раскроя образца, предоставляется по запросу.'
