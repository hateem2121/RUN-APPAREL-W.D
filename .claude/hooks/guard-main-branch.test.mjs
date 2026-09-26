/**
 * Cases for guard-main-branch.mjs. Run from the repo root:
 *
 *   node .claude/hooks/guard-main-branch.test.mjs
 *
 * NOT part of `pnpm test` — .claude/ is not a workspace package — but
 * `.claude/skills/gates/run-gates.mjs` runs it with the other hook tests.
 *
 * The branch half cannot be tested against this checkout (its branch changes), so two
 * throwaway repositories are made in the OS temp directory: one on `main`, one on a
 * feature branch. The hook runs as a real process with each as its `cwd`, exactly as the
 * harness runs it. The ALLOW half matters as much as the DENY half: a guard that blocks
 * `git merge --ff-only origin/main` or a commit message mentioning main would be switched
 * off within a day.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function repoOn(branch) {
  const dir = mkdtempSync(join(tmpdir(), `guard-main-${branch}-`))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git(
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'root',
  )
  if (branch !== 'main') git('switch', '-q', '-c', branch)
  return dir
}

const onMain = repoOn('main')
const onFeature = repoOn('feature')

const cases = [
  // Commits made ON main: the half nothing else catches.
  ['DENY', onMain, 'git commit -m "fix a thing"'],
  ['DENY', onMain, 'git add -A && git commit --amend --no-edit'],
  ['DENY', onMain, 'git cherry-pick abc123'],
  ['DENY', onMain, 'git -c user.name=x commit -m y'],
  // ...and the same commands on a branch are the normal case.
  ['ALLOW', onFeature, 'git commit -m "fix a thing"'],
  ['ALLOW', onFeature, 'git cherry-pick abc123'],

  // Pushes whose destination is main, from anywhere.
  ['DENY', onFeature, 'git push origin main'],
  ['DENY', onFeature, 'git push origin HEAD:main'],
  ['DENY', onFeature, 'git push origin +feature:refs/heads/main'],
  ['DENY', onFeature, 'git push origin :main'],
  ['DENY', onFeature, 'git push --all origin'],
  ['DENY', onFeature, 'git push -o ci.skip origin main'],
  // Pushes that send main because of where you stand.
  ['DENY', onMain, 'git push'],
  ['DENY', onMain, 'git push origin'],
  ['DENY', onMain, 'git push -u origin HEAD'],
  // Normal pushes of a branch.
  ['ALLOW', onFeature, 'git push -u origin feature'],
  ['ALLOW', onFeature, 'git push'],
  ['ALLOW', onFeature, 'git push origin HEAD'],
  ['ALLOW', onFeature, 'git push origin main-fix'],

  // Keeping a local main current is routine and adds no commit of ours.
  ['ALLOW', onMain, 'git merge --ff-only origin/main'],
  ['ALLOW', onMain, 'git pull --ff-only'],
  ['ALLOW', onMain, 'git switch -c clean-slate'],
  ['ALLOW', onMain, 'git status && git log -3'],

  // Text that only MENTIONS the denied commands is data, not a command.
  ['ALLOW', onFeature, "git commit -F - <<'EOF'\nDocs: never git push origin main\n\nEOF"],
  ['ALLOW', onMain, 'grep -n "git commit" CONTRIBUTING.md'],
  ['ALLOW', onMain, 'echo "git push origin main is blocked"'],
  // ...but a real command after that text is still caught — the control.
  ['DENY', onFeature, 'echo "safe" && git push origin main'],
  ['DENY', onMain, "cat <<'EOF'\nnotes\nEOF\ngit commit -m x"],

  // `git -C <dir>` is judged by that directory, not the session's.
  ['DENY', onFeature, `git -C ${onMain} commit -m x`],
  ['ALLOW', onMain, `git -C ${onFeature} commit -m x`],
]

let bad = 0
try {
  for (const [want, cwd, cmd] of cases) {
    const out = execFileSync('node', ['.claude/hooks/guard-main-branch.mjs'], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd }),
    }).toString()
    const got = out.includes('"deny"') ? 'DENY' : 'ALLOW'
    const ok = got === want
    if (!ok) bad++
    const where = cwd === onMain ? 'main   ' : 'feature'
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} want=${want} got=${got} on ${where} ${JSON.stringify(cmd).slice(0, 60)}`,
    )
  }
} finally {
  rmSync(onMain, { recursive: true, force: true })
  rmSync(onFeature, { recursive: true, force: true })
}
console.log(bad === 0 ? '\nall cases correct' : `\n${bad} FAILURES`)
process.exit(bad === 0 ? 0 : 1)
