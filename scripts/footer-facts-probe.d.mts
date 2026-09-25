/** Types for `footer-facts-probe.mjs`, so a TypeScript test can import it (same shape as icon-parity-probe.d.mts). */
import type { FOOTER_FACTS } from './apply-footer-facts.mjs'

export declare const SITE_URL: string
export declare function isRefusal(status: number): boolean
export declare function footerSection(html: string): string
export declare function footerText(section: string): string
export declare function expectedFacts(facts?: typeof FOOTER_FACTS): {
  text: string[]
  hrefs: string[]
}
export declare function missingFacts(html: string, facts?: typeof FOOTER_FACTS): string[]
