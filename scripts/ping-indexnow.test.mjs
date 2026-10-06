import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildIndexNowPayload, submitIndexNow } from './ping-indexnow.mjs'

describe('IndexNow payload builder', () => {
  it('constructs standard IndexNow format with host, key and keyLocation', () => {
    const payload = buildIndexNowPayload('wear-run.com', 'test-key-123', [
      'https://wear-run.com/',
      'https://wear-run.com/products',
    ])

    assert.equal(payload.host, 'wear-run.com')
    assert.equal(payload.key, 'test-key-123')
    assert.equal(payload.keyLocation, 'https://wear-run.com/test-key-123.txt')
    assert.equal(payload.urlList.length, 2)
    assert.equal(payload.urlList[0], 'https://wear-run.com/')
  })

  it('handles dry-run submission safely without making network calls', async () => {
    const payload = buildIndexNowPayload('wear-run.com', 'test-key-123', ['https://wear-run.com/'])
    const result = await submitIndexNow(payload, { dryRun: true })

    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.equal(result.message, 'dry-run-ok')
  })
})
