import { describe, expect, it } from 'vitest'
import {
  BALL_SIZES,
  ballSize,
  ballSizeRange,
  cartonVolume,
  convertWeight,
  GSM_WORDS,
  measureError,
  readDecimal,
  toolWords,
} from './guideTools'

/**
 * The draft's "Known answers" tables (C6 v2, owner approved 6 Nov 2026), every row. Each was
 * recomputed for the draft in exact fractions; here the code must give the same figure.
 */

describe('GSM to ounces converter', () => {
  it.each([
    ['100', '100 GSM is 2.95 ounces per square yard.'],
    ['120', '120 GSM is 3.54 ounces per square yard.'],
    ['180', '180 GSM is 5.31 ounces per square yard.'],
    // The trailing zero is kept.
    ['200', '200 GSM is 5.90 ounces per square yard.'],
    ['300', '300 GSM is 8.85 ounces per square yard.'],
    ['350', '350 GSM is 10.32 ounces per square yard.'],
  ])('%s GSM', (typed, shown) => {
    expect(convertWeight(typed, 'gsm')).toEqual({ result: shown })
  })

  it.each([
    ['1', '1 ounces per square yard is 33.9 GSM.'],
    ['5', '5 ounces per square yard is 169.5 GSM.'],
    ['5.3', '5.3 ounces per square yard is 179.7 GSM.'],
    // A comma reads as the decimal mark.
    ['5,3', '5.3 ounces per square yard is 179.7 GSM.'],
    // NIST's factor, not the 33.9 shortcut, which gives 339.0.
    ['10', '10 ounces per square yard is 339.1 GSM.'],
    // The 180 row's round trip.
    ['5.31', '5.31 ounces per square yard is 180.0 GSM.'],
  ])('%s oz/yd²', (typed, shown) => {
    expect(convertWeight(typed, 'oz')).toEqual({ result: shown })
  })

  it('refuses what is not a weight, in the draft words, and says nothing for an empty box', () => {
    for (const typed of ['abc', '1.2.3', '5,3.1']) {
      expect(convertWeight(typed, 'gsm'), typed).toEqual({ error: GSM_WORDS.notANumber })
    }
    for (const typed of ['0', '-5', '0.0']) {
      expect(convertWeight(typed, 'oz'), typed).toEqual({ error: GSM_WORDS.notPositive })
    }
    expect(convertWeight('', 'gsm')).toBeNull()
    expect(convertWeight('   ', 'oz')).toBeNull()
  })
})

describe('carton volume (CBM) calculator', () => {
  const cm = (length: string, width: string, height: string, count: string) =>
    cartonVolume({ length, width, height }, count, 'cm')
  const inches = (length: string, width: string, height: string, count: string) =>
    cartonVolume({ length, width, height }, count, 'in')

  it('the section’s example carton, alone and ten of them (trailing zeros kept)', () => {
    expect(cm('60', '40', '40', '1').lines).toEqual([
      'One carton: 0.096 cubic meters (CBM), or 3.39 cubic feet.',
    ])
    expect(cm('60', '40', '40', '10').lines).toEqual([
      'One carton: 0.096 cubic meters (CBM), or 3.39 cubic feet.',
      'All 10 cartons: 0.960 cubic meters, or 33.90 cubic feet.',
    ])
  })

  it('inches, exactly (an inch is 2.54 cm)', () => {
    expect(inches('24', '16', '16', '1').lines).toEqual([
      'One carton: 0.101 cubic meters (CBM), or 3.56 cubic feet.',
    ])
    expect(inches('24', '16', '16', '10').lines[1]).toBe(
      'All 10 cartons: 1.007 cubic meters, or 35.56 cubic feet.',
    )
    // One cubic foot exactly.
    expect(inches('12', '12', '12', '1').lines).toEqual([
      'One carton: 0.028 cubic meters (CBM), or 1.00 cubic feet.',
    ])
  })

  it('the total is worked out before rounding: 1.444, not 25 × 0.058 = 1.450', () => {
    expect(cm('55', '35', '30', '25').lines).toEqual([
      'One carton: 0.058 cubic meters (CBM), or 2.04 cubic feet.',
      'All 25 cartons: 1.444 cubic meters, or 50.99 cubic feet.',
    ])
  })

  it('5 rounds up: 0.0525 is shown 0.053 (binary floating point and toFixed give 0.052)', () => {
    expect(cm('50', '30', '35', '1').lines).toEqual([
      'One carton: 0.053 cubic meters (CBM), or 1.85 cubic feet.',
    ])
    // NEGATIVE CONTROL: the shortcut this module refuses really does get it wrong.
    expect((0.0525).toFixed(3)).toBe('0.052')
  })

  it('reads a point or a comma as the decimal mark', () => {
    const want = ['One carton: 0.097 cubic meters (CBM), or 3.42 cubic feet.']
    expect(cm('60.5', '40', '40', '1').lines).toEqual(want)
    expect(cm('60,5', '40', '40', '1').lines).toEqual(want)
  })

  it('a very small carton is "less than" rather than zero', () => {
    expect(cm('5', '5', '5', '1').lines).toEqual([
      'One carton: less than 0.001 cubic meters (CBM), or less than 0.01 cubic feet.',
    ])
  })

  it('the count is a whole number, 1 or more; a comma is not read as thousands', () => {
    for (const count of ['2.5', '0', '1,000']) {
      const answer = cm('60', '40', '40', count)
      expect(answer.countError, count).toBe(
        'The number of cartons must be a whole number, 1 or more.',
      )
      expect(answer.lines, count).toEqual([])
    }
  })

  it('names every measurement in error in one message', () => {
    const answer = cm('-1', 'abc', '40', '1')
    expect(answer.measureError).toBe(
      'Check the length and width. Measurements are numbers above 0, like 60 or 40.5.',
    )
    // Each box in error is marked on its own; the good one is not.
    expect(answer.wrong).toEqual(['length', 'width'])
    expect(answer.lines).toEqual([])
    expect(cm('0', '40', 'x', '1').measureError).toBe(
      'Check the length and height. Measurements are numbers above 0, like 60 or 40.5.',
    )
    expect(cm('a', 'b', 'c', '1').measureError).toBe(
      'Check the length, width and height. Measurements are numbers above 0, like 60 or 40.5.',
    )
  })

  it('an empty box is neither a result nor an error', () => {
    expect(cm('60', '', '40', '1')).toEqual({ lines: [] })
    expect(cm('60', '40', '40', '')).toEqual({ lines: [] })
  })
})

describe('ball size for an age group', () => {
  it.each([
    ['england', 'Under 7 (Year 2)', 3],
    ['england', 'Under 11 (Year 6)', 3],
    ['england', 'Under 12 (Year 7)', 4],
    ['england', 'Under 13 (Year 8)', 4],
    ['england', 'Under 14 (Year 9)', 5],
    ['england', 'Under 16 (Year 11)', 5],
    ['us', '6 and under', 3],
    ['us', '8 and under', 3],
    ['us', '10 and under', 4],
    ['us', '11 and under', 4],
    ['us', '12 and under', 4],
    ['us', '13 and under', 5],
    ['us', '19 and under', 5],
  ] as const)('%s, %s: size %i', (country, group, size) => {
    expect(ballSize(country, group)).toMatch(new RegExp(`^.*: size ${size} \\(`))
  })

  it('offers exactly the sources’ rows, youngest first', () => {
    expect(BALL_SIZES.england).toHaveLength(10)
    expect(BALL_SIZES.us).toHaveLength(12)
    expect(ballSize('england', 'Under 9 (Year 4)')).toBe(
      'Under 9 (Year 4): size 3 (The FA’s FutureFit table).',
    )
    expect(ballSize('us', '10 and under')).toBe('10 and under: size 4 (US Youth Soccer, Rule 303).')
    // An age group outside the sources gets no answer.
    expect(ballSize('us', '20 and under')).toBeNull()
    expect(ballSize('england', '')).toBeNull()
  })

  it('gives the ball guide’s table cells from the same list (the drift guard)', () => {
    expect([3, 4, 5].map((size) => ballSizeRange('england', size as 3 | 4 | 5))).toEqual([
      'Under 7 to Under 11',
      'Under 12 and Under 13',
      'Under 14 to Under 16',
    ])
    expect([3, 4, 5].map((size) => ballSizeRange('us', size as 3 | 4 | 5))).toEqual([
      '6 and under and 8 and under',
      '10 and under to 12 and under',
      '13 and under to 19 and under',
    ])
  })
})

describe('reading a typed number', () => {
  it('reads digits with one decimal mark, and nothing else', () => {
    expect(readDecimal(' 5,3 ')).toEqual({ n: 53n, d: 10n })
    expect(readDecimal('180')).toEqual({ n: 180n, d: 1n })
    for (const typed of ['1.2.3', '5,3.1', '.5', '5.', '1e3', '+5', '5 3']) {
      expect(readDecimal(typed), typed).toBeNull()
    }
  })
})

/*
 * The same tools on a Russian guide (Russian section, 2026-11-15; the language audit found all three
 * drawing English there). What would have to break for these to fail: a Russian page shows an
 * English word, a point for decimals or a comma for thousands, a wrong ending after a count of
 * cartons, or a figure different from the English one for the same input.
 */
describe('in Russian', () => {
  const NBSP = String.fromCharCode(0xa0)
  it('converts with a decimal comma and the same figures as English', () => {
    expect(convertWeight('180', 'gsm', 'ru')).toEqual({ result: '180 г/м² — это 5,31 oz/yd².' })
    expect(convertWeight('5,3', 'oz', 'ru')).toEqual({ result: '5,3 oz/yd² — это 179,7 г/м².' })
    expect(convertWeight('1000', 'oz', 'ru')).toEqual({
      result: `1${NBSP}000 oz/yd² — это 33${NBSP}905,8 г/м².`,
    })
    expect(convertWeight('abc', 'gsm', 'ru')?.error).toBe(
      'Введите плотность цифрами, например 180 или 5,3.',
    )
    expect(convertWeight('0', 'gsm', 'ru')?.error).toBe('Плотность ткани должна быть больше 0.')
  })

  it('works out cartons the same, with the right ending after the count', () => {
    const ru = (count: string) =>
      cartonVolume({ length: '60', width: '40', height: '40' }, count, 'cm', 'ru')
    expect(ru('1').lines).toEqual(['Один короб: 0,096 м³ (CBM), или 3,39 куб. фута.'])
    expect(ru('10').lines[1]).toBe('Итого за 10 коробов: 0,960 м³, или 33,90 куб. фута.')
    expect(ru('2').lines[1]).toMatch(/^Итого за 2 короба:/)
    expect(ru('21').lines[1]).toMatch(/^Итого за 21 короб:/)
    expect(ru('22').lines[1]).toMatch(/^Итого за 22 короба:/)
    expect(ru('111').lines[1]).toMatch(/^Итого за 111 коробов:/)
    expect(ru('12345').lines[1]).toMatch(new RegExp(`^Итого за 12${NBSP}345 коробов:`))
    expect(cartonVolume({ length: '1', width: '1', height: '1' }, '1', 'cm', 'ru').lines[0]).toBe(
      'Один короб: менее 0,001 м³ (CBM), или менее 0,01 куб. фута.',
    )
  })

  it('names every measurement in error in Russian, in one message', () => {
    expect(measureError(['length'], 'ru')).toBe(
      'Проверьте длину. Размеры — числа больше 0, например 60 или 40,5.',
    )
    expect(measureError(['length', 'width', 'height'], 'ru')).toMatch(
      /^Проверьте длину, ширину и высоту\./,
    )
    expect(cartonVolume({ length: '', width: '', height: '' }, '0', 'cm', 'ru').countError).toBe(
      'Количество коробов — целое число, не меньше 1.',
    )
  })

  it('looks up the ball size in Russian from the same list', () => {
    expect(ballSize('england', 'Under 9 (Year 4)', 'ru')).toBe(
      'До 9 лет: размер 3 (таблица FutureFit The FA).',
    )
    expect(ballSize('us', '13 and under', 'ru')).toBe(
      '13 лет и младше: размер 5 (US Youth Soccer, правило 303).',
    )
  })

  it('has a Russian word for every English one, and no English left', () => {
    for (const tool of ['gsm-converter', 'cbm-calculator', 'ball-size-lookup'] as const) {
      const english = toolWords(tool)
      const russian = toolWords(tool, 'ru')
      expect(russian.length, tool).toBe(english.length)
      for (const word of russian) expect(word, `${tool}: «${word}»`).toMatch(/[А-яЁё]/)
    }
  })

  it('leaves English exactly as it was', () => {
    expect(convertWeight('180', 'gsm')).toEqual({
      result: '180 GSM is 5.31 ounces per square yard.',
    })
    expect(convertWeight('1000', 'oz')?.result).toBe(
      '1,000 ounces per square yard is 33,905.8 GSM.',
    )
  })
})
