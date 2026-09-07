import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publishCursor, resetCursorBus, subscribeToCursor } from './cursorBus'

describe('cursorBus', () => {
  beforeEach(resetCursorBus)

  it('delivers every publish to every subscriber, and stops after unsubscribe', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = subscribeToCursor(a)
    subscribeToCursor(b)
    publishCursor({ x: 1, y: 2, placed: true, now: 10 })
    stopA()
    publishCursor({ x: 3, y: 4, placed: true, now: 20 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenLastCalledWith({ x: 3, y: 4, placed: true, now: 20 })
  })

  it('replays the last point to a late subscriber, so a footer mounting mid-move is lit at once', () => {
    publishCursor({ x: 5, y: 6, placed: true, now: 30 })
    const late = vi.fn()
    subscribeToCursor(late)
    expect(late).toHaveBeenCalledWith({ x: 5, y: 6, placed: true, now: 30 })
  })
})
