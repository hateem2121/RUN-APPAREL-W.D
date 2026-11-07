import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderDump, tableCounts } from './order-d1-dump.mjs'

// The three shapes the real 2026-11-07 export had, in its order: a child table and its row BEFORE
// the parent table exists, a table rebuilt as `CREATE TABLE IF NOT EXISTS "…"`, and a child row
// ahead of its parent row. The real dump: 50 tables, 30,360 rows.
const EXPORT_SHAPED = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE \`users_sessions\` (
	\`_parent_id\` integer NOT NULL,
	\`id\` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO "users_sessions" ("_parent_id","id") VALUES(1,'a');
CREATE TABLE \`users\` (
	\`id\` integer PRIMARY KEY NOT NULL
);
INSERT INTO "users" ("id") VALUES(1);
CREATE TABLE \`products_colourways\` (
	\`_parent_id\` integer NOT NULL,
	\`name\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO "products_colourways" ("_parent_id","name") VALUES(7,'wine
with a newline inside the text');
CREATE TABLE IF NOT EXISTS "products" (
	\`id\` integer PRIMARY KEY NOT NULL
);
INSERT INTO "products" ("id") VALUES(7);
CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);
`

test('negative control: the export as wrangler writes it does NOT load with foreign keys on', () => {
  // The drill's first D1 import failed exactly like this: "no such table: main.users".
  assert.throws(
    () => tableCounts(EXPORT_SHAPED, { foreignKeys: true }),
    /no such table: main\.users/,
  )
})

test('reordered, it loads strictly, with every table and row intact', () => {
  const { ordered, moved } = orderDump(EXPORT_SHAPED)
  assert.equal(moved, 4)
  const before = tableCounts(EXPORT_SHAPED, { foreignKeys: false })
  const after = tableCounts(ordered, { foreignKeys: true })
  assert.deepEqual(after.counts, before.counts)
  assert.deepEqual(after.counts, {
    products: 1,
    products_colourways: 1,
    users: 1,
    users_sessions: 1,
  })
  assert.equal(after.violations, 0)
})

test('the IF NOT EXISTS table is named, so it is not lost (the bug the second import found)', () => {
  const { ordered } = orderDump(EXPORT_SHAPED)
  assert.match(ordered, /CREATE TABLE IF NOT EXISTS "products"/)
  // Parent before child, for both the table and its rows.
  assert.ok(
    ordered.indexOf('CREATE TABLE IF NOT EXISTS "products"') <
      ordered.indexOf('CREATE TABLE `products_colourways`'),
  )
  assert.ok(
    ordered.indexOf('INSERT INTO "products" ') <
      ordered.indexOf('INSERT INTO "products_colourways"'),
  )
})

test('a row whose text holds a newline is moved whole, and indexes stay after the rows', () => {
  const { ordered } = orderDump(EXPORT_SHAPED)
  assert.match(ordered, /VALUES\(7,'wine\nwith a newline inside the text'\);/)
  assert.ok(ordered.lastIndexOf('INSERT INTO') < ordered.indexOf('CREATE INDEX'))
})

test('a second definition of one table is refused rather than silently merged', () => {
  const twice = `${EXPORT_SHAPED}CREATE TABLE \`users\` (\n\t\`id\` integer\n);\n`
  assert.throws(() => orderDump(twice), /second definition/)
})
