import { describe, expect, it } from 'vitest'
import { FACTS } from './companyFacts'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { ORDER_PHASES } from './orderProcess'

/**
 * The home page's "How an order works" timeline (owner, 2026-09-29).
 *
 * ⚠️ EVERY SENTENCE HERE IS A PROMISE TO A BUYER, so the test pins what the owner confirmed
 * and refuses what they did not. Asked "which are true for EVERY order?", the owner ticked
 * "nothing goes to bulk unsigned" and "the quote costs nothing", chose "the sample fee is
 * credited back", and did NOT tick "3D before the sample" or "photo updates in
 * production" — so those two may not appear, however good they would sound.
 */
const steps = ORDER_PHASES.flatMap((phase) => phase.steps)
const text = JSON.stringify(ORDER_PHASES)
const fact = (prefix: string) => FACTS.find((f) => f.label.startsWith(prefix))?.value

describe('the order timeline', () => {
  it('has four phases and eight steps, each done by You or We', () => {
    expect(ORDER_PHASES.map((phase) => phase.name)).toEqual(['Talk', 'Develop', 'Make', 'Deliver'])
    expect(steps).toHaveLength(8)
    for (const step of steps) expect(['You', 'We']).toContain(step.actor)
  })

  it('quotes the home page numbers rather than a second copy of them', () => {
    for (const prefix of ['Working days', 'Minimum']) {
      const value = fact(prefix)
      expect(value, prefix).toBeTruthy()
      expect(text).toContain(value)
    }
  })

  /*
   * The owner's review of the wording, 2026-09-29: "customers can be new and from anywhere",
   * "days may vary order to order", and "Pakistan" rather than "Sialkot" here.
   */
  it('names no shipping regions, no shipment window and no city', () => {
    expect(text).not.toMatch(/Europe|America|Oceania|21\s*[–-]\s*45|Sialkot/)
  })

  it('never promises what the owner did not confirm for every order', () => {
    expect(text).not.toMatch(/\b3D\b|photo update|progress photo/i)
  })

  it('states the three commitments the owner confirmed', () => {
    expect(text).toMatch(/nothing goes into bulk until you sign off/i)
    expect(text).toMatch(/quote is free/i)
    expect(text).toMatch(/credited back/i)
  })

  // The picture moved from the phase to the step on 2026-10-02 (VA-29): eight steps, eight photos.
  // `orderTimelinePhotos.test.ts` pins which, and refuses a repeat.
  it('shows a factory photo that exists for every step', () => {
    const slugs = new Set(FACTORY_PHOTOS.map((photo) => photo.slug))
    for (const step of steps) expect(slugs.has(step.photo), step.photo).toBe(true)
  })
})
