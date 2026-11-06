import { describe, expect, it } from 'vitest'
import { GET } from '../app/(frontend)/guides/what-sportswear-buyers-ask/buyer-questions.csv/route'
import {
  BUYER_QUESTIONS,
  buyerQuestionLinks,
  buyerQuestionRows,
  buyerQuestionsCsv,
  buyerRuleRows,
  COUNT_GAP,
  CSV_FILE_NAME,
  chartBars,
  countCell,
  shareCell,
} from './buyerQuestions'
import { guideAt } from './guides'

/**
 * C7's one list (`buyerQuestions.ts`) feeds the chart, both tables and the CSV file. What would have
 * to break for these to fail: a table and a file that stop agreeing, a count below 3 shown as a
 * number, a comma in a topic breaking a CSV row, a made-up number in the held list, or the rules
 * table and the draft's rules drifting apart. The fixtures use INVENTED counts (never real ones) so
 * the code is proven on numbers while the real list stays empty.
 */

const TWO = BUYER_QUESTIONS.slice(0, 3).map((row, index) => ({
  ...row,
  // 40, 2 (hidden) and 10, in the order of the first three topics.
  count: [40, 2, 10][index] ?? null,
}))

describe('what C7 shows for a count', () => {
  it('shows the gap marker for a count owed, "fewer than 3" below 3, and the number from 3', () => {
    expect(countCell(null)).toBe(COUNT_GAP)
    expect(countCell(0)).toBe('fewer than 3')
    expect(countCell(2)).toBe('fewer than 3')
    expect(countCell(3)).toBe('3')
    expect(countCell(40)).toBe('40')
  })

  it('writes a share as a percent in words, hides a small one, and keeps the gap marker', () => {
    expect(shareCell(5, 40)).toBe('12.5 percent')
    expect(shareCell(10, 40)).toBe('25 percent')
    expect(shareCell(2, 40)).toBe('fewer than 3')
    expect(shareCell(null, 40)).toBe(COUNT_GAP)
    expect(shareCell(5, null)).toBe(COUNT_GAP)
  })
})

describe('the real list is still empty (the page is held)', () => {
  it('has 15 topics, each answered by a real guide, and no invented number', () => {
    expect(BUYER_QUESTIONS).toHaveLength(15)
    for (const row of BUYER_QUESTIONS) {
      expect(row.count, row.topic).toBeNull()
      expect(() => guideAt(row.guide.path), row.topic).not.toThrow()
    }
  })

  it('draws the table with the gap marker in every count and the draft’s last row', () => {
    const rows = buyerQuestionRows()
    expect(rows).toHaveLength(16)
    expect(rows.slice(0, 15).every((row) => row[1] === COUNT_GAP && row[2] === COUNT_GAP)).toBe(
      true,
    )
    expect(rows[15]).toEqual(['All inquiries counted', COUNT_GAP, '100 percent', ''])
  })

  it('has no bar for a count nobody has sent', () => {
    expect(chartBars().every((bar) => bar.ratio === null && bar.label === COUNT_GAP)).toBe(true)
  })
})

describe('one list, four views', () => {
  it('the table, the chart and the file agree on the same counts', () => {
    const rows = buyerQuestionRows(TWO, 100)
    expect(rows.slice(0, 3)).toEqual([
      ['Minimum order', '40', '40 percent', 'Minimum order and samples guide'],
      ['Price per piece', 'fewer than 3', 'fewer than 3', 'Cost guide'],
      ['Samples', '10', '10 percent', 'Minimum order and samples guide'],
    ])
    expect(chartBars(TWO).map((bar) => [bar.topic, bar.label, bar.ratio])).toEqual([
      ['Minimum order', '40', 1],
      ['Price per piece', 'fewer than 3', null],
      ['Samples', '10', 0.25],
    ])
    const csv = buyerQuestionsCsv(TWO, 100).split('\r\n')
    expect(csv[0]).toBe('Topic,Inquiries that asked,Share of all inquiries')
    expect(csv[1]).toBe('Minimum order,40,40 percent')
    expect(csv[2]).toBe('Price per piece,fewer than 3,fewer than 3')
    expect(csv[3]).toBe('Samples,10,10 percent')
    expect(csv.at(-2)).toBe('All inquiries counted,100,100 percent')
  })

  it('the file leaves a count owed EMPTY, never the table’s marker', () => {
    const csv = buyerQuestionsCsv()
    expect(csv).not.toContain('[COUNT]')
    expect(csv.split('\r\n')[1]).toBe('Minimum order,,')
  })

  it('quotes a topic with a comma, so its row keeps three cells', () => {
    const csv = buyerQuestionsCsv()
    expect(csv).toContain('"Labels, trims and packaging",,')
    // NEGATIVE CONTROL: a naive join would split that topic into two cells.
    const naive = BUYER_QUESTIONS.map((row) => `${row.topic},,`).join('\n')
    expect(naive.split('\n').some((line) => line.split(',').length > 3)).toBe(true)
  })

  it('links each guide name in the table’s last column and has the draft’s rules table', () => {
    const links = buyerQuestionLinks()
    expect(new Set(links.map((link) => link.phrase)).size).toBe(links.length)
    for (const row of buyerQuestionRows()) {
      if (row[3]) expect(links.map((link) => link.phrase)).toContain(row[3])
    }
    expect(buyerRuleRows()).toHaveLength(15)
    expect(buyerRuleRows()[13]).toEqual(['Soccer balls', 'any question about balls'])
  })

  it('is the table the guide page shows', () => {
    const table = guideAt('/guides/what-sportswear-buyers-ask').sections[0]?.blocks.find(
      (block) => block.kind === 'table',
    )
    expect(table?.kind === 'table' ? table.rows : null).toEqual(buyerQuestionRows())
  })
})

describe('GET /guides/what-sportswear-buyers-ask/buyer-questions.csv', () => {
  it('answers the file, named run-apparel-buyer-questions-2026.csv, from the same list', async () => {
    const response = GET()
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="run-apparel-buyer-questions-2026.csv"',
    )
    expect(CSV_FILE_NAME).toBe('run-apparel-buyer-questions-2026.csv')
    expect(await response.text()).toBe(buyerQuestionsCsv())
  })
})
