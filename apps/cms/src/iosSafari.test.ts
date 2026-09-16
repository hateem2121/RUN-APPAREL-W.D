import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLATFORM_VERSION,
  describeHost,
  readSessionId,
  sessionBody,
  SIMULATOR_CAVEAT,
} from '../../../scripts/ios-safari.mjs'

/**
 * The pure half of the iOS Safari harness.
 *
 * Only the decisions are tested here: what capabilities get sent, how a reply is read, and
 * how a host is labelled. The session functions talk to `safaridriver` over HTTP and are
 * exercised by actually driving a simulator — a mocked `fetch` would assert that this file
 * calls the endpoints this file names, which is the shape of test the root CLAUDE.md warns
 * about: nothing that happens in production could make it fail.
 *
 * ⚠️ Nothing counts `scripts/` in coverage (see contrastRules.test.ts), so as there, every
 * function is shown catching its fault AND passing clean input.
 */

describe('sessionBody — what separates a simulator from a real phone', () => {
  it('always asks for a simulator, never a USB device', () => {
    // Without this flag safaridriver hunts for a physical phone and fails with the SAME
    // "no session hosts" message iOS 27 gives — two very different faults, one message.
    expect(sessionBody().capabilities.alwaysMatch['safari:useSimulator']).toBe(true)
    expect(sessionBody().capabilities.alwaysMatch.platformName).toBe('iOS')
  })

  it('defaults to the newest runtime that actually works', () => {
    expect(DEFAULT_PLATFORM_VERSION).toBe('26.5')
    expect(sessionBody().capabilities.alwaysMatch['safari:platformVersion']).toBe('26.5')
  })

  it('pins one device when given a UDID, and drops the version so they cannot disagree', () => {
    const match = sessionBody({ deviceUdid: 'ABC-123' }).capabilities.alwaysMatch
    expect(match['safari:deviceUDID']).toBe('ABC-123')
    expect(match['safari:platformVersion']).toBeUndefined()
  })

  it('honours an explicit version — negative control for the default', () => {
    const match = sessionBody({ platformVersion: '18.4' }).capabilities.alwaysMatch
    expect(match['safari:platformVersion']).toBe('18.4')
    expect(match['safari:deviceUDID']).toBeUndefined()
  })
})

describe('readSessionId', () => {
  it('returns the id from a real reply', () => {
    // Shape copied from an actual 2026-09-16 session against iPhone 17 Pro / iOS 26.5.
    expect(
      readSessionId({
        value: { sessionId: '7293D908-5E76-440E-A763-C6717F7DD0B8', capabilities: {} },
      }),
    ).toBe('7293D908-5E76-440E-A763-C6717F7DD0B8')
  })

  it('explains the iOS 27 failure instead of repeating it', () => {
    // The verbatim message safaridriver returns for an undiscoverable runtime.
    expect(() =>
      readSessionId({
        value: {
          error: 'session not created',
          message:
            'Could not create a session: Could not find any session hosts that match the requested capabilities.',
        },
      }),
    ).toThrow(/not discoverable/)
  })

  it('passes a DIFFERENT failure through untouched — negative control', () => {
    // A timeout must not be labelled as the iOS 27 fault; they need different responses.
    expect(() =>
      readSessionId({ value: { message: 'Timed out waiting for the browser' } }),
    ).toThrow(/Timed out/)
    expect(() =>
      readSessionId({ value: { message: 'Timed out waiting for the browser' } }),
    ).not.toThrow(/not discoverable/)
  })

  it('does not pretend an empty reply succeeded', () => {
    expect(() => readSessionId({})).toThrow(/no sessionId/)
    expect(() => readSessionId(null)).toThrow(/no sessionId/)
  })
})

describe('describeHost — a report must name what it measured', () => {
  it('labels a real capability set, and says simulator out loud', () => {
    expect(
      describeHost({ 'safari:deviceName': 'iPhone 17 Pro', 'safari:platformVersion': '26.5' }),
    ).toBe('iPhone 17 Pro · iOS 26.5 (simulator)')
  })

  it('never silently invents a device when the fields are missing', () => {
    expect(describeHost({})).toBe('unknown device · iOS unknown iOS (simulator)')
    expect(describeHost(undefined)).toContain('simulator')
  })
})

describe('SIMULATOR_CAVEAT', () => {
  it('names what is trustworthy and what is not', () => {
    expect(SIMULATOR_CAVEAT).toMatch(/real Safari/)
    expect(SIMULATOR_CAVEAT).toMatch(/NOT device numbers/)
  })
})
