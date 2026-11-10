/**
 * PreToolUse guard — refuse a command that POSTS to the LIVE contact or careers form.
 *
 * WHY THIS EXISTS (owner, 2026-11-10: "make sure no more automated tests are made"). Every post to
 * wear-run.com/contact/submit is stored and emailed to the team. Sessions checking the live site
 * sent at least two such tests ("Website delivery test … SITE-AUDIT-20261029", 29 Oct; "TEST -
 * safe to delete", 8 Nov), and they arrived in the team's inbox beside real buyers. The browser
 * suites already post only to a local server (`apps/cms/playwright.config.ts`, port 4174); this
 * stops the same thing being done by hand against production.
 *
 * WHAT IT REFUSES: a command that names a live host's `/contact/submit` or `/careers/submit` AND
 * sends a body or a POST (curl -d/-F/--data/--form/-X POST, wget --post-*, httpie POST, or a
 * `method: 'POST'` in inline code). WHAT IT ALLOWS: the same path on localhost or any other host,
 * a plain GET of the page, and reading or searching files that mention the path.
 *
 * KNOWN LIMIT: a browser tool's click carries no address, so a session filling the live form in a
 * browser is not seen here. The rule in the root CLAUDE.md covers that case in words.
 */

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const LIVE_FORM = /(?:https?:\/\/)?(?:www\.)?wear-run\.(?:com|help)\/(?:contact|careers)\/submit\b/i

const SENDS = [
  /\bcurl\b[^\n|;&]*(?:\s(?:-d|-F|--data[a-z-]*|--form[a-z-]*|--json)\b|\s-X\s*['"]?POST|\s--request\s+['"]?POST)/i,
  /\bwget\b[^\n|;&]*--post-(?:data|file)/i,
  /\bhttps?\s+(?:-[a-z]+\s+)*POST\b/i,
  /method\s*:\s*['"`]POST['"`]/i,
]

/** The reason to refuse, or null to let the command run. */
export function refusal(command) {
  if (!LIVE_FORM.test(command)) return null
  if (!SENDS.some((pattern) => pattern.test(command))) return null
  return [
    'Refused: this would send a real inquiry to the LIVE site, and every one is stored and',
    'emailed to the team (owner, 2026-11-10). Test the form against a local server instead:',
    '`pnpm --filter @run-apparel/cms test:e2e` (it serves on http://localhost:4174), or post',
    'to http://localhost:4174/contact/submit.',
  ].join(' ')
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    raw += chunk
  })
  process.stdin.on('end', () => {
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      process.exit(0) // never break the session over a parse failure in a guard
    }
    const command = payload?.tool_input?.command
    if (payload?.tool_name !== 'Bash' || typeof command !== 'string') process.exit(0)
    const reason = refusal(command)
    if (reason) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        }),
      )
    }
    process.exit(0)
  })
}
