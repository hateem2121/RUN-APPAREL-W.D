import type { BallCountry, CartonUnit, GsmUnit, Measure } from './guideTools'

/**
 * Russian twin of the words in `guideTools.ts` (Russian section, 2026-11-15): the three guide tools
 * on the Russian guides. The language audit of that day found all three drawing English on
 * /ru/guides/… (the converter, the carton calculator and the ball-size lookup). Same keys as the
 * English words; the sums stay in `guideTools.ts`, which picks these by `locale`.
 *
 * Results use units, not words, where a number decides the ending: «5,31 oz/yd²» needs no plural,
 * «5,31 унции» would need one for every figure. Russian figures take a decimal comma and a no-break
 * space between thousands, as `Intl.NumberFormat('ru')` writes them (`formatScaled`).
 */

export const GSM_WORDS_RU = {
  heading: 'Конвертер плотности ткани: г/м² и унции',
  lead: 'Введите плотность ткани в одних единицах, чтобы получить её в других.',
  legend: 'Исходная единица',
  units: {
    gsm: {
      choice: 'Граммы на квадратный метр (г/м², GSM)',
      label: 'Плотность ткани (граммы на квадратный метр)',
      hint: 'Например, 180',
    },
    oz: {
      choice: 'Унции на квадратный ярд (oz/yd²)',
      label: 'Плотность ткани (унции на квадратный ярд)',
      hint: 'Например, 5,3',
    },
  },
  notANumber: 'Введите плотность цифрами, например 180 или 5,3.',
  notPositive: 'Плотность ткани должна быть больше 0.',
  rounding:
    'Унции округляются до двух знаков после запятой, граммы — до одного (5 округляется в большую сторону), поэтому результат может немного отличаться от таблицы выше.',
  credit:
    'Конвертер подготовила контент-команда RUN APPAREL; расчёт ведётся по округлённому коэффициенту NIST: 1 унция на квадратный ярд = 33,90575 грамма на квадратный метр (Special Publication 811, приложение B.9).',
} as const satisfies {
  units: Record<GsmUnit, { choice: string; label: string; hint: string }>
  [key: string]: unknown
}

/** The converter's sentence: «180 г/м² — это 5,31 oz/yd².» and the other way round. */
export function gsmResultRu(from: GsmUnit, typed: string, converted: string): string {
  return from === 'gsm'
    ? `${typed} г/м² — это ${converted} oz/yd².`
    : `${typed} oz/yd² — это ${converted} г/м².`
}

const MEASURE_NAMES_RU: Readonly<Record<Measure, { label: string; accusative: string }>> = {
  length: { label: 'Длина', accusative: 'длину' },
  width: { label: 'Ширина', accusative: 'ширину' },
  height: { label: 'Высота', accusative: 'высоту' },
}

export const CBM_WORDS_RU = {
  heading: 'Калькулятор объёма коробов (CBM)',
  lead: 'Измерьте один упакованный короб снаружи, затем введите его размеры и количество коробов.',
  legend: 'Единицы измерения',
  units: { cm: 'Сантиметры', in: 'Дюймы' },
  measureLabel: (measure: Measure, unit: CartonUnit) =>
    `${MEASURE_NAMES_RU[measure].label}, ${unit === 'cm' ? 'см' : 'дюйм'}`,
  countLabel: 'Количество коробов',
  countHint: 'Целое число, например 10',
  countError: 'Количество коробов — целое число, не меньше 1.',
  rounding:
    'Кубические метры округляются до трёх знаков после запятой, кубические футы — до двух (5 округляется в большую сторону). Общий объём считается до округления.',
  closing: 'В упаковочном листе указываются размеры каждого короба и общий объём в CBM.',
  credit:
    'Калькулятор: контент-команда RUN APPAREL. Дюйм принят равным ровно 2,54 сантиметра, фут — ровно 0,3048 метра, как указано в Special Publication 811 NIST.',
} as const

/** «Проверьте длину.», «Проверьте длину и ширину.», «Проверьте длину, ширину и высоту.» */
export function measureErrorRu(wrong: readonly Measure[]): string {
  const names = wrong.map((measure) => MEASURE_NAMES_RU[measure].accusative)
  const last = names[names.length - 1]
  const listed = names.length === 1 ? last : `${names.slice(0, -1).join(', ')} и ${last}`
  return `Проверьте ${listed}. Размеры — числа больше 0, например 60 или 40,5.`
}

/** «короб», «короба», «коробов» for a whole number of cartons. */
function cartonsWord(count: bigint): string {
  const form = new Intl.PluralRules('ru').select(Number(count % 1000n))
  return form === 'one' ? 'короб' : form === 'few' ? 'короба' : 'коробов'
}

/** Below the smallest shown figure: «менее 0,001». */
export const LESS_THAN_RU = 'менее'

/** The calculator's two lines, figures already formatted. */
export function cartonLinesRu(
  one: { meters: string; feet: string },
  all: { count: bigint; shown: string; meters: string; feet: string } | null,
): string[] {
  const lines = [`Один короб: ${one.meters} м³ (CBM), или ${one.feet} куб. фута.`]
  if (all)
    lines.push(
      `Итого за ${all.shown} ${cartonsWord(all.count)}: ${all.meters} м³, или ${all.feet} куб. фута.`,
    )
  return lines
}

/** One age group of `BALL_SIZES` in Russian: "Under 7 (Year 2)" and "6 and under". */
export function ballGroupRu(group: string): string {
  const under = group.match(/^Under (\d+)/)
  if (under) return `до ${under[1]} лет`
  const andUnder = group.match(/^(\d+) and under$/)
  if (andUnder) return `${andUnder[1]} лет и младше`
  throw new Error(`guideTools.ru.ts: no Russian words for the ball age group "${group}"`)
}

const capital = (text: string) => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`

/** A list line: «До 7 лет», «6 лет и младше». */
export const ballOptionRu = (group: string): string => capital(ballGroupRu(group))

export const BALL_WORDS_RU = {
  heading: 'Размер мяча для возрастной группы',
  lead: 'Выберите, где вы играете, затем — возрастную группу, принятую в вашей лиге.',
  legend: 'Где вы играете',
  countries: { england: 'Англия', us: 'США' },
  listLabel: {
    england: 'Возрастная группа по таблице The FA',
    us: 'Возрастная группа по правилам US Youth Soccer',
  },
  firstLine: 'Выберите возрастную группу',
  source: { england: 'таблица FutureFit The FA', us: 'US Youth Soccer, правило 303' },
  range:
    'Таблица The FA охватывает группы от «до 7 лет» до «до 16 лет». Правило US Youth Soccer охватывает группы от «6 лет и младше» до «19 лет и младше», если иное не установлено US Youth Soccer или ассоциацией штата.',
  credit:
    'Подбор: контент-команда RUN APPAREL. Источники: таблица FutureFit The FA; правило 303 US Youth Soccer.',
} as const satisfies {
  countries: Record<BallCountry, string>
  listLabel: Record<BallCountry, string>
  source: Record<BallCountry, string>
  [key: string]: unknown
}

/** «До 9 лет: размер 3 (таблица FutureFit The FA).» */
export function ballResultRu(country: BallCountry, group: string, size: number): string {
  return `${ballOptionRu(group)}: размер ${size} (${BALL_WORDS_RU.source[country]}).`
}
