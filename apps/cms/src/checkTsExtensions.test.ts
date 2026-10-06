import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  sharedImportProblems,
  unextendedSpecifiers,
} from '../../../scripts/check-ts-extensions.mjs'

/**
 * The plain-Node import rule for packages/shared/src (the link-crawl guard).
 *
 * Root scripts import shared .ts modules under plain Node, where an
 * extensionless relative specifier is ERR_MODULE_NOT_FOUND even though vitest
 * and every bundler resolve it happily. 2026-10-05's link-crawl red was exactly
 * that gap: defaults.ts imported './siteFooter', vitest resolved it, the crawl
 * did not, and nothing between them could see the difference. The rule: every
 * relative import in packages/shared/src carries the .ts extension; this test
 * is what makes the convention binding.
 *
 * Lives in apps/cms (not packages/shared) on purpose: shared sources are
 * worker code, and the lint rule that keeps node builtins out of them is the
 * same reason this test needs node:fs. The real-tree assertion is the point —
 * a fixture-only test would pass while the actual folder drifted, which is the
 * failure shape a gate nothing reaches always ends up in.
 */

const SHARED_SRC = fileURLToPath(new URL('../../../packages/shared/src', import.meta.url))

describe('unextendedSpecifiers', () => {
  it('catches the exact import shape that broke link-crawl', () => {
    expect(unextendedSpecifiers("import { EMPTY_FOOTER } from './siteFooter'")).toEqual([
      './siteFooter',
    ])
  })

  it('passes every shape the convention allows', () => {
    const source = [
      "import { EMPTY_FOOTER } from './siteFooter.ts'",
      "import type { ViewerSiteSettings } from './types.ts'",
      "export * from './slugs.ts'",
      "await import('./heavy.ts')",
      "import { readFileSync } from 'node:fs'",
      "import nothing from 'some-package'",
    ].join('\n')
    expect(unextendedSpecifiers(source)).toEqual([])
  })

  it('reads double quotes and dynamic imports too, so no style dodges it', () => {
    expect(unextendedSpecifiers('import x from "./side.ts"; import("./lazy")')).toEqual(['./lazy'])
  })
})

describe('sharedImportProblems — the real packages/shared/src tree', () => {
  const names = readdirSync(SHARED_SRC).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
  const files: { name: string; source: string }[] = names.map((name) => ({
    name,
    source: readFileSync(join(SHARED_SRC, name), 'utf8'),
  }))

  it('has shared modules to check (a rule over an empty folder guards nothing)', () => {
    expect(names.length).toBeGreaterThanOrEqual(20)
  })

  it('finds ZERO extensionless relative imports in the real sources', () => {
    const problems = sharedImportProblems(files)
    expect(problems, problems.join('\n')).toEqual([])
  })
})
