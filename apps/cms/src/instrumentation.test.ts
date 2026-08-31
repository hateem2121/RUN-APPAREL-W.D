/**
 * Pin WHERE the instrumentation hook lives, not just that it works.
 *
 * `lib/sentry.test.ts` proves the reporting logic is correct. It would go on
 * proving that after somebody moved this file into `src/lib/` for tidiness, at
 * which point Next stops looking for it and the CMS is silently blind again —
 * the exact state L6-03 recorded. Next resolves `instrumentation.ts` from the
 * project root or from `src/` when a `src/` directory is used, and NOWHERE else.
 * There is no warning for a misplaced one.
 *
 * So this asserts the path, and asserts the export Next actually calls.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { onRequestError } from './instrumentation'

const here = dirname(fileURLToPath(import.meta.url))

describe('instrumentation.ts placement', () => {
  it('sits at src/instrumentation.ts, where Next looks for it', () => {
    expect(existsSync(join(here, 'instrumentation.ts'))).toBe(true)
  })

  /**
   * The control. Without it, `existsSync` returning true proves only that
   * `existsSync` returns true — the assertion above would pass against a path
   * that happened to exist for some other reason.
   */
  it('the same check reports false for a path that is not there', () => {
    expect(existsSync(join(here, 'instrumentation-not-a-real-file.ts'))).toBe(false)
  })

  it('exports onRequestError, which is the name Next calls', () => {
    expect(typeof onRequestError).toBe('function')
  })
})

describe('onRequestError', () => {
  /**
   * With no DSN anywhere — which is the state of every test run, every build and
   * every Payload CLI invocation — the hook must complete quietly. If it throws,
   * it throws while Next is already handling an application error.
   */
  it('resolves quietly when no DSN is configured', async () => {
    const previous = process.env.SENTRY_DSN
    process.env.SENTRY_DSN = ''
    try {
      await expect(
        onRequestError(
          new Error('a server error'),
          { path: '/api/public/viewer/rxps/wine', method: 'GET', headers: {} },
          {
            routerKind: 'App Router',
            routePath: '/api/public/viewer/[...slug]',
            routeType: 'route',
            // Required by Next's own type. `undefined` is what a normal request
            // carries — a value only appears on a revalidation.
            revalidateReason: undefined,
          },
        ),
      ).resolves.toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.SENTRY_DSN
      else process.env.SENTRY_DSN = previous
    }
  })
})
