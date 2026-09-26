/**
 * Assert the queue settings that live ONLY in Cloudflare's control plane.
 *
 * WHY THIS EXISTS. `message_retention_period` on both queues is 14 days, and a
 * repo-wide grep for `1209600` or `message_retention` finds it in NO shipping code,
 * test or config — audit 2026-08-30 PM, finding L7-01. So the value is correct and
 * completely unguarded: anyone with dashboard access can put it back to the 345600 s
 * default and nothing here would ever notice.
 *
 * That is the same shape as this repository's headline incident — a Worker
 * hand-edited in the dashboard that no test could see — and the same shape
 * `zone-security-probe.mjs` was written for. Its header already lists queue retention
 * among the control-plane settings it exists to protect; it does not measure it,
 * because it deliberately uses no API token. This does, which is why it runs from
 * `diagnostics-digest.yml` (which already declares `environment: production`) rather
 * than from `uptime.yml`, which holds no Cloudflare credentials at all — a property
 * worth keeping.
 *
 * ⚠️ WHY IT MATTERS THAT THIS IS 14 DAYS AND NOT 4. The DLQ is where a thrice-failed
 * garment leaves its only trace. At the default, evidence of a failure over a long
 * weekend expires before anyone looks — and the raw upload that produced it has
 * expired too, because the ingest bucket's lifecycle rule is also 14 days. The two
 * numbers are deliberately equal (finding L7-18); a job whose evidence outlives its
 * input is recoverable, and one whose does not is a garment that silently never
 * arrived.
 *
 * ⚠️ THE CENTRAL RULE, AND THE ONLY REASON THIS SCRIPT IS LONGER THAN TEN LINES:
 * "I could not read the settings" MUST NOT LOOK LIKE "the settings are correct".
 * A probe that exits 0 on an auth error, an empty list, or a renamed queue is worse
 * than no probe, because it converts an unknown into a green tick. Every one of those
 * cases exits INCONCLUSIVE (2) and says which it was. Only a real reading of a real
 * queue can produce a pass or a fail.
 */

/**
 * Expected retention, stated once with its unit spelled out.
 *
 * 1209600 s = 14 days = Cloudflare's documented MAXIMUM on Workers Paid. The free
 * tier maxes at 24 h, so this number is plan-dependent and cannot simply be copied
 * onto a new account.
 */
import { realpathSync } from 'node:fs'

export const EXPECTED_RETENTION_SECONDS = 1_209_600

/** Cloudflare's own default. Named so a drifted value can say WHICH kind of wrong. */
export const CLOUDFLARE_DEFAULT_SECONDS = 345_600

/** Both queues, named here so a rename fails loudly rather than silently passing. */
export const REQUIRED_QUEUES = ['glb-shrink', 'glb-shrink-dlq']

const INCONCLUSIVE = 2

function inconclusive(reason) {
  console.log(`::warning::queue-settings-probe INCONCLUSIVE — ${reason}`)
  console.log('   Not a pass and not a failure. Nothing was measured.')
  process.exit(INCONCLUSIVE)
}

/**
 * The whole decision, as a pure function — so the PASS path can be tested.
 *
 * The two controls above (no credentials, bad token) can be exercised by running the
 * script. The success path cannot: it needs an account-scoped token this machine does
 * not have, and a probe whose green path has never executed is exactly the kind of
 * instrument this repository keeps getting burned by. So the judgement lives here,
 * where `apps/cms/src/queueSettingsProbe.test.ts` can drive it with fixtures.
 *
 * Returns `{ ok, inconclusive, failures, checked }`. `inconclusive` is NOT a pass:
 * an empty list is a successful HTTP call that measured nothing, which is precisely
 * what a token scoped away from Queues returns.
 *
 * @param {Array<{queue_name?: string, settings?: {message_retention_period?: number}}>} queues
 */
export function evaluateQueues(queues) {
  if (!Array.isArray(queues) || queues.length === 0) {
    return {
      ok: false,
      inconclusive: 'the account returned ZERO queues, so nothing was checked',
      failures: [],
      checked: 0,
    }
  }

  const failures = []
  let checked = 0
  for (const name of REQUIRED_QUEUES) {
    const queue = queues.find((q) => q.queue_name === name)
    if (!queue) {
      failures.push(
        `${name}: NOT FOUND. Either it was deleted or renamed — the shrink pipeline ` +
          'binds it by name in apps/shrink/wrangler.jsonc.',
      )
      continue
    }
    const actual = queue.settings?.message_retention_period
    if (actual !== EXPECTED_RETENTION_SECONDS) {
      const days = typeof actual === 'number' ? (actual / 86_400).toFixed(1) : 'unreadable'
      failures.push(
        `${name}: message_retention_period is ${actual} s (${days} days), expected ` +
          `${EXPECTED_RETENTION_SECONDS} s (14 days).` +
          (actual === CLOUDFLARE_DEFAULT_SECONDS
            ? " That is Cloudflare's default — the setting has been reset, not tuned."
            : ''),
      )
    } else {
      checked += 1
    }
  }
  return { ok: failures.length === 0, inconclusive: null, failures, checked }
}

async function main() {
  const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN

  if (!ACCOUNT || !TOKEN) {
    inconclusive('CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not set')
  }

  let payload
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/queues`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    })
    payload = await res.json()
    if (!res.ok || !payload?.success) {
      const messages = (payload?.errors ?? []).map((e) => e.message).join('; ')
      inconclusive(`the API answered ${res.status}${messages ? ` — ${messages}` : ''}`)
    }
  } catch (error) {
    inconclusive(`the request failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const verdict = evaluateQueues(Array.isArray(payload.result) ? payload.result : [])
  if (verdict.inconclusive) inconclusive(verdict.inconclusive)

  if (!verdict.ok) {
    console.error('\n::error::queue retention has drifted from what CLOUDFLARE-SETUP.md documents:')
    for (const line of verdict.failures) console.error(`   • ${line}`)
    console.error(
      '\n   Restore with:\n' +
        REQUIRED_QUEUES.map(
          (n) =>
            `     npx wrangler@4.140.0 queues update ${n} --message-retention-period-secs ${EXPECTED_RETENTION_SECONDS}`,
        ).join('\n'),
    )
    process.exit(1)
  }

  for (const name of REQUIRED_QUEUES) {
    console.log(`   ${name.padEnd(16)} retention ${EXPECTED_RETENTION_SECONDS} s (14 days) OK`)
  }
  console.log(`OK    both queues retain messages for 14 days.`)
}

const isMain = process.argv[1] && import.meta.filename === realpathSync(process.argv[1])
if (isMain) await main()
