import { describe, expect, it } from 'vitest'
import {
  EXACT_ROWS,
  MINIMUM_ROWS,
  MUST_NOT_BE_EMPTY,
  claimedInserts,
  verify,
} from '../../../scripts/verify-backup.mjs'

/**
 * The volume floors (L20-03) are sized for a REAL production dump — 50 products,
 * 15 media. GOOD_DUMP carries one of each on purpose, because the tests that use it
 * are about replay mechanics, not about how much data a backup should hold.
 * Switching the floors off in those tests states that difference instead of
 * quietly inflating a fixture until it clears a threshold it was never testing.
 */
const NO_VOLUME_CHECKS = { minimumRows: {}, exactRows: {} }

/**
 * Tests for the nightly backup verifier.
 *
 * WHY EVERY CASE HERE IS A NEGATIVE CONTROL. The verifier's job is to distrust a
 * backup, and the only way it can fail at that job is by passing. A verifier that
 * returns `ok: true` unconditionally produces exactly the output a working one does,
 * every night, until the day someone needs the backup.
 *
 * So each block below constructs a specific broken dump — truncated, empty, cascading,
 * schema-only — and requires a failure. The one positive case is last.
 *
 * The truncated case is the realistic one: `wrangler d1 export` writes to a file and a
 * failed upload, a full disk or a killed process leaves a prefix behind. A prefix of
 * valid SQL is still valid SQL right up until it is not, which is why this executes
 * the dump rather than parsing it.
 */

const SCHEMA = `
CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);
CREATE TABLE products (id INTEGER PRIMARY KEY, slug TEXT NOT NULL);
CREATE TABLE site_settings (id INTEGER PRIMARY KEY, catalogue_url TEXT);
CREATE TABLE media (id INTEGER PRIMARY KEY, filename TEXT NOT NULL);
CREATE TABLE colourways (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slug TEXT NOT NULL
);
`

const GOOD_DUMP = `${SCHEMA}
INSERT INTO users VALUES (1, 'owner@example.com');
INSERT INTO products VALUES (1, 'n001');
INSERT INTO site_settings VALUES (1, 'https://example.com/catalogue');
INSERT INTO media VALUES (1, 'n001.glb');
INSERT INTO colourways VALUES (1, 1, 'wine');
INSERT INTO colourways VALUES (2, 1, 'navy');
`

describe('claimedInserts', () => {
  it('counts INSERT statements per table', () => {
    const counts = claimedInserts(GOOD_DUMP) as Map<string, number>
    expect(counts.get('colourways')).toBe(2)
    expect(counts.get('products')).toBe(1)
  })

  it('handles quoted and INSERT OR REPLACE forms, which wrangler emits', () => {
    const counts = claimedInserts(
      `INSERT INTO "products" VALUES (1);\nINSERT OR REPLACE INTO products VALUES (2);`,
    ) as Map<string, number>
    expect(counts.get('products')).toBe(2)
  })
})

describe('verify — a backup that should be rejected', () => {
  it('rejects an empty file', () => {
    const result = verify('   ')
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('empty')
  })

  it('rejects a dump truncated mid-statement', () => {
    // The realistic corruption: a valid prefix. Nothing short of executing it notices.
    const truncated = `${SCHEMA}\nINSERT INTO users VALUES (1, 'owner@exa`
    const result = verify(truncated)

    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('does NOT restore')
  })

  it('rejects a schema-only dump with no data', () => {
    // Exits 0 from wrangler, parses perfectly, restores perfectly, and contains
    // nothing. This is the failure that looks most like success.
    const result = verify(SCHEMA)

    expect(result.ok).toBe(false)
    const message = result.problems.join(' ')
    for (const table of MUST_NOT_BE_EMPTY as string[]) {
      expect(message).toContain(table)
    }
  })

  it('rejects a dump missing a required table entirely', () => {
    const noUsers = `
CREATE TABLE products (id INTEGER PRIMARY KEY);
CREATE TABLE site_settings (id INTEGER PRIMARY KEY);
CREATE TABLE media (id INTEGER PRIMARY KEY);
INSERT INTO products VALUES (1);
INSERT INTO site_settings VALUES (1);
INSERT INTO media VALUES (1);
`
    const result = verify(noUsers)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('users: missing entirely')
  })

  /**
   * THE ORPHANED-ROWS CASE — the one this repo has actually been burned by. Root
   * CLAUDE.md: "A DROP TABLE runs an implicit DELETE, and that cascades", and a
   * migration once "reported success while cascade-deleting two tables nobody was
   * watching".
   *
   * ⚠️ THE MECHANISM THAT CATCHES THIS CHANGED ON 2026-08-13, and the change is worth
   * knowing. It used to be detected by comparing claimed INSERTs against surviving
   * rows — the cascade fired during the replay and the colourways vanished. Now the
   * replay runs with foreign keys OFF (a real wrangler dump inserts into a child
   * before creating the parent, so it must), the cascade does NOT fire, and the rows
   * survive as ORPHANS instead. `PRAGMA foreign_key_check` catches them on the
   * finished database.
   *
   * That is strictly better: it names the exact rows rather than reporting a count
   * shortfall, and it catches an orphan however it was created — including one that
   * was already orphaned in production before the dump was taken, which the old
   * count-based check could never have seen.
   */
  it('rejects a dump that restores rows whose parents are missing', () => {
    const cascading = `${GOOD_DUMP}\nDELETE FROM products WHERE id = 1;`
    const result = verify(cascading)

    expect(result.ok).toBe(false)
    const message = result.problems.join(' ')
    expect(message).toContain('colourways')
    expect(message).toContain('foreign-key violation')
    // The advice must match the fault: this file is complete, so telling someone to
    // suspect a truncated upload sends them looking in the wrong place.
    expect(message).toContain('the problem is in the data')
    expect(message).not.toContain('truncated upload')
  })

  it('rejects a dangling reference via foreign_key_check on the restored database', () => {
    const dangling = `${SCHEMA}
INSERT INTO users VALUES (1, 'o@e.com');
INSERT INTO products VALUES (1, 'n001');
INSERT INTO site_settings VALUES (1, 'x');
INSERT INTO media VALUES (1, 'n001.glb');
INSERT INTO colourways VALUES (1, 999, 'orphan');
`
    const result = verify(dangling)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('missing parent in products')
  })
})

/**
 * THE SHAPE `wrangler d1 export` ACTUALLY EMITS.
 *
 * Every other fixture in this file is hand-written in dependency order — parents
 * before children — and that is exactly why they all passed while the verifier was
 * broken. A real dump interleaves: it creates `users_sessions` (which carries a
 * foreign key to `users`), INSERTs into it, and only then creates `users`. It gets
 * away with that because it opens with `PRAGMA defer_foreign_keys=TRUE`.
 *
 * Verified against a real production export on 2026-08-13. Before the fix the
 * verifier rejected it with `no such table: main.users`, which would have failed the
 * nightly backup job every single night — an alarm that is always on, which is the
 * failure mode this file's own comments warn about.
 */
const WRANGLER_SHAPED_DUMP = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE \`users_sessions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`_parent_id\` integer NOT NULL,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade
);
INSERT INTO "users_sessions" ("id","_parent_id") VALUES('a8b0',1);
CREATE TABLE \`users\` (\`id\` integer PRIMARY KEY NOT NULL, \`email\` text NOT NULL);
INSERT INTO "users" ("id","email") VALUES(1,'owner@example.com');
CREATE TABLE \`products\` (\`id\` integer PRIMARY KEY NOT NULL);
INSERT INTO "products" ("id") VALUES(1);
CREATE TABLE \`site_settings\` (\`id\` integer PRIMARY KEY NOT NULL);
INSERT INTO "site_settings" ("id") VALUES(1);
CREATE TABLE \`media\` (\`id\` integer PRIMARY KEY NOT NULL);
INSERT INTO "media" ("id") VALUES(1);
CREATE INDEX \`users_email_idx\` ON \`users\` (\`email\`);
`

describe('a real wrangler d1 export', () => {
  it('restores, even though it inserts into a child table before the parent exists', () => {
    const result = verify(WRANGLER_SHAPED_DUMP, NO_VOLUME_CHECKS)

    expect(result.problems, 'this is the exact ordering a production dump has').toEqual([])
    expect(result.ok).toBe(true)
    expect(result.tables.get('users_sessions')).toBe(1)
    expect(result.tables.get('users')).toBe(1)
  })

  it('still rejects a genuinely dangling reference in that same shape', () => {
    // The negative control for the fix. Loading with foreign keys OFF must not become
    // skipping the check — the parent row simply never arrives here, and
    // PRAGMA foreign_key_check on the finished database is what has to surface it.
    // Without this, "load with FKs off" would be indistinguishable from "no check".
    const orphaned = WRANGLER_SHAPED_DUMP.replace(
      `INSERT INTO "users" ("id","email") VALUES(1,'owner@example.com');`,
      `INSERT INTO "users" ("id","email") VALUES(99,'someone@example.com');`,
    )
    expect(orphaned).not.toBe(WRANGLER_SHAPED_DUMP)
    expect(verify(orphaned).ok).toBe(false)
  })
})

describe('verify — a good backup', () => {
  it('accepts a complete dump and reports the row counts', () => {
    const result = verify(GOOD_DUMP, NO_VOLUME_CHECKS)

    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.tables.get('colourways')).toBe(2)
    expect(result.tables.get('users')).toBe(1)
  })

  it('does not require tables that are legitimately empty', () => {
    // `events` is telemetry and is empty on a quiet week; `raw_uploads` empties itself
    // on the ingest bucket's 14-day lifecycle rule. Requiring either would train
    // someone to ignore this check, which is worse than not having it.
    expect(MUST_NOT_BE_EMPTY as string[]).not.toContain('events')
    expect(MUST_NOT_BE_EMPTY as string[]).not.toContain('raw_uploads')
  })
})

describe('the required-table list matches the real schema', () => {
  /**
   * Without this, the list above could name a table that was renamed in a migration.
   * The verifier would then report "missing entirely" on every single nightly run —
   * an alarm that is always on, which is an alarm nobody reads. Asserted against the
   * migration files rather than against a hard-coded copy, for the reason
   * mediaReferences.test.ts states: checking that a string exists only proves the
   * string exists.
   */
  it('every table in MUST_NOT_BE_EMPTY is created by a migration', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const dir = join(import.meta.dirname, 'migrations')

    const sources = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
        .map((f) => readFile(join(dir, f), 'utf8')),
    )
    // Spread before mapping: `lib` is ES2022 here, where matchAll returns a plain
    // iterator without the ES2025 iterator helpers.
    const created = new Set(
      [
        ...sources.join('\n').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?\\?`([a-z_0-9]+)\\?`/gi),
      ].map((m) => m[1]),
    )

    expect(
      created.size,
      'expected to find CREATE TABLE statements in the migrations',
    ).toBeGreaterThan(0)

    const unknown = (MUST_NOT_BE_EMPTY as string[]).filter((t) => !created.has(t))
    expect(
      unknown,
      'MUST_NOT_BE_EMPTY names a table no migration creates — the nightly verifier ' +
        'would report it missing on every run, which is an alarm nobody reads.',
    ).toEqual([])
  })
})

/**
 * L20-03 — the volume floors.
 *
 * WHAT WOULD HAVE TO BREAK FOR THESE TO FAIL: a dump that restores perfectly and
 * carries a fraction of the catalogue would have to start passing again. That is
 * not a hypothetical shape — it is the ONLY shape `MUST_NOT_BE_EMPTY` cannot see,
 * because one row is not zero rows.
 *
 * Each test below is paired: the same dump is checked with the floors OFF to prove
 * the old gate really did pass it, and ON to prove the new one catches it. A test
 * that only showed the failure would not show that anything changed.
 */
describe('volume floors', () => {
  /** Enough rows to clear every floor: 50 products, 15 media, 5 colourways. */
  const bulk = (table, n, row) =>
    Array.from({ length: n }, (_, i) => `INSERT INTO ${table} VALUES ${row(i + 1)};`).join('\n')

  const FULL_DUMP = [
    SCHEMA,
    "INSERT INTO users VALUES (1, 'owner@example.com');",
    "INSERT INTO site_settings VALUES (1, 'https://example.com/catalogue');",
    bulk('products', 60, (i) => `(${i}, 'p${i}')`),
    bulk('media', 20, (i) => `(${i}, 'f${i}.glb')`),
    bulk('colourways', 8, (i) => `(${i}, 1, 'c${i}')`),
  ].join('\n')

  /** The same database with 3 products instead of 60 — and nothing else wrong. */
  const THIN_DUMP = [
    SCHEMA,
    "INSERT INTO users VALUES (1, 'owner@example.com');",
    "INSERT INTO site_settings VALUES (1, 'https://example.com/catalogue');",
    bulk('products', 3, (i) => `(${i}, 'p${i}')`),
    bulk('media', 20, (i) => `(${i}, 'f${i}.glb')`),
    bulk('colourways', 8, (i) => `(${i}, 1, 'c${i}')`),
  ].join('\n')

  it('accepts a dump that carries a real catalogue', () => {
    const result = verify(FULL_DUMP)
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('rejects a dump missing most of the catalogue', () => {
    const result = verify(THIN_DUMP)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/products: restored 3 rows, below the floor of 50/)
  })

  it('THE POINT: that same thin dump passes every pre-L20-03 check', () => {
    // The old gate in full — replay, claimed-vs-actual, foreign keys, not-empty.
    // It says yes. Three products out of sixty is a catastrophe that looks like a
    // clean backup, and this is the assertion that says so.
    const old = verify(THIN_DUMP, NO_VOLUME_CHECKS)
    expect(old.problems).toEqual([])
    expect(old.ok).toBe(true)
  })

  it('rejects a duplicated global, which no other check would notice', () => {
    const twoSettings = `${FULL_DUMP}\nINSERT INTO site_settings VALUES (2, 'https://example.com/other');`
    const result = verify(twoSettings)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/site_settings: restored 2 rows where exactly 1/)
    // Control: the same dump is clean to everything else.
    expect(verify(twoSettings, NO_VOLUME_CHECKS).ok).toBe(true)
  })

  it('pins the floors themselves, so lowering one is a deliberate edit', () => {
    expect(MINIMUM_ROWS).toEqual({ products: 50, media: 15, products_colourways: 5, users: 1 })
    expect(EXACT_ROWS).toEqual({ site_settings: 1 })
  })
})
