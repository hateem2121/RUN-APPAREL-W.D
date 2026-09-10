/**
 * Cases for guard-bare-pnpm.mjs. Run from the repo root:
 *
 *   node .claude/hooks/guard-bare-pnpm.test.mjs
 *
 * NOT part of `pnpm test` — .claude/ is not a workspace package, so vitest never
 * sees it. It is here because the guard blocked its own first commit (a commit
 * message describing the denied commands parsed as those commands), and the fix
 * for that then hung the suite instead of failing it. Both regressions are cases
 * below. Run this after touching the guard.
 *
 * THREE OUTCOMES SINCE 2026-08-26, not two. The guard now REWRITES a bare `pnpm`
 * where it can do so unambiguously, and only denies where it cannot. A two-way
 * DENY/ALLOW harness reads a rewrite as "allowed", i.e. as the exact regression
 * this file exists to catch, so the classification below is by SHAPE of the
 * decision rather than by the absence of a denial:
 *
 *   ALLOW    no JSON at all — the guard saw nothing to act on
 *   REWRITE  updatedInput present — the command was corrected before running
 *   DENY     permissionDecision "deny" — ambiguous, so the old refusal stands
 *
 * The `allow` vs `ask` split on a REWRITE is asserted too, because it is the part
 * that must not quietly widen: a rewrite is auto-approved ONLY when it matches a
 * Bash rule the owner already put in .claude/settings.json. Anything else asks.
 */
import { execFileSync } from 'node:child_process'

const P = 'npx --yes pnpm@10.34.5'

/** [outcome, command, expectedRewrite?, expectedDecision?] */
const cases = [
  // --- rewritten, and auto-approved because settings.json already allows the result
  ['REWRITE', 'pnpm build', `${P} build`, 'allow'],
  ['REWRITE', 'pnpm -r test', `${P} -r test`, 'allow'],
  ['REWRITE', 'pnpm test', `${P} test`, 'allow'],
  // --- rewritten, but NOT pre-approved, so the owner sees the corrected command.
  // NODE_ENV=… and time … deliberately do not match a prefix rule: the rule is a
  // prefix, and widening it to "contains" is how an allow-list stops meaning anything.
  ['REWRITE', 'NODE_ENV=production pnpm build', `NODE_ENV=production ${P} build`, 'ask'],
  ['REWRITE', 'time pnpm test', `time ${P} test`, 'ask'],
  ['REWRITE', 'cd apps/cms && pnpm dev', `cd apps/cms && ${P} dev`, 'ask'],
  // --- every command-position pnpm in a chain, not just the first
  ['REWRITE', 'pnpm lint && pnpm typecheck', `${P} lint && ${P} typecheck`, 'ask'],
  // --- untouched: not a bare pnpm in command position
  ['ALLOW', `${P} build`],
  ['ALLOW', 'cat pnpm-lock.yaml'],
  ['ALLOW', 'grep -n pnpm docs/RUNBOOK.md'],
  ['ALLOW', 'git commit -m "use pnpm here"'],
  ['ALLOW', `${P} -r typecheck && ${P} build`],
  // the regression that blocked this guard's own commit:
  [
    'ALLOW',
    "git commit -F - <<'EOF'\nfeat: guard\n\n  denied   pnpm build\n  denied   pnpm -r test\nEOF",
  ],
  ['ALLOW', 'cat <<EOF\npnpm build\nEOF'],
  // ...but a real command AFTER a heredoc must still be caught. It DENIES rather
  // than rewriting: a heredoc means the quote/heredoc safety rule refuses to guess.
  ['DENY', "cat <<'EOF'\nharmless text\nEOF\npnpm build"],
  // Segmentation must respect QUOTES, not just heredocs. Found 2026-08-12 when
  // this guard denied an ordinary grep: `segments()` split on the `\|` inside the
  // search pattern, manufacturing a phantom segment whose first token was `pnpm`.
  // Quoted text is data for the same reason heredoc text is.
  ['ALLOW', String.raw`grep -n 'pnpm build\|pnpm test' CLAUDE.md`],
  ['ALLOW', 'git commit -m "run pnpm build; then pnpm test"'],
  ['ALLOW', 'echo "pnpm build && pnpm test"'],
  // ...and a real command after a quoted argument must still be caught. These stay
  // DENY on purpose: a quote can hide a separator, and a WRONG rewrite runs a
  // command nobody typed, which is worse than a wrong refusal.
  ['DENY', 'echo "harmless text" && pnpm build'],
  ['DENY', "grep -n 'some pattern' file.md; pnpm build"],
]

function classify(out) {
  if (out.trim() === '') return { outcome: 'ALLOW' }
  let parsed
  try {
    parsed = JSON.parse(out)
  } catch {
    return { outcome: 'UNPARSEABLE' }
  }
  const spec = parsed.hookSpecificOutput ?? {}
  if (spec.permissionDecision === 'deny') return { outcome: 'DENY' }
  if (spec.updatedInput) {
    return {
      outcome: 'REWRITE',
      command: spec.updatedInput.command,
      decision: spec.permissionDecision,
      input: spec.updatedInput,
    }
  }
  return { outcome: 'ALLOW' }
}

let bad = 0
for (const [want, cmd, wantCommand, wantDecision] of cases) {
  const out = execFileSync('node', ['.claude/hooks/guard-bare-pnpm.mjs'], {
    input: JSON.stringify({
      tool_name: 'Bash',
      // `description` is here to prove updatedInput does not drop sibling fields:
      // it replaces the ENTIRE input object, so a rewrite that sends only
      // { command } silently discards whatever else the caller set.
      tool_input: { command: cmd, description: 'a description that must survive' },
    }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() },
  }).toString()

  const got = classify(out)
  const problems = []
  if (got.outcome !== want) problems.push(`want=${want} got=${got.outcome}`)
  if (want === 'REWRITE') {
    if (got.command !== wantCommand) problems.push(`command=${JSON.stringify(got.command)}`)
    if (got.decision !== wantDecision) problems.push(`decision=${got.decision}`)
    if (got.input?.description !== 'a description that must survive') {
      problems.push('updatedInput dropped a sibling field')
    }
  }
  if (problems.length > 0) bad++
  console.log(
    `${problems.length === 0 ? 'ok  ' : 'FAIL'} ${want.padEnd(7)} ${JSON.stringify(cmd).slice(0, 58)}` +
      (problems.length > 0 ? `\n       ${problems.join('; ')}` : ''),
  )
}
console.log(bad === 0 ? '\nall cases correct' : `\n${bad} FAILURES`)
process.exit(bad === 0 ? 0 : 1)
