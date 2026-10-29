import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectModelResponse, responseCategory } from './model-response.mjs'

test('separates security evidence, unverified access denial, missing media and service failure', () => {
  assert.equal(
    responseCategory(new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } })),
    'security-challenge',
  )
  assert.equal(responseCategory(new Response('', { status: 403 })), 'access-denied-unverified')
  assert.equal(responseCategory(new Response('', { status: 503 })), 'service-error')
  assert.equal(responseCategory(new Response('', { status: 429 })), 'rate-limited')
  assert.equal(responseCategory(new Response('', { status: 404 })), 'missing-media')
})
test('a successful shell, truncated body and incomplete transfer cannot pass as a model', async () => {
  await assert.rejects(
    inspectModelResponse(new Response('<html>', { headers: { 'content-type': 'text/html' } })),
    /wrong-content/,
  )
  await assert.rejects(
    inspectModelResponse(new Response(new Uint8Array(64)), 100),
    /incomplete-media/,
  )
  await assert.rejects(
    inspectModelResponse(new Response(new Uint8Array(64)), 64),
    /model-image-check/,
  )
  await assert.rejects(
    inspectModelResponse(new Response(new Uint8Array(65)), 65, 64),
    /model-size-limit/,
  )
})
test('a complete GLB passes; a transport failure remains a failure even after headers', async () => {
  const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}'.padEnd(28))
  const bytes = new Uint8Array(20 + json.length)
  const v = new DataView(bytes.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, bytes.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  bytes.set(json, 20)
  assert.equal((await inspectModelResponse(new Response(bytes), bytes.length)).bytes, bytes.length)
  const broken = new ReadableStream({
    start(controller) {
      controller.error(new TypeError('network disconnected'))
    },
  })
  await assert.rejects(inspectModelResponse(new Response(broken)), /network disconnected/)
})
