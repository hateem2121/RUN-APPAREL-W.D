import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import * as android from '../../../scripts/android-chrome.mjs'
import * as ios from '../../../scripts/ios-safari.mjs'
import { startDriverProcess } from '../../../scripts/webdriver-client.mjs'

/**
 * The two phone harnesses (`ios-safari.mjs`, `android-chrome.mjs`) speak the same W3C WebDriver
 * calls. They carried two copies of the client until 2026-10-25, and nothing exercised either
 * copy against a driver: the pure helpers were tested, the HTTP half never ran in a test.
 *
 * This runs BOTH public surfaces against a fake driver on a local port and records what was
 * sent, so moving the shared half into `scripts/webdriver-client.mjs` is held to the exact
 * request shapes the real drivers were always sent, and a future edit to one phone's file
 * cannot change the other's without a test noticing.
 */

type Seen = { method: string; path: string; body: unknown }

let server: Server | undefined
afterEach(() => {
  server?.close()
  server = undefined
})

/** A driver that answers like safaridriver/chromedriver and records every request. */
async function fakeDriver(sessionReply: unknown): Promise<{ port: number; seen: Seen[] }> {
  const seen: Seen[] = []
  const created = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const path = req.url ?? ''
      seen.push({ method: req.method ?? '', path, body: raw ? JSON.parse(raw) : undefined })
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.method === 'POST' && path === '/session') res.end(JSON.stringify(sessionReply))
      else if (path.endsWith('/execute/sync')) res.end(JSON.stringify({ value: { answer: 42 } }))
      else if (path === '/status') res.end(JSON.stringify({ value: { ready: true } }))
      else res.end(JSON.stringify({ value: null }))
    })
  })
  server = created
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve))
  return { port: (created.address() as AddressInfo).port, seen }
}

const OK_REPLY = {
  value: {
    sessionId: 'abc123',
    capabilities: {
      platformName: 'android',
      browserVersion: '129.0.1',
      'safari:deviceName': 'iPhone 17 Pro',
      'safari:platformVersion': '26.5',
    },
  },
}

describe.each([
  ['ios-safari.mjs', ios, 'iPhone 17 Pro · iOS 26.5 (simulator)'],
  ['android-chrome.mjs', android, 'android · Chrome 129.0.1 (emulator)'],
] as const)('%s speaks W3C WebDriver to its driver', (_name, phone, host) => {
  it('opens a session with its own capabilities and labels the host', async () => {
    const { port, seen } = await fakeDriver(OK_REPLY)
    const session = await phone.openSession(port, {})
    expect(session).toEqual({ sessionId: 'abc123', host })
    expect(seen).toEqual([{ method: 'POST', path: '/session', body: phone.sessionBody({}) }])
  })

  it('navigates, evaluates with arguments, and closes — each on the endpoint W3C names', async () => {
    const { port, seen } = await fakeDriver(OK_REPLY)
    await phone.go(port, 'abc123', 'http://localhost:4173/n001/wine')
    const value = await phone.evaluate(port, 'abc123', 'return 1', ['x'])
    await phone.closeSession(port, 'abc123')
    expect(value).toEqual({ answer: 42 })
    expect(seen).toEqual([
      {
        method: 'POST',
        path: '/session/abc123/url',
        body: { url: 'http://localhost:4173/n001/wine' },
      },
      {
        method: 'POST',
        path: '/session/abc123/execute/sync',
        body: { script: 'return 1', args: ['x'] },
      },
      { method: 'DELETE', path: '/session/abc123', body: undefined },
    ])
  })

  it('evaluate sends an empty argument list when it is given none', async () => {
    const { port, seen } = await fakeDriver(OK_REPLY)
    await phone.evaluate(port, 'abc123', 'return 1')
    expect(seen[0]?.body).toEqual({ script: 'return 1', args: [] })
  })

  it('throws the driver’s own message when no session comes back', async () => {
    const { port } = await fakeDriver({ value: { message: 'the driver said this' } })
    await expect(phone.openSession(port, {})).rejects.toThrow(/the driver said this/)
  })
})

describe('what each phone says about a failed session stays its own', () => {
  it('android adds its generic causes under chromedriver’s message', () => {
    expect(() => android.readSessionId({ value: { message: 'no device' } })).toThrow(
      /^no device\n {2}→ chromedriver could not start a Chrome-for-Android session/,
    )
  })

  it('ios explains only the one failure it measured, and passes any other message through', () => {
    expect(() =>
      ios.readSessionId({ value: { message: 'Could not find any session hosts' } }),
    ).toThrow(/not discoverable/)
    const plain = (() => {
      try {
        ios.readSessionId({ value: { message: 'something else' } })
      } catch (error) {
        return (error as Error).message
      }
      return ''
    })()
    expect(plain).toBe('something else')
  })

  it('names the driver when it sent no message at all', () => {
    expect(() => ios.readSessionId({})).toThrow(/^safaridriver returned no sessionId/)
    expect(() => android.readSessionId({})).toThrow(/^chromedriver returned no sessionId/)
  })
})

describe('startDriverProcess', () => {
  it('returns once the driver answers its status endpoint, and stop() ends the process', async () => {
    const { port } = await fakeDriver(OK_REPLY) // something already answering /status on `port`
    const driver = await startDriverProcess({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 60000)'],
      port,
    })
    expect(driver.port).toBe(port)
    driver.stop()
  })

  it('⚠️ CONTROL: gives up with a message naming the command, port and wait when nothing answers', async () => {
    await expect(
      startDriverProcess({
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 60000)'],
        port: 1, // nothing listens here
        attempts: 3,
        intervalMs: 10,
      }),
    ).rejects.toThrow(/did not answer on port 1 within 0s/)
  })
})
