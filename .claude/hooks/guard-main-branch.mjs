/**
 * PreToolUse guard — refuse a commit made ON `main`, and a push whose destination is `main`.
 *
 * WHY THIS EXISTS. "Branch off `main`; never commit to it" has been an owner rule since
 * 2026-09-02, and until 2026-09-26 it lived only in prose. The two halves are not equally
 * covered elsewhere:
 *
 *   - PUSH: GitHub's ruleset on `main` already refuses a direct push (`.github/CLAUDE.md`,
 *     ruleset 22763709), so this half is a second line — it turns a remote refusal into a
 *     local one with the fix in the message.
 *   - COMMIT: nothing else sees it. A commit made on a local `main` sits there silently and
 *     the refusal arrives later, at push time, far from its cause — and "just push it" is the
 *     tempting wrong fix. This is the half that earns the hook.
 *
 * WHAT IT DELIBERATELY ALLOWS. Updating a local `main` (`git merge --ff-only origin/main`,
 * `git pull`) is routine here and creates no commit of ours, so only `commit`,
 * `cherry-pick`, `revert` and `am` are refused on `main`. Any other branch, and a detached
 * HEAD, is never touched.
 *
 * WHY A STRUCTURED DENY, NOT EXIT CODE 2. Both block. The sibling guards use
 * `permissionDecision: "deny"`, which carries the reason in a field the harness documents;
 * one convention across the three guards is easier to read than two.
 *
 * KNOWN LIMIT. The branch is read in the hook's `cwd` (or a `git -C <dir>`), so
 * `cd elsewhere && git commit` is judged by the directory the session is in. That errs
 * toward the session's own checkout, which is the one this rule protects.
 */

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { segments, tokenize } from './shell.mjs'

/** Commands that create a commit on the current branch. */
const COMMIT_MAKERS = new Set(['commit', 'cherry-pick', 'revert', 'am'])

/** git's own global options that consume the next token. */
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

/** `git push` options that consume the next token, so it is not read as a refspec. */
const PUSH_VALUE_OPTIONS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])

/** The subcommand, its arguments and any `-C <dir>`, or null if this is not a git call. */
function gitCall(tokens) {
  if (tokens[0] !== 'git') return null
  let dir = null
  let i = 1
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const option = tokens[i]
    if (GIT_VALUE_OPTIONS.has(option)) {
      if (option === '-C') dir = tokens[i + 1] ?? null
      i += 2
    } else {
      i++
    }
  }
  if (i >= tokens.length) return null
  return { sub: tokens[i], args: tokens.slice(i + 1), dir }
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return null // not a repository, or git missing: never block on what we cannot read
  }
}

/** True if a refspec's destination is `main` (`main`, `+main`, `HEAD:main`, `:main`, `refs/heads/main`). */
function destinationIsMain(refspec) {
  const spec = refspec.replace(/^\+/, '')
  const destination = spec.includes(':') ? spec.slice(spec.lastIndexOf(':') + 1) : spec
  return destination === 'main' || destination === 'refs/heads/main'
}

/** Why this push would write to `main`, or null. */
function pushProblem(args, branch) {
  if (args.includes('--all') || args.includes('--mirror')) {
    return 'it pushes every branch, `main` included'
  }
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('-')) {
      if (PUSH_VALUE_OPTIONS.has(arg)) i++
      continue
    }
    positional.push(arg)
  }
  const refspecs = positional.slice(1) // the first positional is the remote
  if (refspecs.some(destinationIsMain)) return 'it names `main` as the destination'
  if (branch === 'main' && refspecs.length === 0) {
    return 'you are on `main`, so a bare push sends `main`'
  }
  if (branch === 'main' && refspecs.some((spec) => spec === 'HEAD' || spec === '@')) {
    return 'you are on `main`, so pushing HEAD sends `main`'
  }
  return null
}

/** The first reason to refuse this command, or null. Exported for the test. */
export function refusal(command, cwd) {
  for (const segment of segments(command)) {
    const call = gitCall(tokenize(segment.trim()))
    if (!call) continue
    const where = call.dir ? (isAbsolute(call.dir) ? call.dir : join(cwd, call.dir)) : cwd
    if (COMMIT_MAKERS.has(call.sub)) {
      if (currentBranch(where) === 'main') {
        return `\`git ${call.sub}\` would add a commit to \`main\`.`
      }
      continue
    }
    if (call.sub === 'push') {
      const problem = pushProblem(call.args, currentBranch(where))
      if (problem) return `This push would write to \`main\`: ${problem}.`
    }
  }
  return null
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Blocked: ${reason}\n\n` +
          'Work reaches `main` only through a pull request, which the owner merges (the root\n' +
          'CLAUDE.md, "How work is done here"). Put the work on a branch instead:\n' +
          '  git switch -c <short-name>      # uncommitted changes come with you\n' +
          'A commit already made on main moves with:\n' +
          '  git switch -c <short-name> && git branch -f main origin/main',
      },
    }),
  )
  process.exit(0)
}

// Run as a hook only when executed directly, so the test can import refusal(). Compared
// through realpath + pathToFileURL, as scripts/quoted-settings.mjs does: a plain
// `file://${argv[1]}` misses a path with a space or a symlink (fixed repo-wide in #71).
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
    const reason = refusal(command, payload.cwd ?? process.cwd())
    if (reason) deny(reason)
    process.exit(0)
  })
}
