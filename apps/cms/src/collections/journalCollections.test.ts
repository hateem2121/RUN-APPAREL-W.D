import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Access, Field, PayloadRequest, Where } from 'payload'
import { describe, expect, it } from 'vitest'
import { JOURNAL_CLUSTERS, JOURNAL_RELATED_PAGES } from '../lib/journal'
import {
  lockPublishedSlug,
  markFirstPublished,
  pingIndexNowWhenPublished,
  requireShareImageSize,
} from '../lib/journalHooks'
import { keptPagesAfterChange, keptPagesAfterDelete } from '../lib/contentVersion'
import { Authors } from './Authors'
import { CaseStudies } from './CaseStudies'
import { JournalPosts } from './JournalPosts'

/**
 * The Journal's and the case studies' collections (PLAN.md E7, review focus 4: "a draft Journal
 * post or a draft case study is readable by the public"). What would have to break in production
 * for these to fail: an access rule that lets an anonymous REST read see a draft, a collection
 * that lost its drafts, or a save that no longer runs the slug lock or the share-picture check.
 */

type Principal = { role?: string; _strategy?: string } | null
const ask = (rule: unknown, user: Principal) =>
  (rule as Access)({ req: { user } as unknown as PayloadRequest })

const admin = { role: 'admin' }
const editor = { role: 'editor' }

/**
 * Applies the one shape an access rule here returns (`{ field: { equals } }`, or `true`) to a
 * list of rows, the way the database would. A rule of any other shape fails loudly rather than
 * being guessed at.
 */
function visible(rule: boolean | Where, rows: ReadonlyArray<Record<string, unknown>>) {
  if (rule === true) return rows
  if (rule === false) return []
  return rows.filter((row) =>
    Object.entries(rule).every(([field, condition]) => {
      const equals = (condition as { equals?: unknown }).equals
      if (equals === undefined) throw new Error(`unexpected rule shape on ${field}`)
      return row[field] === equals
    }),
  )
}

const ROWS = [
  { id: 1, slug: 'made-properly', _status: 'published' },
  { id: 2, slug: 'planted-draft', _status: 'draft' },
]

describe.each([
  ['journal-posts', JournalPosts],
  ['case-studies', CaseStudies],
])('%s: who reads what', (_slug, collection) => {
  it('an anonymous reader sees published rows only — the planted draft never appears', () => {
    const rule = ask(collection.access?.read, null) as boolean | Where
    expect(visible(rule, ROWS).map((row) => row.slug)).toEqual(['made-properly'])
  })

  it('a signed-in person sees drafts too (that is the admin)', () => {
    expect(visible(ask(collection.access?.read, admin) as boolean | Where, ROWS)).toHaveLength(2)
  })

  /*
   * ⚠️ THE ROBOT'S API KEY IS NOT A PERSON (2026-10-07, the security review of this work). It
   * is signed in, so `req.user ? true` showed it every draft — a case study's client name or
   * quote before the client agreed. The site keeps private records from it with
   * `isSignedInPerson` (applications, inquiries); drafts are held the same way.
   */
  it('the robot’s API key reads published rows only, as a stranger does', () => {
    const robot = { role: 'admin', _strategy: 'api-key' }
    const rule = ask(collection.access?.read, robot) as boolean | Where
    expect(visible(rule, ROWS).map((row) => row.slug)).toEqual(['made-properly'])
  })

  it('only a signed-in person reads the version history, where every draft lives', () => {
    // Payload sets no default for readVersions: left out, anyone signed in (the robot too) reads it.
    expect(collection.access?.readVersions, 'readVersions is not set').toBeDefined()
    expect(ask(collection.access?.readVersions, admin)).toBe(true)
    expect(ask(collection.access?.readVersions, { role: 'admin', _strategy: 'api-key' })).toBe(
      false,
    )
    expect(ask(collection.access?.readVersions, null)).toBe(false)
  })

  it('keeps drafts: without them every save would publish', () => {
    expect(collection.versions).toMatchObject({ drafts: true })
  })

  it('editors write, only an admin deletes, nobody anonymous does either', () => {
    expect(ask(collection.access?.create, editor)).toBe(true)
    expect(ask(collection.access?.update, editor)).toBe(true)
    expect(ask(collection.access?.create, null)).toBe(false)
    expect(ask(collection.access?.update, null)).toBe(false)
    expect(ask(collection.access?.delete, admin)).toBe(true)
    expect(ask(collection.access?.delete, editor)).toBe(false)
    expect(ask(collection.access?.delete, null)).toBe(false)
  })

  it('runs the slug lock, the first-publish mark and the share-picture check on every save', () => {
    expect(collection.hooks?.beforeChange).toEqual([
      lockPublishedSlug,
      markFirstPublished,
      requireShareImageSize,
    ])
    expect(collection.hooks?.afterChange?.[0]).toBe(keptPagesAfterChange)
    expect(collection.hooks?.afterChange).toHaveLength(2)
    expect(collection.hooks?.afterDelete).toEqual([keptPagesAfterDelete])
  })

  it('holds a unique, indexed slug and a required share picture', () => {
    const field = (name: string) =>
      collection.fields.find((entry) => 'name' in entry && entry.name === name) as
        | (Field & Record<string, unknown>)
        | undefined
    expect(field('slug')).toMatchObject({ required: true, unique: true, index: true })
    expect(field('shareImage')).toMatchObject({ relationTo: 'media', required: true })
    expect(field('firstPublishedAt')).toMatchObject({ admin: { readOnly: true } })
  })
})

describe('a Journal post’s choices come from the lists the pages read', () => {
  const field = (name: string) =>
    JournalPosts.fields.find((entry) => 'name' in entry && entry.name === name) as Record<
      string,
      unknown
    >

  it('the clusters and the Read more pages', () => {
    expect(field('cluster').options).toEqual(
      JOURNAL_CLUSTERS.map((cluster) => ({ label: cluster.label, value: cluster.value })),
    )
    expect(field('relatedPages').options).toEqual(
      JOURNAL_RELATED_PAGES.map((page) => ({ label: page.label, value: page.path })),
    )
  })

  it('the body offers h2 and h3 only: the page’s one h1 is the title', () => {
    const source = readFileSync(join(import.meta.dirname, 'JournalPosts.ts'), 'utf8')
    expect(source).toMatch(/HeadingFeature\(\{ enabledHeadingSizes: \['h2', 'h3'\] \}\)/)
  })

  it('pings IndexNow for the post’s own folder', () => {
    // A factory, so the instance differs; its address is what matters, held by journalHooks.test.
    expect(typeof pingIndexNowWhenPublished('/journal')).toBe('function')
    expect(JournalPosts.hooks?.afterChange?.[1]).toEqual(expect.any(Function))
  })
})

describe('authors', () => {
  it('are public to read (a post shows them), written by editors, deleted by an admin', () => {
    expect(ask(Authors.access?.read, null)).toBe(true)
    expect(ask(Authors.access?.create, editor)).toBe(true)
    expect(ask(Authors.access?.create, null)).toBe(false)
    expect(ask(Authors.access?.delete, editor)).toBe(false)
    expect(ask(Authors.access?.delete, admin)).toBe(true)
  })

  it('cannot be saved without consent recorded', () => {
    const consent = Authors.fields.find(
      (entry) => 'name' in entry && entry.name === 'consentRecorded',
    ) as { validate: (value: unknown) => unknown }
    expect(consent.validate(false)).toEqual(expect.any(String))
    expect(consent.validate(true)).toBe(true)
  })
})

describe('registration', () => {
  it('all three collections are in the Payload config', () => {
    // Read as text: the config needs Cloudflare bindings to import (as applicationFiles.test.ts).
    const config = readFileSync(join(import.meta.dirname, '..', 'payload.config.ts'), 'utf8')
    for (const name of ['Authors', 'JournalPosts', 'CaseStudies']) {
      expect(config).toMatch(new RegExp(`\\n    ${name},\\n`))
    }
  })
})
