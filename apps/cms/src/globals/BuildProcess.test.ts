import { describe, expect, it } from 'vitest'
import { BuildProcess } from './BuildProcess'
import { CatalogueDefaults } from './CatalogueDefaults'

/**
 * The universal "How we build your product" copy.
 *
 * This is a config object, so most of what could be asserted here would only
 * restate the file. What is tested is the small set of properties that are
 * load-bearing somewhere ELSE — where a silent change would be felt in
 * production rather than in this directory.
 */
describe('BuildProcess global', () => {
  it('uses the slug the public viewer endpoint asks for', () => {
    // endpoints/publicViewer.ts calls findGlobal({ slug: 'build-process' }) and
    // deliberately swallows a read failure — an unknown slug would degrade to the
    // per-product fallback silently, on every product page, forever.
    expect(BuildProcess.slug).toBe('build-process')
  })

  it('carries exactly the two fields the projection reads', () => {
    const names = (BuildProcess.fields as { name?: string }[]).map((f) => f.name)
    // projectViewer.ts reads these two by name off the global document. A rename
    // here is not a compile error there — the document is typed as a bag of
    // unknowns — so it would show up as every page losing its build steps.
    expect(names).toEqual(['customisationIntro', 'customisationSteps'])
  })

  it('shapes its steps identically to the products it replaces', () => {
    const steps = (BuildProcess.fields as { name?: string; fields?: { name?: string }[] }[]).find(
      (f) => f.name === 'customisationSteps',
    )
    // The viewer renders `{ number, title, body }` and the projection maps them
    // straight through. The old per-product array had this shape; the deploy-
    // window fallback means BOTH shapes are live at once, so they must agree.
    expect(steps?.fields?.map((f) => f.name)).toEqual(['number', 'title', 'body'])
  })

  it('declares versions: false, like every other global here', () => {
    // Not ceremony: `false` is the Payload 3.x default but v4 flips it ON, which
    // would silently add a `_versions` table to D1 and double the row-writes per
    // save. Stating it pins today's behaviour through that upgrade — the same
    // reasoning Products.ts, SiteSettings.ts and CatalogueDefaults.ts all record.
    expect(BuildProcess.versions).toBe(false)
  })

  it('is not readable or writable by an anonymous visitor', () => {
    // It reaches the public only through the viewer endpoint's projection. A
    // permissive `read` here would expose the CMS document itself.
    expect(BuildProcess.access?.read).toBeTypeOf('function')
    expect(BuildProcess.access?.update).toBeTypeOf('function')
    // `{ req: {} }`, not `{}` — the access signature destructures `req`, so an
    // empty object throws rather than returning false and the test would pass
    // for the wrong reason. An absent `req.user` is the anonymous case.
    const anonymous = { req: {} } as never
    expect(BuildProcess.access?.read?.(anonymous)).toBe(false)
    expect(BuildProcess.access?.update?.(anonymous)).toBe(false)
  })
})

/**
 * ⚠️ THE TWO GLOBALS MUST NOT BOTH OWN THIS COPY.
 *
 * `CatalogueDefaults` SEEDED `customisationIntro`/`customisationSteps` onto each
 * new product until 2026-08-17. If those fields ever come back there while
 * `BuildProcess` also has them, a new product silently gets a frozen snapshot of
 * the shared copy — which is exactly the drift this change removed, restored
 * without anyone noticing, because both screens would look correct.
 */
describe('CatalogueDefaults no longer owns the build-process copy', () => {
  it('seeds only the genuinely per-product settings', () => {
    const names = (CatalogueDefaults.fields as { name?: string }[]).map((f) => f.name)
    expect(names).not.toContain('customisationIntro')
    expect(names).not.toContain('customisationSteps')
    // A garment CAN have its own catalogue link and its own retired-colour
    // wording, so those two stay seeds and this global keeps its purpose.
    expect(names).toEqual(['catalogueUrl', 'retiredMessage'])
  })

  /**
   * The catalogue link is the only navigation the viewer has — it is behind the
   * wordmark AND the header button — and every new product inherits this value.
   * A bad one here propagates silently to every garment created afterwards, so
   * the validator is worth exercising rather than trusting.
   *
   * It had NO test at all until 2026-08-17 (measured: 0 of 1 functions covered
   * in this file), which is how a gap like this stays invisible — the global is
   * a config object, so nothing about the file looks untested.
   */
  it('refuses a catalogue link that is not a complete web address', () => {
    const field = (
      CatalogueDefaults.fields as { name?: string; validate?: (v: unknown) => unknown }[]
    ).find((f) => f.name === 'catalogueUrl')
    const validate = field?.validate as (value: unknown) => true | string

    expect(validate('https://wear-run.help/catalogue')).toBe(true)

    // `new URL()` accepts any scheme, so a relative path is what actually has to
    // be caught here — it is the shape a human types.
    expect(validate('/catalogue')).toContain('https://')
    expect(validate('wear-run.help/catalogue')).toContain('https://')
    expect(validate('')).toBe('A catalogue link is required.')
    expect(validate(undefined)).toBe('A catalogue link is required.')
  })
})
