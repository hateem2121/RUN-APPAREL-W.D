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
 */
import { execFileSync } from 'node:child_process'
const cases = [
  ['DENY', 'pnpm build'],
  ['DENY', 'pnpm -r test'],
  ['DENY', 'NODE_ENV=production pnpm build'],
  ['DENY', 'cd apps/cms && pnpm dev'],
  ['DENY', 'time pnpm test'],
  ['ALLOW', 'npx --yes pnpm@10.33.0 build'],
  ['ALLOW', 'cat pnpm-lock.yaml'],
  ['ALLOW', 'grep -n pnpm docs/RUNBOOK.md'],
  ['ALLOW', 'git commit -m "use pnpm here"'],
  ['ALLOW', 'npx --yes pnpm@10.33.0 -r typecheck && npx --yes pnpm@10.33.0 build'],
  // the regression that blocked this guard's own commit:
  [
    'ALLOW',
    "git commit -F - <<'EOF'\nfeat: guard\n\n  denied   pnpm build\n  denied   pnpm -r test\nEOF",
  ],
  ['ALLOW', 'cat <<EOF\npnpm build\nEOF'],
  // ...but a real command AFTER a heredoc must still be caught:
  ['DENY', "cat <<'EOF'\nharmless text\nEOF\npnpm build"],
]
let bad = 0
for (const [want, cmd] of cases) {
  const out = execFileSync('node', ['.claude/hooks/guard-bare-pnpm.mjs'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
  }).toString()
  const got = out.includes('"deny"') ? 'DENY' : 'ALLOW'
  const ok = got === want
  if (!ok) bad++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} want=${want} got=${got}  ${JSON.stringify(cmd).slice(0, 70)}`,
  )
}
console.log(bad === 0 ? '\nall cases correct' : `\n${bad} FAILURES`)
process.exit(bad === 0 ? 0 : 1)
