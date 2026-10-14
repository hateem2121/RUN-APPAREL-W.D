#!/usr/bin/env node
/**
 * Did the shrink container's image move during this deploy? ci.yml's `deploy-shrink` job
 * pipes `wrangler containers list` into this after `wrangler deploy`, and retries it.
 *
 * WHY A SCRIPT. The check was inline shell until 2026-10-14 and had two faults, both seen on
 * the deploy of 727174aa (issue #177, a false alarm):
 *   1. It took the NEWEST "LAST MODIFIED" in the whole table. The account holds another
 *      project's container too, so a fresh image there could pass a stale one here, and a
 *      stale one there told it nothing either way. It now reads this container's own row.
 *   2. It read the table once, straight after the deploy. Cloudflare updated the row's
 *      timestamp to 06:44:26Z about a minute after the read, so a good deploy failed. The
 *      workflow now retries while this answers `old`.
 *
 * The row is named `<worker name>-<container class_name in lower case>` (from
 * apps/shrink/wrangler.jsonc); `shrinkImageMoved.test.ts` derives it from that file.
 *
 * Usage: wrangler containers list | node scripts/shrink-image-moved.mjs --name <row> --before <epoch>
 * Exit 0 = moved, 1 = older than this run, 2 = row or timestamp not found (the workflow warns).
 */
import { readFileSync, realpathSync } from 'node:fs'

/** The NAME column of `wrangler containers list` for a Worker's container class. */
export function containerRowName(workerName, className) {
  return `${workerName}-${className.toLowerCase()}`
}

/**
 * This container's LAST MODIFIED, in epoch seconds, or null when its row or stamp is absent.
 * Cloudflare prints nanoseconds (`2026-10-14T06:44:26.468999936Z`); Date.parse needs at most
 * milliseconds, so the fraction is cut to three digits first.
 */
export function lastModifiedEpoch(table, name) {
  for (const line of table.split('\n')) {
    const cells = line.split('│').map((cell) => cell.trim())
    if (!cells.includes(name)) continue
    const stamp = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z?/)
    if (!stamp) return null
    const fraction = stamp[2] ? stamp[2].slice(0, 4) : ''
    const ms = Date.parse(`${stamp[1]}${fraction}Z`)
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
  }
  return null
}

/** `moved` when the row changed at or after the run began, `old` before it, `unknown` if unread. */
export function imageVerdict(table, name, beforeEpoch) {
  const modified = lastModifiedEpoch(table, name)
  if (modified === null) return { verdict: 'unknown', modified }
  return { verdict: modified >= beforeEpoch ? 'moved' : 'old', modified }
}

function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  const name = arg('--name')
  const before = Number(arg('--before'))
  if (!name || !Number.isFinite(before)) {
    console.error('usage: … | node scripts/shrink-image-moved.mjs --name <row> --before <epoch>')
    process.exit(2)
  }
  const { verdict, modified } = imageVerdict(readFileSync(0, 'utf8'), name, before)
  const when = modified === null ? 'not found' : new Date(modified * 1000).toISOString()
  console.log(
    `${name}: last modified ${when}; run began ${new Date(before * 1000).toISOString()} → ${verdict}`,
  )
  process.exit(verdict === 'moved' ? 0 : verdict === 'old' ? 1 : 2)
}
