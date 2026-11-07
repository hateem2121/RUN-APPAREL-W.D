#!/usr/bin/env node
/**
 * Make a `wrangler d1 export` dump loadable INTO D1: every CREATE TABLE first, then the rest.
 *
 *   node scripts/order-d1-dump.mjs <dump.sql> <out.sql>
 *
 * WHY (restore drill, 2026-11-07). The export INTERLEAVES its output: `CREATE TABLE users_sessions`
 * (foreign key → `users`), then an INSERT into it, then `CREATE TABLE users`. D1 resolves the
 * parent table when the row goes in, even under the dump's own `PRAGMA defer_foreign_keys=TRUE`, so
 * docs/BACKUP-RESTORE.md's "Restoring D1 from a SQL dump" failed on the first statement that
 * needed it: `no such table: main.users: SQLITE_ERROR`, and D1 rolled the whole import back.
 * scripts/verify-backup.mjs had met the same ordering on 2026-08-13 and replays with foreign keys
 * OFF — right for proving the CONTENT, impossible on D1, which cannot switch them off.
 *
 * What moves: whole statements, never their text. Tables are created parents first, then their
 * rows are inserted parents first (each table's rows in the export's own order), then everything
 * else (indexes, triggers) in its original order. The second drill import proved the first half
 * alone was not enough: D1 loads in batches, so a child ROW ahead of its parent row also fails.
 *
 * It then PROVES the result: the output is replayed into an in-memory SQLite with foreign keys
 * ON (as D1 runs) and `PRAGMA foreign_key_check` must be empty, and every table must hold the same
 * number of rows as the original replayed with foreign keys OFF. Exit 1 if either fails.
 */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

/**
 * Statements of the dump, kept whole. A statement ends ONLY at a `;` outside every quoted text
 * ('…' with '' escapes, "…", `…`, […]) and outside comments.
 *
 * ⚠️ NEVER split on lines. The first version started a new statement at any line beginning
 * "INSERT INTO" — inside a stored text too — and the dump holds text visitors typed (inquiry
 * messages). A message carrying such a line would have been cut out of its row and, reordered,
 * RUN as a statement during a restore (security review of PR #348, 2026-11-07). The tests plant
 * exactly that.
 * @param {string} sql
 * @returns {string[]}
 */
export function statements(sql) {
  const out = []
  let start = 0
  let quote = null
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (quote) {
      if (c === quote) {
        if (quote === "'" && sql[i + 1] === "'") i++
        else quote = null
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '[') quote = ']'
    else if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 1
    } else if (c === ';') {
      const stmt = sql.slice(start, i + 1).trim()
      if (stmt) out.push(stmt)
      start = i + 1
    }
  }
  if (quote)
    throw new Error('the dump ends inside a quoted text; refusing to guess where statements end')
  const tail = sql.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

const nameOf = (stmt) =>
  /^(?:CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO) [`"]([^`"]+)[`"]/.exec(stmt)?.[1]

/**
 * Parents before children: tables ordered so every table a FOREIGN KEY names comes first
 * (a table's link to itself is ignored; rows inside a table keep the export's order).
 * @param {Map<string, Set<string>>} parents
 */
function parentsFirst(parents) {
  const done = new Set()
  const order = []
  const visit = (t, path) => {
    if (done.has(t) || path.has(t)) return
    path.add(t)
    for (const p of parents.get(t) ?? []) if (p !== t && parents.has(p)) visit(p, path)
    path.delete(t)
    done.add(t)
    order.push(t)
  }
  for (const t of parents.keys()) visit(t, new Set())
  return order
}

/**
 * @param {string} sql
 * @returns {{ ordered: string, moved: number }}
 */
export function orderDump(sql) {
  const head = []
  const creates = new Map()
  const rows = new Map()
  const rest = []
  for (const stmt of statements(sql)) {
    if (/^PRAGMA /.test(stmt) && creates.size === 0 && rows.size === 0) head.push(stmt)
    else if (/^CREATE TABLE /.test(stmt)) {
      const t = nameOf(stmt)
      if (!t || creates.has(t))
        throw new Error(`cannot name, or a second definition of, a table: ${stmt.slice(0, 80)}`)
      creates.set(t, stmt)
    } else if (/^INSERT INTO /.test(stmt) && nameOf(stmt)) {
      const t = nameOf(stmt)
      if (!rows.has(t)) rows.set(t, [])
      rows.get(t).push(stmt)
    } else rest.push(stmt)
  }
  const parents = new Map(
    [...creates].map(([t, stmt]) => [
      t,
      new Set([...stmt.matchAll(/REFERENCES [`"]([^`"]+)[`"]/g)].map((m) => m[1])),
    ]),
  )
  const order = parentsFirst(parents)
  const orphanRows = [...rows.keys()].filter((t) => !creates.has(t))
  const ordered = [
    ...head,
    ...order.map((t) => creates.get(t)),
    ...order.flatMap((t) => rows.get(t) ?? []),
    ...orphanRows.flatMap((t) => rows.get(t)),
    ...rest,
  ].join('\n')
  return { ordered, moved: creates.size }
}

/** Row count of every user table after replaying `sql`. */
export function tableCounts(sql, { foreignKeys }) {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`)
    // STRICT, statement by statement: D1 loads a file in BATCHES (measured 2026-11-07: a child row
    // ahead of its parent row failed there with "FOREIGN KEY constraint failed", though the dump's
    // own `PRAGMA defer_foreign_keys=TRUE` would have held it inside one transaction). Passing
    // with every row checked as it lands is the strictest replay, so D1 must accept it too.
    db.exec(sql)
    const violations = db.prepare('PRAGMA foreign_key_check').all()
    const counts = {}
    const digests = {}
    for (const { name } of db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()) {
      counts[name] = db
        .prepare(`SELECT count(*) AS n FROM "${String(name).replaceAll('"', '""')}"`)
        .get().n
      // The CONTENT, not just the count: every row as JSON, sorted, hashed (security review, PR #348).
      const rows = db
        .prepare(`SELECT * FROM "${String(name).replaceAll('"', '""')}"`)
        .all()
        .map((r) => JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? String(v) : v)))
        .sort()
      digests[name] = createHash('sha256').update(rows.join('\n')).digest('hex')
    }
    return { counts, digests, violations: violations.length }
  } finally {
    db.close()
  }
}

function main([input, output]) {
  if (!input || !output) {
    console.error('usage: node scripts/order-d1-dump.mjs <dump.sql> <out.sql>')
    return 2
  }
  const sql = readFileSync(input, 'utf8')
  const { ordered, moved } = orderDump(sql)
  const before = tableCounts(sql, { foreignKeys: false })
  let after
  try {
    after = tableCounts(ordered, { foreignKeys: true })
  } catch (err) {
    console.error(
      `::error::the reordered dump still does not load with foreign keys ON: ${err.message}`,
    )
    return 1
  }
  const tables = Object.keys(before.counts)
  const differ = tables.filter(
    (t) => before.counts[t] !== after.counts[t] || before.digests[t] !== after.digests[t],
  )
  if (
    after.violations > 0 ||
    differ.length > 0 ||
    Object.keys(after.counts).length !== tables.length
  ) {
    console.error(
      `::error::reordered dump differs: ${after.violations} broken links; tables differing: ${differ.join(', ') || 'none'}`,
    )
    return 1
  }
  writeFileSync(output, ordered)
  const rows = Object.values(after.counts).reduce((a, b) => a + b, 0)
  console.log(
    `moved ${moved} CREATE TABLE statements first; ${tables.length} tables, ${rows} rows, every row identical; loads with foreign keys ON`,
  )
  return 0
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
