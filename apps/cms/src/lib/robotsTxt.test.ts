import { describe, expect, it } from 'vitest'
import { AI_CRAWLER_UAS, TRAINING_ONLY_UAS } from '../../htmlLimitedBots.mjs'
import { ANSWERING_UAS, buildRobotsTxt, CONTENT_SIGNAL, DISALLOW } from './robotsTxt'
import { SITE_ORIGIN, VIEWER_ORIGIN } from './seo'

/**
 * `/robots.txt` — audit FA-N-17, plus the owner's reuse policy of 2026-09-07.
 *
 * ⚠️ THE ASSERTIONS THAT MATTER ARE THE PER-GROUP ONES, AND THEY ARE THE ONES A
 * REASONABLE PERSON WOULD LEAVE OUT. Per RFC 9309 a group for a named user agent
 * REPLACES the `*` group for that agent rather than adding to it. So a tidy edit that
 * writes `User-agent: GPTBot` + `Allow: /` and stops there does two things at once: it
 * hands every AI crawler the admin panel and the REST API, and it drops the `ai-train=no`
 * signal for precisely the agents it was written for — while making the file read more
 * welcoming than before.
 *
 * The file is parsed into groups the way a crawler would, on blank lines, rather than
 * pattern-matched. An earlier version of the browser test split on every `User-agent:`
 * line, decided `User-agent: GPTBot` was a group with no rules in it, and failed against
 * a file that was correct.
 */

const text = buildRobotsTxt()

/** Records separated by a blank line; a run of consecutive user-agent lines is ONE group. */
const groups = text
  .split(/\n\s*\n/)
  .filter((block) => /^User-agent:/m.test(block))
  .map((block) => ({
    agents: [...block.matchAll(/^User-agent:\s*(.+)$/gm)].map((m) => m[1]?.trim() ?? ''),
    lines: block.split('\n').filter((line) => !line.startsWith('#')),
  }))

describe('the groups', () => {
  it('there are three: wildcard, the answering crawlers, the training-only ones', () => {
    expect(groups).toHaveLength(3)
    expect(groups[0]?.agents).toEqual(['*'])
    expect(groups[1]?.agents).toEqual([...ANSWERING_UAS])
    expect(groups[2]?.agents).toEqual([...TRAINING_ONLY_UAS])
  })

  it.each([0, 1])('allowed group %i refuses the admin and the API', (index) => {
    const lines = groups[index]?.lines ?? []
    for (const path of DISALLOW) {
      expect(lines, `group ${index} does not disallow ${path}`).toContain(`Disallow: ${path}`)
    }
    expect(lines).toContain('Allow: /')
  })

  /*
   * ⚠️ NO `Allow:` IN THE REFUSED GROUP. Most crawlers resolve a conflict by longest
   * match, and `Allow: /` ties exactly with `Disallow: /` — so adding one "for
   * consistency" with the two groups above quietly re-opens the crawl, while the file
   * still reads as a refusal.
   */
  it('the training-only group refuses everything, with nothing that re-allows it', () => {
    const lines = groups[2]?.lines ?? []
    expect(lines).toContain('Disallow: /')
    expect(lines.some((line) => line.startsWith('Allow:'))).toBe(false)
  })

  /*
   * An agent in two groups is a state where what a crawler does is anybody's guess, and
   * it is one careless copy-paste away. `ANSWERING_UAS` is derived by filtering rather
   * than typed out, so this asserts the derivation still holds.
   */
  it('no crawler appears in more than one group', () => {
    const named = [...(groups[1]?.agents ?? []), ...(groups[2]?.agents ?? [])]
    expect(new Set(named).size).toBe(named.length)
  })

  /*
   * The reuse policy has to be repeated per group for the same reason the disallows do.
   * Stated as its own test because the failure is invisible: the file still parses, still
   * allows everything it should, and simply stops expressing the owner's objection to the
   * only agents that objection is about.
   */
  it.each([0, 1, 2])('group %i carries the content signal', (index) => {
    expect(groups[index]?.lines).toContain(`Content-Signal: ${CONTENT_SIGNAL}`)
  })
})

describe('the owner’s reuse policy', () => {
  /*
   * Owner decision 2026-09-07, asked as one question with the consequence of each answer
   * stated. `no` refuses, `yes` permits, and ABSENCE expresses no preference — so a
   * dropped `ai-train` is not a neutral edit, it withdraws a stated objection.
   */
  it('refuses training, and permits search and answering', () => {
    expect(CONTENT_SIGNAL).toContain('ai-train=no')
    expect(CONTENT_SIGNAL).toContain('search=yes')
    expect(CONTENT_SIGNAL).toContain('ai-input=yes')
  })

  it('names the policy so a reader can look it up', () => {
    expect(text).toContain('contentsignals.org')
  })

  /*
   * ⚠️ AND IT SAYS WHAT IT IS. Cloudflare's own documentation is explicit that this is a
   * preference and not a block, and the owner chose it on that basis. A file that implied
   * enforcement would be the one misleading thing here.
   */
  it('does not claim to be a block', () => {
    expect(text).toMatch(/not a technical block/i)
  })
})

describe('who is welcomed and who is refused', () => {
  /*
   * ⚠️ THE ASSERTION THAT PROTECTS THE BUSINESS. Every one of these reads in order to
   * ANSWER a buyer's question and cite the site for it. Moving any of them into the
   * refused group makes the company invisible to the engines people actually ask — and it
   * would look like tightening security rather than losing leads.
   */
  it.each([
    'OAI-SearchBot',
    'ChatGPT-User',
    'Claude-SearchBot',
    'Claude-User',
    'PerplexityBot',
    'meta-externalfetcher',
    'Amzn-SearchBot',
    'Amzn-User',
  ])('%s is WELCOME', (agent) => {
    expect(groups[1]?.agents, `${agent} is not in the allowed group`).toContain(agent)
    expect(groups[2]?.agents, `${agent} has been moved to the refused group`).not.toContain(agent)
  })

  it.each([...TRAINING_ONLY_UAS])('%s is refused', (agent) => {
    expect(groups[2]?.agents).toContain(agent)
  })

  /*
   * Owner decision 2026-09-11: both hosts refuse these eight. The last three joined the
   * original five after each operator's own documentation named them training crawlers
   * with a separate answering sibling (checked 2026-09-16; sources in htmlLimitedBots.mjs).
   */
  it('refuses exactly the eight the owner named', () => {
    expect([...TRAINING_ONLY_UAS].sort()).toEqual(
      [
        'Amazonbot',
        'Applebot-Extended',
        'Bytespider',
        'CCBot',
        'ClaudeBot',
        'Google-Extended',
        'GPTBot',
        'meta-externalagent',
      ].sort(),
    )
  })

  /*
   * The welcomed list is still exactly what `htmlLimitedBots.mjs` gives a blocking
   * metadata render to, minus the refused ones — a crawler we invite is a crawler we owe
   * a finished `<head>`.
   */
  it('the welcomed list is the metadata list minus the refused', () => {
    expect(groups[1]?.agents).toEqual(AI_CRAWLER_UAS.filter((a) => !TRAINING_ONLY_UAS.includes(a)))
  })
})

describe('the sitemaps', () => {
  it('offers both hosts, in order', () => {
    const sitemaps = [...text.matchAll(/^Sitemap:\s*(.+)$/gm)].map((m) => m[1]?.trim())
    expect(sitemaps).toEqual([`${SITE_ORIGIN}/sitemap.xml`, `${VIEWER_ORIGIN}/sitemap.xml`])
  })

  it('hardcodes neither host', () => {
    // The origins come from lib/seo.ts, which reads the environment.
    expect(buildRobotsTxt()).toContain(SITE_ORIGIN)
  })
})

describe('it is a text file', () => {
  it('contains no markup and ends with a newline', () => {
    expect(text).not.toMatch(/<\/[a-z]/i)
    expect(text.endsWith('\n')).toBe(true)
  })
})
