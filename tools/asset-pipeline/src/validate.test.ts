import { SIZE_WARNING_BYTES as SHARED_SIZE_WARNING_BYTES } from '../../../packages/shared/src/media'
import { describe, expect, it } from 'vitest'
import { SIZE_WARNING_BYTES } from './validate'

describe('SIZE_WARNING_BYTES does not drift from the shared copy', () => {
  /**
   * This package cannot depend on @run-apparel/shared: it is installed with
   * plain `npm install` inside the shrink container's Docker image
   * (apps/shrink/Dockerfile:20), where a `workspace:*` dependency does not
   * resolve. So the constant is written twice and pinned here instead — the
   * same arrangement GLB_HARD_MAX_BYTES has at
   * apps/cms/src/collections/mediaRules.test.ts:94.
   *
   * The import below is a RELATIVE path into the shared package's source, not a
   * package import, so it works in the monorepo (where tests run) and is never
   * reached inside the container image (where tests do not).
   *
   * What drift would cost: `validate` would call a file publish-ready that the
   * CMS then rejects on upload, or stay silent about one that is over the
   * mobile guideline the owner is being held to.
   */
  it('matches packages/shared/src/media.ts', () => {
    expect(SIZE_WARNING_BYTES).toBe(SHARED_SIZE_WARNING_BYTES)
  })

  it('is the 8 MB mobile guideline both sides document', () => {
    expect(SIZE_WARNING_BYTES).toBe(8 * 1024 * 1024)
  })
})
