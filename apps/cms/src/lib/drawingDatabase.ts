import { keptRender } from '../../pageCache.mjs'

/**
 * The D1 binding Payload is given (payload.config.ts), choosing per query which copy of the
 * database answers (faster-taps plan, Task 7, owner's choice of 27 Oct).
 *
 * A drawing the shared store will keep (pageCache.mjs keptRenders: a website page, tap data or a
 * garment's data drawn on a miss) reads through ITS OWN D1 session, opened `first-primary` at its
 * first query: that query goes to the main database, and every later one may be answered by a
 * read-only copy near the buyer that is at least as new. Everything else (visitors served live,
 * the admin, every save) reads the database exactly as before.
 *
 * WHY. A drawing makes several trips to the database in Eastern North America; the store's
 * drawings took 341 ms typically and 1,472 ms at the 90th percentile (7 days to 27 Oct, 3,210
 * drawings). Cloudflare keeps the copies at no extra cost, once replication is switched on for
 * the database ("Global read replication", D1 docs, updated 10 Aug 2026).
 *
 * ⚠️ NOT PAYLOAD'S OWN READ-REPLICA SWITCH. Payload 3.92 opens that session once, when it connects
 * (db-d1-sqlite dist/connect.js), and content.ts keeps one Payload per Worker copy. A copy running
 * since before a save would then redraw a kept page from a database copy that had not caught up,
 * and the store would keep the pre-save page for up to a day. A session per drawing cannot: it
 * starts at the main database after the save. src/readReplicas.test.ts keeps the switch off.
 *
 * Statements and their batch stay on one session because both are asked for inside the same
 * drawing. A database without sessions (an older local emulator) is read as it is.
 */
export function drawingDatabase(db: D1Database): D1Database {
  if (!db) return db
  const reader = (): D1Database | D1DatabaseSession => {
    const render = keptRender() as { database?: D1DatabaseSession } | undefined
    if (!render || typeof db.withSession !== 'function') return db
    render.database ??= db.withSession('first-primary')
    return render.database
  }
  return {
    prepare: (query: string) => reader().prepare(query),
    batch: <T = unknown>(statements: D1PreparedStatement[]) => reader().batch<T>(statements),
    exec: (query: string) => db.exec(query),
    withSession: (constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint) =>
      db.withSession(constraintOrBookmark),
  } as D1Database
}
