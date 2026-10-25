import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COOLDOWN_DAYS,
  compareVersions,
  judge,
  readPins,
  summarize,
  TOOLS,
} from '../../../scripts/check-tool-versions.mjs'

/*
 * The weekly "newer tool released?" check (25 Oct 2026). What would have to break: a pin
 * renamed or duplicated in ci.yml and silently skipped, a release a week old reported as fine,
 * a fresh release reported as overdue, or 1.31.1 read as older than 1.30.10.
 */
const root = join(import.meta.dirname, '..', '..', '..')
const ciYml = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
const DAY = 86_400_000
const NOW = Date.parse('2026-10-25T12:00:00Z')
const released = (tag: string, daysAgo: number) => ({
  tag,
  publishedAt: new Date(NOW - daysAgo * DAY).toISOString(),
})

describe('the pins are read from ci.yml itself', () => {
  it('finds every tool exactly once, as a plain version', () => {
    const pins = readPins(ciYml)
    for (const { pin } of TOOLS) expect(pins[pin], pin).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('NEGATIVE CONTROL: a pin removed, doubled or not a version is unreadable, never skipped', () => {
    const removed = ciYml.replace(/^\s+ZIZMOR_VERSION:.*$/m, '')
    const doubled = ciYml.replace(
      /^(\s+)GITLEAKS_VERSION:(.*)$/m,
      '$1GITLEAKS_VERSION:$2\n$1GITLEAKS_VERSION:$2',
    )
    const wrong = ciYml.replace(/^(\s+)ACTIONLINT_VERSION:.*$/m, '$1ACTIONLINT_VERSION: latest')
    expect(readPins(removed).ZIZMOR_VERSION).toBeNull()
    expect(readPins(doubled).GITLEAKS_VERSION).toBeNull()
    expect(readPins(wrong).ACTIONLINT_VERSION).toBeNull()
    const rows = judge(readPins(removed), { 'zizmorcore/zizmor': released('v9.9.9', 30) }, NOW)
    expect(rows.find((r) => r.pin === 'ZIZMOR_VERSION')?.state).toBe('unreadable')
  })
})

describe('versions compare part by part', () => {
  it('orders dotted numbers numerically, not as text', () => {
    expect(compareVersions('1.31.1', '1.30.10')).toBe(1)
    expect(compareVersions('1.7.12', '1.7.9')).toBe(1)
    expect(compareVersions('8.30.1', '8.30.1')).toBe(0)
    expect(compareVersions('2.0', '2.0.0')).toBe(0)
  })
})

describe('the verdict follows the same 7-day wait as Dependabot', () => {
  const pins = {
    ACTIONLINT_VERSION: '1.7.12',
    ZIZMOR_VERSION: '1.30.1',
    GITLEAKS_VERSION: '8.30.1',
  }

  it('NEGATIVE CONTROL: a newer release out a week is behind; out less is waiting', () => {
    const rows = judge(
      pins,
      {
        'rhysd/actionlint': released('v1.7.12', 200),
        'zizmorcore/zizmor': released('v1.31.1', COOLDOWN_DAYS),
        'gitleaks/gitleaks': released('v8.31.0', COOLDOWN_DAYS - 1),
      },
      NOW,
    )
    expect(rows.map((r) => r.state)).toEqual(['current', 'behind', 'waiting'])
    const { failing, text } = summarize(rows)
    expect(failing).toBe(1)
    expect(text).toContain('zizmor: 1.31.1 has been out 7 days, pinned 1.30.1. Bump ZIZMOR_VERSION')
    expect(text).toContain('gitleaks: 8.31.0 is out (6 days), pinned 8.30.1')
  })

  it('a pin ahead of the latest release (a pulled release) is current, not behind', () => {
    const rows = judge(pins, { 'zizmorcore/zizmor': released('v1.29.0', 90) }, NOW)
    expect(rows.find((r) => r.pin === 'ZIZMOR_VERSION')?.state).toBe('current')
  })

  it('an unreadable release (failed fetch, odd tag) fails the check rather than passing', () => {
    const rows = judge(
      pins,
      {
        'rhysd/actionlint': null,
        'zizmorcore/zizmor': released('nightly', 1),
        'gitleaks/gitleaks': { tag: 'v8.31.0', publishedAt: 'not a date' },
      },
      NOW,
    )
    expect(rows.map((r) => r.state)).toEqual(['unreadable', 'unreadable', 'unreadable'])
    expect(summarize(rows).failing).toBe(3)
  })
})

describe('tool-versions.yml runs it weekly with a read-only token', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'tool-versions.yml'), 'utf8')

  it('runs the script on a weekly schedule', () => {
    expect(workflow).toContain('run: node scripts/check-tool-versions.mjs')
    expect(workflow).toMatch(/cron: '\d+ \d+ \* \* 1'/)
  })

  it('asks for nothing beyond reading the repository', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(workflow).not.toContain('secrets.')
  })
})
