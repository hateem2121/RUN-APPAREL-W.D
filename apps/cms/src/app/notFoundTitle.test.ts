import { readFileSync } from 'node:fs'
import { resolveTitle } from 'next/dist/lib/metadata/resolvers/resolve-title'
import { describe, expect, it } from 'vitest'
import { metadata } from './not-found'

/**
 * Found 2026-10-22 (site check-up): /journal/<missing> and /case-studies/<missing> were titled
 * "Page not found | RUN APPAREL | RUN APPAREL" while every other 404 said it once. Those two
 * call `notFound()` from inside `generateMetadata`, so the 404 is drawn under the (frontend)
 * layout, whose `%s | RUN APPAREL` template is then applied to the 404's own title, which
 * already ends in the name. An `absolute` title is the one form Next never runs through a template.
 */
describe('the 404 page title', () => {
  const layout = readFileSync(new URL('./(frontend)/layout.tsx', import.meta.url), 'utf8')
  const template = /template:\s*'([^']+)'/.exec(layout)?.[1]

  it('reads the layout template from the real layout (so this test cannot drift)', () => {
    expect(template).toBe('%s | RUN APPAREL')
  })

  it('says the name once under the layout template, as Next resolves it', () => {
    const resolved = resolveTitle(metadata.title, template ?? null)
    expect(resolved.absolute).toBe('Page not found | RUN APPAREL')
  })

  it('says the name once with no template above it too (an unknown path)', () => {
    expect(resolveTitle(metadata.title, null).absolute).toBe('Page not found | RUN APPAREL')
  })
})
