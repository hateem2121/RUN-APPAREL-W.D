/**
 * Cases for explain-failure.mjs. Run from the repo root:
 *
 *   node .claude/hooks/explain-failure.test.mjs
 *
 * NOT part of `pnpm test`, for the reason guard-bare-pnpm.test.mjs states: .claude/
 * is not a workspace package, so vitest never sees it.
 *
 * WHAT THESE CASES ARE ACTUALLY FOR. This hook can only fail in two directions and
 * one of them is invisible:
 *
 *   - It matches NOTHING, forever, because it keyed on a field that does not exist.
 *     That is what log-instructions-loaded.mjs did for 167 loads, and no test caught
 *     it because the fixture supplied the missing field. So every payload below is
 *     shaped like a REAL PostToolUseFailure — `error` as a top-level string, first
 *     line `Exit code N` — and none of them invents a field to make a case pass.
 *   - It matches TOO MUCH, and starts explaining pnpm to someone who ran `grep pnpm`.
 *     The false-positive cases at the bottom are the ones that keep it useful; an
 *     explainer that fires on everything is noise, and noise gets switched off.
 */
import { execFileSync } from 'node:child_process'

const HOOK = new URL('explain-failure.mjs', import.meta.url).pathname
let failures = 0

/** Run the hook and return the injected context, or '' when it stayed quiet. */
function run(payload) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PostToolUseFailure', ...payload }),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString()
  if (out.trim() === '') return ''
  return JSON.parse(out).hookSpecificOutput?.additionalContext ?? ''
}

function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL  ${name}\n      ${error.message}`)
  }
}

/** A failure payload shaped the way the docs say Bash failures actually arrive. */
function bashFailure(error, extra = {}) {
  return { tool_name: 'Bash', tool_input: { command: 'x' }, error, ...extra }
}

check('names PORT and bare pnpm for the Playwright timeout that names neither', () => {
  const got = run(
    bashFailure('Exit code 1\nError: Timed out waiting 120000ms from config.webServer'),
  )
  if (!got.includes('PORT')) throw new Error('did not mention PORT')
  if (!got.includes('npx --yes pnpm@10.33.0')) throw new Error('did not mention the npx form')
})

check('names NODE_ENV for the useContext error that reads as a React problem', () => {
  const got = run(
    bashFailure(
      'Exit code 1\nError occurred prerendering page "/_global-error"\n' +
        "TypeError: Cannot read properties of null (reading 'useContext')",
    ),
  )
  if (!got.includes('NODE_ENV')) throw new Error('did not mention NODE_ENV')
})

check('tells you to read `conclusion`, not the exit code, on a cancelled run', () => {
  const got = run(bashFailure('Exit code 1\n##[error]The operation was canceled'))
  if (!got.includes('conclusion')) throw new Error('did not mention conclusion')
})

check('names the second lockfile when npm ci fails', () => {
  const got = run(
    bashFailure(
      'Exit code 1\nnpm ci can only install packages when your package-lock.json is in sync',
    ),
  )
  if (!got.includes('tools/asset-pipeline')) throw new Error('did not name the second lockfile')
})

check('names the held workers-types version for readUInt32LE', () => {
  const got = run(
    bashFailure("Exit code 2\nProperty 'readUInt32LE' does not exist on type 'NonSharedBuffer'"),
  )
  if (!got.includes('5.20260804.1')) throw new Error('did not name the held version')
})

check('names the git identity deadlock for a blocked merge', () => {
  const got = run(bashFailure('Exit code 1\nthe base branch policy prohibits the merge'))
  if (!got.includes('user.email')) throw new Error('did not name the identity')
  if (!got.includes('--admin')) throw new Error('did not warn against the admin override')
})

check('anchors the pnpm rule: a command MENTIONING pnpm does not trigger it', () => {
  // `grep pnpm` failing with exit 1 is an ordinary no-match, not the 127 trap. The
  // rule matches `exit code 127`, never a bare `127` that could be a byte count.
  const got = run({
    tool_name: 'Bash',
    tool_input: { command: 'grep -rn pnpm docs/RUNBOOK.md' },
    error: 'Exit code 1\n',
  })
  if (got !== '') throw new Error(`fired on an ordinary grep: ${got}`)
})

check('stays quiet on an unrecognised failure', () => {
  const got = run(bashFailure('Exit code 1\nsomething entirely unrelated went wrong'))
  if (got !== '') throw new Error(`explained an error it does not know: ${got}`)
})

check('stays quiet when the failure was an interrupt, not an error', () => {
  const got = run(
    bashFailure('Exit code 1\nTimed out waiting 120000ms from config.webServer', {
      is_interrupt: true,
    }),
  )
  if (got !== '') throw new Error('explained a build the owner cancelled')
})

check('exits 0 and stays quiet on malformed JSON', () => {
  const out = execFileSync('node', [HOOK], {
    input: '{not json',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString()
  if (out.trim() !== '') throw new Error(`wrote something: ${out}`)
})

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
