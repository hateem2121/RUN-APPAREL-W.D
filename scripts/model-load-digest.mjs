/**
 * Summarise the weekly model-load-rate query's rows into the digest's prose (RO-11).
 *
 * WHY A SEPARATE MODULE rather than a `node -e "…"` blob inline in
 * `.github/workflows/diagnostics-digest.yml`, the way the page-speed section does it.
 * That inline style is fine for a single expression; this needed a threshold, an
 * edge-day exclusion and a loop, and testing THAT by extracting it back out of a
 * YAML-and-shell-escaped string is fragile in a way testing a plain module import is
 * not. The SQL that produces the rows still lives in the workflow file, read by
 * `apps/cms/src/diagnosticsDigest.test.ts` exactly as the page-speed query is — only
 * the PROSE step moved here.
 *
 * `viewer_page_loaded` fires on every page open; `model_loaded` only once the GLB has
 * actually decoded. A gap between the two is the failure mode a QR scan cannot
 * recover from unassisted.
 */

/**
 * 85% IS A MEASURED THRESHOLD, NOT A ROUND NUMBER. Read live 2026-09-23 (10 days,
 * Cloudflare MCP `d1_database_query`, `rows_written: 0`): the three FULL days in that
 * sample were all 100% (40/40, 33/33, 40/40); the lowest ratio recorded on any day
 * with double-digit traffic was 17/31 = 54.8%. 85% sits below every clean day
 * measured and above where a single slow visitor could ever move the number on a
 * busy day, so it flags a real gap without firing on ordinary variance.
 */
export const FLAG_BELOW = 0.85

/**
 * Below this many page loads, a flagged day gets an extra "small sample" note rather
 * than a bare percentage — same reasoning the page-speed section already uses for its
 * own "fewer than 50 visits" line. Measured live 2026-09-23 (rows_written 0): a
 * 2-load day read 1/2 (50%), which is one visitor's model failing to load, not a
 * pattern — while every day at or above this count in the same read was 4 or more
 * loads with either a clean ratio or none flagged at all. This does NOT change
 * whether a day is flagged (`FLAG_BELOW` is still the one number that decides that);
 * it only changes how a flagged day already below `FLAG_BELOW` is worded.
 */
export const LOW_VOLUME_LOADS = 10

/**
 * @typedef {{ day: string, loads: number, models: number }} DayRow
 */

/**
 * Pure: turn the query's per-day rows into the digest's prose. No network, no clock
 * read beyond what is passed in — `today`/`cutoff` are parameters so a planted-fault
 * proof can pick fixed dates rather than racing the real one.
 *
 * @param {DayRow[]} rows
 * @param {{ today: string, cutoff: string }} window Both `YYYY-MM-DD`, UTC. The
 *   window's own first and last calendar day are dropped as necessarily partial —
 *   see the module docblock.
 * @returns {{ fullDays: number, flagged: DayRow[], summary: string }}
 */
export function summarizeModelLoadRate(rows, { today, cutoff }) {
  if (rows.length === 0) {
    return {
      fullDays: 0,
      flagged: [],
      summary: '**3D models load:** no page-view data in the last 7 days.',
    }
  }

  const full = rows.filter((r) => r.day !== today && r.day !== cutoff && Number(r.loads) > 0)
  const flagged = full.filter((r) => Number(r.models) / Number(r.loads) < FLAG_BELOW)

  const lines = [
    `**3D models load** (last 7 days, edge days excluded as partial): ${full.length} full day(s) measured.`,
    // What the ratio actually counts, so a reader does not have to guess from the number
    // alone: how many page opens got as far as a decoded model, not how many visitors
    // clicked anything or how many garments exist.
    'The ratio is model_loaded events against viewer_page_loaded events on the same day.',
  ]
  if (full.length === 0) {
    // Rows existed (the `rows.length === 0` case above already returned), but every one
    // was an edge day or had zero page loads — `flagged` is necessarily empty here too,
    // and reporting "All full days at or above 85%" would be true of zero days for free.
    lines.push('No full day to judge this week.')
  } else if (flagged.length === 0) {
    lines.push(
      `All full days at or above ${Math.round(FLAG_BELOW * 100)}% (page opened -> model loaded).`,
    )
  } else {
    for (const r of flagged) {
      const pct = ((Number(r.models) / Number(r.loads)) * 100).toFixed(0)
      const smallSample =
        Number(r.loads) < LOW_VOLUME_LOADS ? ' (small sample — read as a hint, not a verdict)' : ''
      lines.push(
        `- ${r.day}: ${r.models}/${r.loads} (${pct}%) — below ${Math.round(FLAG_BELOW * 100)}%${smallSample}.`,
      )
    }
  }

  return { fullDays: full.length, flagged, summary: lines.join('\n') }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const { readFileSync } = await import('node:fs')
  const path = process.argv[2]
  if (!path) {
    console.error('usage: node scripts/model-load-digest.mjs <wrangler-json-output-path>')
    process.exit(2)
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  const rows = parsed[0]?.results ?? []
  const today = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { summary } = summarizeModelLoadRate(rows, { today, cutoff })
  // Line 1 is the `days` output GITHUB_OUTPUT needs for the issue-step's `if:` gate;
  // everything from line 2 on is the summary block verbatim, so the workflow's shell
  // needs no parsing beyond `head -1` / `tail -n +2`.
  console.log(`days=${rows.length}`)
  console.log(summary)
}
