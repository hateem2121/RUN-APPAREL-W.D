import { describe, expect, it } from 'vitest'
import { AI_CRAWLER_UAS } from '../../htmlLimitedBots.mjs'
import { SITE_ORIGIN, VIEWER_ORIGIN } from '../lib/seo'
import robots from './robots'

/**
 * `/robots.txt` (audit FA-N-17).
 *
 * ⚠️ THE ASSERTION THAT MATTERS IS THE DISALLOW ON THE NAMED GROUP, and it is the one a
 * reasonable person would leave out. A robots.txt group for a named user agent REPLACES
 * the `*` group for that agent rather than adding to it, so a well-meaning edit that
 * writes `User-agent: GPTBot` + `Allow: /` and stops there hands every AI crawler the
 * admin panel and the REST API — while the file reads more welcoming than before and
 * every other test passes.
 */
const result = robots()
const wildcard = result.rules
const rules = Array.isArray(wildcard) ? wildcard : [wildcard]

describe('every group refuses the admin and the API', () => {
  for (const rule of rules) {
    const name = Array.isArray(rule.userAgent)
      ? `${rule.userAgent.length} named agents`
      : rule.userAgent
    it(`${name}`, () => {
      expect(rule.disallow).toEqual(['/admin', '/api/'])
      expect(rule.allow).toBe('/')
    })
  }

  /*
   * The negative control for the rule above: if the two groups ever stop sharing one
   * constant, this is what notices. Two array literals that happen to be equal today
   * satisfy the per-group assertion forever.
   */
  it('shares ONE disallow list rather than two that happen to match', () => {
    const lists = rules.map((rule) => rule.disallow)
    expect(lists.length).toBeGreaterThan(1)
    expect(new Set(lists).size, 'the groups hold different array instances — they can drift').toBe(
      1,
    )
  })
})

describe('the AI crawlers are named', () => {
  const named = rules.find((rule) => Array.isArray(rule.userAgent))

  it('has a group of its own, separate from the wildcard', () => {
    expect(named).toBeDefined()
    expect(rules.some((rule) => rule.userAgent === '*')).toBe(true)
  })

  /*
   * From the same constant that gives them a blocking metadata render — a crawler we
   * invite is a crawler we owe a finished `<head>`. If the two lists were typed
   * separately, one would be welcomed here and served a title-less page there.
   */
  it('names exactly the list htmlLimitedBots.mjs blocks metadata for', () => {
    expect(named?.userAgent).toEqual([...AI_CRAWLER_UAS])
  })

  it.each(['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot'])('names %s', (agent) => {
    expect(named?.userAgent).toContain(agent)
  })
})

describe('the sitemaps', () => {
  /*
   * robots.txt is the one file that may point a crawler at a sitemap on another host, and
   * doing so is what tells a search engine these two origins are one business. Owner
   * decision D11, 2026-09-07 (FA-N-13).
   */
  it('offers both hosts', () => {
    expect(result.sitemap).toEqual([`${SITE_ORIGIN}/sitemap.xml`, `${VIEWER_ORIGIN}/sitemap.xml`])
  })
})
