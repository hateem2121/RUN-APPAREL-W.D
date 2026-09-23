/**
 * Types for `voiceover.mjs`, so TypeScript tests can import it — the same reason and the
 * same shape as `android-chrome.d.mts` and `ios-safari.d.mts`.
 */

export declare const VOICEOVER_CAVEAT: string
export declare const VOICEOVER_HONESTY_LABEL: string
export declare const DEFAULT_TARGET_URL: string
export declare const DEFAULT_GARMENT_NAME: string
export declare const EXPECTED_COLOURWAY_COUNT: number
export declare const WEBKIT_APPLICATION_NAME: string
export declare const DISABLE_SPEAK_INSTRUCTIONS_SETTINGS: Record<string, boolean>

export interface PackageJsonExportsCondition {
  types?: string
  import?: string
  default?: string
  require?: string
}

export interface PackageJsonLike {
  main?: string
  exports?: Record<string, string | PackageJsonExportsCondition> | string
}

export declare function resolveEsmEntry(packageJson: PackageJsonLike | null | undefined): string

export declare function isHeadingLevel1Announcement(itemText: unknown): boolean
export declare function containsGarmentName(text: unknown, garmentName: unknown): boolean
export declare function isTabAnnouncement(itemText: unknown): boolean
export declare function isAnnouncedSelected(itemText: unknown): boolean

export interface CheckResult {
  name: string
  pass: boolean
  message: string
}

export declare function formatCheckLine(result: CheckResult): string

export declare function resolveRuntimeDepsDir(env?: Record<string, string | undefined>): string
// biome-ignore lint/suspicious/noExplicitAny: the resolved module's shape depends entirely on which package was requested.
export declare function importFromDepsDir(depsDir: string, packageName: string): Promise<any>

export interface LogEntry {
  label: string
  itemText: string
  spokenPhrase: string
}

// The real Guidepup/Playwright object shapes are intentionally not modelled here — this
// module talks to them only inside main(), never in anything apps/cms/src/voiceOver.test.ts
// imports, so `unknown` keeps the test file's types honest about what it actually exercises.
export declare function navigateToWebContent(options: {
  voiceOver: unknown
  macOSActivate: (applicationName: string) => Promise<void>
  MacOSKeyCodes: Record<string, number>
  page: unknown
  capture?: unknown
}): Promise<void>

export declare function runChecks(options: {
  voiceOver: unknown
  garmentName: string
}): Promise<{ results: CheckResult[]; fullLog: LogEntry[] }>
