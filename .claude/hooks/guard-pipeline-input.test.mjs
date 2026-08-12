/**
 * Cases for guard-pipeline-input.mjs. Run from the repo root:
 *
 *   node .claude/hooks/guard-pipeline-input.test.mjs
 *
 * NOT part of `pnpm test` — .claude/ is not a workspace package, so vitest never
 * sees it. Run this and the sibling guard-bare-pnpm cases after touching either
 * guard or shell.mjs.
 *
 * WHY THIS FILE EXISTS. It did not, until 2026-08-12. Both guards share
 * ./shell.mjs precisely so their answers cannot drift, but only one of them had
 * cases — so a change to the shared parser was verified against half its
 * consumers. That is the same shape as isMediaReferenced vs find-orphan-media.mjs
 * in CLAUDE.md, where two things that had to agree silently stopped agreeing.
 *
 * The ALLOW half matters as much as the DENY half: CLAUDE.md's own diagnosis
 * workflow reads FROM output/ on purpose, and a guard that blocks the documented
 * command gets switched off within a day.
 */
import { execFileSync } from 'node:child_process'

const cases = [
  // The trap itself: optimize/merge re-encode geometry, so their INPUTS matter.
  ['DENY', 'pnpm pipeline optimize output/n001.glb --out output/n001-2.glb'],
  ['DENY', 'pnpm pipeline optimize ./output/x.glb'],
  ['DENY', 'pnpm pipeline optimize tools/asset-pipeline/output/x.glb'],
  ['DENY', 'pnpm pipeline merge output/a.glb=VARIANT-1 output/b.glb=VARIANT-2'],

  // --out pointing INTO output/ is the normal case and must never be blocked.
  ['ALLOW', 'pnpm pipeline optimize raw/garment.glb --out output/n001.glb'],
  ['ALLOW', 'pnpm pipeline merge raw/a.glb=VARIANT-1 --out output/merged.glb'],

  // Read-only subcommands are allowed wherever they read from — this is the
  // workflow CLAUDE.md tells you to run.
  ['ALLOW', 'pnpm pipeline compare output/before output/after --out sheet.png'],
  ['ALLOW', 'pnpm pipeline render out.glb --out output/after'],
  ['ALLOW', 'pnpm pipeline textures output/x.glb --out output/textures'],
  ['ALLOW', 'pnpm pipeline validate output/x.glb'],

  // A file merely NAMED like output must not match — isUnderOutput matches on
  // path segments, not substrings.
  ['ALLOW', 'pnpm pipeline optimize raw/my-output.glb'],

  // The subcommand word alone is not enough; it has to follow the pipeline itself.
  ['ALLOW', 'git commit -m "optimize the output/ handling"'],

  // The regression that moved parsing into shell.mjs: prose in a heredoc commit
  // message described the denied command and was parsed as it.
  [
    'ALLOW',
    "git commit -F - <<'EOF'\nfix(hooks): guard\n\n  denied   pipeline optimize output/n001.glb\nEOF",
  ],
  // ...but a real command AFTER a heredoc must still be caught — the control.
  ['DENY', "cat <<'EOF'\nharmless text\nEOF\npnpm pipeline optimize output/n001.glb"],

  // Added 2026-08-12 with the quote-aware segments() fix: operators inside quotes
  // are data, so a grep whose PATTERN mentions the denied command is allowed.
  ['ALLOW', String.raw`grep -rn 'pipeline optimize output/\|merge output/' docs/`],
  ['ALLOW', 'echo "never run pipeline optimize output/x.glb; it drops artwork"'],
  // ...and a real command after a quoted argument is still caught.
  ['DENY', 'echo "safe text" && pnpm pipeline optimize output/x.glb'],
]

let bad = 0
for (const [want, cmd] of cases) {
  const out = execFileSync('node', ['.claude/hooks/guard-pipeline-input.mjs'], {
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
