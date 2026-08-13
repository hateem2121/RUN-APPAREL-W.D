import { describe, expect, it } from 'vitest'
import { MUST_NOT_BE_EMPTY, claimedInserts, verify } from '../../../scripts/verify-backup.mjs'

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
   * THE CASCADE CASE — the one this repo has actually been burned by. Root CLAUDE.md:
   * "A DROP TABLE runs an implicit DELETE, and that cascades", and a migration once
   * "reported success while cascade-deleting two tables nobody was watching".
   *
   * Here the dump inserts two colourways and then deletes their parent product. Every
   * statement succeeds; the file restores; and the colourways are gone. Only comparing
   * claimed rows against surviving rows catches it.
   */
  it('rejects a dump whose rows do not survive their own replay', () => {
    const cascading = `${GOOD_DUMP}\nDELETE FROM products WHERE id = 1;`
    const result = verify(cascading)

    expect(result.ok).toBe(false)
    const message = result.problems.join(' ')
    expect(message).toContain('colourways')
    expect(message).toContain('survived the replay')
  })

  it('restores with foreign keys ON, so a dangling reference is rejected', () => {
    // A dump that only restores with the checks disabled is a dump whose referential
    // integrity is already broken.
    const dangling = `${SCHEMA}
INSERT INTO users VALUES (1, 'o@e.com');
INSERT INTO products VALUES (1, 'n001');
INSERT INTO site_settings VALUES (1, 'x');
INSERT INTO media VALUES (1, 'n001.glb');
INSERT INTO colourways VALUES (1, 999, 'orphan');
`
    expect(verify(dangling).ok).toBe(false)
  })
})

describe('verify — a good backup', () => {
  it('accepts a complete dump and reports the row counts', () => {
    const result = verify(GOOD_DUMP)

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
    const created = new Set(
      sources
        .join('\n')
        .matchAll(/CREATE TABLE (?:IF NOT EXISTS )?\\?`([a-z_0-9]+)\\?`/gi)
        .map((m) => m[1]),
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
