import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_FILES, parseSources } from '../../../scripts/guide-source-links.mjs'
import { GUIDES } from './lib/guides'

/**
 * The weekly source-link check (.github/workflows/guide-sources.yml) reads the guides' source files
 * as TEXT, because Node cannot load them as code. This proves the text reader finds exactly what the
 * site renders: every source of every guide in `GUIDES`, tied to the guide that cites it, and nothing
 * else. A guide layout the reader cannot follow would otherwise check fewer links in silence.
 */
const REPO = join(import.meta.dirname, '..', '..', '..')

describe('the weekly source-link check reads every guide source (2026-11-15)', () => {
  const read = GUIDE_FILES.flatMap((file) => parseSources(readFileSync(join(REPO, file), 'utf8')))
  const real = GUIDES.flatMap((guide) =>
    (guide.sources ?? []).map((source) => ({ url: source.url, guide: guide.path })),
  )
  const key = (s: { url: string; guide: string }) => `${s.guide} ${s.url}`

  it('finds the same citations as GUIDES, guide by guide', () => {
    expect(read.map(key).sort()).toEqual(real.map(key).sort())
    expect(real.length).toBeGreaterThan(400)
  })

  it('NEGATIVE CONTROL: a source the reader misses would be seen', () => {
    const missed = read.slice(1)
    expect(missed.map(key).sort()).not.toEqual(real.map(key).sort())
  })
})
