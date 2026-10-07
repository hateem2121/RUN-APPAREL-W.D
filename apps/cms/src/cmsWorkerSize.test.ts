import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLOUDFLARE_LIMIT_KIB,
  CMS_WORKER_BUDGET_KIB,
  judgeWorkerSize,
  uploadedBytes,
} from '../../../scripts/check-cms-worker-size.mjs'

/**
 * The CMS Worker's size gate (2026-10-07). On that day the Worker reached 64,905 KiB of
 * Cloudflare's 64 MiB, fresh copies of it failed to load, and bursts of requests got
 * Error 1101 on the live site. Nothing had measured the Worker before a deploy: CI built
 * Next but never the Worker. What would have to go wrong for this gate to miss it?
 */
describe('the CMS Worker size gate', () => {
  it('leaves real room under Cloudflare’s limit: the budget is at most 80% of 64 MiB', () => {
    expect(CLOUDFLARE_LIMIT_KIB).toBe(64 * 1024)
    expect(CMS_WORKER_BUDGET_KIB).toBeLessThanOrEqual(CLOUDFLARE_LIMIT_KIB * 0.8)
  })

  it('passes the measured fixed Worker (42,994 KiB, inline CSS off)', () => {
    expect(judgeWorkerSize(42_994 * 1024).ok).toBe(true)
  })

  it('NEGATIVE CONTROL: fails the Worker that broke the live site (64,905 KiB)', () => {
    const verdict = judgeWorkerSize(64_905 * 1024)
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toMatch(/64,905 KiB/)
    expect(verdict.message).toMatch(/inlineCss|client-reference-manifest/)
  })

  it('counts what wrangler uploads: every module, never the source map or the README', () => {
    const dir = mkdtempSync(join(tmpdir(), 'worker-size-'))
    mkdirSync(join(dir, 'nested'))
    writeFileSync(join(dir, 'worker.js'), Buffer.alloc(3000))
    writeFileSync(join(dir, 'a-resvg.wasm'), Buffer.alloc(500))
    writeFileSync(join(dir, 'nested', 'chunk.js'), Buffer.alloc(200))
    writeFileSync(join(dir, 'worker.js.map'), Buffer.alloc(9_000_000))
    writeFileSync(join(dir, 'README.md'), 'not uploaded')
    expect(uploadedBytes(dir)).toBe(3700)
  })
})
