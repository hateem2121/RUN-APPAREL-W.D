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
    TRIVY_VERSION: '0.70.0',
  }

  it('NEGATIVE CONTROL: a newer release out a week is behind; out less is waiting', () => {
    const rows = judge(
      pins,
      {
        'rhysd/actionlint': released('v1.7.12', 200),
        'zizmorcore/zizmor': released('v1.31.1', COOLDOWN_DAYS),
        'gitleaks/gitleaks': released('v8.31.0', COOLDOWN_DAYS - 1),
        'aquasecurity/trivy': released('v0.70.0', 200),
      },
      NOW,
    )
    expect(rows.map((r) => r.state)).toEqual(['current', 'behind', 'waiting', 'current'])
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
        'aquasecurity/trivy': null,
      },
      NOW,
    )
    expect(rows.map((r) => r.state)).toEqual([
      'unreadable',
      'unreadable',
      'unreadable',
      'unreadable',
    ])
    expect(summarize(rows).failing).toBe(4)
  })
})

/*
 * TRIVY HAS TWO COPIES (4 Nov 2026). trivy-action's installer downloads from get.trivy.dev, which
 * stopped resolving on 3 Nov, so ci.yml and security-scans.yml each install Trivy from its GitHub
 * release with pinned checksums. What would have to break: one copy bumped and the other not (the
 * gitleaks fix lived in one of two workflows for three months, .github/CLAUDE.md), or a Trivy step
 * left on the action's own installer, which fails with curl exit 6 before scanning anything.
 */
const TRIVY_PINS = /^\s+(TRIVY_VERSION|TRIVY_SHA256_X64|TRIVY_SHA256_ARM64):\s*(\S+)\s*$/gm
const trivyPins = (source: string) =>
  Object.fromEntries([...source.matchAll(TRIVY_PINS)].map((m) => [m[1], m[2]]))
/** Every trivy-action step's text, from its `uses:` line to the next step. */
const trivySteps = (source: string) =>
  source.split(/\n(?= {6}- )/).filter((step) => step.includes('aquasecurity/trivy-action@'))
const workflows = ['ci.yml', 'security-scans.yml'].map((name) => ({
  name,
  source: readFileSync(join(root, '.github', 'workflows', name), 'utf8'),
}))

describe('Trivy is installed the same way in both workflows that run it', () => {
  it('pins the same version and both checksums in each', () => {
    const [ci, scans] = workflows.map(({ source }) => trivyPins(source))
    expect(Object.keys(ci ?? {}).sort()).toEqual([
      'TRIVY_SHA256_ARM64',
      'TRIVY_SHA256_X64',
      'TRIVY_VERSION',
    ])
    expect(ci?.TRIVY_SHA256_X64).toMatch(/^[0-9a-f]{64}$/)
    expect(ci?.TRIVY_SHA256_ARM64).toMatch(/^[0-9a-f]{64}$/)
    expect(scans).toEqual(ci)
    expect(readPins(ciYml).TRIVY_VERSION).toBe(ci?.TRIVY_VERSION)
  })

  it('no Trivy step falls back to the action installer', () => {
    for (const { name, source } of workflows) {
      const steps = trivySteps(source)
      expect(steps.length, name).toBeGreaterThan(0)
      for (const step of steps) expect(step, name).toContain("skip-setup-trivy: 'true'")
    }
  })

  it('NEGATIVE CONTROL: a drifted copy or a step without the skip is caught', () => {
    const [ci, scans] = workflows
    const bumped = (scans?.source ?? '').replace(/(TRIVY_VERSION:\s*)\S+/, '$10.71.0')
    expect(trivyPins(bumped)).not.toEqual(trivyPins(ci?.source ?? ''))
    const unskipped = (ci?.source ?? '').replace("skip-setup-trivy: 'true'\n", '')
    expect(trivySteps(unskipped).every((step) => step.includes("skip-setup-trivy: 'true'"))).toBe(
      false,
    )
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
