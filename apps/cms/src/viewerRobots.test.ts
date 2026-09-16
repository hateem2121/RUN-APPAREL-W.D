import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRAINING_ONLY_UAS } from '../htmlLimitedBots.mjs'
import { CONTENT_SIGNAL } from './lib/robotsTxt'

/**
 * The viewer host's robots.txt is a static file (apps/viewer/public/robots.txt), while the
 * site builds its own from lib/robotsTxt.ts. The owner's rule is ONE policy on both hosts
 * (2026-09-11), so this reads the viewer's file and fails when the two drift. Audit L-09:
 * measured live 2026-09-16, the viewer refused nobody, carried no signal and did not point
 * at the site's sitemap.
 */
const text = readFileSync(
  fileURLToPath(new URL('../../viewer/public/robots.txt', import.meta.url)),
  'utf8',
)
const directives = (block: string) =>
  block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
const groups = text
  .split(/\n\s*\n/)
  .map(directives)
  .filter((lines) => lines.some((line) => line.startsWith('User-agent:')))
const agentsOf = (lines: string[]) =>
  lines.filter((line) => line.startsWith('User-agent:')).map((line) => line.slice(11).trim())
const lower = (list: readonly string[]) => list.map((item) => item.toLowerCase()).sort()
const refused = groups.find((lines) => lines.includes('Disallow: /')) ?? []
const wildcard = groups.find((lines) => agentsOf(lines).includes('*')) ?? []

describe('the viewer host’s robots.txt matches the site’s policy (L-09, FI-06)', () => {
  it('refuses exactly the site’s training-only crawlers', () => {
    expect(lower(agentsOf(refused))).toEqual(lower(TRAINING_ONLY_UAS))
  })

  it('has no Allow line in the refused group, which would tie with Disallow: /', () => {
    expect(refused.some((line) => line.startsWith('Allow:'))).toBe(false)
  })

  it('lets everyone else crawl everything', () => {
    expect(wildcard).toContain('Allow: /')
    expect(wildcard.some((line) => line.startsWith('Disallow:'))).toBe(false)
  })

  it('states the same reuse policy in every group', () => {
    for (const lines of groups) expect(lines).toContain(`Content-Signal: ${CONTENT_SIGNAL}`)
  })

  it.each([
    'facebookexternalhit',
    'Twitterbot',
    'LinkedInBot',
    'Slackbot',
    'Googlebot',
    'Applebot',
    'OAI-SearchBot',
    'Claude-SearchBot',
    'Claude-User',
    'PerplexityBot',
    'meta-externalfetcher',
    'Amzn-SearchBot',
    'Amzn-User',
  ])('never refuses %s (link previews and answer engines)', (agent) => {
    expect(lower(agentsOf(refused))).not.toContain(agent.toLowerCase())
  })

  it('names both sitemaps, so a crawler treats the two hosts as one business', () => {
    const sitemaps = text.split('\n').filter((line) => line.startsWith('Sitemap:'))
    expect(sitemaps).toContain('Sitemap: https://viewer.wear-run.help/sitemap.xml')
    expect(sitemaps).toContain('Sitemap: https://wear-run.help/sitemap.xml')
  })
})
