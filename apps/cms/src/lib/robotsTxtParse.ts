/**
 * Parse a robots.txt file's text into its groups, with no other imports.
 *
 * WHY A SEPARATE, DEPENDENCY-FREE FILE FROM `robotsTxt.ts`. That file imports `./seo`
 * (extensionless, this repo's normal style for a bundler-resolved TypeScript import) —
 * fine for Next and for Vitest, but plain Node's own ESM resolver refuses an
 * extensionless specifier outright. `scripts/public-security-probe.mjs` runs under
 * plain Node (FI-07: it checks the LIVE robots.txt, not the repo's copy, so it has to
 * be a runnable CLI), and needs the SAME parser `viewerRobots.test.ts` already uses
 * (so a future change to the crawler list is asserted once and read twice) — so the
 * parser has to live somewhere plain Node can import without dragging in `./seo`.
 * `robotsTxt.ts` re-exports these three rather than duplicating them.
 */

/** One robots.txt file's groups, each as its raw non-comment lines. */
export function robotsTxtGroups(text: string): string[][] {
  const directives = (block: string) =>
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  return text
    .split(/\n\s*\n/)
    .map(directives)
    .filter((lines) => lines.some((line) => line.startsWith('User-agent:')))
}

/** The `User-agent:` values named in one group's lines. */
export function agentsOf(lines: string[]): string[] {
  return lines.filter((line) => line.startsWith('User-agent:')).map((line) => line.slice(11).trim())
}

/** Case-insensitive, order-independent comparison helper. */
export function lower(list: readonly string[]): string[] {
  return list.map((item) => item.toLowerCase()).sort()
}
