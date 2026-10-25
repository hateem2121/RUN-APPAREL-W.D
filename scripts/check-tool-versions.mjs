/**
 * Says when a newer release of a tool CI downloads by version number has been out a week.
 *
 * WHY. Dependabot updates every `uses:` pin and every package, but ci.yml downloads three tools
 * by a version number in an `env:` value — actionlint, zizmor and gitleaks — and Dependabot
 * cannot see those. On 25 Oct 2026 zizmor sat at 1.30.1 for ten days after 1.31.0 shipped, and
 * nothing said so (CI audit that day). This runs weekly (tool-versions.yml) and fails, naming the
 * tool and both versions, once a newer release is older than the same 7-day wait Dependabot and
 * pnpm give everything else (.github/dependabot.yml `cooldown`, pnpm-workspace.yaml
 * `minimumReleaseAge`): long enough for a bad release to be pulled, short enough not to rot.
 *
 * Bumping one is still a person's job: a new version needs its checksum (PyPI for zizmor, the
 * release's checksums file for the other two) and a run on this repository's workflows first.
 */
import { readFileSync, realpathSync } from 'node:fs'

/** The pinned tools: the `env:` name in ci.yml and the GitHub repository that releases it. */
export const TOOLS = Object.freeze([
  { pin: 'ACTIONLINT_VERSION', repo: 'rhysd/actionlint' },
  { pin: 'ZIZMOR_VERSION', repo: 'zizmorcore/zizmor' },
  { pin: 'GITLEAKS_VERSION', repo: 'gitleaks/gitleaks' },
])

/** Days a newer release must have been out before it counts as one to adopt. */
export const COOLDOWN_DAYS = 7

const VERSION = /^v?(\d+(?:\.\d+){1,3})$/

/**
 * Each tool's pinned version, read from ci.yml's text. A pin that is missing, written twice or
 * not a plain version becomes null, so the check reports it instead of passing it.
 *
 * @param {string} source ci.yml
 * @returns {Record<string, string | null>}
 */
export function readPins(source) {
  const out = {}
  for (const { pin } of TOOLS) {
    const found = [...source.matchAll(new RegExp(`^\\s+${pin}:\\s*(\\S+)\\s*$`, 'gm'))]
    const value = found.length === 1 ? found[0][1].replace(/^['"]|['"]$/g, '') : ''
    out[pin] = VERSION.test(value) ? value.replace(/^v/, '') : null
  }
  return out
}

/** -1, 0 or 1, comparing dotted numbers part by part (1.31.1 > 1.30.10). */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/**
 * Pure: pins and the latest releases to one verdict per tool.
 *
 * @param {Record<string, string | null>} pins
 * @param {Record<string, { tag: string, publishedAt: string } | null>} latest by repository
 * @param {number} now epoch ms
 */
export function judge(pins, latest, now) {
  return TOOLS.map(({ pin, repo }) => {
    const pinned = pins[pin]
    const release = latest[repo]
    const tag = release && VERSION.test(release.tag) ? release.tag.replace(/^v/, '') : null
    const published = release ? Date.parse(release.publishedAt) : Number.NaN
    if (!pinned || !tag || !Number.isFinite(published)) {
      return { pin, repo, pinned, latest: tag, state: 'unreadable' }
    }
    if (compareVersions(tag, pinned) <= 0)
      return { pin, repo, pinned, latest: tag, state: 'current' }
    const days = Math.floor((now - published) / 86_400_000)
    return {
      pin,
      repo,
      pinned,
      latest: tag,
      days,
      state: days >= COOLDOWN_DAYS ? 'behind' : 'waiting',
    }
  })
}

/** Fixed words around versions and day counts: the only text this prints. */
export function summarize(rows) {
  const lines = rows.map((r) => {
    const name = r.repo.split('/')[1]
    if (r.state === 'unreadable') return `- ${name}: could not read the pin or the latest release`
    if (r.state === 'current') return `- ${name}: ${r.pinned} is current`
    if (r.state === 'waiting')
      return `- ${name}: ${r.latest} is out (${r.days} days), pinned ${r.pinned}; inside the ${COOLDOWN_DAYS}-day wait`
    return `- ${name}: ${r.latest} has been out ${r.days} days, pinned ${r.pinned}. Bump ${r.pin} in ci.yml with its checksum`
  })
  const failing = rows.filter((r) => r.state === 'behind' || r.state === 'unreadable').length
  return { failing, text: lines.join('\n') }
}

async function main() {
  const pins = readPins(
    readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  )
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'run-apparel-tool-versions',
  }
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`
  const latest = {}
  for (const { repo } of TOOLS) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      })
      const body = r.ok ? await r.json() : null
      latest[repo] = body
        ? { tag: String(body.tag_name), publishedAt: String(body.published_at) }
        : null
    } catch {
      latest[repo] = null
    }
  }
  const { failing, text } = summarize(judge(pins, latest, Date.now()))
  console.log(text)
  if (failing) {
    console.log(`::error::${failing} pinned tool(s) need attention (see the lines above).`)
    process.exit(1)
  }
}

// Run only when called directly, never when a test imports it (as page-store-digest.mjs does).
const isMain = process.argv[1] && import.meta.filename === realpathSync(process.argv[1])
if (isMain) await main()
