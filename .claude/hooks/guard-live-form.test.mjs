/**
 * Cases for guard-live-form.mjs. Run from the repo root:
 *
 *   node .claude/hooks/guard-live-form.test.mjs
 *
 * NOT part of `pnpm test` — .claude/ is not a workspace package — but
 * `.claude/skills/gates/run-gates.mjs` runs every `.claude/hooks/*.test.mjs`.
 *
 * The ALLOW half matters as much as the DENY half: a guard that blocks reading the route file or
 * testing the local server would be switched off within a day. The last case runs the hook as a
 * real process with a real payload, as the harness does.
 */
import { execFileSync } from 'node:child_process'
import { refusal } from './guard-live-form.mjs'

const DENY = [
  'curl -X POST https://wear-run.com/contact/submit -F name=Test -F email=t@example.com -F message=hi',
  'curl -s -d "name=TEST - safe to delete" https://wear-run.com/contact/submit',
  'curl --data-urlencode message=x https://www.wear-run.com/contact/submit',
  'curl -F role=Cutting https://wear-run.com/careers/submit',
  'curl --request POST wear-run.help/contact/submit',
  'wget --post-data "name=x" https://wear-run.com/contact/submit',
  'http POST https://wear-run.com/contact/submit name=x',
  `node -e "fetch('https://wear-run.com/contact/submit', { method: 'POST', body: new FormData() })"`,
]

const ALLOW = [
  // The local server is where testing belongs.
  'curl -X POST http://localhost:4174/contact/submit -F name=x',
  'pnpm --filter @run-apparel/cms exec playwright test e2e/inquiry.spec.ts',
  // Reading the live page, or the route's source, is not sending.
  'curl -s https://wear-run.com/contact | grep -c inquiry-form',
  'curl -sI https://wear-run.com/contact/submit',
  'grep -rn "wear-run.com/contact/submit" apps/cms/src',
  "sed -n 1,40p 'apps/cms/src/app/(frontend)/contact/submit/route.ts'",
  // A POST to somewhere else in the same command line is not this guard's business.
  'curl -X POST https://api.resend.com/emails -d @mail.json',
]

let failed = 0
for (const command of DENY) {
  if (!refusal(command)) {
    failed++
    console.error(`MISSED (should refuse): ${command}`)
  }
}
for (const command of ALLOW) {
  if (refusal(command)) {
    failed++
    console.error(`WRONGLY REFUSED: ${command}`)
  }
}

// As the harness runs it: JSON on stdin, a structured deny on stdout.
const out = execFileSync('node', [new URL('./guard-live-form.mjs', import.meta.url).pathname], {
  input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: DENY[0] } }),
  encoding: 'utf8',
})
if (JSON.parse(out || '{}').hookSpecificOutput?.permissionDecision !== 'deny') {
  failed++
  console.error('the process did not answer with a deny')
}
const quiet = execFileSync('node', [new URL('./guard-live-form.mjs', import.meta.url).pathname], {
  input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: ALLOW[0] } }),
  encoding: 'utf8',
})
if (quiet !== '') {
  failed++
  console.error('the process spoke for an allowed command')
}

if (failed > 0) {
  console.error(`guard-live-form: ${failed} case(s) failed`)
  process.exit(1)
}
console.log(
  `guard-live-form: ${DENY.length} refused, ${ALLOW.length} allowed, process checked — all pass`,
)
