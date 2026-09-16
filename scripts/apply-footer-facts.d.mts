/** Types for `apply-footer-facts.mjs`, so a TypeScript test can import it (same shape as live-copy.d.mts). */
export interface FooterFacts {
  capacity: {
    moq: string
    leadTime: string
    /** Stored select codes, `mon`–`sun` — NOT the 0–6 numbers `projectHours()` renders. */
    hoursFirstDay: string
    hoursLastDay: string
    /** 24-hour `HH:MM`. */
    hoursOpen: string
    hoursClose: string
  }
  worksCoordinates: string
  certifications: Array<{ name: string }>
  socialLinks: Array<{ label: string; url: string }>
}
export declare const FOOTER_FACTS: FooterFacts
/** One line per violation; empty means every value is storable. */
export declare function problems(facts?: FooterFacts): string[]
