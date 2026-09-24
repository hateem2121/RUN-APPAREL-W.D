/**
 * Types for `ios-safari.mjs`, so TypeScript tests can import it — the same reason and the
 * same shape as `copy-rules.d.mts` and `contrast-rules.d.mts`.
 */

export declare const SIMULATOR_CAVEAT: string
export declare const DEFAULT_PLATFORM_VERSION: string

export interface SessionOptions {
  platformVersion?: string
  deviceUdid?: string
}

export interface SessionBody {
  capabilities: { alwaysMatch: Record<string, unknown> }
}

export declare function sessionBody(options?: SessionOptions): SessionBody

/** Returns the session id, or THROWS carrying safaridriver's own message. */
export declare function readSessionId(payload: unknown): string

export declare function describeHost(capabilities: unknown): string

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
/** Base64-encoded PNG of the current page. */
export declare function screenshot(port: number, sessionId: string): Promise<string>
export declare function closeSession(port: number, sessionId: string): Promise<void>
