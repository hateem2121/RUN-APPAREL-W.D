import { describe, expect, it } from 'vitest'
import { FOOT_BAND, followFootEdge } from './footEdge'

/** A stand-in element: the unit suite runs in Node, and only `dataset` is touched. */
const box = () => ({ dataset: {} }) as unknown as HTMLElement

/** A stand-in IntersectionObserver that records what it watches and lets the test fire it. */
function fakeObserver() {
  const watched: Element[] = []
  let fire: IntersectionObserverCallback = () => {}
  let options: IntersectionObserverInit | undefined
  let disconnected = false
  return {
    watched,
    get options() {
      return options
    },
    get disconnected() {
      return disconnected
    },
    fire: (target: Element, isIntersecting: boolean) =>
      fire([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver),
    observe: (callback: IntersectionObserverCallback, init: IntersectionObserverInit) => {
      fire = callback
      options = init
      return {
        observe: (element: Element) => watched.push(element),
        disconnect: () => {
          disconnected = true
        },
      }
    },
  }
}

describe('followFootEdge (iPhone Safari keeps the last sticky box at the foot while it is visible)', () => {
  it('watches the last 1% of the screen', () => {
    const fake = fakeObserver()
    const element = box()
    followFootEdge([element], fake.observe)
    expect(fake.options).toEqual({ rootMargin: FOOT_BAND })
    expect(FOOT_BAND).toBe('-99% 0px 0px 0px')
    expect(fake.watched).toEqual([element])
  })

  it('marks a box on while it reaches the foot and off once it leaves', () => {
    const fake = fakeObserver()
    const element = box()
    followFootEdge([element], fake.observe)
    fake.fire(element, true)
    expect(element.dataset.edge).toBe('on')
    fake.fire(element, false)
    expect(element.dataset.edge).toBe('off')
  })

  it('stopping disconnects and clears every mark, so no box stays hidden', () => {
    const fake = fakeObserver()
    const boxes = [box(), box()]
    const stop = followFootEdge(boxes, fake.observe)
    fake.fire(boxes[0] as HTMLElement, false)
    fake.fire(boxes[1] as HTMLElement, true)
    stop()
    expect(fake.disconnected).toBe(true)
    for (const element of boxes) expect(element.dataset.edge).toBeUndefined()
  })
})
