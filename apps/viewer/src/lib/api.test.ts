import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchViewerData } from './api'

afterEach(() => vi.restoreAllMocks())

describe('fetchViewerData', () => {
  it('returns the JSON payload on success', async () => {
    const payload = { product: { productCode: 'N001' } }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
    )
    await expect(fetchViewerData('n001', 'navy')).resolves.toEqual(payload)
  })

  it('returns the error body on 404 without throwing', async () => {
    const err = { error: 'not_found', message: 'nope' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => err }),
    )
    await expect(fetchViewerData('x', 'y')).resolves.toEqual(err)
  })

  it('throws on other non-ok statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    await expect(fetchViewerData('x', 'y')).rejects.toThrow(/500/)
  })

  it('URL-encodes the slugs into the request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchViewerData('n 001', 'na/vy')
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain(encodeURIComponent('n 001'))
    expect(url).toContain(encodeURIComponent('na/vy'))
  })
})
