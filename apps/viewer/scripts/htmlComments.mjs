import { stripUntilStable } from '../../../scripts/strip-until-stable.mjs'

/**
 * Remove the developer notes (`<!-- … -->`) from the built `index.html` (findability audit,
 * 2026-10-08). The garment page's HTML carried 7,974 bytes of them in a 19,603-byte document,
 * measured on the live page that day: every QR scan and every robot downloaded the reasons a
 * line is there before the line itself. The notes stay in the SOURCE, where people read them.
 *
 * WHY NOTHING DEPENDS ON THEM (checked 2026-10-08): the Worker rewrites elements and never a
 * comment (`worker/index.ts`, `worker/preview.ts`); the two readers that look past comments
 * strip them first themselves (`worker/preview.test.ts`, `scripts/smoke-viewer-preview.mjs`).
 *
 * `stripUntilStable`, not one `replace`: removing an inner comment can join the text around it
 * into a fresh `<!-- … -->` (the reason it exists; CodeQL js/incomplete-multi-character-sanitization).
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtmlComments(html) {
  return stripUntilStable(html, /<!--[\s\S]*?-->/g, '')
}
