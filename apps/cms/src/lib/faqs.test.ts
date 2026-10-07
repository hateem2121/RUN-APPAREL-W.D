import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { CERTIFICATION_LINES, CERTIFICATION_PROMISE, FACTS, LEAD_TIME } from './companyFacts'
import {
  FAQ_INDEX,
  FAQ_PATHS,
  FAQ_TOPICS,
  faqEntryById,
  faqTopicAt,
  faqVisibleAnswer,
} from './faqs'
import { GUIDES } from './guides'

/**
 * The FAQ's rules (PLAN.md D5, Task 3.2) made testable: what would have to go wrong for a
 * buyer to read a wrong or invented answer.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const BRAND_SUFFIX = ' — RUN APPAREL'
const entries = FAQ_TOPICS.flatMap((topic) => topic.entries)
const words = (text: string) => text.trim().split(/\s+/).length

describe('the FAQ answers', () => {
  it('every id is unique across every page, so an anchor lands on one answer', () => {
    const ids = entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it('every direct answer is 50 words or fewer: the part an answer engine lifts', () => {
    const long = entries.filter((entry) => words(entry.answer) > 50).map((entry) => entry.id)
    expect(long).toEqual([])
  })

  it('every topic page has at least five questions', () => {
    for (const topic of FAQ_TOPICS)
      expect(topic.entries.length, topic.path).toBeGreaterThanOrEqual(5)
  })

  it('every entry names where its words come from', () => {
    for (const entry of entries) expect(entry.source.trim().length, entry.id).toBeGreaterThan(0)
  })

  /*
   * ⚠️ A NUMBER IS A CLAIM. Every figure an answer states must already be stated by the site's
   * own facts or guides, so an answer cannot invent a lead time, a weight or a count. The 24
   * hours is the reply promise every guide's closing block makes.
   */
  it('states no number the site does not already state', () => {
    const known = [
      ...FACTS.map((entry) => entry.value),
      LEAD_TIME,
      ...CERTIFICATION_LINES,
      CERTIFICATION_PROMISE,
      JSON.stringify(GUIDES),
      FAQ_INDEX.lede,
    ].join(' ')
    const allowed = new Set(known.match(/\d+(?:,\d{3})*/g) ?? [])
    const invented: string[] = []
    for (const entry of entries) {
      for (const number of faqVisibleAnswer(entry).match(/\d+(?:,\d{3})*/g) ?? []) {
        if (!allowed.has(number)) invented.push(`${entry.id}: ${number}`)
      }
    }
    expect(invented).toEqual([])
  })

  it('the hub’s most-asked questions each exist on a topic page', () => {
    for (const id of FAQ_INDEX.mostAsked) expect(() => faqEntryById(id), id).not.toThrow()
    expect(FAQ_INDEX.mostAsked).toHaveLength(5)
  })

  it('the visible answer is the direct answer, then the detail, exactly once', () => {
    const withDetail = entries.find((entry) => entry.detail)
    expect(withDetail, 'no entry has a detail, so this checks nothing').toBeDefined()
    if (withDetail?.detail) {
      expect(faqVisibleAnswer(withDetail)).toBe(`${withDetail.answer} ${withDetail.detail}`)
    }
  })
})

describe('every FAQ page has an address, a route and a title that fits', () => {
  it('the hub, then each topic, under /faq', () => {
    expect(FAQ_PATHS[0]).toBe('/faq')
    for (const path of FAQ_PATHS.slice(1)) expect(path).toMatch(/^\/faq\/[a-z]+(?:-[a-z]+)*$/)
    expect(faqTopicAt(FAQ_PATHS[1] ?? '').path).toBe(FAQ_PATHS[1])
    expect(() => faqTopicAt('/faq/no-such-topic')).toThrow()
  })

  for (const path of FAQ_PATHS) {
    it(`${path} has a route folder`, () => {
      expect(existsSync(join(FRONTEND, path.slice(1), 'page.tsx'))).toBe(true)
    })
  }

  for (const page of [FAQ_INDEX, ...FAQ_TOPICS]) {
    it(`${page.path}: the whole title fits and the description can be the snippet`, () => {
      expect((page.title + BRAND_SUFFIX).length).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    })
  }
})
