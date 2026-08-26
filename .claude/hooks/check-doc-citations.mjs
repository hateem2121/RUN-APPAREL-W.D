#!/usr/bin/env node
/**
 * PostToolUse hook — re-run the citation checker after a Markdown edit.
 *
 * WHY THIS EXISTS. Every document here is citation-checked in CI
 * (`apps/cms/src/claudeMd.test.ts` is the gate), and breaking one is the single
 * most repeated way this repo has gone red. Three of the twenty-five commits before
 * 2026-08-26 were repairs to citations that had ALREADY reached CI:
 *
 *   ad6bfa7  "exempt the gitignored .env.local citation the previous commit broke CI with"
 *   50ebfba  "stop the never-cite-generated-directories warning citing one"
 *   fe7e9e7  "cite the decoder generator, not the generated directory"
 *
 * Note the second and third: the WARNING about not citing generated directories
 * broke CI by citing one, and the fix for it needed a fix. That is a class of
 * mistake prose review does not catch, because the sentence reads correctly.
 *
 * WHY IT IS AFFORDABLE. Measured 2026-08-26: `node scripts/doc-citations.mjs`
 * reports "684 citations checked across 50 documents; 0 unresolved" in 47ms. Those
 * three CI round trips cost more than running this on every Markdown edit for the
 * life of the repo.
 *
 * WHY IT REPORTS RATHER THAN BLOCKS. A citation can legitimately be unresolved for
 * one edit — the path it names is about to be created in the next. Blocking would
 * force the writing order rather than the result. PostToolUse `additionalContext`
 * puts the failure in front of Claude at the moment it is cheap to fix, which is
 * the whole difference between this and finding out from CI.
 *
 * ⚠️ The bare command was NOT usable before 2026-08-19 — the script was a module
 * with no `main` and exited 0 having checked nothing, and CLAUDE.md said so for
 * months after it was fixed. It is a real command now: it prints a line per
 * unresolved citation and exits 1. Re-measure before trusting this comment.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const CHECKER = 'scripts/doc-citations.mjs'

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
  const filePath = event.tool_input?.file_path
  if (typeof filePath !== 'string' || !filePath.endsWith('.md')) process.exit(0)

  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  if (!existsSync(join(root, CHECKER))) process.exit(0)

  const run = spawnSync(process.execPath, [CHECKER], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  })

  // status 0 is the healthy case and needs no words; a null status means the run
  // was killed or never started, which is not a citation failure and must not be
  // reported as one.
  if (run.status === 0 || run.status === null) process.exit(0)

  const detail = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `${CHECKER} now fails after this edit — CI gates on it ` +
          `(apps/cms/src/claudeMd.test.ts). Fix it now rather than at the push:\n\n${detail}`,
      },
    }),
  )
} catch {
  // Never break a session over a checker that could not be run.
}
process.exit(0)
