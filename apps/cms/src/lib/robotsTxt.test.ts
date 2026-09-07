import { describe, expect, it } from 'vitest'
import { AI_CRAWLER_UAS } from '../../htmlLimitedBots.mjs'
import { buildRobotsTxt, CONTENT_SIGNAL, DISALLOW } from './robotsTxt'
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
  it('there is a wildcard group and a named AI group, and nothing else', () => {
    expect(groups).toHaveLength(2)
    expect(groups[0]?.agents).toEqual(['*'])
    expect(groups[1]?.agents).toEqual([...AI_CRAWLER_UAS])
  })

  it.each([0, 1])('group %i refuses the admin and the API', (index) => {
    const lines = groups[index]?.lines ?? []
    for (const path of DISALLOW) {
      expect(lines, `group ${index} does not disallow ${path}`).toContain(`Disallow: ${path}`)
    }
    expect(lines).toContain('Allow: /')
  })

  /*
   * The reuse policy has to be repeated per group for the same reason the disallows do.
   * Stated as its own test because the failure is invisible: the file still parses, still
   * allows everything it should, and simply stops expressing the owner's objection to the
   * only agents that objection is about.
   */
  it.each([0, 1])('group %i carries the content signal', (index) => {
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

describe('the AI crawlers are named', () => {
  it.each(['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'CCBot'])(
    'names %s',
    (agent) => {
      expect(groups[1]?.agents).toContain(agent)
    },
  )

  /*
   * From the same constant that gives them a blocking metadata render — a crawler we
   * invite is a crawler we owe a finished `<head>`. Typed separately, one would be
   * welcomed here and served a title-less page there.
   */
  it('is exactly the list htmlLimitedBots.mjs blocks metadata for', () => {
    expect(groups[1]?.agents).toEqual([...AI_CRAWLER_UAS])
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
