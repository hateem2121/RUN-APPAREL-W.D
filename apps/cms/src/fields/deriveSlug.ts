import { isValidSlug } from '@run-apparel/shared'

/**
 * Turn a product or colour name into a web address word.
 *
 * SUGGESTION ONLY, AND ONLY INTO A BLANK. A slug is printed on physical QR tags
 * and cannot be recalled, so nothing automated may rewrite one — the same rule
 * importColours.ts is built around, for the same reason.
 *
 * Returns '' rather than a nearly-valid string: an empty field shows the
 * existing "Every product needs a web address word" message, which tells the
 * owner what to do. A silently mangled one does not.
 */
export function deriveSlug(name: unknown): string {
  if (typeof name !== 'string') return ''
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug !== '' && isValidSlug(slug) ? slug : ''
}
