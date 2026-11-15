import { FACTS } from './companyFacts'
import { LEAD_TIME_RU } from './companyFacts.ru'
import { FAMILY_SINCE } from './press'

/**
 * Russian twin of `press.ts`'s words: `PRESS_PHOTO_USAGE` and `PRESS_FACTS`, same shape and order.
 * The email, the photos and the download links are the English file's and are not repeated here.
 * A row whose `value` is a figure alone (`FAMILY_SINCE`) is the English value itself; a figure inside
 * words is read from `FACTS` as the English reads it and printed the Russian way, thousands apart by
 * a non-breaking space, because «100,000» reads as one hundred in Russian.
 */

const fact = (prefix: string) => FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

/** A figure in Russian print: "100,000" → "100 000" (a non-breaking space). */
const ruFigure = (value: string): string => value.replace(/(\d),(?=\d{3}\b)/g, '$1 ')

/** `PRESS_PHOTO_USAGE`. */
export const PRESS_PHOTO_USAGE_RU =
  'Можно использовать бесплатно в статьях о RUN APPAREL с подписью «RUN APPAREL».'

/** `PRESS_FACTS`, row for row. */
export const PRESS_FACTS_RU: readonly { label: string; value: string }[] = [
  { label: 'Семейное производство с', value: FAMILY_SINCE },
  { label: 'Родственная компания', value: 'DURUS INDUSTRIES' },
  { label: 'Сотрудники', value: `Около ${fact('People')}` },
  {
    label: 'Производственная мощность',
    value: `${ruFigure(fact('Pieces per month'))} изделий в месяц`,
  },
  { label: 'Под крышей', value: `${ruFigure(fact('Sq m'))} кв. м` },
  { label: 'Минимальный заказ', value: `${fact('Minimum')} изделий на модель` },
  { label: 'Образец', value: `Обычно ${fact('Working days')} рабочих дней` },
  { label: 'Срок производства', value: LEAD_TIME_RU },
]
