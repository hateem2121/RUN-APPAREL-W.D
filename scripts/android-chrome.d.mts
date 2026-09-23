/**
 * Types for `android-chrome.mjs`, so TypeScript tests can import it — the same reason and
 * the same shape as `ios-safari.d.mts`.
 */

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

export declare function parseChromeVersionName(dumpsysOutput: string): string
export declare function chromeMajorVersion(versionName: string): number

export interface Driver {
  port: number
  stop(): void
}
export declare function startDriver(port: number): Promise<Driver>

export interface Session {
  sessionId: string
  host: string
}
export declare function openSession(port: number, options?: SessionOptions): Promise<Session>

export declare function go(port: number, sessionId: string, url: string): Promise<void>
export declare function evaluate(
  port: number,
  sessionId: string,
  script: string,
  args?: unknown[],
): Promise<unknown>
export declare function closeSession(port: number, sessionId: string): Promise<void>

export interface FontCheckResult {
  fontFamily?: string
  archivoLoaded?: boolean
}
export declare function fontCheckPassed(result: FontCheckResult | null | undefined): boolean
