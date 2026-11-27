/**
 * Cases for note-piped-test.mjs. Run from the repo root:
 *
 *   node .claude/hooks/note-piped-test.test.mjs
 *
 * NOT part of `pnpm test` — .claude/ is not a workspace package — but
 * `.claude/skills/gates/run-gates.mjs` and CI's "Hook guard tests" step run it.
 *
 * The QUIET half matters as much as the NOTED half: a note on every `| tail` would be read by
 * nobody within a day. The last cases run the hook as a real process, as the harness does, and
 * the count at the end must equal the number of checks written, so a crash cannot print a pass.
 */
import { execFileSync } from 'node:child_process'
import { hiddenTest, pipelines } from './note-piped-test.mjs'

const NOTED = [
  // The shape that pushed a failing check on 2026-11-27 (pull request #503).
  'npx --yes pnpm@12.15.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts 2>&1 | grep -E "Tests|passed|failed"',
  'npx --yes pnpm@12.15.0 test:coverage | tail -20',
  'cd apps/viewer && npx playwright test --grep "language note" | tail -5',
  'node --test scripts/*.test.mjs 2>&1 | tail -3',
  'node .claude/hooks/guard-live-form.test.mjs | head -1',
  'node scripts/doc-citations.mjs | wc -l',
  'node .claude/skills/gates/run-gates.mjs 2>&1 | tee gates.log',
  'CI=1 npx --yes pnpm@12.15.0 lint |& grep -c error',
  'npx tsc --noEmit | head -30; echo done',
  'for t in scripts/*.test.mjs; do node --test "$t" | tail -1; done',
]

const QUIET = [
  // Nothing piped: the exit code is the test's own.
  'npx --yes pnpm@12.15.0 test:coverage',
  'node --test scripts/*.test.mjs; echo "exit $?"',
  // The test's exit code is kept.
  'set -o pipefail; npx --yes pnpm@12.15.0 test:coverage | tail -20',
  'node --test scripts/*.test.mjs | tail -3; echo "${PIPESTATUS[0]}"',
  'node --test scripts/*.test.mjs | tail -3; echo "${pipestatus[1]}"',
  // A reader that only mentions a test runs none.
  'grep -rn vitest apps/cms/package.json | head -5',
  'cat apps/cms/src/claudeMd.test.ts | head -40',
  'git log --oneline -- scripts/gate-health.test.mjs | head -3',
  'gh run view 45986328659 --log | grep "node --test"',
  // Words inside quotes or a heredoc are data.
  'git commit -m "Tests — vitest run | grep no longer hides a failure"',
  'echo "npx vitest run | tail" | wc -c',
  "git commit -F - <<'EOF'\nTests — stop piping\n\nnode --test scripts/*.test.mjs | tail -3\nEOF",
  // The test is the LAST program in the pipe: its exit code is the one reported.
  'cat cases.txt | node scripts/gate-health.test.mjs',
  // A known limit, pinned so a change to it is noticed: a test named only by a variable.
  'for t in .claude/hooks/*.test.mjs; do node "$t" | tail -1; done',
  // An ordinary pipe with no test in it.
  'ls apps | wc -l',
]

let failed = 0
let checks = 0
const check = (ok, message) => {
  checks++
  if (!ok) {
    failed++
    console.error(message)
  }
}

for (const command of NOTED) {
  check(hiddenTest(command) !== null, `MISSED (should be noted): ${command}`)
}
for (const command of QUIET) {
  check(hiddenTest(command) === null, `WRONGLY NOTED: ${command}`)
}

// The splitter keeps which separator it found: that is what tells a pipe from a sequence.
check(
  JSON.stringify(pipelines('a | b && c; d')) === JSON.stringify([['a ', ' b '], [' c'], [' d']]),
  `pipelines() split wrongly: ${JSON.stringify(pipelines('a | b && c; d'))}`,
)
check(
  pipelines("grep 'x|y' f | head").length === 1 && pipelines("grep 'x|y' f | head")[0].length === 2,
  'pipelines() split on a | inside quotes',
)

// As the harness runs it: JSON on stdin; a note on stdout and nothing else decided.
const HOOK = new URL('./note-piped-test.mjs', import.meta.url).pathname
const run = (command) =>
  execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  })
const spoken = JSON.parse(run(NOTED[0]) || '{}').hookSpecificOutput ?? {}
check(spoken.hookEventName === 'PreToolUse', 'the process did not name its event')
check(
  typeof spoken.additionalContext === 'string' && spoken.additionalContext.includes('pipefail'),
  'the process did not add the note',
)
check(
  !('permissionDecision' in spoken),
  'the process decided a permission; it must only add a note',
)
check(!('updatedInput' in spoken), 'the process rewrote the command; it must only add a note')
check(run(QUIET[0]) === '', 'the process spoke for a command with no pipe')
check(
  execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' }) === '',
  'the process spoke for input it could not read',
)

const EXPECTED = NOTED.length + QUIET.length + 8
if (checks !== EXPECTED) {
  console.error(`note-piped-test: FAILED — ran ${checks} of ${EXPECTED} checks`)
  process.exit(1)
}
if (failed > 0) {
  console.error(`note-piped-test: FAILED — ${failed} of ${checks} checks`)
  process.exit(1)
}
console.log(
  `note-piped-test: ${NOTED.length} noted, ${QUIET.length} quiet, splitter and process checked (${checks} of ${EXPECTED}) — all pass`,
)
