import { describe, expect, it } from 'vitest'
import { CRAWLER } from '../../viewer/worker/crawlerAgents'
import { AI_CRAWLER_UAS } from '../htmlLimitedBots.mjs'

/**
 * Every AI agent the website names must also get the garment pages' robot copy.
 *
 * Two lists, two Workers: the website's `AI_CRAWLER_UAS` (robots.txt and Next's complete-head
 * switch read it) and the garment Worker's `CRAWLER` (apps/viewer/worker/crawlerAgents.ts),
 * which decides who gets the 153-word copy instead of the 16-word "Loading" shell. They had
 * drifted: measured 2026-10-08, Claude-User and Perplexity-User were on the first and matched
 * nothing in the second. The Worker cannot import from this app (lint), so this test is the
 * tie, the same shape as `viewerRobots.test.ts`.
 *
 * Each agent is tested by its bare token, so a name is never carried by a "bot" that happens
 * to sit elsewhere in its full string.
 */
describe('the garment pages recognise every AI agent the website names', () => {
  it.each(AI_CRAWLER_UAS)('%s', (agent) => {
    expect(CRAWLER.test(agent)).toBe(true)
  })
})
