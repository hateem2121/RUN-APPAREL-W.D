/**
 * Types for `webdriver-client.mjs`, so TypeScript tests can import it — the same reason and
 * the same shape as `ios-safari.d.mts` and `android-chrome.d.mts`, which re-export from here.
 */

export interface Driver {
  port: number
  stop(): void
}

export interface Session {
  sessionId: string
  host: string
}

export declare const json: (url: string, init?: RequestInit) => Promise<unknown>

export declare function readSessionIdWith(
  payload: unknown,
  how: { driver: string; explain: (message: string) => string | null },
): string

export declare function startDriverProcess(options: {
  command: string
  args: string[]
  port: number
  attempts?: number
  intervalMs?: number
}): Promise<Driver>

export declare function newSession(port: number, body: unknown): Promise<unknown>
export declare function go(port: number, sessionId: string, url: string): Promise<void>
export declare function evaluate(
  port: number,
  sessionId: string,
  script: string,
  args?: unknown[],
): Promise<unknown>
export declare function closeSession(port: number, sessionId: string): Promise<void>
