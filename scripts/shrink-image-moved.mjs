#!/usr/bin/env node
/**
 * Which image does the shrink container run? ci.yml's `deploy-shrink` job asks this BEFORE
 * `wrangler deploy` and again after it, and fails when the image did not change, or changed and
 * then went back.
 *
 * WHY THE IMAGE AND NOT A TIMESTAMP (2026-10-14, issues #177 and #179). Until then the check read
 * the LAST MODIFIED column of `wrangler containers list`, and that column does not follow a
 * deploy: on 1734cac9 it moved to 08:07:29, 3.5 minutes after wrangler swapped the image, and on
 * 10e88123 it still said 08:07:29 nine minutes after `wrangler containers info` showed the new
 * image (updated_at 09:11:57). Three good deploys failed on it. The application record from
 * `containers info` names the exact image (`configuration.image`, a sha256 digest), so before and
 * after can be compared directly, and an image put back afterwards shows as the old digest, which
 * no timestamp can tell apart from a deploy. Something did put the old image back between 08:03
 * and 09:11 that day: 10e88123's deploy replaced f686a27f, not 1734cac9's da9c0c00.
 *
 * The row is named `<worker name>-<container class_name in lower case>` (from
 * apps/shrink/wrangler.jsonc); `shrinkImageMoved.test.ts` derives it from that file. The table also
 * lists another project's container: only this row is read.
 *
 * Usage: node scripts/shrink-image-moved.mjs current --name <row>
 * Prints the digest (`sha256:…`, never the registry path, which carries the account ID).
 * Exit 0 = printed, 2 = the row or its image was not found, 3 = a wrangler read failed.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

/** The NAME column of `wrangler containers list` for a Worker's container class. */
export function containerRowName(workerName, className) {
  return `${workerName}-${className.toLowerCase()}`
}

/** The ID cell of this container's row in `wrangler containers list`, or null. */
export function rowId(table, name) {
  for (const line of table.split('\n')) {
    const cells = line.split('│').map((cell) => cell.trim())
    if (!cells.includes(name)) continue
    return (
      cells.find((cell) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cell),
      ) ?? null
    )
  }
  return null
}

/** The image digest in `wrangler containers info <id>` output, or null. */
export function imageDigest(info) {
  const start = info.indexOf('{')
  const end = info.lastIndexOf('}')
  if (start === -1 || end < start) return null
  let record
  try {
    record = JSON.parse(info.slice(start, end + 1))
  } catch {
    return null
  }
  const image = record?.configuration?.image
  if (typeof image !== 'string') return null
  return image.match(/@(sha256:[0-9a-f]{64})$/)?.[1] ?? null
}

function wrangler(...args) {
  return spawnSync('pnpm', ['--filter', '@run-apparel/shrink', 'exec', 'wrangler', ...args], {
    encoding: 'utf8',
  })
}

function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  const name = arg('--name')
  if (process.argv[2] !== 'current' || !name) {
    console.error('usage: node scripts/shrink-image-moved.mjs current --name <row>')
    process.exit(2)
  }
  const list = wrangler('containers', 'list')
  if (list.status !== 0) {
    console.error(`wrangler containers list failed:\n${list.stdout}${list.stderr}`)
    process.exit(3)
  }
  const id = rowId(list.stdout, name)
  if (!id) {
    console.error(`no row named ${name} in wrangler containers list:\n${list.stdout}`)
    process.exit(2)
  }
  const info = wrangler('containers', 'info', id)
  if (info.status !== 0) {
    console.error(`wrangler containers info failed:\n${info.stdout}${info.stderr}`)
    process.exit(3)
  }
  const digest = imageDigest(info.stdout)
  if (!digest) {
    console.error(`no image digest in wrangler containers info ${id}`)
    process.exit(2)
  }
  console.log(digest)
}
