import { describe, expect, it } from 'vitest'
import { DOCUMENT_ISOLATION, withDocumentIsolation } from './documentHeaders'

const html = (init: ResponseInit = {}) =>
  new Response('<!doctype html><p>hi', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'",
    },
    ...init,
  })

describe('withDocumentIsolation (SE-05)', () => {
  it('is same-origin for both headers', () => {
    expect(DOCUMENT_ISOLATION).toEqual({
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
    })
  })

  it('adds both to a garment page', () => {
    const out = withDocumentIsolation(html())
    expect(out.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(out.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('adds both to the branded 404, which is the same page', () => {
    const out = withDocumentIsolation(html({ status: 404 }))
    expect(out.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('keeps every header _headers set, the CSP included', () => {
    expect(withDocumentIsolation(html()).headers.get('content-security-policy')).toBe(
      "default-src 'self'",
    )
  })

  it('leaves anything that is not HTML alone', () => {
    const image = new Response('x', { status: 200, headers: { 'content-type': 'image/jpeg' } })
    expect(withDocumentIsolation(image)).toBe(image)
  })

  it('leaves a 304 alone, which has no body to rebuild', () => {
    const notModified = new Response(null, {
      status: 304,
      headers: { 'content-type': 'text/html' },
    })
    expect(withDocumentIsolation(notModified)).toBe(notModified)
  })

  it('keeps the body readable', async () => {
    expect(await withDocumentIsolation(html()).text()).toBe('<!doctype html><p>hi')
  })
})
