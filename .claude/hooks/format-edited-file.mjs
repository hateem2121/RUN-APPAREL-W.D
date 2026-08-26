#!/usr/bin/env node
/**
 * PostToolUse hook — run Biome over the one file that was just edited.
 *
 * WHY THIS EXISTS. `pnpm lint` (`biome check .`) is the FIRST gate in CI's order,
 * and it is the cheapest one to fail on: a formatting-only diff costs a full red
 * run and a round trip, and says nothing about the change that caused it. Nothing
 * in this repo formatted a file after an edit until 2026-08-26 — every one of the
 * three PreToolUse guards prevents a disaster, none of them caught a stray space.
 *
 * WHY IT IS AFFORDABLE. Measured on this machine 2026-08-26 with the local binary:
 * `biome check` on a single file reports "Checked 1 file in 2ms". Whole-repo
 * `biome check .` is the CI gate; this is deliberately NOT that — one file, so the
 * cost is per-edit noise rather than a build.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *
 *   - It never blocks. PostToolUse runs after the edit already landed, so a
 *     non-zero exit here would only produce noise. Every path exits 0.
 *   - It does not run when the local binary is absent. `node_modules/.bin/biome`
 *     only exists after an install, and a hook that fails loudly on a fresh clone
 *     is a hook the owner learns to switch off — the same reasoning
 *     guard-pipeline-input.mjs states about gates that get overridden.
 *   - It skips GENERATED files. `apps/cms/src/app/(payload)/admin/importMap.js` is
 *     rewritten by `next dev` in Payload's own formatting, and CLAUDE.md is explicit:
 *     "Do not 'fix' it by reformatting the generated file into the repo." Biome's own
 *     config already excludes next-env.d.ts, the migrations and payload-types.ts
 *     (biome.jsonc), so those need no handling here — the import map is the one the
 *     config does not cover.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative, isAbsolute } from 'node:path'

/** Extensions Biome actually parses. Anything else is a no-op, so skip the spawn. */
const HANDLED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc', '.css'])

/**
 * Generated files Biome's config does NOT exclude but this repo still must not
 * reformat. Kept as a suffix match so the parenthesised Payload route segment does
 * not have to be spelled twice.
 */
const GENERATED = ['admin/importMap.js']

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
  if (typeof filePath !== 'string' || filePath.length === 0) process.exit(0)

  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

  // Outside the repo means outside Biome's config, so there is nothing to apply.
  const rel = relative(root, filePath)
  if (rel.startsWith('..') || isAbsolute(rel)) process.exit(0)

  const dot = filePath.lastIndexOf('.')
  if (dot === -1 || !HANDLED.has(filePath.slice(dot))) process.exit(0)
  if (GENERATED.some((suffix) => filePath.endsWith(suffix))) process.exit(0)

  const binary = join(root, 'node_modules/.bin/biome')
  if (!existsSync(binary)) process.exit(0)

  // --write applies safe fixes; --no-errors-on-unmatched keeps a file Biome's own
  // `files.includes` excludes from being reported as a failure by this hook.
  spawnSync(binary, ['check', '--write', '--no-errors-on-unmatched', filePath], {
    cwd: root,
    stdio: 'ignore',
    timeout: 15_000,
  })
} catch {
  // A guard that throws on a malformed payload is worse than one that does nothing.
}
process.exit(0)
