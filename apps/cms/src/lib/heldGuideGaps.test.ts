import { describe, expect, it } from 'vitest'
import {
  ALL_INQUIRIES_TOPIC,
  BUYER_QUESTIONS,
  COUNT_DATE,
  COUNT_GAP,
  TOTAL_INQUIRIES,
  WHATSAPP_TOPICS_COUNTED,
} from './buyerQuestions'
import { GUIDES, guideAt } from './guides'

/**
 * THE HELD GUIDES' GAPS (owner, 2026-11-06: "Build them, publish later"). C2, C3 and C7 are built
 * and every approved word is in, but the owner's team still owes facts, and nobody may write them
 * from general knowledge. THIS FILE FAILS ON PURPOSE, ONE ASSERTION PER MISSING FACT, until each
 * arrives; every other test in the suite passes. A branch that fails only here is a branch that is
 * waiting only on the team. When a fact arrives: write it where its marker is, and this test turns
 * green for that fact alone. Merge nothing while one is red.
 *
 * Who sends what: C2's defect examples and C3's methods come from the team (the QC checklist and
 * the production in-charge); C7's WhatsApp topics come from the team and its counts and count date
 * from the main session's own count, which the OWNER must approve before the page goes live.
 *
 * What would have to break for this to fail wrongly: the marker text or a count changing without a
 * fact behind it. The negative control at the end runs both ways on a copy.
 */

const GAP = /\[TEAM:[^\]]*\]|\[COUNT\]/

const wordsOf = (path: string): string[] =>
  guideAt(path).sections.flatMap((section) =>
    section.blocks.flatMap((block) => {
      if (block.kind === 'text') return [block.text]
      if (block.kind === 'list') return [...block.items]
      if (block.kind === 'table') return block.rows.flat()
      return []
    }),
  )

describe('C2 · /guides/aql-inspection · waits for the team’s defect examples', () => {
  const examples = (): string =>
    wordsOf('/guides/aql-inspection').find((item) =>
      item.startsWith('Examples from our QC checklist.'),
    ) ?? ''

  it.each(['critical', 'major', 'minor'])(
    'C2 is missing: examples of %s defects from the QC checklist (team)',
    (kind) => {
      expect(examples(), `C2 still shows the gap marker for ${kind} defect examples`).not.toContain(
        `[TEAM: ${kind} defect examples]`,
      )
    },
  )
})

describe('C3 · /guides/fabric-and-garment-testing · waits for the team’s methods', () => {
  const checks = (): readonly (readonly string[])[] => {
    const table = guideAt('/guides/fabric-and-garment-testing')
      .sections.flatMap((section) => section.blocks)
      .find((block) => block.kind === 'table' && block.caption === 'Our in-house checks')
    if (table?.kind !== 'table') throw new Error('C3 lost its table "Our in-house checks"')
    return table.rows
  }

  it('C3 table still has the six in-house checks it waits on', () => {
    expect(checks().map((row) => row[0])).toEqual([
      'Fabric on arrival: colorfastness',
      'Fabric on arrival: shrinkage',
      'Fabric on arrival: tensile strength',
      'Finished garments, wash test: shrinkage',
      'Finished garments, wash test: colorfastness to washing',
      'Finished garments, wash test: appearance after washing',
    ])
  })

  it.each([
    'Fabric on arrival: colorfastness',
    'Fabric on arrival: shrinkage',
    'Fabric on arrival: tensile strength',
    'Finished garments, wash test: shrinkage',
    'Finished garments, wash test: colorfastness to washing',
    'Finished garments, wash test: appearance after washing',
  ])('C3 is missing: the method for "%s" (team)', (check) => {
    const method = checks().find((row) => row[0] === check)?.[1] ?? ''
    expect(method.trim(), `C3 has no method for "${check}"`).not.toBe('')
    expect(method, `C3 still shows the gap marker for "${check}"`).not.toMatch(GAP)
  })
})

describe('C7 · /guides/what-sportswear-buyers-ask · waits for the count', () => {
  it('C7 is missing: the end date of the counting window (main session, owner approves)', () => {
    expect(COUNT_DATE, 'C7 has no count date').not.toBeNull()
    expect(wordsOf('/guides/what-sportswear-buyers-ask').join('\n')).not.toContain(
      '[TEAM: count date]',
    )
  })

  it('C7 is missing: the WhatsApp topics (team)', () => {
    expect(WHATSAPP_TOPICS_COUNTED, 'C7 counts do not yet include WhatsApp').toBe(true)
  })

  it.each(BUYER_QUESTIONS.map((row) => row.topic))(
    'C7 is missing: the count for "%s" (main session, owner approves)',
    (topic) => {
      const row = BUYER_QUESTIONS.find((entry) => entry.topic === topic)
      expect(row?.count, `C7 has no count for "${topic}"`).not.toBeNull()
    },
  )

  it(`C7 is missing: the count for "${ALL_INQUIRIES_TOPIC}" (main session, owner approves)`, () => {
    expect(TOTAL_INQUIRIES, 'C7 has no total').not.toBeNull()
  })
})

describe('no gap marker is left anywhere in the held guides', () => {
  const HELD = [
    '/guides/aql-inspection',
    '/guides/fabric-and-garment-testing',
    '/guides/what-sportswear-buyers-ask',
  ]

  it('the three guides are in GUIDES, and the checker sees a marker where one is planted', () => {
    for (const path of HELD) expect(GUIDES.map((guide) => guide.path)).toContain(path)
    // NEGATIVE CONTROL, both ways: a planted marker is found, and plain words are not.
    expect(GAP.test('Critical: [TEAM: critical defect examples]')).toBe(true)
    expect(GAP.test(`Minimum order ${COUNT_GAP}`)).toBe(true)
    expect(GAP.test('Critical: a missing label')).toBe(false)
  })

  it.each(HELD)('%s shows no [TEAM: …] or [COUNT] marker', (path) => {
    const left = wordsOf(path).filter((words) => GAP.test(words))
    expect(left).toEqual([])
  })
})
