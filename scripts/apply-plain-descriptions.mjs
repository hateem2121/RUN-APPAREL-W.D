#!/usr/bin/env node
/**
 * CT-04 — the garment short descriptions, rewritten in plain words (reading grade 11 or
 * below), as the owner approved on 2026-09-25 from a sample (the leather jacket, grade 16.5 ->
 * 8.4). Twelve of the sixteen live descriptions read above grade 11 on the products page; every
 * fact is kept, and the rewrites also store American spelling ("minimises", "stylised",
 * "panelling", "coloured" were live). Checked by apps/cms/src/plainDescriptions.test.ts.
 *
 * ⚠️ THE OWNER RUNS --apply, WITH THEIR OWN KEY, IN THEIR OWN TERMINAL. Claude never sees it.
 * Every write is read back (`?depth=0`): a 200 from Payload means accepted, not stored
 * (apps/cms/CLAUDE.md). A description is written only when the stored text is still the
 * `before` below, or that text in American spelling (scripts/apply-american-spelling.mjs may
 * have run first); anything else was edited since and is left alone.
 *
 * Usage:
 *   node scripts/apply-plain-descriptions.mjs              # dry run, no key needed
 *   CMS_API_KEY=… node scripts/apply-plain-descriptions.mjs --apply   (export it first; see RUNBOOK)
 */
import { toAmerican } from './copy-rules.mjs'
import { realpathSync } from 'node:fs'

/** slug -> the live text on 2026-09-25, and the approved rewrite. */
export const PLAIN_DESCRIPTIONS = {
  'r-atj': {
    before:
      'A men’s utility jacket in 1.2 mm cowhide leather with a thermal-regulating inner lining and a multi-point adjustable storm hood. Secure waterproof utility zippers and adjustable velcro cuffs seal it up, while hydrophobic moisture management and reinforced double-needle stitching hold performance. 3D articulated shoulder panels give a durable all-season outer shield for urban commuting, outdoor training and transitional weather.',
    after:
      'A men’s utility jacket in 1.2 mm cowhide leather, with a lining that helps keep an even temperature and a storm hood you can adjust at several points. Waterproof zips and adjustable hook-and-loop cuffs seal it up. The finish sheds rain and moves sweat away, and double-needle stitching keeps the seams strong. Shaped shoulder panels move with you. It is a tough outer layer for every season, made for city commutes, outdoor training and changing weather.',
  },
  'r-css': {
    before:
      'A soccer jersey with a distinctive tonal, abstract geometric pattern across the body and sleeves, creating a subtle but dynamic visual texture. It carries a classic fold-over polo collar and a simple V-neck opening, pairing a traditional silhouette with contemporary construction. Diagonal solid-coloured panels across the chest and shoulders mark out functional zones within the athletic cut.',
    after:
      'A soccer jersey with a subtle, tonal geometric pattern across the body and sleeves. It has a classic fold-over polo collar and a simple V-neck opening, so a traditional shape meets modern construction. Solid-colored panels run at an angle across the chest and shoulders and mark out the working zones of the athletic cut.',
  },
  'r-atw': {
    before:
      'An ultralight wind-resistant nylon taffeta shell with a ventilated back yoke and breathable mesh lining, taking a full sublimation print. Elasticated cuffs and a drop-tail hem hold the streamlined aero fit, and a DWR finish adds water repellency. Reinforced articulated seams and an ergonomic sleeve design make it packable all-weather protection for road cycling, gravel and outdoor endurance training.',
    after:
      'A very light, wind-resistant nylon taffeta shell that takes a full sublimation print. A vented back yoke and a breathable mesh lining let heat out. Elastic cuffs and a longer back hem hold the close, aero fit, and a DWR finish repels water. Shaped seams and sleeves let you move freely, and it packs small. Made for road cycling, gravel and long outdoor training in any weather.',
  },
  'r-asb': {
    before:
      'Engineered with high-support compression and breathable, moisture-wicking spacer knit, this bra minimises bounce while maximising comfort. The sleek strappy design holds through HIIT sessions and yoga flows alike, giving support without restriction.',
    after:
      'A high-support compression bra in a breathable spacer knit that pulls sweat away. It cuts down bounce and stays comfortable. The sleek strappy design holds through HIIT sessions and yoga flows alike, and supports you without holding you back.',
  },
  'r-aj': {
    before:
      'A highly stylised, fitted women’s American football jersey defined by its contoured, female-specific cut. The body carries an aggressive distressed brushstroke graphic, and the design incorporates a V-neck with contrasting ribbed trim. Built in a double interlock poly-stretch with both digital sublimation and silicone printing.',
    after:
      'A fitted women’s American football jersey with a shaped cut made for a woman’s body. A bold, distressed brushstroke graphic covers the body, and the V-neck has contrasting ribbed trim. It is made in a double interlock poly-stretch fabric, with both digital sublimation and silicone printing.',
  },
  'r-gtd': {
    before:
      'A well-engineered piece of athletic wear built to meet the demands of tennis performance while keeping a stylish look. Every seam and panel is thoughtfully placed, supporting athletic movement and a flattering silhouette at the same time. It blends high-tech function with contemporary design for competitive play and active lifestyles alike.',
    after:
      'A tennis dress made to handle the demands of the game and still look sharp. Every seam and panel is placed with care, so it supports your movement and flatters your shape at the same time. It brings high-tech function and modern design together, for match play and an active life off the court.',
  },
  rxps: {
    before:
      'Women’s performance cycling skinsuit in a four-way stretch nylon knit. Pro compression spandex, a multi-density chamois pad and breathable mesh bib straps sit under a full digital print. Silicone leg grippers, flatlock stitching and ergonomic panelling hold an aero race position comfortably over long distances.',
    after:
      'A women’s performance cycling skinsuit in a nylon knit that stretches four ways. Pro compression spandex, a chamois pad in several densities and breathable mesh bib straps all sit under a full digital print. Silicone leg grippers, flatlock stitching and shaped panels hold you comfortably in an aero race position over long distances.',
  },
  'r-au': {
    before:
      'A men’s two-piece American football uniform: a contoured jersey over a padded trouser. The jersey pairs a contrasting chevron yoke with distressed brushstroke numbering, a player-name panel and a ribbed V-neck trim, while the trouser carries EVA foam padding at hip, thigh and knee above a RUN-branded elastic waistband. Built in a double mesh interlock with silicone printing, so the graphics hold their edge through contact.',
    after:
      'A men’s two-piece American football uniform: a shaped jersey over padded pants. The jersey has a contrasting chevron yoke, distressed brushstroke numbers, a panel for the player’s name and a ribbed V-neck trim. The pants have EVA foam pads at the hip, thigh and knee, above an elastic waistband with the RUN name. It is made in a double mesh interlock with silicone printing, so the graphics keep sharp edges through contact.',
  },
  'r-mm': {
    before:
      'A performance tennis dress built directly from the geometry of the old mine cut diamond. It is constructed from 22 cut fabric panels, each mapped to echo a single facet, so the angular panelling creates a sense of movement and refraction across the body as the player moves.',
    after:
      'A performance tennis dress built on the shape of the old mine cut diamond. It is made from 22 cut fabric panels, each shaped like one facet of the stone. As the player moves, the angled panels seem to shift and catch the light across the body.',
  },
  'r-xmp': {
    before:
      'Men’s performance cycling bib shorts for road, MTB and endurance riding. Pro compression spandex carries a multi-density chamois pad and breathable mesh bib straps, and the whole garment takes a full sublimation print. Silicone leg grippers, flatlock stitching and an ergonomic panel design keep everything where it should be over long distances.',
    after:
      'Men’s performance cycling bib shorts for road, MTB and endurance riding. Pro compression spandex holds a chamois pad in several densities and breathable mesh bib straps, and the whole garment takes a full sublimation print. Silicone leg grippers, flatlock stitching and shaped panels keep everything in place over long distances.',
  },
  'r-wzu': {
    before:
      'A women’s bra zip-up vest combining the security of a high-performance sports bra with the coverage of a crop vest. Breathable, flexible eco-power mesh keeps you cool through a workout or a day out, and a reversible zip adds a second way to wear it.',
    after:
      'A women’s zip-up vest that gives the support of a high-performance sports bra with the coverage of a crop vest. Breathable, flexible eco-power mesh keeps you cool through a workout or a day out. A reversible zip gives you a second way to wear it.',
  },
  'r-et': {
    before:
      'A men’s tech tracksuit pairing a pullover hood with a tapered pant. Contrast raglan sleeves and an oversized tonal logo across the chest give it shape, while ribbed cuffs and an elasticated waist keep it easy to move in and out of. Quick-dry moisture management and wrinkle-resistant fabric make it a complete training set for team travel, warm-ups and athletic lifestyle.',
    after:
      'A men’s tech tracksuit: a pullover hoodie with tapered pants. Contrast raglan sleeves and a large tonal logo across the chest give it shape. Ribbed cuffs and an elastic waist make it easy to move in and to pull on and off. The fabric dries fast, moves sweat away and resists wrinkles, so it is a complete training set for team travel, warm-ups and everyday active wear.',
  },
}

/**
 * Pure: what to do with one stored description.
 * @param {string} stored
 * @param {{ before: string, after: string }} entry
 * @returns {'write' | 'already' | 'edited-since'}
 */
export function plannedChange(stored, entry) {
  const text = String(stored ?? '').trim()
  if (text === entry.after) return 'already'
  if (text === entry.before || text === toAmerican(entry.before)) return 'write'
  return 'edited-since'
}

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
const API_KEY = process.env.CMS_API_KEY || ''
const APPLY = process.argv.includes('--apply')

async function api(method, pathname, body) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `users API-Key ${API_KEY}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { ok: response.ok, status: response.status, json }
}

async function main() {
  if (!API_BASE.startsWith('https://')) {
    console.error(`CMS_API_BASE must be https:// — got "${API_BASE}"`)
    process.exit(2)
  }
  if (APPLY && !API_KEY) {
    console.error('CMS_API_KEY is not set. Export it before using --apply.')
    process.exit(2)
  }
  console.log(APPLY ? `APPLYING to ${API_BASE}\n` : 'Dry run — nothing will be written.\n')
  const tally = { write: 0, already: 0, 'edited-since': 0, written: 0, failed: 0 }
  for (const [slug, entry] of Object.entries(PLAIN_DESCRIPTIONS)) {
    let stored
    let id
    if (APPLY) {
      const found = await api(
        'GET',
        `/api/products?where%5Bslug%5D%5Bequals%5D=${encodeURIComponent(slug)}&limit=1&depth=0`,
      )
      const doc = found.json?.docs?.[0]
      if (!found.ok || !doc) {
        console.error(`✗ ${slug}: could not read the stored product (${found.status})`)
        tally.failed++
        continue
      }
      stored = doc.shortDescription
      id = doc.id
    } else {
      const live = await fetch(`${API_BASE}/api/public/viewer/${slug}`, {
        headers: { accept: 'application/json' },
      })
      stored = live.ok ? ((await live.json()).product?.shortDescription ?? '') : ''
    }
    const plan = plannedChange(stored, entry)
    tally[plan]++
    if (plan === 'already') {
      console.log(`= ${slug}: already the plain version`)
      continue
    }
    if (plan === 'edited-since') {
      console.log(`! ${slug}: the stored text was edited since 2026-09-25 — left alone`)
      continue
    }
    console.log(`── ${slug}\n   before: ${entry.before}\n   after : ${entry.after}`)
    if (!APPLY) continue
    const saved = await api('PATCH', `/api/products/${id}`, { shortDescription: entry.after })
    const back = await api('GET', `/api/products/${id}?depth=0`)
    if (!saved.ok || String(back.json?.shortDescription ?? '') !== entry.after) {
      console.error(`   ✗ not stored (${saved.status})`)
      tally.failed++
      continue
    }
    console.log('   ✓ written and read back')
    tally.written++
  }
  console.log(
    `\n${tally.write} to write, ${tally.written} written, ${tally.already} already plain, ` +
      `${tally['edited-since']} edited since (left alone), ${tally.failed} failed.`,
  )
  if (tally.failed > 0) process.exit(1)
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(
      `apply-plain-descriptions: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
