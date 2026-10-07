import { describe, expect, it } from 'vitest'
import {
  CASE_STUDIES_HUB,
  CASE_STUDIES_PATH,
  CASE_STUDY_FACTS,
  CASE_STUDY_STORY,
  caseStudyPath,
} from './caseStudies'

/** The case-study hub's words and a case study's fixed labels (PLAN.md D9, E7). */
describe('the case-study addresses', () => {
  it('put a case study one folder under /case-studies', () => {
    expect(CASE_STUDIES_PATH).toBe('/case-studies')
    expect(caseStudyPath('team-kit')).toBe('/case-studies/team-kit')
  })
})

describe('the hub words (D9)', () => {
  it('are the plan’s headline and its closing question', () => {
    expect(CASE_STUDIES_HUB.heading).toBe('Proof,')
    expect(CASE_STUDIES_HUB.headingAccent).toBe('not promises.')
    expect(CASE_STUDIES_HUB.firstStory).toBe('Want to be our first story?')
  })

  it('list what each case study will include: the template’s own parts, in its order', () => {
    // The hub promises exactly what a case study page shows, nothing more (E7's fields).
    expect(CASE_STUDIES_HUB.includes).toEqual([
      ...CASE_STUDY_FACTS.map((fact) => fact.label),
      ...CASE_STUDY_STORY.map((part) => part.label),
      'The client’s words, with their permission',
    ])
  })

  it('describe the page within the 160 characters a search result shows', () => {
    expect(CASE_STUDIES_HUB.description.length).toBeLessThanOrEqual(160)
  })
})

describe('a case study’s parts', () => {
  it('name the four facts and the three story parts after the CMS fields that hold them', () => {
    expect(CASE_STUDY_FACTS.map((fact) => fact.field)).toEqual([
      'whatWasMade',
      'clientDescription',
      'quantity',
      'timeline',
    ])
    expect(CASE_STUDY_STORY.map((part) => part.field)).toEqual(['challenge', 'whatWeDid', 'result'])
  })
})
