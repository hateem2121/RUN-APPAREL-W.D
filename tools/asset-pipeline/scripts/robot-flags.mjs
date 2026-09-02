#!/usr/bin/env node
/**
 * Print the exact optimise flags the shrink robot would use for a file.
 *
 * The container (apps/shrink/container/server.ts) builds its flags in three steps —
 * `shrinkFlagsFor(detail)` in the Worker, then `describeGlb` on the file to decide its
 * family, then `refineFlagsForFamily` — and a local run that skips any of them is not a
 * reproduction of production. This prints the result of all three so a local
 * `pipeline optimize` can be given the same flags, which is how Rank 2 of the 2026-09
 * fix plan proved the two refused FIXED GLBs come out byte-identical before and after
 * the gate change.
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/robot-flags.mjs <file.glb> [--detail balanced|fidelity] [--json]
 */
import { resolve } from 'node:path'
import { shrinkFlagsFor } from '../../../packages/shared/src/shrink.ts'
import { describeGlb } from '../src/describe.ts'
import { refineFlagsForFamily } from '../src/strategy.ts'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: robot-flags.mjs <file.glb> [--detail balanced|fidelity] [--json]')
  process.exit(2)
}
const detailIndex = args.indexOf('--detail')
const detail = detailIndex >= 0 ? args[detailIndex + 1] : undefined
const description = await describeGlb(resolve(file))
const family = description.error ? 'mixed' : description.family
const flags = refineFlagsForFamily(shrinkFlagsFor(detail), family)
if (args.includes('--json')) {
  console.log(JSON.stringify({ file, detail: detail ?? 'default', family, flags }))
} else {
  console.error(
    `# ${file}: family ${family}${description.error ? ` (describe error: ${description.error})` : ''}`,
  )
  console.log(flags.join(' '))
}
