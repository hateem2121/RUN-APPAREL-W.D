# Site Footer "Quiet Room" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public site's 120px footer strip with the approved full-screen "Quiet Room" footer — flipped-notch CTA tab, live Sialkot clock, 2×2 facts from optional CMS fields, spotlit outline wordmark — and bring the viewer's dot-and-ring cursor to the three site pages with a footer-only glow, all without a new dependency.

**Architecture:** The footer stays a server component; four small client islands (clock, wordmark fit + spotlight, glow, cursor) hydrate on top of server-rendered markup, each with its pure logic extracted into `apps/cms/src/lib` so the coverage floor measures real branches. New CMS fields are projected onto the cms-only `PublicSiteSettings`; a hand-written D1 migration adds eleven nullable columns and two leaf tables. Geometry is asserted by the browser suite, never derived by arithmetic.

**Tech Stack:** Payload 3.88 on Next 16.3 (`apps/cms`), hand-written CSS on `@run-apparel/ui` tokens, Vitest 4, Playwright (Chromium + Firefox), Cloudflare D1 via `@payloadcms/db-d1-sqlite`.

**Source spec:** `docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md` · design artifact rev 7: https://claude.ai/code/artifact/117f155c-4bb5-421f-b294-c73758cc392d

## Global Constraints

- `pnpm` means `npx --yes pnpm@10.33.0` everywhere below. It has been on PATH, absent, and present-but-broken on this machine.
- Run `env | grep -E 'NODE_ENV|PORT'` before believing any build or e2e failure; both leak in from another project.
- **No new dependency.** No Motion, no Lenis, no Tailwind in `apps/cms`. `dependencyPolicy.test.ts` and the SBOM gate both fail on a new package.
- **No cross-app import.** `apps/cms` may not import from `apps/viewer` (lint-enforced via `biome.jsonc` `noRestrictedImports`). The cursor is re-implemented, not shared.
- **CSS passes `apps/viewer/src/styles/tokens.test.ts`, which scans `site.css` and JSX:** spacing only from `4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 64` px (or `0`, `auto`, `clamp()`, `var()`); every `border-radius` a token (`--radius-panel` 18px, `--radius-card` 12px, `--radius-chip` 6px, `--radius-pill`, or `50%`); every shadow `--shadow-raised`; every duration `--fast` (200ms) / `--ui` (220ms) / `--slow` (800ms) with `--ease`; every `:hover` inside `@media (hover: hover) and (pointer: fine)`; every `var()` without a fallback must resolve; **no inline `style={{ … }}` with a literal in a `.tsx`**.
- **`withPayload` wins the header race** — nothing here touches headers; if you think you need one, read `apps/cms/publicViewerHeaders.mjs` first.
- **`pnpm build` passing does not mean the app can be deployed.** The final gate is `pnpm --filter @run-apparel/cms exec opennextjs-cloudflare build`.
- **Coverage floors are measured, never lowered.** `apps/cms`: lines 84 / functions 80 / branches 74 / statements 84 over `src/**/*.ts` (not `.tsx`, not `src/app/**`). Pure logic goes in `src/lib/*.ts` with tests.
- **Migrations are hand-written** in this repo (`payload migrate:create` diffs a stale chain and asks an interactive question that would rename a live column). Only `ADD COLUMN` and leaf `CREATE TABLE`; never a table rebuild. Register in `apps/cms/src/migrations/index.ts`. `apps/cms/src/migrationReplay/replay.test.ts` must stay green.
- **The e2e harness skips the rebuild locally** (`apps/cms/e2e/prepare.mjs`): use `CI=1` whenever a source change must reach the suite, and always for a negative control.
- **Every new gate gets a negative control**: break the thing, watch the test fail, restore it.
- **Claims are not copy.** Certifications, socials, MOQ, lead time, hours, coordinates carry NO defaults and render nothing when empty.
- `git config --local user.email hateemjamshaid@gmail.com` is set (verified). Commit on this branch only; **no push, no PR, no merge.**
- Any `docs/` file you touch is citation-checked: backticked paths must exist. New files may be named only inside code fences until they exist.

---

## File structure

```text
apps/cms/src/globals/SiteSettings.ts                     MODIFY  eleven new fields (four copy, seven claim) + two arrays
apps/cms/src/lib/projectPublic.ts                        MODIFY  FooterSettings type, projectFooter(), mergeSiteSettings widened
apps/cms/src/lib/projectPublic.test.ts                   MODIFY  projection cases
apps/cms/src/lib/content.ts                              MODIFY  fallback carries empty footer facts
apps/cms/src/migrations/20260905_150000_footer_facts.ts  CREATE  11 ADD COLUMN + 2 leaf tables + 4 indexes
apps/cms/src/migrations/index.ts                         MODIFY  register it
apps/cms/src/lib/footerHours.ts                          CREATE  pure: parse / format / isOpenAt / opensAtLabel
apps/cms/src/lib/footerHours.test.ts                     CREATE
apps/cms/src/lib/wordmarkFit.ts                          CREATE  pure: fitScale()
apps/cms/src/lib/wordmarkFit.test.ts                     CREATE
apps/cms/src/lib/cursorMath.ts                           CREATE  pure: trail(), ringTransform(), isInteractive()
apps/cms/src/lib/cursorMath.test.ts                      CREATE
apps/cms/src/lib/cursorBus.ts                            CREATE  pure: the ring's trailed point, published per frame
apps/cms/src/lib/cursorBus.test.ts                       CREATE
apps/cms/src/lib/footerCopy.ts                           CREATE  pure: splitLastWord()
apps/cms/src/lib/footerCopy.test.ts                      CREATE
apps/cms/src/components/site/SiteFooter.tsx              REWRITE server component, the whole slab
apps/cms/src/components/site/SiteFooter.test.ts          CREATE  renderToStaticMarkup assertions
apps/cms/src/components/site/FooterTab.tsx               CREATE  'use client' — /contact everywhere, mailto: on /contact
apps/cms/src/components/site/FooterClock.tsx             CREATE  'use client' island
apps/cms/src/components/site/FooterWordmark.tsx          CREATE  'use client' island (fit + spotlight)
apps/cms/src/components/site/FooterGlow.tsx              CREATE  'use client' island (three layers)
apps/cms/src/components/site/Cursor.tsx                  CREATE  'use client', site-wide
apps/cms/src/app/(frontend)/layout.tsx                   MODIFY  mount <Cursor />
apps/cms/src/app/(frontend)/site.css                     MODIFY  replace the footer block; add tab, facts, wordmark, glow, forced-colors
apps/cms/e2e/footer.spec.ts                              CREATE  geometry + behaviour matrix
docs/OWNER-CHECKLIST.md                                  MODIFY  item 5: the three claim blocks
apps/cms/CLAUDE.md                                       MODIFY  a "## The public site footer" section (NOT a Traps bullet — the root counter)
```

---

### Task 1: Settings fields and their projection

**Files:**

```text
Modify: apps/cms/src/globals/SiteSettings.ts
Modify: apps/cms/src/lib/projectPublic.ts
Modify: apps/cms/src/lib/projectPublic.test.ts
Modify: apps/cms/src/lib/content.ts
```

**Interfaces:**
- Produces `FooterSettings`, `EMPTY_FOOTER`, `projectFooter(doc)`, and `PublicSiteSettings.footer: FooterSettings` for every later task.

- [ ] **Step 1: Write the failing projection tests**

Append to `apps/cms/src/lib/projectPublic.test.ts`:

```ts
import { EMPTY_FOOTER, mergeSiteSettings, projectFooter } from './projectPublic'

describe('projectFooter', () => {
  it('projects nothing but copy defaults from an empty global', () => {
    expect(projectFooter(null)).toEqual(EMPTY_FOOTER)
    expect(EMPTY_FOOTER.ctaLabel).toBe('Start an enquiry')
    expect(EMPTY_FOOTER.certifications).toEqual([])
    expect(EMPTY_FOOTER.socialLinks).toEqual([])
    expect(EMPTY_FOOTER.capacity).toEqual({ moq: '', leadTime: '', hours: null })
    expect(EMPTY_FOOTER.worksCoordinates).toBe('')
  })

  it('keeps only https social links with a label, trimmed', () => {
    const footer = projectFooter({
      socialLinks: [
        { label: ' LinkedIn ', url: 'https://www.linkedin.com/company/run-apparel ' },
        { label: 'Bad', url: 'http://insecure.example' },
        { label: '', url: 'https://x.example' },
        { label: 'NoUrl' },
        'garbage',
      ],
    })
    expect(footer.socialLinks).toEqual([
      { label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel' },
    ])
  })

  it('drops blank certifications and trims the rest', () => {
    const footer = projectFooter({ certifications: [{ name: ' GOTS ' }, { name: '' }, null] })
    expect(footer.certifications).toEqual(['GOTS'])
  })

  it('projects hours only when all four parts are valid, and never a partial week', () => {
    const full = projectFooter({
      capacity: { hoursFirstDay: 'mon', hoursLastDay: 'sat', hoursOpen: '09:00', hoursClose: '18:00' },
    })
    expect(full.capacity.hours).toEqual({ firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' })

    const partial = projectFooter({ capacity: { hoursFirstDay: 'mon', hoursOpen: '09:00' } })
    expect(partial.capacity.hours).toBeNull()

    const malformed = projectFooter({
      capacity: { hoursFirstDay: 'mon', hoursLastDay: 'sat', hoursOpen: '9am', hoursClose: '18:00' },
    })
    expect(malformed.capacity.hours).toBeNull()
  })

  it('a copy field falls back to its default when blank, a claim field to empty', () => {
    const footer = projectFooter({ ctaQuestion: '   ', capacity: { moq: '  ' }, worksCoordinates: ' ' })
    expect(footer.ctaQuestion).toBe('Have a garment that needs making properly?')
    expect(footer.capacity.moq).toBe('')
    expect(footer.worksCoordinates).toBe('')
  })

  it('mergeSiteSettings carries the footer, and the shared type is untouched', () => {
    const merged = mergeSiteSettings({ ctaLabel: 'Talk to us' })
    expect(merged.footer.ctaLabel).toBe('Talk to us')
    // The viewer API returns ViewerSiteSettings; nothing footer-shaped may leak into it.
    expect(Object.keys(merged)).not.toContain('certifications')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/projectPublic.test.ts`
Expected: FAIL — `projectFooter` and `EMPTY_FOOTER` are not exported.

- [ ] **Step 3: Add the fields to the global**

In `apps/cms/src/globals/SiteSettings.ts`, after the `legalLine` field and before `inquiryTemplate`, insert:

```ts
    /*
     * ── The footer ────────────────────────────────────────────────────────────
     * Four COPY fields carry defaults. Everything under `capacity`, plus
     * `worksCoordinates`, `certifications` and `socialLinks`, is a CLAIM about the
     * business and carries none: the footer renders nothing for a blank claim, and a
     * certification the company does not hold must never appear because a default
     * put it there. Owner decision 2026-09-05; see docs/OWNER-CHECKLIST.md item 5.
     */
    {
      name: 'ctaLabel',
      type: 'text',
      required: true,
      maxLength: 32,
      defaultValue: 'Start an enquiry',
      admin: { description: 'The green tab at the top of the footer. Links to the Contact page.' },
    },
    {
      name: 'ctaQuestion',
      type: 'text',
      required: true,
      maxLength: 80,
      defaultValue: 'Have a garment that needs making properly?',
      admin: { description: 'The big question. The LAST word is set in italic green automatically.' },
    },
    {
      name: 'ctaSubline',
      type: 'text',
      required: true,
      maxLength: 120,
      defaultValue: 'Send a tech pack, a sketch, or just the idea.',
    },
    {
      name: 'ctaPromise',
      type: 'text',
      required: true,
      maxLength: 48,
      defaultValue: 'Reply within 2 business days',
      admin: { description: 'Drawn as a measurement line under the question. This is a promise in writing.' },
    },
    {
      name: 'capacity',
      type: 'group',
      admin: {
        description:
          'Facts a buyer wants before they write to you. Every box is optional and the footer hides what is blank. ' +
          'The clock light ("Open now") is worked out from the hours — leave them blank and no light is shown.',
      },
      fields: [
        { name: 'moq', type: 'text', maxLength: 48, admin: { description: 'e.g. "50 pcs per style"' } },
        { name: 'leadTime', type: 'text', maxLength: 48, admin: { description: 'e.g. "4–6 weeks from approval"' } },
        {
          type: 'row',
          fields: [
            { name: 'hoursFirstDay', type: 'select', options: DAY_OPTIONS, admin: { width: '25%' } },
            { name: 'hoursLastDay', type: 'select', options: DAY_OPTIONS, admin: { width: '25%' } },
            { name: 'hoursOpen', type: 'text', validate: validateClock, admin: { width: '25%', description: 'HH:MM, Sialkot time' } },
            { name: 'hoursClose', type: 'text', validate: validateClock, admin: { width: '25%', description: 'HH:MM, Sialkot time' } },
          ],
        },
      ],
    },
    {
      name: 'worksCoordinates',
      type: 'text',
      maxLength: 40,
      admin: { description: 'Optional, shown under the address. e.g. "32.49° N · 74.52° E". Only if you know it is right.' },
    },
    {
      name: 'certifications',
      type: 'array',
      labels: { singular: 'Certification', plural: 'Certifications' },
      admin: { description: 'Only standards you actually hold. Each one is a claim buyers may ask you to prove.' },
      fields: [{ name: 'name', type: 'text', required: true, maxLength: 48 }],
    },
    {
      name: 'socialLinks',
      type: 'array',
      labels: { singular: 'Social link', plural: 'Social links' },
      fields: [
        { name: 'label', type: 'text', required: true, maxLength: 24 },
        { name: 'url', type: 'text', required: true, validate: validateHttps },
      ],
    },
```

And above `export const SiteSettings`, add the two validators and the option list:

```ts
const DAY_OPTIONS = [
  { label: 'Monday', value: 'mon' },
  { label: 'Tuesday', value: 'tue' },
  { label: 'Wednesday', value: 'wed' },
  { label: 'Thursday', value: 'thu' },
  { label: 'Friday', value: 'fri' },
  { label: 'Saturday', value: 'sat' },
  { label: 'Sunday', value: 'sun' },
]

/** `HH:MM`, 24-hour. Blank is allowed — the field is optional and blank means "no hours". */
const validateClock = (value: unknown) =>
  !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) || 'Use 24-hour HH:MM, e.g. 09:00'

/** The public site links out to these; a plain-http profile would be a mixed-content warning. */
const validateHttps = (value: unknown) =>
  /^https:\/\/\S+$/.test(String(value ?? '')) || 'Must start with https://'
```

- [ ] **Step 4: Add the projection**

In `apps/cms/src/lib/projectPublic.ts`, replace the `PublicSiteSettings` interface and `mergeSiteSettings` with:

```ts
/** Working hours, parsed. Days are 0–6 with Sunday 0, matching `Date#getDay()`. */
export interface FooterHours {
  firstDay: number
  lastDay: number
  /** `HH:MM`, works local time (Asia/Karachi). */
  open: string
  close: string
}

export interface FooterSettings {
  ctaLabel: string
  ctaQuestion: string
  ctaSubline: string
  ctaPromise: string
  capacity: { moq: string; leadTime: string; hours: FooterHours | null }
  worksCoordinates: string
  certifications: string[]
  socialLinks: { label: string; url: string }[]
}

export interface PublicSiteSettings extends ViewerSiteSettings {
  /** Owner-uploaded tab icon. `null` falls back to the built-in mark in public/. */
  logoUrl: string | null
  logoMimeType: string | null
  footer: FooterSettings
}

/**
 * Copy has a default; a claim does not. The split is the whole point of this object —
 * a blank certification list renders NO block, never an example one.
 */
export const EMPTY_FOOTER: FooterSettings = {
  ctaLabel: 'Start an enquiry',
  ctaQuestion: 'Have a garment that needs making properly?',
  ctaSubline: 'Send a tech pack, a sketch, or just the idea.',
  ctaPromise: 'Reply within 2 business days',
  capacity: { moq: '', leadTime: '', hours: null },
  worksCoordinates: '',
  certifications: [],
  socialLinks: [],
}

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function projectHours(capacity: Record<string, unknown> | null): FooterHours | null {
  const first = DAY_INDEX[text(capacity?.hoursFirstDay)]
  const last = DAY_INDEX[text(capacity?.hoursLastDay)]
  const open = text(capacity?.hoursOpen)
  const close = text(capacity?.hoursClose)
  if (first === undefined || last === undefined) return null
  if (!CLOCK.test(open) || !CLOCK.test(close)) return null
  return { firstDay: first, lastDay: last, open, close }
}

export function projectFooter(doc: Record<string, unknown> | null | undefined): FooterSettings {
  const copy = (key: 'ctaLabel' | 'ctaQuestion' | 'ctaSubline' | 'ctaPromise') =>
    text(doc?.[key]) || EMPTY_FOOTER[key]
  const capacity =
    doc?.capacity && typeof doc.capacity === 'object' ? (doc.capacity as Record<string, unknown>) : null
  const rows = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : []
  return {
    ctaLabel: copy('ctaLabel'),
    ctaQuestion: copy('ctaQuestion'),
    ctaSubline: copy('ctaSubline'),
    ctaPromise: copy('ctaPromise'),
    capacity: { moq: text(capacity?.moq), leadTime: text(capacity?.leadTime), hours: projectHours(capacity) },
    worksCoordinates: text(doc?.worksCoordinates),
    certifications: rows(doc?.certifications).map((r) => text(r.name)).filter(Boolean),
    socialLinks: rows(doc?.socialLinks)
      .map((r) => ({ label: text(r.label), url: text(r.url) }))
      .filter((r) => r.label && /^https:\/\/\S+$/.test(r.url)),
  }
}

export function mergeSiteSettings(
  doc: Record<string, unknown> | null | undefined,
): PublicSiteSettings {
  const pick = (key: keyof ViewerSiteSettings): string =>
    text(doc?.[key]) || DEFAULT_SITE_SETTINGS[key]
  const logo = doc?.logo
  const logoDoc =
    logo && typeof logo === 'object' ? (logo as { url?: unknown; mimeType?: unknown }) : null
  return {
    logoUrl: text(logoDoc?.url) || null,
    logoMimeType: text(logoDoc?.mimeType) || null,
    companyName: pick('companyName'),
    email: pick('email'),
    whatsappNumber: pick('whatsappNumber'),
    catalogueUrl: pick('catalogueUrl'),
    temporaryWordmark: pick('temporaryWordmark'),
    footerLine: pick('footerLine'),
    legalLine: pick('legalLine'),
    footer: projectFooter(doc),
  }
}
```

In `apps/cms/src/lib/content.ts`, the failure fallback in `getSiteSettings` becomes:

```ts
    return { ...DEFAULT_SITE_SETTINGS, logoUrl: null, logoMimeType: null, footer: EMPTY_FOOTER }
```

with `EMPTY_FOOTER` added to the import from `./projectPublic`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/projectPublic.test.ts && npx --yes pnpm@10.33.0 --filter @run-apparel/cms typecheck`
Expected: PASS; typecheck clean. (`payload-types.ts` is generated — run `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec payload generate:types` if the typecheck complains about the global's shape, and commit the regenerated file.)

- [ ] **Step 6: Commit**

```bash
git add apps/cms/src/globals/SiteSettings.ts apps/cms/src/lib/projectPublic.ts apps/cms/src/lib/projectPublic.test.ts apps/cms/src/lib/content.ts apps/cms/src/payload-types.ts
git commit -m "feat(cms): footer settings — four copy fields with defaults, seven claim fields without

Certifications, socials, MOQ, lead time, hours and coordinates carry no defaults
because each is a claim about the business, not copy. projectFooter() renders
nothing for a blank claim. Projected on PublicSiteSettings only; the shared
ViewerSiteSettings the viewer API returns is untouched.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The migration

**Files:**

```text
Create: apps/cms/src/migrations/20260905_150000_footer_facts.ts
Modify: apps/cms/src/migrations/index.ts
```

- [ ] **Step 1: Learn the exact names Payload would generate — do not guess them**

```bash
cd apps/cms && PAYLOAD_LOCAL_D1=1 npx --yes pnpm@10.33.0 exec payload generate:db-schema; ls -la payload-generated-schema.ts
```

Open the generated file and copy the table and column names for `site_settings`, `site_settings_certifications` and `site_settings_social_links` (expected: `cta_label`, `cta_question`, `cta_subline`, `cta_promise`, `capacity_moq`, `capacity_lead_time`, `capacity_hours_first_day`, `capacity_hours_last_day`, `capacity_hours_open`, `capacity_hours_close`, `works_coordinates`; array tables with `_order`, `_parent_id`, `id`, and `name` / `label`, `url`). If the command refuses for want of a D1 binding, read the adapter's snake-casing in `node_modules/@payloadcms/drizzle` and confirm each name against `20260817_120000_build_process_and_description.ts`'s `build_process_customisation_steps`, which shows the array-table shape.

Then **delete the generated file** — it is not part of the tree:

```bash
rm apps/cms/payload-generated-schema.ts
```

- [ ] **Step 2: Write the failing replay expectation**

The replay suite already asserts every migration in `index.ts` applies against real SQLite with foreign keys ON and empties no table. Register the migration first so the suite exercises it; the test fails until the file exists:

In `apps/cms/src/migrations/index.ts` add the import and the entry at the end of the array:

```ts
import * as migration_20260905_150000_footer_facts from './20260905_150000_footer_facts';
```

```ts
  {
    up: migration_20260905_150000_footer_facts.up,
    down: migration_20260905_150000_footer_facts.down,
    name: '20260905_150000_footer_facts',
  },
```

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/migrationReplay`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```ts
import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The footer's settings: four copy fields, seven claim fields, two arrays.
 *
 * HAND-WRITTEN, for the reason 20260905_090000_site_logo gives: `migrate:create` diffs
 * a stale snapshot chain and stops on an interactive question that would rename a live
 * column. Every name below was copied from `payload generate:db-schema` on 2026-09-05,
 * not typed from memory.
 *
 * ELEVEN ADD COLUMNs AND TWO LEAF TABLES — no table rebuild anywhere, so none of the
 * implicit-DELETE cascade hazard applies. The two array tables reference
 * `site_settings` with ON DELETE cascade, which is Payload's own shape for an array
 * (compare `build_process_customisation_steps`) and is harmless: the global row is
 * never deleted.
 *
 * Every column is nullable with no default. The copy fields' defaults live in the
 * Payload config and in projectPublic.ts, where a blank falls back at READ time; a
 * database default would freeze today's wording into the schema.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const column of [
    'cta_label',
    'cta_question',
    'cta_subline',
    'cta_promise',
    'capacity_moq',
    'capacity_lead_time',
    'capacity_hours_first_day',
    'capacity_hours_last_day',
    'capacity_hours_open',
    'capacity_hours_close',
    'works_coordinates',
  ]) {
    await db.run(sql.raw(`ALTER TABLE \`site_settings\` ADD COLUMN \`${column}\` text;`))
  }

  await db.run(sql`CREATE TABLE \`site_settings_certifications\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(
    sql`CREATE INDEX \`site_settings_certifications_order_idx\` ON \`site_settings_certifications\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`site_settings_certifications_parent_id_idx\` ON \`site_settings_certifications\` (\`_parent_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`site_settings_social_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`url\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(
    sql`CREATE INDEX \`site_settings_social_links_order_idx\` ON \`site_settings_social_links\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`site_settings_social_links_parent_id_idx\` ON \`site_settings_social_links\` (\`_parent_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The two arrays are LEAF tables — nothing references them — so dropping them is
  // the ordinary parent/child rule, not a rebuild. The eleven columns stay, for the
  // reason 20260905_090000_site_logo records: SQLite cannot drop a column without a
  // rebuild, and a rebuild is the one operation this repo refuses on D1.
  await db.run(sql`DROP TABLE \`site_settings_social_links\`;`)
  await db.run(sql`DROP TABLE \`site_settings_certifications\`;`)
}
```

⚠️ If the generated names from Step 1 differ from the list above, the generated names win — edit the list and the two CREATE TABLEs to match before continuing. `sql.raw` is used for the loop because a template `sql\`…\`` would bind the column name as a parameter; if the adapter's `sql` lacks `.raw`, unroll the loop into eleven literal statements.

- [ ] **Step 4: Replay, then apply locally**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/migrationReplay`
Expected: PASS — `emptiedTables` empty for every migration including this one.

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms migrate`
Expected: the migration applies against the local D1. Then prove the columns are real by saving the global through the API, not by trusting the log:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/globals/site-settings \
  -H "Authorization: users API-Key $CMS_API_KEY" -H 'content-type: application/json' \
  -d '{"certifications":[{"name":"probe"}],"capacity":{"moq":"probe"}}'
```

and READ IT BACK (`GET /api/globals/site-settings`) — a 200 that stored nothing is a documented failure shape here. Then clear the probe values the same way. (Needs a running dev server: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms dev`; stop it and `git checkout -- apps/cms/src/app/\(payload\)/admin/importMap.js apps/cms/next-env.d.ts` afterwards — the dev server rewrites both.)

- [ ] **Step 5: Commit**

```bash
git add apps/cms/src/migrations/20260905_150000_footer_facts.ts apps/cms/src/migrations/index.ts
git commit -m "feat(cms): D1 migration for the footer settings — eleven columns, two leaf tables

Hand-written, names copied from payload generate:db-schema. No rebuild.
down() drops only the two leaf tables and leaves the columns, as
20260905_090000_site_logo does and for the same reason.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Hours logic (pure)

**Files:**

```text
Create: apps/cms/src/lib/footerHours.ts
Create: apps/cms/src/lib/footerHours.test.ts
```

**Interfaces:**
- Consumes `FooterHours` from Task 1.
- Produces `WORKS_TIME_ZONE`, `formatHours(hours)`, `isOpenAt(hours, instant)`, `worksClock(instant)` for Tasks 4 and 6.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { formatHours, isOpenAt, WORKS_TIME_ZONE, worksClock } from './footerHours'

const MON_SAT = { firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' }
// Sialkot is UTC+5 all year. 2026-09-07 is a Monday.
const at = (iso: string) => new Date(iso)

describe('footerHours', () => {
  it('names the works time zone once', () => {
    expect(WORKS_TIME_ZONE).toBe('Asia/Karachi')
  })

  it('formats a contiguous week as the footer prints it', () => {
    expect(formatHours(MON_SAT)).toBe('Mon–Sat 09:00–18:00 PKT')
    expect(formatHours({ ...MON_SAT, firstDay: 1, lastDay: 1 })).toBe('Mon 09:00–18:00 PKT')
  })

  it('is open inside the window on a working day, in Sialkot time', () => {
    expect(isOpenAt(MON_SAT, at('2026-09-07T04:00:00Z'))).toBe(true) // 09:00 PKT Monday
    expect(isOpenAt(MON_SAT, at('2026-09-07T12:59:00Z'))).toBe(true) // 17:59 PKT
    expect(isOpenAt(MON_SAT, at('2026-09-07T13:00:00Z'))).toBe(false) // 18:00 PKT — close is exclusive
    expect(isOpenAt(MON_SAT, at('2026-09-07T03:59:00Z'))).toBe(false) // 08:59 PKT
  })

  it('is closed on Sunday for a Mon–Sat week', () => {
    expect(isOpenAt(MON_SAT, at('2026-09-06T06:00:00Z'))).toBe(false) // Sunday 11:00 PKT
  })

  it('handles a week that wraps past Sunday', () => {
    const SAT_MON = { ...MON_SAT, firstDay: 6, lastDay: 1 } // Sat, Sun, Mon
    expect(isOpenAt(SAT_MON, at('2026-09-06T06:00:00Z'))).toBe(true) // Sunday
    expect(isOpenAt(SAT_MON, at('2026-09-08T06:00:00Z'))).toBe(false) // Tuesday
  })

  it('handles hours that cross midnight', () => {
    const NIGHT = { ...MON_SAT, open: '22:00', close: '02:00' }
    expect(isOpenAt(NIGHT, at('2026-09-07T18:30:00Z'))).toBe(true) // 23:30 PKT Monday
    expect(isOpenAt(NIGHT, at('2026-09-07T20:30:00Z'))).toBe(true) // 01:30 PKT Tuesday
    expect(isOpenAt(NIGHT, at('2026-09-07T10:00:00Z'))).toBe(false) // 15:00 PKT
  })

  it('renders the works clock as HH:MM in Sialkot time', () => {
    expect(worksClock(at('2026-09-07T04:05:00Z'))).toBe('09:05')
    expect(worksClock(at('2026-09-07T19:00:00Z'))).toBe('00:00') // never "24:00"
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/footerHours.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { FooterHours } from './projectPublic'

/** The works are in Sialkot. One constant, so the clock, the light and the label agree. */
export const WORKS_TIME_ZONE = 'Asia/Karachi'

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Mon–Sat 09:00–18:00 PKT" — the footer's own wording, derived, never retyped. */
export function formatHours(hours: FooterHours): string {
  const days =
    hours.firstDay === hours.lastDay
      ? DAY_LABEL[hours.firstDay]
      : `${DAY_LABEL[hours.firstDay]}–${DAY_LABEL[hours.lastDay]}`
  return `${days} ${hours.open}–${hours.close} PKT`
}

const minutes = (clock: string): number => {
  const [h, m] = clock.split(':').map(Number)
  return h * 60 + m
}

/** Weekday (0–6, Sunday 0) and minutes since midnight, both in Sialkot time. */
function inSialkot(instant: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WORKS_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    day: DAY_LABEL.indexOf(get('weekday')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/**
 * Open at `instant`? A wrapped week (Sat→Mon) and a window past midnight
 * (22:00–02:00) are both real for a factory and both handled; close is exclusive.
 */
export function isOpenAt(hours: FooterHours, instant: Date): boolean {
  const now = inSialkot(instant)
  const open = minutes(hours.open)
  const close = minutes(hours.close)
  const dayInWeek = (day: number) =>
    hours.firstDay <= hours.lastDay
      ? day >= hours.firstDay && day <= hours.lastDay
      : day >= hours.firstDay || day <= hours.lastDay
  if (open < close) {
    return dayInWeek(now.day) && now.minute >= open && now.minute < close
  }
  // Crosses midnight: the late half belongs to the working day it started on.
  if (now.minute >= open) return dayInWeek(now.day)
  if (now.minute < close) return dayInWeek((now.day + 6) % 7)
  return false
}

/** "HH:MM" in Sialkot time. `h23` so midnight is 00:00, never 24:00. */
export function worksClock(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/footerHours.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/cms/src/lib/footerHours.ts apps/cms/src/lib/footerHours.test.ts
git commit -m "feat(cms): footer hours — clock, label and open/closed derived from one field

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The footer markup (server component) and its copy helper

**Files:**

```text
Create: apps/cms/src/lib/footerCopy.ts
Create: apps/cms/src/lib/footerCopy.test.ts
Rewrite: apps/cms/src/components/site/SiteFooter.tsx
Create: apps/cms/src/components/site/SiteFooter.test.ts
```

**Interfaces:**
- Consumes `PublicSiteSettings.footer` (Task 1), `formatHours` (Task 3).
- Produces the DOM contract every later task and the e2e rely on — class names: `site-footer`, `site-footer__tab`, `site-footer__tab-label`, `site-footer__slab`, `footer-cta`, `footer-eyebrow`, `footer-q`, `footer-derisk`, `footer-dim`, `footer-side`, `footer-facts`, `footer-block`, `footer-block--capacity`, `footer-block--certified`, `footer-block--elsewhere`, `footer-legal`, `footer-mark`, `footer-mark__layer`, `footer-mark__layer--lit`; and three client-island slots rendered by Tasks 6 and 8.

- [ ] **Step 1: Write the failing tests**

The copy helper's test (new file, footerCopy.test.ts beside the other lib tests):

```ts
import { describe, expect, it } from 'vitest'
import { splitLastWord } from './footerCopy'

describe('splitLastWord', () => {
  it('separates the last word from its trailing punctuation', () => {
    expect(splitLastWord('Have a garment that needs making properly?')).toEqual({
      head: 'Have a garment that needs making ',
      last: 'properly',
      tail: '?',
    })
  })
  it('handles a single word and no punctuation', () => {
    expect(splitLastWord('Hello')).toEqual({ head: '', last: 'Hello', tail: '' })
  })
  it('treats trailing whitespace as absent', () => {
    expect(splitLastWord('Two words  ')).toEqual({ head: 'Two ', last: 'words', tail: '' })
  })
})
```

The footer's markup test (new file, SiteFooter.test.ts beside the component — `.test.ts`, not `.tsx`, because the cms vitest config only collects `src/**/*.test.ts`):

```ts
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { EMPTY_FOOTER, type PublicSiteSettings } from '../../lib/projectPublic'
import { SiteFooter } from './SiteFooter'

// `usePathname` needs the app router; outside Next it is mocked, and the path is a
// hoisted mutable so each case can choose the page it renders on.
const route = vi.hoisted(() => ({ path: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    // `href` LAST, so the mock renders `class` before `href` like a real <a> does and
    // both branches of the tab assert the same way
    createElement('a', { ...rest, href }, children as never),
}))

const base: PublicSiteSettings = { ...DEFAULT_SITE_SETTINGS, logoUrl: null, logoMimeType: null, footer: EMPTY_FOOTER }
const html = (settings: PublicSiteSettings) => renderToStaticMarkup(createElement(SiteFooter, { settings }))

describe('SiteFooter', () => {
  it('renders the tab as a real link to Contact, label and arrow in separate spans', () => {
    route.path = '/'
    const out = html(base)
    expect(out).toContain('class="site-footer__tab" href="/contact"')
    expect(out).toContain('site-footer__tab-label">Start an enquiry<')
    expect(out).toContain('aria-hidden="true">→<')
  })

  it('on the Contact page the tab links to the email instead — the visitor is already there', () => {
    route.path = '/contact'
    const out = html(base)
    expect(out).toContain('class="site-footer__tab" href="mailto:partner@wear-run.com"')
    expect(out).not.toContain('site-footer__tab" href="/contact"')
    route.path = '/'
  })

  it('sets the last word of the question in the serif accent', () => {
    expect(html(base)).toContain('needs making <em>properly</em>?')
  })

  it('renders NO claim block when the fields are empty', () => {
    const out = html(base)
    expect(out).not.toContain('footer-block--capacity')
    expect(out).not.toContain('footer-block--certified')
    expect(out).not.toContain('footer-block--elsewhere')
    expect(out).toContain('footer-block--contact')
    // and never a placeholder, dotted or otherwise
    expect(out).not.toMatch(/GOTS|Oeko|MOQ 50/)
  })

  it('renders each claim block only with its own real values', () => {
    const out = html({
      ...base,
      footer: {
        ...EMPTY_FOOTER,
        capacity: { moq: '50 pcs per style', leadTime: '', hours: { firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' } },
        certifications: ['GOTS'],
        socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel' }],
        worksCoordinates: '32.49° N · 74.52° E',
      },
    })
    expect(out).toContain('50 pcs per style')
    expect(out).toContain('Mon–Sat 09:00–18:00 PKT')
    expect(out).not.toContain('Lead time')
    expect(out).toContain('>GOTS<')
    expect(out).toContain('href="https://www.linkedin.com/company/run-apparel" rel="noopener"')
    expect(out).toContain('32.49° N · 74.52° E')
  })

  it('renders the wordmark twice, both decorative, from the same field as the top bar', () => {
    const out = html({ ...base, temporaryWordmark: 'RUN APPAREL' })
    expect(out.match(/footer-mark__layer[^>]*aria-hidden="true"[^>]*>RUN APPAREL</g)).toHaveLength(2)
  })

  it('renders the clock placeholder and no light before hydration', () => {
    const out = html(base)
    expect(out).toContain('--:--')
    expect(out).not.toContain('Open now')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/footerCopy.test.ts src/components/site/SiteFooter.test.ts`
Expected: FAIL — `footerCopy` missing; SiteFooter renders the old strip.

- [ ] **Step 3: The copy helper**

New file, footerCopy.ts in the cms lib directory:

```ts
/**
 * Split "…needs making properly?" into the part before the last word, the last word,
 * and its trailing punctuation — so the component can set ONE word in the serif accent
 * without the CMS field carrying markup.
 */
export function splitLastWord(sentence: string): { head: string; last: string; tail: string } {
  const trimmed = sentence.trimEnd()
  const match = /^(.*?)(\S+?)([^\w\s]*)$/.exec(trimmed)
  if (!match) return { head: '', last: trimmed, tail: '' }
  return { head: match[1] ?? '', last: match[2] ?? '', tail: match[3] ?? '' }
}
```

- [ ] **Step 4: The footer**

Replace `apps/cms/src/components/site/SiteFooter.tsx` entirely:

```tsx
import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import Link from 'next/link'
import { formatHours } from '../../lib/footerHours'
import { splitLastWord } from '../../lib/footerCopy'
import type { PublicSiteSettings } from '../../lib/projectPublic'
import { formatAddress } from '../../lib/structuredData'
import { FooterClock } from './FooterClock'
import { FooterGlow } from './FooterGlow'
import { FooterTab } from './FooterTab'
import { FooterWordmark } from './FooterWordmark'

/**
 * The public site footer — "The Quiet Room". Design record:
 * docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md
 *
 * ⚠️ <footer> IS UNCLIPPED AND THE SLAB INSIDE IT CARRIES `overflow: hidden`. The tab is
 * seated ON the slab's top edge — the header notch mirrored — and a tab inside a clipped
 * box is simply invisible. The wordmark needs the clip (it is cropped by the bottom
 * edge), so the clip lives one level down. Measured 2026-09-05 on the design artifact,
 * where the first version put the tab INSIDE the slab and it never rose out of anything.
 *
 * Server-rendered. The four things that need a browser — the clock, the wordmark fit and
 * spotlight, the glow, the cursor — are islands that hydrate over markup that already
 * reads correctly without them.
 */
export function SiteFooter({ settings }: { settings: PublicSiteSettings }) {
  const f = settings.footer
  const q = splitLastWord(f.ctaQuestion)
  const hours = f.capacity.hours
  const showCapacity = Boolean(f.capacity.moq || f.capacity.leadTime || hours)

  return (
    <footer className="site-footer">
      <FooterTab label={f.ctaLabel} email={settings.email} />

      <div className="site-footer__slab">
        <FooterGlow />

        <div className="footer-cta">
          <div>
            <p className="footer-eyebrow">Start here</p>
            <h2 className="footer-q">
              {q.head}
              <em>{q.last}</em>
              {q.tail}
            </h2>
            <p className="footer-derisk">{f.ctaSubline}</p>
            <p className="footer-dim">{f.ctaPromise}</p>
          </div>
          <div className="footer-side">
            <FooterClock hours={hours} />
          </div>
        </div>

        <div className="footer-grow" />

        <div className="footer-facts">
          <div className="footer-block footer-block--contact">
            <h3>Contact</h3>
            <ul>
              <li>
                <a href={`mailto:${settings.email}`}>{settings.email}</a>
              </li>
              <li>
                <a href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`} rel="noopener">
                  WhatsApp {settings.whatsappNumber}
                </a>
              </li>
              <li>{formatAddress()}</li>
              {f.worksCoordinates ? <li className="footer-block__sub">{f.worksCoordinates}</li> : null}
            </ul>
          </div>

          {showCapacity ? (
            <div className="footer-block footer-block--capacity">
              <h3>Capacity</h3>
              <ul>
                {f.capacity.moq ? <li>MOQ {f.capacity.moq}</li> : null}
                {f.capacity.leadTime ? <li>Lead time {f.capacity.leadTime}</li> : null}
                {hours ? <li>{formatHours(hours)}</li> : null}
              </ul>
            </div>
          ) : null}

          {f.certifications.length > 0 ? (
            <div className="footer-block footer-block--certified">
              <h3>Certified</h3>
              <ul>
                {f.certifications.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {f.socialLinks.length > 0 ? (
            <div className="footer-block footer-block--elsewhere">
              <h3>Elsewhere</h3>
              <ul>
                {f.socialLinks.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} rel="noopener">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* `legalLine` already contains the company name — see git history for the
            "© RUN APPAREL (PVT) LTD · RUN APPAREL (PVT) LTD" that appending produced. */}
        <div className="footer-legal">
          <span>{settings.legalLine}</span>
          <span>{settings.footerLine}</span>
          <Link className="nav-link" href="/products">
            Products
          </Link>
          <Link className="nav-link" href="/contact">
            Contact
          </Link>
        </div>

        <FooterWordmark text={settings.temporaryWordmark} />
      </div>
    </footer>
  )
}
```

The tab is its own small client component, because it changes where it points depending on the page — owner decision 2026-09-05: on the Contact page a visitor is already where the tab would send them, so there it links straight to the email. Same `usePathname` pattern `NavLinks.tsx` already uses for `aria-current`; it resolves during SSR, so the href is in the HTML.

```tsx
// apps/cms/src/components/site/FooterTab.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The flipped notch: a volt tab seated on the slab's top edge, carrying the one
 * action. Everywhere it links to /contact; ON /contact — where the visitor already is
 * what the tab would send them to — it links to the email instead. Both are real links
 * with the label in the HTML, so JavaScript-off and crawlers see the same thing.
 */
export function FooterTab({ label, email }: { label: string; email: string }) {
  const onContact = usePathname() === '/contact'
  const inner = (
    <>
      <span className="site-footer__tab-label">{label}</span>
      <span className="site-footer__tab-arrow" aria-hidden="true">
        →
      </span>
    </>
  )
  return onContact ? (
    <a className="site-footer__tab" href={`mailto:${email}`}>
      {inner}
    </a>
  ) : (
    <Link className="site-footer__tab" href="/contact">
      {inner}
    </Link>
  )
}
```

The other three islands do not exist yet. For this task, create them as **server-safe stubs** so the markup test can run; Tasks 6 and 8 replace them:

```tsx
// apps/cms/src/components/site/FooterClock.tsx  (stub — replaced in Task 6)
import type { FooterHours } from '../../lib/projectPublic'
export function FooterClock(_props: { hours: FooterHours | null }) {
  return (
    <span className="footer-clock">
      <i aria-hidden="true" />
      <span className="footer-clock__city">Sialkot · HQ &amp; works</span>
      <span className="footer-clock__time">
        <span>--:--</span>
        <small>PKT</small>
      </span>
    </span>
  )
}
```

```tsx
// apps/cms/src/components/site/FooterWordmark.tsx  (stub — replaced in Task 6)
export function FooterWordmark({ text }: { text: string }) {
  return (
    <div className="footer-mark">
      <div className="footer-mark__layer" aria-hidden="true">{text}</div>
      <div className="footer-mark__layer footer-mark__layer--lit" aria-hidden="true">{text}</div>
    </div>
  )
}
```

```tsx
// apps/cms/src/components/site/FooterGlow.tsx  (stub — replaced in Task 8)
export function FooterGlow() {
  return null
}
```

- [ ] **Step 5: Run the tests**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/footerCopy.test.ts src/components/site/SiteFooter.test.ts`
Expected: PASS — `next/link` and `next/navigation` are both mocked at the top of the test, because neither works outside a Next runtime.

- [ ] **Step 6: Commit**

```bash
git add apps/cms/src/lib/footerCopy.ts apps/cms/src/lib/footerCopy.test.ts apps/cms/src/components/site/SiteFooter.tsx apps/cms/src/components/site/SiteFooter.test.ts apps/cms/src/components/site/FooterTab.tsx apps/cms/src/components/site/FooterClock.tsx apps/cms/src/components/site/FooterWordmark.tsx apps/cms/src/components/site/FooterGlow.tsx
git commit -m "feat(cms): the Quiet Room footer markup — claim blocks render only from real values

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The footer CSS

**Files:**

```text
Modify: apps/cms/src/app/(frontend)/site.css   (replace the block between "/* --- footer */" and "/* --- product gallery */")
```

**Interfaces:**
- Consumes the class names from Task 4. Produces `--footer-pad`, the tab geometry, and the `.footer-glow*` rules Task 8 fills.

- [ ] **Step 1: Negative control first — prove the style gate reads this file**

Add `padding: 13px;` to `.site-footer` temporarily and run:

`npx --yes pnpm@10.33.0 --filter @run-apparel/viewer exec vitest run src/styles/tokens.test.ts`
Expected: FAIL naming `site.css` and `13px`. Remove the line.

- [ ] **Step 2: Replace the footer block**

Delete everything from `/* ---------------------------------------------------------------- footer */` up to (not including) `/* ------------------------------------------------------- product gallery */` and insert:

```css
/* ---------------------------------------------------------------- footer */

/*
 * "The Quiet Room" — docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md.
 * A full-screen dark slab from tablet widths up, mostly empty on purpose, ending in the
 * company's name at the width of the screen.
 *
 * ⚠️ THE TAB SITS ON THE SLAB'S TOP EDGE, OUTSIDE THE CLIP. `.site-footer` is unclipped
 * and positions; `.site-footer__slab` clips (the wordmark is cropped by its bottom edge).
 * The first draft put the tab inside the slab and it never rose out of anything.
 */
.site-footer {
  --footer-pad: clamp(20px, 4.4vw, 64px);
  --footer-bg: light-dark(var(--ink), var(--raised));
  --footer-text: light-dark(var(--paper), var(--text));
  /* dark is 0.68, not 0.6: on --raised, 0.6 measured 4.57:1 — AA by 0.07 */
  --footer-muted: light-dark(rgba(241, 239, 234, 0.6), rgba(236, 235, 228, 0.68));
  --footer-line: light-dark(rgba(241, 239, 234, 0.16), rgba(236, 235, 228, 0.16));
  --footer-grid: light-dark(rgba(241, 239, 234, 0.07), rgba(236, 235, 228, 0.06));
  --footer-stroke: light-dark(rgba(241, 239, 234, 0.26), rgba(236, 235, 228, 0.24));
  position: relative;
  /* room for the tab, which is seated above the slab's edge */
  padding-block-start: var(--target-min);
}

.site-footer__slab {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0 var(--footer-pad);
  background: var(--footer-bg);
  color: var(--footer-text);
  /* In dark mode --raised sits at 1.47:1 against the page — the header notch's
     figure, fixed there with --shadow-raised. A slab is too wide for a shadow to
     read as an edge, so a hairline; invisible against light-mode ink. */
  border-top: 1px solid var(--footer-line);
}

/* the blueprint grid (base.css's recipe) fading in toward the bottom */
.site-footer__slab::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--footer-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--footer-grid) 1px, transparent 1px);
  background-size: 26px 26px;
  mask: linear-gradient(to bottom, transparent 30%, #000 100%);
  pointer-events: none;
}

/* One full screen from tablet up. `svh`, not `dvh`: the viewer measured dvh resizing
   a stage 14 times in one swipe; a footer's height must not follow the toolbar. On a
   phone the content sets the height — a dark screen after the page is thumb-travel
   past nothing. */
@media (min-width: 768px) {
  .site-footer__slab {
    min-height: 100svh;
  }
}

/* ── the flipped notch ─────────────────────────────────────────────────────
 *   header (.notch)              footer tab
 *   border-end-*-radius          border-start-*-radius
 *   fillet inset-block-start: 0  fillet inset-block-end: 0
 *   mask circle at *,100%        mask circle at *,0
 * The fillets live OUTSIDE the tab's box, one --notch-r each; the rail reserves
 * exactly that (see .notch-shell for why "exactly"). */
.site-footer__tab {
  --arrow-w: 14px;
  --arrow-gap: 10px;
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 50%;
  translate: -50% 0;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--target-min);
  max-width: calc(100% - var(--notch-r) * 2);
  padding-inline: 24px;
  background: var(--volt);
  color: var(--ink);
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  letter-spacing: 0.17em;
  text-transform: uppercase;
  white-space: nowrap;
  border-start-start-radius: var(--notch-r);
  border-start-end-radius: var(--notch-r);
}

.site-footer__tab::before,
.site-footer__tab::after {
  content: "";
  position: absolute;
  inset-block-end: 0;
  width: var(--notch-r);
  height: var(--notch-r);
  background: var(--volt);
  pointer-events: none;
}

.site-footer__tab::before {
  inset-inline-end: 100%;
  mask: radial-gradient(circle at 0 0, #0000 var(--notch-r), #000 calc(var(--notch-r) + 0.5px));
}

.site-footer__tab::after {
  inset-inline-start: 100%;
  mask: radial-gradient(circle at 100% 0, #0000 var(--notch-r), #000 calc(var(--notch-r) + 0.5px));
}

/* The label rests centred; on hover it slides left and the arrow arrives. The tab's
   WIDTH NEVER CHANGES — the arrow's slot is always reserved and the label is nudged
   right by half of it at rest — so the fillets never move. Touch has no hover, so
   there the arrow is simply always shown. */
.site-footer__tab-arrow {
  font-family: var(--font-display);
  width: var(--arrow-w);
  margin-inline-start: var(--arrow-gap);
  text-align: end;
}

.site-footer__tab:focus-visible {
  outline: 2px solid var(--footer-text);
  outline-offset: 4px;
}

@media (hover: hover) and (pointer: fine) {
  .site-footer__tab {
    transition: background-color var(--fast) var(--ease);
  }

  .site-footer__tab:hover {
    background: color-mix(in srgb, var(--volt) 88%, white);
  }

  .site-footer__tab-label {
    transform: translateX(calc((var(--arrow-w) + var(--arrow-gap)) / 2));
    transition: transform var(--ui) var(--ease);
  }

  .site-footer__tab-arrow {
    opacity: 0;
    transform: translateX(-6px);
    transition:
      opacity var(--fast) var(--ease),
      transform var(--ui) var(--ease);
  }

  .site-footer__tab:hover .site-footer__tab-label,
  .site-footer__tab:focus-visible .site-footer__tab-label {
    transform: translateX(0);
  }

  .site-footer__tab:hover .site-footer__tab-arrow,
  .site-footer__tab:focus-visible .site-footer__tab-arrow {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ── the question ──────────────────────────────────────────────────────── */
.footer-cta {
  position: relative;
  padding-block-start: clamp(44px, 6vw, 84px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: start;
}

.footer-side {
  display: grid;
  gap: 14px;
  justify-items: end;
}

@media (max-width: 720px) {
  .footer-cta {
    grid-template-columns: 1fr;
  }

  .footer-side {
    justify-items: start;
  }
}

.footer-eyebrow {
  margin: 0 0 14px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--footer-muted);
}

.footer-q {
  margin: 0;
  max-width: 22ch;
  font-family: var(--font-display);
  font-weight: 800;
  font-stretch: 122%;
  font-size: clamp(27px, 4.3vw, 52px);
  line-height: 1;
  letter-spacing: var(--tracking-display-sm); /* the only display tracking token that exists */
  text-wrap: balance;
}

.footer-q em {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-stretch: 100%;
  color: var(--volt);
}

.footer-derisk {
  margin: 16px 0 0;
  max-width: 44ch;
  font-size: var(--text-sm);
  color: var(--footer-muted);
}

/* the dimension line: end ticks on the ends of the text, so it is fit-content and
   nowrap — a wrapped one measured half of what it labelled. */
.footer-dim {
  position: relative;
  width: fit-content;
  margin: 24px 0 0;
  padding-block-start: 8px;
  border-top: 1px solid currentColor;
  color: var(--volt);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  letter-spacing: 0.17em;
  text-transform: uppercase;
  white-space: nowrap;
}

.footer-dim::before,
.footer-dim::after {
  content: "";
  position: absolute;
  inset-block-start: -4px;
  width: 1px;
  height: 8px;
  background: currentColor;
}

.footer-dim::before {
  inset-inline-start: 0;
}

.footer-dim::after {
  inset-inline-end: 0;
}

/* ── the clock, corner-bracketed ───────────────────────────────────────── */
.footer-clock {
  position: relative;
  display: inline-grid;
  gap: 4px;
  padding: 10px 14px 8px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  white-space: nowrap;
}

.footer-clock i {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.footer-clock::before,
.footer-clock::after,
.footer-clock i::before,
.footer-clock i::after {
  content: "";
  position: absolute;
  width: 7px;
  height: 7px;
  border: 1px solid var(--footer-muted);
  pointer-events: none;
}

.footer-clock::before {
  inset-block-start: 0;
  inset-inline-start: 0;
  border-width: 1px 0 0 1px;
}

.footer-clock::after {
  inset-block-end: 0;
  inset-inline-end: 0;
  border-width: 0 1px 1px 0;
}

.footer-clock i::before {
  inset-block-start: 0;
  inset-inline-end: 0;
  border-width: 1px 1px 0 0;
}

.footer-clock i::after {
  inset-block-end: 0;
  inset-inline-start: 0;
  border-width: 0 0 1px 1px;
}

.footer-clock__city {
  font-size: var(--text-mono-sm);
  letter-spacing: 0.18em;
  color: var(--footer-muted);
}

.footer-clock__time {
  font-size: var(--text-sm);
  letter-spacing: 0.06em;
  font-weight: 500;
}

.footer-clock__time small {
  margin-inline-start: 6px;
  font-size: var(--text-mono-sm);
  letter-spacing: 0.14em;
  color: var(--footer-muted);
}

.footer-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--footer-muted);
}

.footer-status::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--footer-muted);
}

.footer-status[data-state="open"] {
  color: var(--footer-text);
}

.footer-status[data-state="open"]::before {
  background: var(--volt);
  box-shadow: var(--shadow-raised);
}

/* ── the facts, 2 × 2, bottom-right ────────────────────────────────────── */
.footer-grow {
  flex: 1 1 auto;
  min-height: 24px;
}

.footer-facts {
  max-width: 640px;
  margin-inline-start: auto;
  padding: 24px 0 clamp(24px, 4vw, 64px);
  border-top: 1px solid var(--footer-line);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* 24 both ways — 44 is not a documented spacing step and the gate says so */
  gap: 24px;
}

@media (max-width: 420px) {
  .footer-facts {
    grid-template-columns: 1fr;
  }
}

/* On a phone bottom-right has nowhere to be bottom-right OF: measured 2026-09-05 the
   block kept its desktop right-alignment and sat in the right 264px of a 390px screen
   with a dead gutter beside it. Full width there. */
@media (max-width: 720px) {
  .footer-facts {
    max-width: none;
    margin-inline-start: 0;
  }
}

.footer-block h3 {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 400;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--footer-muted);
}

.footer-block ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.footer-block li,
.footer-block a {
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  letter-spacing: 0.055em;
  text-transform: uppercase;
  color: var(--footer-text);
  text-decoration: none;
  font-variant-numeric: tabular-nums;
}

.footer-block__sub {
  color: var(--footer-muted);
  font-size: var(--text-mono-sm);
}

@media (hover: hover) and (pointer: fine) {
  .footer-block a:hover {
    color: var(--volt);
  }
}

.footer-block a:focus-visible {
  outline: 2px solid var(--volt);
  outline-offset: 2px;
}

/* ── legal ─────────────────────────────────────────────────────────────── */
.footer-legal {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px 24px;
  padding: 16px 0 22px;
  border-top: 1px solid var(--footer-line);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--footer-muted);
}

.footer-legal .nav-link {
  min-height: 0;
  padding-inline: 0;
  --notch-muted: var(--footer-muted);
  --notch-text: var(--footer-text);
}

/* the same ring every other footer link gets — measured 2026-09-05 these two fell
   back to the browser's `auto 1px` while the rest showed the design's 2px volt */
.footer-legal .nav-link:focus-visible {
  outline: 2px solid var(--volt);
  outline-offset: 2px;
}

/* ── the wordmark: outlined, fitted, cropped, spotlit ──────────────────────
   Two identical layers. The base is always there. The lit layer is a volt stroke
   with a 30% volt fill, masked to the pointer, and fades out on leave. Fine pointers
   only; the base outline IS the design. The font-size here is a first paint only —
   FooterWordmark measures the rendered text and scales it to the slab's width. */
.footer-mark {
  position: relative;
  margin-inline: calc(var(--footer-pad) * -1);
  margin-block-end: -0.2em;
  font-size: 12vw;
  line-height: 0.74;
  cursor: default;
}

.footer-mark__layer {
  font-family: var(--font-display);
  font-weight: 900;
  font-stretch: 122%;
  letter-spacing: -0.045em;
  line-height: inherit;
  white-space: nowrap;
  text-align: center;
  user-select: none;
  color: transparent;
  -webkit-text-stroke: 1.5px var(--footer-stroke);
}

.footer-mark__layer--lit {
  position: absolute;
  inset: 0;
  --mx: -1000px;
  --my: -1000px;
  color: color-mix(in srgb, var(--volt) 30%, transparent);
  -webkit-text-stroke: 1.5px var(--volt);
  opacity: 0;
  transition: opacity var(--ui) var(--ease);
  mask-image: radial-gradient(circle 170px at var(--mx) var(--my), #000 0%, rgba(0, 0, 0, 0.55) 45%, transparent 100%);
  pointer-events: none;
}

.footer-mark[data-lit="true"] .footer-mark__layer--lit {
  opacity: 1;
}

@media (hover: none), (prefers-reduced-motion: reduce) {
  .footer-mark__layer--lit {
    display: none;
  }
}

/* ── the glow (footer only) — filled by FooterGlow ──────────────────────── */
/* The SLAB owns --gx/--gy (set by FooterGlow from the ring's trailed point) and every
   layer inherits them, so one write lights everything. */
.site-footer__slab {
  --gx: -1000px;
  --gy: -1000px;
}

.footer-glow {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--ui) var(--ease);
}

.site-footer__slab[data-glow="true"] .footer-glow {
  opacity: 1;
}

.footer-glow--halo {
  background: radial-gradient(
    circle 230px at var(--gx) var(--gy),
    rgba(205, 243, 69, 0.22) 0%,
    rgba(205, 243, 69, 0.07) 50%,
    transparent 100%
  );
  mix-blend-mode: screen;
}

.site-footer__slab[data-glow="true"][data-over="true"] .footer-glow--halo {
  opacity: 0.32;
}

.footer-glow--transfer {
  background: radial-gradient(
    circle 170px at var(--gx) var(--gy),
    var(--volt) 0%,
    rgba(205, 243, 69, 0.55) 50%,
    transparent 100%
  );
  mix-blend-mode: multiply;
}

.footer-glow--grid {
  background-image:
    linear-gradient(rgba(205, 243, 69, 0.42) 1px, transparent 1px),
    linear-gradient(90deg, rgba(205, 243, 69, 0.42) 1px, transparent 1px);
  background-size: 26px 26px;
  mask-image:
    radial-gradient(circle 200px at var(--gx) var(--gy), #000 0%, rgba(0, 0, 0, 0.5) 50%, transparent 100%),
    linear-gradient(to bottom, transparent 30%, #000 100%);
  mask-composite: intersect;
}

@media (hover: none), (prefers-reduced-motion: reduce) {
  .footer-glow {
    display: none;
  }
}

/* Windows High Contrast: the tab's fillets and the grid are decoration and may go;
   the tab keeps a border, the wordmark keeps a stroke in a system colour. */
@media (forced-colors: active) {
  .site-footer__tab {
    border: 1px solid CanvasText;
  }

  .site-footer__tab::before,
  .site-footer__tab::after,
  .site-footer__slab::before {
    display: none;
  }

  .footer-mark__layer {
    -webkit-text-stroke-color: CanvasText;
  }
}
```

⚠️ Check `--tracking-display` and `--tracking-display-sm` exist in `packages/ui/src/tokens.css` (the old footer used `--tracking-display-sm`); if `--tracking-display` does not, use `--tracking-display-sm`. The token test fails on an unresolved `var()` and names the line.

- [ ] **Step 3: Run the style gate, lint and typecheck**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/viewer exec vitest run src/styles/tokens.test.ts && npx --yes pnpm@10.33.0 lint`
Expected: PASS. Biome will reformat long declarations — accept its formatting.

- [ ] **Step 4: Look at it once**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms dev` and open `http://localhost:3000/contact` with the Playwright MCP. Screenshot `.site-footer`. The tab must sit on the slab's top edge with volt shoulders sweeping down; the question two lines; the facts a 2×2 bottom-right; the wordmark spanning the width (it will be the first-paint size until Task 6). Stop the dev server and restore the two generated files:

```bash
git checkout -- "apps/cms/src/app/(payload)/admin/importMap.js" apps/cms/next-env.d.ts
```

- [ ] **Step 5: Commit**

```bash
git add "apps/cms/src/app/(frontend)/site.css"
git commit -m "feat(cms): footer styles — flipped notch tab, dimension line, 2x2 facts, cropped outline wordmark

Every spacing, radius, shadow and duration is a token; every :hover is gated;
forced-colors keeps a border and a stroke. svh not dvh for the full-screen rule.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The clock and wordmark islands

**Files:**

```text
Create: apps/cms/src/lib/wordmarkFit.ts
Create: apps/cms/src/lib/wordmarkFit.test.ts
Replace: apps/cms/src/components/site/FooterClock.tsx
Replace: apps/cms/src/components/site/FooterWordmark.tsx
```

**Interfaces:**
- Consumes `isOpenAt`, `worksClock` (Task 3), `FooterHours` (Task 1).
- Produces `fitScale(available, needed, safety?)`.

- [ ] **Step 1: Write the failing fit test**

```ts
import { describe, expect, it } from 'vitest'
import { fitScale } from './wordmarkFit'

describe('fitScale', () => {
  it('scales the font so the text spans the available width, with a hairline of safety', () => {
    expect(fitScale(1000, 500)).toBeCloseTo(1.99, 2) // 2 × 0.995
    expect(fitScale(500, 1000)).toBeCloseTo(0.4975, 4)
  })
  it('returns 1 when either measurement is missing, so a bad read never blanks the name', () => {
    expect(fitScale(0, 500)).toBe(1)
    expect(fitScale(500, 0)).toBe(1)
    expect(fitScale(Number.NaN, 500)).toBe(1)
  })
})
```

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/wordmarkFit.test.ts` → FAIL, module missing.

- [ ] **Step 2: Implement the pure part**

```ts
/**
 * The factor to multiply the current font-size by so the rendered text spans the
 * available width. FITTED, NOT GUESSED: two fixed sizes both ran "RUN APPAREL" off the
 * edge of the design artifact, because Archivo 900 at 122% is not a width you estimate.
 * The name comes from a CMS field, so its length is an input, not a constant.
 */
export function fitScale(available: number, needed: number, safety = 0.995): number {
  if (!Number.isFinite(available) || !Number.isFinite(needed) || available <= 0 || needed <= 0) return 1
  return (available / needed) * safety
}
```

- [ ] **Step 3: The clock island**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { isOpenAt, worksClock } from '../../lib/footerHours'
import type { FooterHours } from '../../lib/projectPublic'

/**
 * A live Sialkot clock and, when the owner has set hours, an open/closed light derived
 * from them. Renders `--:--` and no light on the server and on the first client render,
 * so the markup hydrates without a mismatch and JavaScript-off readers see an honest
 * placeholder rather than a frozen time.
 */
export function FooterClock({ hours }: { hours: FooterHours | null }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const open = now && hours ? isOpenAt(hours, now) : null

  return (
    <>
      <span className="footer-clock">
        <i aria-hidden="true" />
        <span className="footer-clock__city">Sialkot · HQ &amp; works</span>
        <span className="footer-clock__time">
          <span>{now ? worksClock(now) : '--:--'}</span>
          <small>PKT</small>
        </span>
      </span>
      {open === null ? null : (
        <span className="footer-status" data-state={open ? 'open' : 'closed'}>
          {open ? 'Open now' : `Opens ${hours?.open} PKT`}
        </span>
      )}
    </>
  )
}
```

- [ ] **Step 4: The wordmark island**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { fitScale } from '../../lib/wordmarkFit'

/**
 * The company's name at the width of the slab, cropped by its bottom edge. Two
 * identical layers: the base outline is always there; the lit layer is masked to a
 * point and fades out. THIS ISLAND ONLY FITS THE TEXT — the spotlight's position and
 * `data-lit` are driven by FooterGlow's light controller, so the wordmark, the halo
 * and the grid are lit from ONE point, the cursor ring's. Two lights of different
 * radii wandering over the same letters was the first draft's tell.
 *
 * FIT AFTER FONTS: Archivo's metrics differ from the fallback, so measuring before
 * `document.fonts.ready` fits the wrong face. Re-fit on resize.
 */
export function FooterWordmark({ text }: { text: string }) {
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const base = el.querySelector<HTMLElement>('.footer-mark__layer')
    if (!base) return

    const fit = () => {
      el.style.fontSize = ''
      const scale = fitScale(el.clientWidth, base.scrollWidth)
      el.style.fontSize = `${Number.parseFloat(getComputedStyle(el).fontSize) * scale}px`
    }
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.then(fit)
    const observer = new ResizeObserver(fit)
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return (
    <div className="footer-mark" ref={wrap} data-lit="false">
      <div className="footer-mark__layer" aria-hidden="true">
        {text}
      </div>
      <div className="footer-mark__layer footer-mark__layer--lit" aria-hidden="true">
        {text}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Tests, lint, typecheck, and the JSX style gate**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib src/components && npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 --filter @run-apparel/viewer exec vitest run src/styles/tokens.test.ts`
Expected: all PASS. (`el.style.fontSize = …px` is a computed value, which the JSX gate allows; a literal `style={{ padding: '20px' }}` would not be.)

- [ ] **Step 6: Commit**

```bash
git add apps/cms/src/lib/wordmarkFit.ts apps/cms/src/lib/wordmarkFit.test.ts apps/cms/src/components/site/FooterClock.tsx apps/cms/src/components/site/FooterWordmark.tsx
git commit -m "feat(cms): footer islands — live Sialkot clock with derived open light, fitted spotlit wordmark

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The cursor, site-wide, dependency-free

**Files:**

```text
Create: apps/cms/src/lib/cursorMath.ts
Create: apps/cms/src/lib/cursorMath.test.ts
Create: apps/cms/src/lib/cursorBus.ts
Create: apps/cms/src/lib/cursorBus.test.ts
Create: apps/cms/src/components/site/Cursor.tsx
Modify: apps/cms/src/app/(frontend)/layout.tsx
```

**Interfaces:**
- Produces `trail(current, target, k)`, `ringTransform(x, y, scale)`, `isInteractive(node)`, and the bus: `subscribeToCursor(fn: (point: CursorPoint) => void): () => void`, `publishCursor(point: CursorPoint)`, `type CursorPoint = { x: number; y: number; placed: boolean; now: number }` — the ring's TRAILED viewport position, published once per painted frame. Task 8 consumes it.

- [ ] **Step 0: The bus, and its test**

New file cursorBus.ts in the cms lib directory — a module-level singleton, which is correct here: there is one cursor per document and every subscriber wants the same point.

```ts
/**
 * The cursor ring's trailed position, published once per painted frame by Cursor.tsx
 * and consumed by anything that must be lit FROM the ring rather than from the raw
 * pointer. Measured 2026-09-05 on the design artifact: lit from the pointer, the
 * footer's halo sat at x=738 while the ring was still gliding through x=348, so the
 * glow visibly detached from the cursor on every fast move.
 */
export interface CursorPoint {
  x: number
  y: number
  /** false once the pointer has left the window; subscribers switch off */
  placed: boolean
  now: number
}

const listeners = new Set<(point: CursorPoint) => void>()
let last: CursorPoint | null = null

export function subscribeToCursor(fn: (point: CursorPoint) => void): () => void {
  listeners.add(fn)
  if (last) fn(last)
  return () => {
    listeners.delete(fn)
  }
}

export function publishCursor(point: CursorPoint): void {
  last = point
  for (const fn of listeners) fn(point)
}

/** Test seam. */
export function resetCursorBus(): void {
  listeners.clear()
  last = null
}
```

Its test, cursorBus.test.ts beside it:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publishCursor, resetCursorBus, subscribeToCursor } from './cursorBus'

describe('cursorBus', () => {
  beforeEach(resetCursorBus)

  it('delivers every publish to every subscriber, and stops after unsubscribe', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = subscribeToCursor(a)
    subscribeToCursor(b)
    publishCursor({ x: 1, y: 2, placed: true, now: 10 })
    stopA()
    publishCursor({ x: 3, y: 4, placed: true, now: 20 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenLastCalledWith({ x: 3, y: 4, placed: true, now: 20 })
  })

  it('replays the last point to a late subscriber, so a footer mounting mid-move is lit at once', () => {
    publishCursor({ x: 5, y: 6, placed: true, now: 30 })
    const late = vi.fn()
    subscribeToCursor(late)
    expect(late).toHaveBeenCalledWith({ x: 5, y: 6, placed: true, now: 30 })
  })
})
```

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/cursorBus.test.ts` → PASS.

- [ ] **Step 1: Write the failing tests — the transform ORDER is the one that matters**

```ts
import { describe, expect, it } from 'vitest'
import { INTERACTIVE, isInteractive, ringTransform, trail } from './cursorMath'

describe('cursorMath', () => {
  it('trail closes a fixed fraction of the remaining gap', () => {
    expect(trail(0, 100, 0.22)).toBeCloseTo(22)
    expect(trail(22, 100, 0.22)).toBeCloseTo(39.16)
    expect(trail(100, 100, 0.22)).toBe(100)
  })

  it('puts translate BEFORE scale in one transform string', () => {
    // The viewer's ring once carried scale as a standalone property while its position
    // lived in transform; CSS composes those in a fixed order and the ring landed 1.53×
    // away from the pointer. One string, translate first, is the fix and this pins it.
    const t = ringTransform(800, 400, 1.53)
    expect(t).toBe('translate3d(800px, 400px, 0) translate(-50%, -50%) scale(1.53)')
    expect(t.indexOf('translate3d')).toBeLessThan(t.indexOf('scale('))
  })

  it('names the same interactive targets the viewer inflates over', () => {
    expect(INTERACTIVE).toBe('a, button, [role="tab"], [data-cursor="pointer"]')
    const a = { closest: (s: string) => (s === INTERACTIVE ? {} : null) } as unknown as Element
    expect(isInteractive(a)).toBe(true)
    expect(isInteractive(null)).toBe(false)
  })
})
```

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/cursorMath.test.ts` → FAIL.

- [ ] **Step 2: Implement the pure part**

```ts
/** The targets the ring inflates over — identical to apps/viewer's Cursor.tsx. */
export const INTERACTIVE = 'a, button, [role="tab"], [data-cursor="pointer"]'

/** One frame of the ring's trail: close `k` of the remaining gap. 0.22 ≈ the viewer's spring feel. */
export function trail(current: number, target: number, k: number): number {
  return current + (target - current) * k
}

/**
 * ⚠️ ONE STRING, TRANSLATE BEFORE SCALE. `translate`/`scale`/`transform` compose in a
 * fixed order you do not control; a standalone `scale` on an element whose position is
 * in `transform` multiplies the position. The viewer measured its ring at (1224, 612)
 * for a pointer at (800, 400) that way.
 */
export function ringTransform(x: number, y: number, scale: number): string {
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`
}

export function isInteractive(node: Element | null): boolean {
  return Boolean(node?.closest?.(INTERACTIVE))
}
```

- [ ] **Step 3: The component**

```tsx
'use client'

import { useEffect } from 'react'
import { publishCursor } from '../../lib/cursorBus'
import { isInteractive, ringTransform, trail } from '../../lib/cursorMath'

/**
 * The viewer's precision cursor — a dot that tracks the pointer exactly and a ring that
 * trails it — on the public site, without Motion. The CSS is the shared one in
 * packages/ui/src/base.css (`.cursor-dot`, `.cursor-ring`, `.has-custom-cursor`); only
 * this file is new. Fine pointers only; never under reduced motion or automation.
 *
 * `has-custom-cursor` (which hides the real cursor) is applied ONLY once the replacement
 * is placed, and removed when the pointer leaves the window — the viewer shipped a
 * "no cursor at all" window between mount and first move, and this keeps that fix.
 */
export function Cursor() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced || navigator.webdriver) return

    const dot = document.createElement('span')
    dot.className = 'cursor-dot'
    dot.setAttribute('aria-hidden', 'true')
    dot.dataset.hidden = 'true'
    const ring = document.createElement('span')
    ring.className = 'cursor-ring'
    ring.setAttribute('aria-hidden', 'true')
    ring.dataset.hidden = 'true'
    ring.dataset.pointer = 'false'
    document.body.append(dot, ring)

    const root = document.documentElement
    let px = -100
    let py = -100
    let rx = -100
    let ry = -100
    let scale = 1
    let placed = false
    let frame = 0

    const paint = (now: number) => {
      frame = 0
      rx = trail(rx, px, 0.22)
      ry = trail(ry, py, 0.22)
      const moving = Math.abs(px - rx) > 0.3 || Math.abs(py - ry) > 0.3
      if (!moving) {
        // land exactly, so the ring and everything lit from it stop on the pointer
        rx = px
        ry = py
      }
      dot.style.transform = ringTransform(px, py, 1)
      ring.style.transform = ringTransform(rx, ry, scale)
      // the ring's TRAILED point, for anything that must be lit from the ring
      publishCursor({ x: rx, y: ry, placed, now })
      if (moving) frame = requestAnimationFrame(paint)
    }
    const onMove = (event: MouseEvent) => {
      px = event.clientX
      py = event.clientY
      if (!placed) {
        placed = true
        rx = px
        ry = py
        root.classList.add('has-custom-cursor')
        dot.dataset.hidden = 'false'
        ring.dataset.hidden = 'false'
      }
      scale = isInteractive(event.target as Element | null) ? 1.53 : 1
      ring.dataset.pointer = String(scale > 1)
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onLeave = () => {
      placed = false
      root.classList.remove('has-custom-cursor')
      dot.dataset.hidden = 'true'
      ring.dataset.hidden = 'true'
      publishCursor({ x: rx, y: ry, placed: false, now: performance.now() })
    }
    // scrolling moves the page under a still pointer; re-publish from the same point
    const onScroll = () => {
      if (placed && !frame) frame = requestAnimationFrame(paint)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('mouseleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      root.classList.remove('has-custom-cursor')
      dot.remove()
      ring.remove()
    }
  }, [])

  return null
}
```

- [ ] **Step 4: Mount it**

In `apps/cms/src/app/(frontend)/layout.tsx`, import `{ Cursor } from '../../components/site/Cursor'` and render `<Cursor />` immediately after `<Analytics />`.

- [ ] **Step 5: Tests, lint, typecheck**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/lib/cursorMath.test.ts && npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/cms/src/lib/cursorMath.ts apps/cms/src/lib/cursorMath.test.ts apps/cms/src/lib/cursorBus.ts apps/cms/src/lib/cursorBus.test.ts apps/cms/src/components/site/Cursor.tsx "apps/cms/src/app/(frontend)/layout.tsx"
git commit -m "feat(cms): the viewer's dot-and-ring cursor on the site, without Motion

Position and scale in one transform string, translate first — pinned by a test,
because the viewer shipped the other order and measured its ring 1.53x off.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The footer glow

**Files:**

```text
Replace: apps/cms/src/components/site/FooterGlow.tsx
```

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { type CursorPoint, subscribeToCursor } from '../../lib/cursorBus'

/** Anything under the light that should carry it instead of the halo. */
const CONTENT = 'a, .footer-q, .footer-eyebrow, .footer-derisk, .footer-dim, .footer-block, .footer-clock, .footer-status, .footer-legal, .footer-mark'

/** How long the content keeps the light after the point leaves it. */
const LINGER_MS = 180

/**
 * ONE light for the whole slab, positioned from the cursor ring's TRAILED point via
 * the cursor bus — never from the raw pointer. Three layers ride with it: a soft volt
 * halo on the ground (`screen`), a transfer disc in full volt through `multiply` — so
 * anything lighter than the slab under it takes the colour and the ground barely
 * changes — and the blueprint grid drawn again in volt, masked to the point and to the
 * base grid's own bottom fade. The wordmark's spotlight is driven from here too.
 *
 * Over content the halo drops to a third and the content carries the light. Entering
 * content is immediate; LEAVING it waits LINGER_MS, so crossing the gap between two
 * rows of the 2×2 does not dim-and-relight the halo — measured 2026-09-05: four toggles
 * per crossing without it, one with it.
 *
 * Attaches to its PARENT (the slab) so the footer stays server-rendered. Runs only
 * while the cursor publishes, which is only on fine pointers with motion allowed and
 * outside automation — so the glow is exactly as present as the cursor it belongs to.
 * The CSS hides the layers in the same cases.
 */
export function FooterGlow() {
  const first = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const slab = first.current?.parentElement
    if (!slab) return
    const mark = slab.querySelector<HTMLElement>('.footer-mark')
    const lit = slab.querySelector<HTMLElement>('.footer-mark__layer--lit')
    const inside = (r: DOMRect, x: number, y: number) =>
      x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    let glowOn = false
    let lastOverAt = Number.NEGATIVE_INFINITY

    const light = (point: CursorPoint) => {
      const r = slab.getBoundingClientRect()
      const on = point.placed && inside(r, point.x, point.y)
      if (on !== glowOn) {
        glowOn = on
        slab.dataset.glow = String(on)
      }
      if (!on) {
        if (mark?.dataset.lit === 'true') mark.dataset.lit = 'false'
        return
      }
      slab.style.setProperty('--gx', `${point.x - r.left}px`)
      slab.style.setProperty('--gy', `${point.y - r.top}px`)

      // The cursor spans and the glow layers are pointer-events:none, so the element
      // under the point is real content or the slab itself.
      const under = document.elementFromPoint(point.x, point.y)
      const overNow = Boolean(under && slab.contains(under) && under.closest(CONTENT))
      if (overNow) lastOverAt = point.now
      slab.dataset.over = String(overNow || point.now - lastOverAt < LINGER_MS)

      if (mark && lit) {
        const m = mark.getBoundingClientRect()
        if (inside(m, point.x, point.y)) {
          lit.style.setProperty('--mx', `${point.x - m.left}px`)
          lit.style.setProperty('--my', `${point.y - m.top}px`)
          mark.dataset.lit = 'true'
        } else if (mark.dataset.lit === 'true') {
          mark.dataset.lit = 'false'
        }
      }
    }
    return subscribeToCursor(light)
  }, [])

  return (
    <>
      <div className="footer-glow footer-glow--grid" aria-hidden="true" ref={first} />
      <div className="footer-glow footer-glow--transfer" aria-hidden="true" />
      <div className="footer-glow footer-glow--halo" aria-hidden="true" />
    </>
  )
}
```

- [ ] **Step 2: Lint, typecheck, the JSX style gate**

Run: `npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 --filter @run-apparel/viewer exec vitest run src/styles/tokens.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/cms/src/components/site/FooterGlow.tsx
git commit -m "feat(cms): the footer glow — halo, multiply transfer and a lit grid riding with the pointer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The browser suite

**Files:**

```text
Create: apps/cms/e2e/footer.spec.ts
```

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test'

/**
 * The footer, measured. Every number here was wrong at least once on the design
 * artifact before it was measured: the tab sat inside the slab instead of on its edge,
 * the wordmark ran off the right edge twice, and the dimension line wrapped so its ticks
 * bracketed half of what they labelled.
 */

const SLAB = '.site-footer__slab'

test.describe('the footer geometry', () => {
  test('the tab is seated on the slab top edge, not inside it', async ({ page }) => {
    await page.goto('/contact')
    const tab = await page.locator('.site-footer__tab').boundingBox()
    const slab = await page.locator(SLAB).boundingBox()
    expect(tab && slab).toBeTruthy()
    // bottom of the tab == top of the slab, to the pixel
    expect(Math.abs((tab?.y ?? 0) + (tab?.height ?? 0) - (slab?.y ?? 0))).toBeLessThanOrEqual(1)
    // and the tab is entirely above it
    expect((tab?.y ?? 0) + (tab?.height ?? 0)).toBeLessThanOrEqual((slab?.y ?? 0) + 1)
  })

  test('the facts are a 2×2 at desktop width', async ({ page }) => {
    await page.goto('/contact')
    const tracks = await page.locator('.footer-facts').evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(tracks.trim().split(/\s+/)).toHaveLength(2)
  })

  test('the wordmark spans the slab exactly, cropped only at the bottom', async ({ page }) => {
    await page.goto('/contact')
    await page.locator('.footer-mark').scrollIntoViewIfNeeded()
    // the fit runs after fonts load — poll for the outcome rather than waiting a fixed time
    await expect
      .poll(async () =>
        page.locator('.footer-mark').evaluate((el) => {
          const base = el.querySelector('.footer-mark__layer') as HTMLElement
          return base.scrollWidth / el.clientWidth
        }),
      )
      .toBeGreaterThan(0.97)
    const ratio = await page.locator('.footer-mark').evaluate((el) => {
      const base = el.querySelector('.footer-mark__layer') as HTMLElement
      return base.scrollWidth / el.clientWidth
    })
    expect(ratio).toBeLessThanOrEqual(1)
  })

  test('the dimension line is one row, ticks on the ends of its own text', async ({ page }) => {
    await page.goto('/contact')
    const dim = page.locator('.footer-dim')
    const box = await dim.boundingBox()
    const line = await dim.evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight))
    expect(box?.height ?? 0).toBeLessThan(line * 2)
  })

  test('the slab is one full screen from tablet up and content-sized on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await page.goto('/contact')
    const tall = await page.locator(SLAB).boundingBox()
    expect(tall?.height ?? 0).toBeGreaterThanOrEqual(700)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/contact')
    const phone = await page.locator(SLAB).evaluate((el) => getComputedStyle(el).minHeight)
    expect(phone).toBe('0px')
  })
})

test.describe('claims render only from real values', () => {
  test('no block is ever empty, and no placeholder ever appears', async ({ page }) => {
    await page.goto('/contact')
    // Contact is always present; the other three depend on the CMS. Whatever is present
    // must carry real text — an empty block or an example value is the failure.
    const blocks = page.locator('.footer-block')
    expect(await blocks.count()).toBeGreaterThanOrEqual(1)
    for (let i = 0; i < (await blocks.count()); i++) {
      const items = blocks.nth(i).locator('li')
      expect(await items.count()).toBeGreaterThan(0)
      for (let j = 0; j < (await items.count()); j++) {
        expect((await items.nth(j).innerText()).trim().length).toBeGreaterThan(0)
      }
    }
    await expect(page.locator('.site-footer')).not.toContainText(/Oeko|GOTS|ISO 9001|MOQ 50/)
  })

  test('the clock ticks and the light appears only with hours', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('.footer-clock__time span').first()).not.toHaveText('--:--')
    const hasStatus = (await page.locator('.footer-status').count()) > 0
    const hasHours = (await page.locator('.footer-block--capacity li', { hasText: /PKT/ }).count()) > 0
    expect(hasStatus).toBe(hasHours)
  })
})

test.describe('the cursor and the glow', () => {
  test('present on a fine pointer once the mouse moves', async ({ page, context }) => {
    // Playwright sets navigator.webdriver, and the cursor honours it (as the viewer's
    // does) — so the automation gate has to be lifted to observe the fine-pointer path.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.goto('/contact')
    await expect(page.locator('html')).not.toHaveClass(/has-custom-cursor/)
    await page.mouse.move(300, 300)
    await page.mouse.move(320, 310)
    await expect(page.locator('html')).toHaveClass(/has-custom-cursor/)
    await expect(page.locator('.cursor-dot')).toHaveAttribute('data-hidden', 'false')
    // over a link the ring inflates and fills
    await page.locator('.notch__nav a').first().hover()
    await expect(page.locator('.cursor-ring')).toHaveAttribute('data-pointer', 'true')
    const t = await page.locator('.cursor-ring').evaluate((el) => (el as HTMLElement).style.transform)
    expect(t.indexOf('translate3d')).toBeLessThan(t.indexOf('scale('))

    // and the glow lights inside the slab
    const slab = page.locator(SLAB)
    await slab.scrollIntoViewIfNeeded()
    await page.locator('.footer-block--contact a').first().hover()
    await expect(slab).toHaveAttribute('data-glow', 'true')
    await expect(slab).toHaveAttribute('data-over', 'true')
    await page.locator('.footer-grow').hover()
    await expect(slab).toHaveAttribute('data-over', 'false')
  })

  test('absent under automation, the honest default', async ({ page }) => {
    await page.goto('/contact')
    await page.mouse.move(300, 300)
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
  })

  test('absent under reduced motion', async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/contact')
    await page.mouse.move(300, 300)
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
    await expect(page.locator('.footer-glow').first()).toBeHidden()
    await expect(page.locator('.footer-mark__layer--lit')).toBeHidden()
  })
})

test.describe('the numbers the design audit fixed', () => {
  test('the light rides with the ring, and the hand-off does not flicker across the 2×2', async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.goto('/contact')
    const slab = page.locator(SLAB)
    await slab.scrollIntoViewIfNeeded()
    const box = await slab.boundingBox()
    if (!box) throw new Error('no slab')
    // park, then one big jump; after the ring settles the light must sit ON the ring
    await page.mouse.move(box.x + 200, box.y + 300)
    await page.waitForTimeout(500)
    await page.mouse.move(box.x + 700, box.y + 320)
    await page.waitForTimeout(700)
    const settled = await page.evaluate(() => {
      const slabEl = document.querySelector('.site-footer__slab') as HTMLElement
      const ring = document.querySelector('.cursor-ring') as HTMLElement
      const r = slabEl.getBoundingClientRect()
      const m = /translate3d\(([\d.]+)px, ([\d.]+)px/.exec(ring.style.transform)
      return {
        ringX: m ? Number(m[1]) - r.left : Number.NaN,
        lightX: Number.parseFloat(slabEl.style.getPropertyValue('--gx')),
      }
    })
    expect(Math.abs(settled.ringX - settled.lightX)).toBeLessThanOrEqual(1)

    // sweep down through the facts at 3px per frame and count over/off toggles
    const facts = await page.locator('.footer-facts').boundingBox()
    if (!facts) throw new Error('no facts')
    let toggles = 0
    let last: string | null = null
    for (let y = facts.y - 20; y < facts.y + facts.height + 20; y += 3) {
      await page.mouse.move(facts.x + 60, y)
      await page.waitForTimeout(16)
      const over = await slab.getAttribute('data-over')
      if (last !== null && over !== last) toggles++
      last = over
    }
    expect(toggles).toBeLessThanOrEqual(2)
  })

  test('the facts run full width on a phone, and the legal links get the design focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/contact')
    const facts = await page.locator('.footer-facts').boundingBox()
    const slab = await page.locator(SLAB).boundingBox()
    const pad = await page.locator(SLAB).evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
    expect(Math.abs((facts?.x ?? 0) - ((slab?.x ?? 0) + pad))).toBeLessThanOrEqual(1)

    await page.locator('.footer-legal a[href="/products"]').focus()
    const outline = await page.locator('.footer-legal a[href="/products"]').evaluate((el) => getComputedStyle(el).outlineWidth)
    expect(outline).toBe('2px')
  })

  test('dark mode: muted text clears AA with headroom and the slab has an edge', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/contact')
    const numbers = await page.locator(SLAB).evaluate((slabEl) => {
      const lum = (r: number, g: number, b: number) => {
        const f = (c: number) => {
          const v = c / 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const parse = (s: string) => {
        const m = (s.match(/[\d.]+/g) ?? []).map(Number)
        return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }
      }
      const ratio = (fgS: string, bgS: string) => {
        const bg = parse(bgS)
        const f = parse(fgS)
        const fg = { r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a) }
        const l1 = lum(fg.r, fg.g, fg.b)
        const l2 = lum(bg.r, bg.g, bg.b)
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      }
      const bg = getComputedStyle(slabEl).backgroundColor
      const label = slabEl.querySelector('.footer-block h3') as HTMLElement
      return {
        muted: ratio(getComputedStyle(label).color, bg),
        borderTop: getComputedStyle(slabEl).borderTopWidth,
      }
    })
    expect(numbers.muted).toBeGreaterThanOrEqual(5)
    expect(numbers.borderTop).toBe('1px')
  })
})

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  test('no cursor, no glow, arrow always shown on the tab', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
    await expect(page.locator('.footer-glow').first()).toBeHidden()
    await expect(page.locator('.site-footer__tab-arrow')).toHaveCSS('opacity', '1')
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('every route out still renders, the clock is honest, no cursor', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.site-footer__tab')).toHaveAttribute('href', '/contact')
    // on Contact the tab points at the email — in the HTML, not added by a script
    await page.goto('/contact')
    await expect(page.locator('.site-footer__tab')).toHaveAttribute('href', /^mailto:/)
    await expect(page.locator('.footer-legal a[href="/products"]')).toBeVisible()
    await expect(page.locator('.footer-block--contact a[href^="mailto:"]')).toBeVisible()
    await expect(page.locator('.footer-clock__time span').first()).toHaveText('--:--')
    await expect(page.locator('.footer-status')).toHaveCount(0)
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run the suite with a forced rebuild**

```bash
pkill -f e2e/serve.mjs; env | grep -E 'NODE_ENV|PORT'; CI=1 npx --yes pnpm@10.33.0 --filter @run-apparel/cms test:e2e
```

Expected: all PASS on Chromium and Firefox. (Firefox: `mask-composite` and `-webkit-text-stroke` are supported; if the wordmark ratio test fails only there, read the failure before touching the CSS — it is the engine that renders alt text and scroll-driven animation differently, and the test exists to catch exactly an engine split.)

- [ ] **Step 3: Negative controls — each one, with `CI=1`**

For each, make the change, run only that test with `CI=1 … test:e2e -- -g "<title>"`, confirm FAIL, then `git checkout --` the file:

1. In `site.css`, change `.site-footer__tab { inset-block-start: 0 }` to `inset-block-start: 20px` → "seated on the slab top edge" FAILS.
2. In `site.css`, change `.footer-facts { grid-template-columns: repeat(2, …) }` to `repeat(3, …)` → "2×2" FAILS.
3. In `wordmarkFit.ts`, return `1` unconditionally → "spans the slab exactly" FAILS.
4. In `SiteFooter.tsx`, render `<li>GOTS</li>` inside the Certified block unconditionally → "no placeholder" FAILS.
5. In `Cursor.tsx`, remove the `navigator.webdriver` check → "absent under automation" FAILS.
6. In `cursorMath.ts`, swap the order to `scale(…) translate3d(…)` → "translate before scale" unit test FAILS **and** the e2e transform assertion FAILS.

- [ ] **Step 4: Commit**

```bash
git add apps/cms/e2e/footer.spec.ts
git commit -m "test(cms): the footer measured in a browser — tab seating, 2x2, fitted wordmark, claims, cursor, touch, no-JS

Six negative controls run before trusting any of it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Every gate, then the documents

**Files:**

```text
Modify: docs/OWNER-CHECKLIST.md
Modify: apps/cms/CLAUDE.md
```

- [ ] **Step 1: The gates, in CI's order**

```bash
env | grep -E 'NODE_ENV|PORT'
npx --yes pnpm@10.33.0 lint
npx --yes pnpm@10.33.0 typecheck
npx --yes pnpm@10.33.0 test:coverage
bash scripts/test-alert-shell.sh
npx --yes pnpm@10.33.0 seed:assets && npx --yes pnpm@10.33.0 build
node scripts/check-bundle-budget.mjs
npx --yes pnpm@10.33.0 eval:artwork
CI=1 npx --yes pnpm@10.33.0 --filter @run-apparel/cms test:e2e
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec opennextjs-cloudflare build
```

Expected: every one exits 0. If `test:coverage` reports the `apps/cms` floor short, the pure modules in `src/lib` need more branches covered — add cases; **never lower the floor**. The viewer's e2e is not run: no viewer file changed (`git diff --stat main -- apps/viewer packages/ui` must be empty — check it).

- [ ] **Step 2: The owner checklist**

In `docs/OWNER-CHECKLIST.md`, before "What I could not close", add:

```markdown
## 5 · Fill in the three footer blocks (about 10 minutes)

**Why me.** Each is a claim about the business. The footer shows nothing for a blank one —
it will never invent a certification — so until you type them, buyers see Contact only.

Open the CMS admin, go to **Settings**, and fill in:

1. **Capacity** — your minimum order (e.g. "50 pcs per style"), your usual lead time, and
   your working days and hours in Sialkot time. The hours also switch on the little
   "Open now" light beside the clock; leave them blank and there is no light.
2. **Certifications** — only standards you hold today. Add one row per certificate.
3. **Social links** — one row per live account, with the full `https://` address.

Optional: **Works coordinates** under the address, only if you know them to be right.

**You are done when** the bottom of any page shows the blocks you filled and nothing you did not.
```

- [ ] **Step 3: The CLAUDE.md section — a section, NOT a Traps bullet**

Append to `apps/cms/CLAUDE.md` (the root file's "Eight more traps" counter counts bullets under `## Traps`; a new `##` section leaves it honest):

```markdown
## The public site footer

Built 2026-09-05 from an approved design — `docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md`.
Three things that bit while building it:

- **The CTA tab sits ON the slab's top edge, OUTSIDE the clipped box.** `<footer>` is
  unclipped; the inner slab carries `overflow: hidden` for the cropped wordmark. Put the
  tab inside the clipped element and it is invisible — the first draft did, and the fillets
  curved into an edge that was already behind them.
- **The wordmark is fitted by measuring the rendered text**, after `document.fonts.ready`.
  Two fixed sizes both ran the name off the edge; the name is a CMS field, so its length is
  an input. `src/lib/wordmarkFit.ts`.
- **The cursor honours `navigator.webdriver`** (as the viewer's does), so Playwright never
  sees it unless the test lifts the flag with `addInitScript`. `apps/cms/e2e/footer.spec.ts`
  does, and also asserts the honest default — absent under automation.

The seven claim fields (`capacity.*`, `worksCoordinates`, `certifications`, `socialLinks`)
carry **no defaults on purpose**. `projectFooter()` renders nothing for a blank claim.
```

- [ ] **Step 4: The document gates**

```bash
node scripts/doc-citations.mjs
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
```

Expected: both PASS. If `claudeMd.test.ts` complains the cms file exceeds its size gate, trim prose in the new section — never the traps above it.

- [ ] **Step 5: Commit**

```bash
git add docs/OWNER-CHECKLIST.md apps/cms/CLAUDE.md
git commit -m "docs: the footer's owner tasks and its three build-time traps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Report**

State the final branch position (`git log --oneline main..HEAD`), that nothing was pushed, and the three values still owed by the owner. Do not push.

---

## Self-review

- **Spec coverage:** height rule (T5), question + accent + de-risk + dimension line (T4/T5), flipped tab + hover + touch arrow (T5), clock + light (T3/T6), 2×2 facts hidden when empty (T1/T4/T5), legal (T4), fitted spotlit wordmark (T5/T6), blueprint grid (T5), cursor port with transform order (T7), glow with three layers and the jump (T5/T8), behaviour matrix rows (T9), migration (T2), no shared-type change (T1), owner docs (T10). ✔
- **Placeholders:** none — every step carries its code and command.
- **Type consistency:** `FooterHours`/`FooterSettings`/`EMPTY_FOOTER`/`projectFooter` (T1) are the names used by T3, T4, T6; `fitScale` (T6) by T6 and T9; `ringTransform`/`trail`/`isInteractive`/`INTERACTIVE` (T7) by T7 and T9; class names (T4) by T5, T8, T9. ✔
