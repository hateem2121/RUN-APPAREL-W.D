/**
 * The HTML a visitor sees: a private document's pages, or "this link is not active".
 *
 * WHY PICTURES AND NO JAVASCRIPT. The catalogue PDF holds 1,243 images, 543 with soft
 * masks; a browser's PDF viewer decodes and blends them on the visitor's device as each
 * page scrolls in (27.2 s for Ghostscript to draw every page on the owner's Mac,
 * 2026-09-11). Pictures rendered once by `scripts/document-pages.mjs` move that work off
 * the phone, the way Google Drive's preview does. Plain `<img loading="lazy">` with a
 * `srcset` needs no script, so the CSP can forbid scripts outright.
 *
 * ⚠️ BUILT BY THE WORKER, SO `_headers` NEVER APPLIES. index.js sets every header.
 * ⚠️ NO E-MAIL ADDRESS. This zone's e-mail obfuscation would inject a script the CSP
 * blocks; the contact button goes to the site's contact page instead.
 */

import { WIDTHS, pictureFileName } from './manifest.js'

export const CONTACT_URL = 'https://wear-run.help/contact'
/** The footer's Privacy link (owner decision D37, 2026-09-15). */
export const PRIVACY_URL = 'https://wear-run.help/privacy'
export const MESSAGE_HEADLINE = 'This link is not complete or no longer active.'
export const MESSAGE_BODY = 'Please contact RUN Apparel for the current link.'

/**
 * [light, dark] pairs copied from `packages/ui/src/tokens.css`, because a Worker cannot
 * import the site's stylesheet. `apps/cms/src/apexPage.test.ts` fails if one drifts.
 */
export const TOKENS = Object.freeze({
  bg: /** @type {const} */ (['#f1efea', '#1c1f18']),
  surface: /** @type {const} */ (['#faf9f6', '#23271f']),
  wash: /** @type {const} */ (['#e4e1d8', '#2c3126']),
  text: /** @type {const} */ (['#1d1f1a', '#ecebe4']),
  muted: /** @type {const} */ (['#63665b', '#a2a695']),
  line: /** @type {const} */ (['rgba(29, 31, 26, 0.18)', 'rgba(236, 235, 228, 0.18)']),
  'btn-primary-bg': /** @type {const} */ (['#1d1f1a', '#cdf345']),
  'btn-primary-text': /** @type {const} */ (['#cdf345', '#1d1f1a']),
  'focus-ring': /** @type {const} */ (['#5f7414', '#cdf345']),
})

const variables = Object.entries(TOKENS)
  .map(([name, [light, dark]]) => `--${name}:light-dark(${light},${dark})`)
  .join(';')

/** The only style on either page. Its SHA-256 is the CSP's `style-src`. */
export const STYLE = [
  `:root{color-scheme:light dark;${variables}}`,
  '*{box-sizing:border-box}',
  'body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
  '.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;max-width:1600px;margin:0 auto;padding:16px;background:var(--surface)}',
  '.bar--top{border-bottom:1px solid var(--line)}',
  '.wordmark{margin:0;font-weight:800;letter-spacing:.08em}',
  '.title{margin:0;flex:1 1 auto;font-size:1.125rem;font-weight:600}',
  '.button{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:999px;background:var(--btn-primary-bg);color:var(--btn-primary-text);font-weight:600;text-decoration:none}',
  '.button:focus-visible,.privacy:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}',
  // As tall as the button (44px). --muted on --surface measures 5.57:1 light, 6.10:1 dark.
  '.privacy{display:inline-flex;align-items:center;min-height:44px;margin-left:auto;padding:0 8px;color:var(--muted);font-size:.875rem;text-underline-offset:3px}',
  '.doc{max-width:1600px;margin:0 auto;padding:16px}',
  // `position:relative` makes each page the box its reading marker sits at the foot of.
  '.page{position:relative;margin:0 0 24px}',
  '.parts{display:grid;grid-template-columns:1fr;background:var(--wash)}',
  '@media (min-width:900px){.parts--split{grid-template-columns:1fr 1fr}}',
  '.parts img{display:block;width:100%;height:auto}',
  '.caption{margin:6px 0 0;color:var(--muted);font-size:.875rem;text-align:center}',
  // A marker must never be seen, tapped, or given a line of its own: left inline, even a
  // 1px image opens a line box as tall as the body's line height under every caption.
  '.seen{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none}',
  '.message{max-width:36rem;margin:0 auto;padding:15vh 16px;text-align:center}',
  '.message .title{margin:16px 0 8px;font-size:1.5rem}',
  '.message p{margin:0 0 24px;color:var(--muted)}',
].join('\n')

/** @type {Promise<string> | undefined} */
let policy

/**
 * Computed once per isolate from the exact style served.
 *
 * @returns {Promise<string>}
 */
export function contentSecurityPolicy() {
  policy ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(STYLE)).then((digest) => {
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
    return `default-src 'none'; img-src 'self'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  })
  return policy
}

/** @param {string} text */
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Decimal megabytes, as a person reads a file size.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function megabytes(bytes) {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`
}

/** @param {string} title */
const head = (title) =>
  [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${escapeHtml(title)} · RUN APPAREL</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
  ].join('\n')

/**
 * @param {{
 *   doc: import('./documents.js').DocumentConfig,
 *   manifest: import('./manifest.js').Manifest,
 *   code: string,
 * }} input `code` must already be normalised (index.js)
 * @returns {string}
 */
export function renderDocumentPage({ doc, manifest, code }) {
  const base = `/${escapeHtml(code)}`
  const total = manifest.pages.length
  // `/get`, not `/download` (owner decision D32, 2026-09-15). The PDF is cached for an hour
  // and a cache HIT never runs the Worker, so index.js counts the press at /get, which is
  // never cached, and sends the browser on to /download.
  const download = `<a class="button" href="${base}/get" download>Download PDF (${megabytes(manifest.pdf.bytes)})</a>`

  const sections = manifest.pages.map((page) => {
    const split = page.parts.length === 2
    const sizes = split ? '(min-width: 900px) min(50vw, 800px), 100vw' : 'min(100vw, 1600px)'
    const loading = page.number === 1 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'
    const images = page.parts.map((part) => {
      /** @param {number} width */
      const src = (width) => `${base}/p/${manifest.version}/${pictureFileName(part.id, width)}`
      const half = part.id.endsWith('a')
        ? ', left half'
        : part.id.endsWith('b')
          ? ', right half'
          : ''
      return [
        `<img src="${src(1600)}"`,
        `srcset="${WIDTHS.map((width) => `${src(width)} ${width}w`).join(', ')}"`,
        `sizes="${sizes}" width="${part.width}" height="${part.height}"`,
        `alt="${escapeHtml(doc.altLabel)}, page ${page.number}${half}"`,
        `decoding="async" ${loading}>`,
      ].join(' ')
    })
    // A READING MARKER (owner decision D32, 2026-09-15). The last thing in every page after
    // the first is a lazy, invisible 1×1 picture, so its request tells index.js that someone
    // scrolled that far. Page 1 needs none: opening the page counts it. Still no script.
    const marker =
      page.number >= 2
        ? [
            `<img class="seen" src="${base}/seen/${page.number}" alt="" aria-hidden="true" width="1" height="1" loading="lazy" decoding="async" fetchpriority="low">`,
          ]
        : []
    return [
      `<section class="page" id="page-${page.number}" aria-label="Page ${page.number} of ${total}">`,
      `<div class="parts parts--${split ? 'split' : 'whole'}">`,
      ...images,
      '</div>',
      `<p class="caption">Page ${page.number} of ${total}</p>`,
      ...marker,
      '</section>',
    ].join('\n')
  })

  return [
    head(doc.title),
    '<body>',
    '<header class="bar bar--top">',
    '<p class="wordmark">RUN APPAREL</p>',
    `<h1 class="title">${escapeHtml(doc.title)}</h1>`,
    download,
    '</header>',
    '<main class="doc">',
    ...sections,
    '</main>',
    '<footer class="bar">',
    download,
    `<a class="privacy" href="${PRIVACY_URL}">Privacy</a>`,
    '</footer>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/**
 * The same page for a missing code, a wrong code and the retired apex addresses — it
 * must not reveal which of those it was.
 *
 * @returns {string}
 */
export function renderMessagePage() {
  return [
    head('Link not active'),
    '<body>',
    '<main class="message">',
    '<p class="wordmark">RUN APPAREL</p>',
    `<h1 class="title">${MESSAGE_HEADLINE}</h1>`,
    `<p>${MESSAGE_BODY}</p>`,
    `<a class="button" href="${CONTACT_URL}">Contact RUN Apparel</a>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
