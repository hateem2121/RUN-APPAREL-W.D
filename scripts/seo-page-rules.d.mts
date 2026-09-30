/** Types for `seo-page-rules.mjs`, so TypeScript tests can import it (same shape as canonical-tags.d.mts). */

export declare const TITLE_MAX: number
export declare const DESCRIPTION_MAX: number
export declare const DESCRIPTION_MIN: number

export interface PageRead {
  title: string
  description: string | null
  h1: string[]
  canonicals: string[]
  robots: string | null
  lang: string | null
  images: number
  imagesWithoutAlt: number
  ogImage: string | null
  jsonLdTypes: string[]
}

export interface Finding {
  level: 'error' | 'warning'
  rule: string
  message: string
}

export interface CrawledPage {
  url: string
  status: number
  html: string
  xRobotsTag?: string | null
}

/** Everything the report needs from one page's raw HTML, comments removed first. */
export declare function readPage(html: string): PageRead
/** The findings for one page a sitemap offers to search engines. */
export declare function checkPage(page: CrawledPage): Finding[]
/** Findings that only show across pages: shared titles and descriptions. */
export declare function checkSite(pages: CrawledPage[]): Array<Finding & { urls: string[] }>
/** Every `<loc>` in a sitemap, in order; `<image:loc>` is not a page and is skipped. */
export declare function sitemapUrls(xml: string): string[]
