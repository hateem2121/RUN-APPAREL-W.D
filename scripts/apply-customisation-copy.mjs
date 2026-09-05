/**
 * Write the drafted customisation copy into the CMS.
 *
 * Ten of eleven live products shipped with `customisationSteps: []` and an empty
 * intro (measured 2026-09-04), so the section headed "FROM IDEA TO PRODUCTION."
 * rendered a heading, one fallback sentence, and nothing else. The copy that fixes
 * it is in docs/CUSTOMISATION-COPY-2026-09-04.md.
 *
 * ⚠️ EVERY WRITE IS READ BACK, because the first run of this script reported
 * "11 written, 0 failed" while writing ten of eleven intros to a field that does
 * not exist. See the `customisationIntro` comment at the patch site. A 200 from
 * Payload means "the request was accepted", not "your field was stored" — unknown
 * keys are dropped in silence. The read-back below is what makes the success line
 * mean something.
 *
 * ⚠️ THAT MARKDOWN FILE IS THE SINGLE SOURCE OF TRUTH, AND THIS SCRIPT PARSES IT.
 * The obvious alternative — a JSON payload beside a markdown doc showing the same
 * prose — gives two copies of eleven garments' worth of text that must stay in
 * step, and this repo has paid for that shape repeatedly (the theme-color meta vs
 * tokens.css, `--header-h` vs the rendered header, REFERENCE_PATHS vs the four
 * hardcoded paths below it). The owner reviews and edits prose in the markdown;
 * anything else would mean editing the reviewed copy in a second place afterwards.
 *
 * Fragile parsing is handled by being LOUD rather than clever: the expected shape
 * is asserted up front — eleven products, each with an intro and exactly four
 * numbered steps — and any shortfall exits non-zero before a single request is
 * made. A parser that silently found nine products would write nine and report
 * success, which is the failure mode worth engineering against here.
 *
 * Usage:
 *   node scripts/apply-customisation-copy.mjs                 # dry run, prints a diff
 *   node scripts/apply-customisation-copy.mjs --only rxps     # dry run, one product
 *   node scripts/apply-customisation-copy.mjs --apply         # write all eleven
 *   node scripts/apply-customisation-copy.mjs --only rxps --apply
 *
 * Env:
 *   CMS_API_KEY   required for --apply. A Payload API key on a user with the
 *                 editor or admin role: `Authorization: users API-Key <key>`, the
 *                 same form scripts/import-catalogue-products.mjs already uses.
 *   CMS_API_BASE  override the CMS origin (default https://cms.wear-run.help).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DOC = path.join(HERE, '..', 'docs', 'CUSTOMISATION-COPY-2026-09-04.md')

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
const API_KEY = process.env.CMS_API_KEY || ''

// The copy and the API key both travel in every request below. `CMS_API_BASE` is
// operator-supplied, so an http:// value would put them on the wire in cleartext
// with nothing to say so — the same guard, and the same reasoning, as
// scripts/import-catalogue-products.mjs.
if (!API_BASE.startsWith('https://')) {
  console.error(`CMS_API_BASE must be https:// — got "${API_BASE}"`)
  process.exit(2)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const onlyAt = args.indexOf('--only')
const ONLY = onlyAt === -1 ? null : args[onlyAt + 1]

const EXPECTED_PRODUCTS = 11
const EXPECTED_STEPS = 4

/** `| a | b | c |` -> ['a','b','c'], with escaped pipes preserved. */
function cells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

/**
 * Parse the per-garment sections.
 *
 * Shape expected, and asserted:
 *   ## <n>. <NAME> — `<slug>` (<CODE>)
 *   **Intro**
 *   > one or more blockquote lines
 *   | # | Title | Body |
 *   |---|---|---|
 *   | 1 | <TITLE> | <BODY> |   x4
 */
function parseCopy(markdown) {
  const products = []
  const sections = markdown.split(/\n(?=## )/)
  for (const section of sections) {
    const heading = /^## \d+\.\s+(.+?)\s+—\s+`([a-z0-9-]+)`\s+\(([A-Z0-9-]+)\)/.exec(section)
    if (!heading) continue
    const [, name, slug, code] = heading

    const introBlock = /\*\*Intro\*\*\s*\n\n((?:>.*\n?)+)/.exec(section)
    const intro = introBlock
      ? introBlock[1]
          .split('\n')
          .map((l) => l.replace(/^>\s?/, '').trim())
          .filter(Boolean)
          .join(' ')
      : ''

    const steps = []
    for (const line of section.split('\n')) {
      if (!/^\|\s*\d+\s*\|/.test(line)) continue
      const [number, title, body] = cells(line)
      steps.push({ number: Number(number), title, body })
    }
    products.push({ slug, code, name, intro, steps })
  }
  return products
}

/** The owner-confirmed `garmentFit` values, from the table at the end of the doc. */
function parseFits(markdown) {
  const fits = {}
  // Scan the WHOLE section to the next heading, not the first paragraph after it.
  // The first version stopped at the first blank line, which lands on the prose
  // between the heading and the table — so it parsed zero rows and said so, which
  // is the only reason this was caught before it silently shipped no fit values.
  const section = /## Garment fit values[\s\S]*?(?=\n## |$)/.exec(markdown)
  if (!section) return fits
  for (const line of section[0].split('\n')) {
    const m = /^\|\s*`([a-z0-9-]+)`[^|]*\|\s*\*\*(.+?)\*\*\s*\|/.exec(line)
    if (m) fits[m[1]] = m[2]
  }
  return fits
}

async function api(method, pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `users API-Key ${API_KEY}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { ok: res.ok, status: res.status, json }
}

/**
 * One paragraph as a Lexical editor state — the shape `customisationIntro` stores.
 *
 * ⚠️ NOT ESCAPED, AND THAT IS THE FIX RATHER THAN AN OMISSION. The first version of
 * this script escaped the text and wrote pre-built HTML, reasoning that the field is
 * rendered with dangerouslySetInnerHTML. Both halves were wrong. `convertLexicalToHTML`
 * escapes every text node itself — MEASURED 2026-09-04 against the installed package:
 *
 *     "Teamwear & Uniforms"             -> <p>Teamwear &amp; Uniforms</p>
 *     "a <script>alert(1)</script> tag" -> <p>a &lt;script&gt;alert(1)&lt;/script&gt; tag</p>
 *
 * so escaping here would double-escape and put a literal "&amp;" on eleven live pages.
 * The escaping belongs at the layer that builds the markup, and that layer already has
 * it.
 */
function lexicalParagraph(text) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          textFormat: 0,
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              version: 1,
            },
          ],
        },
      ],
    },
  }
}

function explain(json) {
  const outer = json?.errors?.[0]
  const inner = outer?.data?.errors?.[0]
  if (inner) return `${inner.field}: ${inner.message}`
  return outer?.message || json?.raw || JSON.stringify(json).slice(0, 200)
}

const markdown = readFileSync(DOC, 'utf8')
const parsed = parseCopy(markdown)
const fits = parseFits(markdown)

// ── Loud, up-front shape assertions ────────────────────────────────────────────
// A parser that quietly found the wrong number of products would write the wrong
// number and report success. Everything below this point can assume the shape.
const problems = []
if (parsed.length !== EXPECTED_PRODUCTS) {
  problems.push(`expected ${EXPECTED_PRODUCTS} products in the doc, parsed ${parsed.length}`)
}
for (const p of parsed) {
  if (!p.intro) problems.push(`${p.slug}: no intro paragraph parsed`)
  if (p.steps.length !== EXPECTED_STEPS) {
    problems.push(`${p.slug}: expected ${EXPECTED_STEPS} steps, parsed ${p.steps.length}`)
  }
  for (const s of p.steps) {
    if (!s.title || !s.body) problems.push(`${p.slug}: step ${s.number} has an empty cell`)
  }
}
// The fit table is one of two explicit owner instructions (2026-09-04), so a
// silent zero here would drop half of what was asked for. Assert the count.
const EXPECTED_FITS = 3
if (Object.keys(fits).length !== EXPECTED_FITS) {
  problems.push(
    `expected ${EXPECTED_FITS} owner-confirmed garmentFit values, parsed ` +
      `${Object.keys(fits).length} — check the "Garment fit values" table in the doc`,
  )
}
if (problems.length > 0) {
  console.error(`Refusing to continue — ${DOC} did not parse as expected:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(2)
}

const targets = ONLY ? parsed.filter((p) => p.slug === ONLY) : parsed
if (targets.length === 0) {
  console.error(`--only ${ONLY} matched none of: ${parsed.map((p) => p.slug).join(', ')}`)
  process.exit(2)
}

console.log(
  `Parsed ${parsed.length} products, ${parsed.length * EXPECTED_STEPS} steps, ` +
    `${Object.keys(fits).length} confirmed fit values from ${path.basename(DOC)}.`,
)
console.log(APPLY ? `APPLYING to ${API_BASE}\n` : `Dry run — nothing will be written.\n`)

if (APPLY && !API_KEY) {
  console.error('CMS_API_KEY is not set. Export it before using --apply.')
  process.exit(2)
}

let written = 0
let failed = 0
for (const p of targets) {
  const fit = fits[p.slug]
  console.log(`── ${p.slug}  (${p.code})  ${p.name}`)
  console.log(`   intro : ${p.intro.slice(0, 96)}…`)
  for (const s of p.steps) console.log(`   step ${s.number}: ${s.title}`)
  // "only if empty" rather than "currently empty": this line prints before the
  // product is fetched, so at this point nobody knows. It claimed the stronger
  // thing and was wrong on the second run, when every fit was already set.
  if (fit) console.log(`   fit   : ${fit}  (written only if the CMS value is empty)`)

  if (!APPLY) {
    console.log('')
    continue
  }

  const found = await api(
    'GET',
    `/api/products?where[slug][equals]=${encodeURIComponent(p.slug)}&limit=1&depth=0`,
  )
  const doc = found.json?.docs?.[0]
  if (!found.ok || !doc) {
    console.error(`   ✗ could not find product "${p.slug}": ${explain(found.json)}\n`)
    failed++
    continue
  }

  // ⚠️ `customisationIntro`, NOT `customisationIntroHtml` — THE FIRST RUN WROTE THE
  // SECOND AND SILENTLY LOST ALL ELEVEN INTROS. `customisationIntroHtml` is a
  // PROJECTED field: publicViewer.ts computes it at read time by running
  // `convertLexicalToHTML` over this column. It exists only on the way out, so a
  // PATCH naming it is an unknown key — Payload answers 200, drops it, and the
  // script prints "✓ written". Measured on 2026-09-04, after a run this script
  // reported as 11/11 successful: 44 steps live, and ten of eleven intros empty.
  //
  // The tell was not in the response, which was clean; it was in reading the field
  // back. Verify a write by reading the value, never by trusting the status code.
  const patch = {
    customisationIntro: lexicalParagraph(p.intro),
    customisationSteps: p.steps.map((s) => ({ number: s.number, title: s.title, body: s.body })),
  }
  // Only fill a fit that is actually empty. Overwriting a value someone set in the
  // CMS from a file they did not know existed is the wrong default, and "fit" is a
  // specification a buyer may quote back.
  if (fit && !String(doc.garmentFit || '').trim()) patch.garmentFit = fit

  const res = await api('PATCH', `/api/products/${doc.id}`, patch)
  if (!res.ok) {
    console.error(`   ✗ ${res.status}: ${explain(res.json)}\n`)
    failed++
    continue
  }

  // Read the document back and compare. `depth=0` returns the stored columns
  // rather than the projected view, so this checks what was actually persisted.
  const after = await api('GET', `/api/products/${doc.id}?depth=0`)
  const stored = after.json || {}
  const storedIntro = stored?.customisationIntro?.root?.children?.[0]?.children?.[0]?.text ?? ''
  const storedSteps = Array.isArray(stored.customisationSteps) ? stored.customisationSteps : []

  const mismatches = []
  if (storedIntro !== p.intro) {
    mismatches.push(
      storedIntro
        ? `intro differs (stored ${storedIntro.length} chars, expected ${p.intro.length})`
        : 'intro did not persist — the field is empty after the write',
    )
  }
  if (storedSteps.length !== p.steps.length) {
    mismatches.push(`expected ${p.steps.length} steps, ${storedSteps.length} stored`)
  }
  if (patch.garmentFit && String(stored.garmentFit || '').trim() !== patch.garmentFit) {
    mismatches.push(`fit did not persist (stored "${String(stored.garmentFit || '')}")`)
  }

  if (mismatches.length > 0) {
    console.error(`   ✗ written but NOT stored: ${mismatches.join('; ')}\n`)
    failed++
  } else {
    console.log(`   ✓ written and verified\n`)
    written++
  }
}

if (APPLY) {
  console.log(`${written} written, ${failed} failed.`)
  if (failed > 0) process.exit(1)
} else {
  console.log(`Dry run complete. Re-run with --apply and CMS_API_KEY set to write.`)
}
