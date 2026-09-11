import { describe, expect, it } from 'vitest'
import { EAGER_POSTERS, posterLoading } from './posterLoading'

describe('posterLoading (IM-05, PF-20)', () => {
  it('loads the first card eagerly, at high priority', () => {
    expect(posterLoading(0)).toEqual({ loading: 'eager', fetchPriority: 'high' })
  })

  it('loads the rest of the first row eagerly, without competing for priority', () => {
    for (let index = 1; index < EAGER_POSTERS; index++) {
      expect(posterLoading(index), `card ${index + 1}`).toEqual({ loading: 'eager' })
    }
  })

  it('leaves every later card lazy', () => {
    for (let index = EAGER_POSTERS; index < 80; index++) {
      expect(posterLoading(index), `card ${index + 1}`).toEqual({ loading: 'lazy' })
    }
  })

  it('asks for high priority exactly once in a whole gallery', () => {
    const high = Array.from({ length: 80 }, (_, index) => posterLoading(index)).filter(
      (poster) => poster.fetchPriority === 'high',
    )
    expect(high).toHaveLength(1)
  })
})
