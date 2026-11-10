import { describe, expect, it } from 'vitest'
import { FACTS } from './companyFacts'
import { CONTACT_STEPS } from './contactSteps'

const fact = (prefix: string) => FACTS.find((entry) => entry.label.startsWith(prefix))?.value

describe('CONTACT_STEPS', () => {
  it('takes its numbers from the site’s one list of facts', () => {
    const sample = CONTACT_STEPS[2]?.body ?? ''
    expect(sample).toContain(`${fact('Working days')} working days`)
    expect(sample).toContain(`${fact('Minimum')} pieces per style`)
  })

  it('never prints an empty fact', () => {
    for (const step of CONTACT_STEPS) expect(step.body).not.toMatch(/ {2}|\bfrom {1,}pieces|^ /)
  })

  // The hero already says it; the owner's rule is no duplication on a page.
  it('does not repeat the hero’s reply time', () => {
    for (const step of CONTACT_STEPS) expect(`${step.title} ${step.body}`).not.toMatch(/24 hours/)
  })

  it('numbers the steps in order, in the brand’s section style', () => {
    expect(CONTACT_STEPS.map((step) => step.number)).toEqual(['№01', '№02', '№03'])
  })
})
