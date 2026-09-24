#!/usr/bin/env node
/**
 * The two lists that must name the same gates, compared.
 *
 * A job that gates a release is named in TWO places, both edited by hand:
 *   - `deploy.needs` in .github/workflows/ci.yml stops the DEPLOY
 *     (apps/cms/src/workflowHardening.test.ts makes every ci.yml job either gate it or
 *     sit on a written allow-list);
 *   - the `main` ruleset's required status checks stop the MERGE (repository settings).
 * .github/CLAUDE.md records what goes wrong when only one is edited: a renamed or split
 * gating job either stops blocking the merge while red, or leaves every pull request
 * waiting forever for a check no job posts any more. Nothing compared the two until
 * 2026-09-24.
 *
 * WHY A WORKFLOW AND NOT A UNIT TEST. A unit test must not reach the network, and the
 * ruleset is repository configuration. The repository is public, so GitHub's "rules for
 * a branch" endpoint answers without admin rights — measured 2026-09-24: an anonymous
 * GET returned 200 and all six required checks, each with the app that posts it. The
 * comparison itself is pure and tested offline in apps/cms/src/requiredChecks.test.ts.
 *
 * WHY ON `main` AND NOT ON PULL REQUESTS. A check may join the ruleset only AFTER a
 * workflow on `main` produces it (.github/CLAUDE.md: "ORDER MATTERS HERE TOO"), so a PR
 * that adds a gating job disagrees with the ruleset until it merges — by design. Gating
 * PRs on this would block exactly the change it exists to follow. On `main`, a
 * disagreement means the ruleset needs updating, which the owner does in Settings.
 *
 * EXIT CODES. A failed read and a failed comparison must never look the same:
 *   0  the lists agree — or the read failed TRANSIENTLY (network, 5xx): ::warning::
 *   1  the lists disagree: ::error:: names each side
 *   2  the rules could not be read at all (authenticated AND anonymous reads refused):
 *      a permanent condition, so it fails instead of staying green and blind
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The GitHub Actions app: every check a ci.yml job posts carries this integration id. */
export const ACTIONS_INTEGRATION_ID = 15368

/** Two spaced retries for a transient failure, then give up as INCONCLUSIVE. */
export const RETRY_DELAYS_MS = [3_000, 10_000]

const DEFAULT_REPOSITORY = 'hateem2121/RUN-APPAREL-W.D'

/**
 * The job ids in ci.yml's `deploy.needs`, each mapped to the check name it posts (its
 * `name:` when it has one, else its id — GitHub names a job's check that way).
 *
 * Throws rather than returning [] when there is no deploy job or no `needs:`: an empty
 * list would make every comparison "agree" about nothing.
 *
 * @param {string} source ci.yml's text
 * @returns {string[]}
 */
export function parseDeployNeeds(source) {
  const jobs = jobBlocks(source)
  const deploy = jobs.get('deploy')
  if (!deploy) throw new Error('ci.yml has no `deploy` job under `jobs:`')

  const needs = []
  const flow = deploy.match(/^ {4}needs:\s*\[([^\]]*)\]/m)
  if (flow?.[1] !== undefined) {
    needs.push(
      ...flow[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  } else {
    const block = deploy.match(/^ {4}needs:\s*\n((?: {6}- .*\n?)+)/m)
    if (block?.[1])
      needs.push(
        ...block[1]
          .split('\n')
          .map((l) => l.replace(/^ {6}- /, '').trim())
          .filter(Boolean),
      )
    const scalar = deploy.match(/^ {4}needs:\s*([A-Za-z0-9_-]+)\s*$/m)
    if (!block && scalar?.[1]) needs.push(scalar[1])
  }
  if (needs.length === 0) throw new Error('ci.yml `deploy` job has no readable `needs:`')

  return needs.map((id) => {
    const job = jobs.get(id)
    const name = job?.match(/^ {4}name:\s*['"]?([^'"\n]+?)['"]?\s*$/m)?.[1]
    return name ?? id
  })
}

/**
 * Each job's text, keyed by id: the lines from `  <id>:` to the next job at the same
 * indent. Enough YAML for a file whose jobs sit at two spaces under `jobs:`, which
 * workflowHardening.test.ts already relies on.
 *
 * @param {string} source
 * @returns {Map<string, string>}
 */
function jobBlocks(source) {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  const blocks = new Map()
  if (start === -1) return blocks
  let id = null
  let body = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (header?.[1]) {
      if (id) blocks.set(id, body.join('\n'))
      id = header[1]
      body = []
      continue
    }
    if (id) body.push(line)
  }
  if (id) blocks.set(id, body.join('\n'))
  return blocks
}

/**
 * Flatten GET /repos/{o}/{r}/rules/branches/{branch} into its required checks.
 *
 * @param {unknown} rules the endpoint's JSON body (an array of rules)
 * @returns {{ context: string, integrationId: number | null }[]}
 */
export function requiredChecksFromBranchRules(rules) {
  if (!Array.isArray(rules)) throw new Error('branch rules: expected an array')
  return rules
    .filter((rule) => rule?.type === 'required_status_checks')
    .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
    .map((check) => ({
      context: String(check.context),
      integrationId: check.integration_id ?? null,
    }))
}

/**
 * Compare the two lists. A required check posted by another app (Socket, for one) gates
 * the merge only and has no job to match, so it is reported as `external`, not as drift.
 * A required check with no app pinned could be posted by a job, so it is compared.
 *
 * @param {{ deployNeeds: string[], required: { context: string, integrationId: number | null }[] }} lists
 * @returns {{ missingFromRuleset: string[], notInDeployNeeds: string[], external: string[] }}
 */
export function compareRequiredChecks({ deployNeeds, required }) {
  const external = required
    .filter((c) => c.integrationId !== null && c.integrationId !== ACTIONS_INTEGRATION_ID)
    .map((c) => c.context)
  const jobChecks = required
    .filter((c) => c.integrationId === null || c.integrationId === ACTIONS_INTEGRATION_ID)
    .map((c) => c.context)
  return {
    missingFromRuleset: deployNeeds.filter((job) => !jobChecks.includes(job)),
    notInDeployNeeds: jobChecks.filter((check) => !deployNeeds.includes(check)),
    external,
  }
}

/**
 * Read the branch's rules: with the workflow token when there is one, then anonymously.
 * A refusal (4xx) from both is permanent; anything else that fails is transient.
 *
 * @param {{ repository: string, branch: string, token?: string, fetchImpl?: typeof fetch, delays?: number[] }} opts
 * @returns {Promise<{ ok: true, rules: unknown } | { ok: false, permanent: boolean, detail: string }>}
 */
export async function readBranchRules({
  repository,
  branch,
  token,
  fetchImpl = fetch,
  delays = RETRY_DELAYS_MS,
}) {
  const url = `https://api.github.com/repos/${repository}/rules/branches/${branch}`
  const attempts = token ? [token, undefined] : [undefined]
  let lastDetail = ''
  let refusedByAll = true
  for (const auth of attempts) {
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
          },
          signal: AbortSignal.timeout(20_000),
        })
        if (response.ok) return { ok: true, rules: await response.json() }
        lastDetail = `HTTP ${response.status} (${auth ? 'token' : 'anonymous'})`
        // A rate limit is a 403 or 429 that says so, and it is TRANSIENT: an anonymous
        // read from a shared runner address can hit GitHub's 60-an-hour limit.
        const rateLimited =
          response.status === 429 ||
          (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
        if (!rateLimited && response.status >= 400 && response.status < 500) break // refused: try the next way in
        refusedByAll = false
      } catch (error) {
        lastDetail = `${error instanceof Error ? error.message : String(error)} (${auth ? 'token' : 'anonymous'})`
        refusedByAll = false
      }
      const delay = delays[attempt]
      if (delay !== undefined) await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return { ok: false, permanent: refusedByAll, detail: lastDetail }
}

async function main() {
  const root = process.cwd()
  const repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY
  const deployNeeds = parseDeployNeeds(
    await readFile(join(root, '.github/workflows/ci.yml'), 'utf8'),
  )

  const read = await readBranchRules({
    repository,
    branch: 'main',
    token: process.env.GITHUB_TOKEN,
  })
  if (!read.ok) {
    if (read.permanent) {
      console.error(
        `::error::COULD NOT READ the rules for main (${read.detail}). This is not a mismatch — the comparison never ran.`,
      )
      process.exit(2)
    }
    console.log(
      `::warning::INCONCLUSIVE: the rules for main could not be read (${read.detail}). Re-run later; nothing was compared.`,
    )
    return
  }

  const required = requiredChecksFromBranchRules(read.rules)
  const { missingFromRuleset, notInDeployNeeds, external } = compareRequiredChecks({
    deployNeeds,
    required,
  })
  console.log(`deploy.needs (ci.yml):       ${deployNeeds.join(', ')}`)
  console.log(
    `required on main (Actions):  ${required
      .filter((c) => !external.includes(c.context))
      .map((c) => c.context)
      .join(', ')}`,
  )
  console.log(`required on main (other apps, merge-only): ${external.join(', ') || '(none)'}`)

  const failures = [
    ...missingFromRuleset.map(
      (job) =>
        `"${job}" gates the deploy but is NOT a required check on main, so a red run of it does not block a merge. Add it in Settings -> Rules -> the main ruleset.`,
    ),
    ...notInDeployNeeds.map(
      (check) =>
        `"${check}" is a required check on main but NOT in deploy.needs: if no job posts it any more, every pull request waits for it forever. Rename it in the ruleset, or add the job to deploy.needs.`,
    ),
  ]
  if (failures.length > 0) {
    for (const failure of failures) console.error(`::error::${failure}`)
    process.exit(1)
  }
  console.log(
    'OK: every job in deploy.needs is a required check on main, and nothing else from Actions is.',
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
