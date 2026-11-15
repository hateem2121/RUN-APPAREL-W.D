import { type CompanyFact, FACTS, LEAD_TIME, PAYMENT_TERMS } from './companyFacts'
import { FAMILY_SINCE } from './press'

// Seven sentences the FAQ already has are told once, there (faqs.ru.ts), and named here as well.
export {
  CERTIFICATION_LINES_RU,
  CERTIFICATION_PROMISE_RU,
  LEAD_TIME_RU,
  PAYMENT_TERMS_RU,
  RELATIONSHIP_RU,
  SAMPLE_TIME_RU,
  SHIPS_TO_RU,
} from './faqs.ru'

/**
 * Russian twin of `companyFacts.ts`: same names with `_RU`, same shapes, same order; prose
 * translated only. Every figure is the English one, read from the English constant (`FACTS`), or,
 * where the English constant is words (`LEAD_TIME`, `PAYMENT_TERMS`), out of that constant's own
 * text (`figureIn`), so no number is typed twice. `FACTS_RU` keeps each `value` exactly as `FACTS`
 * has it. Durus is «родственная компания» (owner, 2026-11-04), never «материнская» or «дочерняя»;
 * every certificate keeps its holder and SMETA stays an audit. The sentences that `faqs.ru.ts`
 * already says (`SHIPS_TO_RU`, `CERTIFICATION_LINES_RU`, `CERTIFICATION_PROMISE_RU`,
 * `PAYMENT_TERMS_RU`, `LEAD_TIME_RU`, `SAMPLE_TIME_RU`, `RELATIONSHIP_RU`) are word for word the
 * same here, so the site says each one way.
 */

/** The figure at `index` in an English constant's words. Throws at build if the words lose it. */
function figureIn(text: string, index = 0): string {
  const found = text.match(/\d[\d,]*/g)?.[index]
  if (found === undefined) throw new Error(`companyFacts.ru.ts: no figure ${index} in "${text}"`)
  return found
}

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

/** `PRECISION_MACHINES`. */
export const PRECISION_MACHINES_RU: CompanyFact = { value: '200+', label: 'Высокоточных машин' }

/** `CUTTING_LINES`. */
export const CUTTING_LINES_RU: CompanyFact = { value: '3', label: 'Линии раскроя' }

/** `CERTIFICATION`: the owner's paragraph, every holder named, SMETA an audit. */
export const CERTIFICATION_RU =
  'RUN APPAREL не имеет сертификатов и аудитов на собственное имя. Наша родственная компания ' +
  'DURUS INDUSTRIES зарегистрирована в SEDEX и прошла аудит SMETA, а мы шьём одежду в её зданиях. ' +
  'Наши поставщики тканей и фурнитуры имеют сертификаты ISO 9001, OEKO-TEX и GRS, а также прошли ' +
  'аудиты amfori BSCI. Обе компании зарегистрированы в Комиссии по ценным бумагам и биржам ' +
  'Пакистана (SECP). Мы полностью готовы пройти любую сертификацию, которой требует ваша программа.'

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
