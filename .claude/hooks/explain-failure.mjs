#!/usr/bin/env node
/**
 * PostToolUseFailure hook — name the cause when a tool fails with an error that
 * names something else.
 *
 * WHY THIS EXISTS. Most of the root CLAUDE.md is a catalogue of errors that blame
 * the wrong component, and each entry is there because a session was spent
 * believing the error text. The tally in that file, by its own dates:
 *
 *   "Timed out waiting 120000ms from config.webServer"  — TWO sessions to a stray
 *       PORT (2026-08-08), then TWO more to a bare `pnpm` exiting 127 inside a
 *       child process (2026-08-21). The message names Playwright either way.
 *   "Cannot read properties of null (reading 'useContext')" — blamed on React, then
 *       on an unused import a linter had removed. It was NODE_ENV=development, and
 *       Next says so only in a mild warning twenty lines earlier (2026-08-09).
 *   "##[error]The operation was canceled" — a session spent debugging a HEALTHY job
 *       that a second push had cancelled; `gh run watch --exit-status` returns 1 for
 *       `cancelled` exactly as for `failure` (2026-08-12).
 *   `npm ci` failing after every local gate passed — the SECOND lockfile in
 *       tools/asset-pipeline, which no workspace tooling maintains. Cost a deploy
 *       (2026-08-12).
 *
 * That is seven-plus sessions against four strings. The file already tells you to
 * "run `env | grep -E 'NODE_ENV|PORT'` before reading any code — three times now",
 * which is an instruction to remember something at exactly the moment attention is
 * elsewhere. This hook does not ask anyone to remember.
 *
 * WHICH FIELD IT READS, AND WHY THAT WAS CHECKED RATHER THAN ASSUMED. The docs give
 * PostToolUseFailure a top-level `error` string, and for Bash its first line is
 * `Exit code N` followed by stdout and stderr interleaved. That was verified against
 * the reference before this file was written, because the alternative is the failure
 * mode log-instructions-loaded.mjs shipped with: it read `event.file_content`, a
 * field that is never populated, and recorded `0c` for 167 consecutive loads before
 * anyone looked. A hook keyed on a guessed field name does not fail — it goes quiet,
 * which is worse.
 *
 * `error` is the primary source; the raw payload is the fallback if a future version
 * moves it. Matching is deliberately anchored (`exit code 127`, not `127`) so that a
 * command merely MENTIONING pnpm cannot trigger a pnpm explanation.
 *
 * An interrupt is not a failure: `is_interrupt` short-circuits the whole hook, since
 * explaining a build the owner deliberately cancelled is pure noise.
 *
 * It never blocks and never retries. Exit 0 on every path.
 */

/**
 * Each entry: a `when` predicate over the lowercased payload text, and the note to
 * surface. Keep notes short — this is read at the moment of a failure, competing
 * with the error itself for attention.
 */
const EXPLANATIONS = [
  {
    name: 'playwright-webserver-timeout',
    when: (text) =>
      text.includes('config.webserver') || text.includes('timed out waiting 120000ms'),
    note:
      'This error names Playwright and means almost anything else. CLAUDE.md records TWO causes,\n' +
      'each of which cost two sessions:\n' +
      '  1. A `PORT` exported for another project. e2e/serve.mjs used to read process.env.PORT,\n' +
      '     so PORT=5002 bound the server where Playwright was not polling. Run:\n' +
      '       env | grep -E "^(NODE_ENV|PORT)="\n' +
      '  2. A bare `pnpm`. e2e/prepare.mjs shells out to `pnpm build`, so exit 127 dies inside a\n' +
      '     child process and surfaces only as this timeout. Use `npx --yes pnpm@10.33.0`.\n' +
      'Check both BEFORE reading any code. Both are fixed at the source, so a recurrence means\n' +
      'something new — but check them first anyway.',
  },
  {
    name: 'bare-pnpm-127',
    when: (text) =>
      (text.includes('pnpm') && text.includes('command not found')) ||
      (text.includes('pnpm') && text.includes('exit code 127')),
    note:
      '`pnpm` is not reliably on PATH here — it has MEASURED BOTH WAYS on this machine, so assume\n' +
      'neither. Every documented `pnpm <script>` in this repo means `npx --yes pnpm@10.33.0 <script>`.',
  },
  {
    name: 'next-build-usecontext',
    when: (text) =>
      text.includes("reading 'usecontext'") ||
      text.includes('_global-error') ||
      (text.includes('prerendering page') && text.includes('usecontext')),
    note:
      'This reads as a React-version or duplicate-copy problem and is neither. On 2026-08-09 it was\n' +
      '`NODE_ENV=development` present in the environment; Next prints only a mild "non-standard\n' +
      'NODE_ENV" warning twenty lines earlier. Run:\n' +
      '  env | grep -E "^(NODE_ENV|PORT)="\n' +
      "apps/cms's build script already pins NODE_ENV=production, so a recurrence means the pin was\n" +
      'bypassed — check that before blaming React or an import.',
  },
  {
    name: 'ci-run-cancelled',
    when: (text) =>
      text.includes('the operation was canceled') || text.includes('operation was cancelled'),
    note:
      'A cancelled run is NOT a failed one, and `gh run watch --exit-status` returns 1 for both.\n' +
      'Confirm which it was before debugging anything:\n' +
      '  gh run view <id> --json conclusion -q .conclusion\n' +
      'Two known causes: ci.yml sets `cancel-in-progress: true`, so a second push kills the first\n' +
      'run; or the job hit its OWN timeout-minutes. Raising a ceiling only moves which job dies.',
  },
  {
    name: 'container-npm-ci',
    when: (text) =>
      text.includes('npm ci') &&
      (text.includes('lock') || text.includes('eusage') || text.includes('in sync')),
    note:
      "tools/asset-pipeline carries a SECOND lockfile (package-lock.json, npm's) that only\n" +
      'apps/shrink/Dockerfile reads and no workspace tooling maintains. Bumping that package.json\n' +
      'in the workspace desynchronises it, so the image build dies here AFTER every local gate has\n' +
      'passed. Cost a deploy on 2026-08-12. Procedure: tools/asset-pipeline/CLAUDE.md.',
  },
  {
    name: 'workers-types-readuint32le',
    when: (text) => text.includes('readuint32le') || text.includes('nonsharedbuffer'),
    note:
      'Expected: @cloudflare/workers-types is HELD at 5.20260804.1 and every release from\n' +
      '5.20260808.1 on reproduces exactly this in tools/asset-pipeline/src/validate.ts, but only\n' +
      "under apps/shrink's tsconfig. If the hold is intact, something raised it — do not chase the\n" +
      'error, check the installed version. Do NOT "fix" it by raising workers-types.',
  },
  {
    name: 'merge-blocked-unattributed',
    when: (text) =>
      text.includes('base branch policy prohibits') ||
      (text.includes('mergestatestatus') && text.includes('blocked')),
    note:
      'Every check green and the merge still refused is the UNATTRIBUTED-COMMITS deadlock, not a\n' +
      'failing gate. git user.email unset makes git fall back to user@hostname, which matches no\n' +
      "GitHub account, so main's ruleset demands an approving review the author cannot give. Fix:\n" +
      '  git config --local user.email hateemjamshaid@gmail.com\n' +
      "  git rebase origin/main --exec 'git commit --amend --no-edit --reset-author'\n" +
      'Do NOT reach for `gh pr merge --admin`: the rule is doing its job.',
  },
]

async function readStdin() {
  try {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return ''
  }
}

const raw = await readStdin()
try {
  const event = JSON.parse(raw)
  // A cancelled tool is not a failing one. Nothing below applies.
  if (event.is_interrupt === true) process.exit(0)
  // `error` is the documented carrier; the raw payload is the fallback if that moves.
  const source = typeof event.error === 'string' && event.error.length > 0 ? event.error : raw
  const text = source.toLowerCase()
  const matched = EXPLANATIONS.filter((entry) => entry.when(text))
  if (matched.length === 0) process.exit(0)

  const body = matched.map((entry) => `[${entry.name}]\n${entry.note}`).join('\n\n')
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext:
          `This failure matches an error CLAUDE.md records as naming the wrong cause. ` +
          `Check this before reading code:\n\n${body}`,
      },
    }),
  )
} catch {
  // Nothing here is worth failing a session over.
}
process.exit(0)
