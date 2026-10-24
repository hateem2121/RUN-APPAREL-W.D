/**
 * Types for `android-chrome.mjs`, so TypeScript tests can import it — the same reason and
 * the same shape as `ios-safari.d.mts`.
 */

import type { Driver, Session } from './webdriver-client.mjs'
export type { Driver, Session }
export { closeSession, evaluate, go } from './webdriver-client.mjs'

export declare const ANDROID_CAVEAT: string
export declare const DEFAULT_ANDROID_PACKAGE: string
export declare const HOST_LOOPBACK_ALIAS: string
export declare const FONT_CHECK_SCRIPT: string

export interface SessionOptions {
  androidPackage?: string
  androidDeviceSerial?: string
}

export interface SessionBody {
  capabilities: { alwaysMatch: Record<string, unknown> }
}

export declare function sessionBody(options?: SessionOptions): SessionBody

/** Returns the session id, or THROWS carrying chromedriver's own message. */
export declare function readSessionId(payload: unknown): string

export declare function describeHost(capabilities: unknown): string

export declare function startDriver(port: number): Promise<Driver>

export declare function openSession(port: number, options?: SessionOptions): Promise<Session>

export interface FontCheckResult {
  fontFamily?: string
  archivoLoaded?: boolean
}
export declare function fontCheckPassed(result: FontCheckResult | null | undefined): boolean
