import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTelemetry } from './telemetry'

// telemetry reads VITE_API_BASE_URL at import time. This used to say the endpoint
// was deterministic "with none set in tests", which was FALSE on any machine
// carrying apps/viewer/.env.local — a gitignored file Vite loads automatically. CI
// never has one and passed forever; a machine that had run the CMS locally failed
// forever. vitest.config.ts now PINS the value, the same way playwright.config.ts
// pins PORT, so the environment cannot move it. Found 2026-08-26.
const ENDPOINT = 'https://cms.wear-run.help/api/public/events'

let stop: () => void = () => {}
let beacon: ReturnType<typeof vi.fn>

function setNav(prop: string, value: unknown) {
  Object.defineProperty(navigator, prop, { value, configurable: true, writable: true })
}

beforeEach(() => {
  beacon = vi.fn().mockReturnValue(true)
  setNav('sendBeacon', beacon)
  setNav('webdriver', false)
  setNav('doNotTrack', null)
})

afterEach(() => {
  stop()
  stop = () => {}
  vi.restoreAllMocks()
})

const analytics = (detail: Record<string, string>) =>
  document.dispatchEvent(new CustomEvent('run:analytics', { detail }))

// jsdom's Blob has no .text(); read it via FileReader, which jsdom implements.
const readText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
const batchOf = async (call: unknown[]) => JSON.parse(await readText(call[1] as Blob))

describe('initTelemetry', () => {
  it('no-ops under automation (webdriver)', () => {
    setNav('webdriver', true)
    stop = initTelemetry()
    for (let i = 0; i < 12; i += 1) analytics({ event: 'model_loaded' })
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).not.toHaveBeenCalled()
  })

  it('batches analytics and flushes on the threshold via sendBeacon', async () => {
    stop = initTelemetry()
    for (let i = 0; i < 10; i += 1) analytics({ event: 'colourway_selected', product: 'N001' })
    expect(beacon).toHaveBeenCalledTimes(1)
    const [url] = beacon.mock.calls[0]!
    expect(url).toBe(ENDPOINT)
    const arr = await batchOf(beacon.mock.calls[0]!)
    expect(arr).toHaveLength(10)
    expect(arr[0]).toMatchObject({
      type: 'analytics',
      event: 'colourway_selected',
      product: 'N001',
    })
  })

  it('drops analytics under Do-Not-Track but still sends errors', async () => {
    setNav('doNotTrack', '1')
    stop = initTelemetry()
    analytics({ event: 'model_loaded' })
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).toHaveBeenCalledTimes(1)
    const arr = await batchOf(beacon.mock.calls[0]!)
    expect(arr).toEqual([
      expect.objectContaining({ type: 'error', event: 'client_error', message: 'boom' }),
    ])
  })

  it('caps and de-duplicates client errors', async () => {
    stop = initTelemetry()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })) // duplicate
    for (const m of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      window.dispatchEvent(new ErrorEvent('error', { message: m }))
    }
    window.dispatchEvent(new Event('pagehide'))
    const arr = await batchOf(beacon.mock.calls[0]!)
    const errors = arr.filter((e: { type: string }) => e.type === 'error')
    expect(errors).toHaveLength(5) // MAX_ERRORS, deduped
    expect(errors.map((e: { message: string }) => e.message)).toEqual([
      'boom',
      'e1',
      'e2',
      'e3',
      'e4',
    ])
  })
})
