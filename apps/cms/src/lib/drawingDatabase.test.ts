import { describe, expect, it, vi } from 'vitest'
import { keptRenders } from '../../pageCache.mjs'
import { drawingDatabase } from './drawingDatabase'

/**
 * Which copy of the database a query reads (faster-taps plan, Task 7). A drawing the store will keep
 * reads through its OWN session, opened at the main copy when the drawing starts, so the nearby
 * read-only copies serve it but nothing in it can be older than the database at that moment.
 * Everything else (visitors served live, the admin, every save) reads the database as before.
 *
 * WHY ITS OWN SESSION, NOT PAYLOAD'S `readReplicas: 'first-primary'`. Payload 3.92 opens that
 * session once, when it connects (db-d1-sqlite dist/connect.js), and content.ts keeps one Payload
 * per Worker copy: a copy running since before a save would redraw a kept page from a copy of the
 * database that had not caught up, and the store would keep the old page for a day.
 */
function fakeDatabase() {
  let opened = 0
  const sessions: Array<{
    constraint: unknown
    prepare: ReturnType<typeof vi.fn>
    batch: ReturnType<typeof vi.fn>
  }> = []
  const db = {
    prepare: vi.fn((query: string) => ({ on: 'main', query })),
    batch: vi.fn(async (statements: unknown[]) => statements.map(() => ({ on: 'main' }))),
    exec: vi.fn(async () => ({ count: 0, duration: 0 })),
    withSession: vi.fn((constraint?: string) => {
      const id = ++opened
      const session = {
        constraint,
        prepare: vi.fn((query: string) => ({ on: `session ${id}`, query })),
        batch: vi.fn(async (statements: unknown[]) =>
          statements.map(() => ({ on: `session ${id}` })),
        ),
        getBookmark: () => null,
      }
      sessions.push(session)
      return session
    }),
  }
  return { db, sessions }
}

const drawing = <T>(work: () => Promise<T> | T) => keptRenders().run({ spoiled: false }, work)

describe('drawingDatabase', () => {
  it('outside a drawing, every query reads the database as before', async () => {
    const { db } = fakeDatabase()
    const wrapped = drawingDatabase(db as unknown as D1Database)
    expect(wrapped.prepare('select 1')).toEqual({ on: 'main', query: 'select 1' })
    await wrapped.batch([wrapped.prepare('select 2')])
    expect(db.batch).toHaveBeenCalledTimes(1)
    expect(db.withSession).not.toHaveBeenCalled()
  })

  it('a drawing opens one session at the main copy and reads every query through it', async () => {
    const { db, sessions } = fakeDatabase()
    const wrapped = drawingDatabase(db as unknown as D1Database)
    await drawing(async () => {
      expect(wrapped.prepare('select 1')).toEqual({ on: 'session 1', query: 'select 1' })
      await Promise.resolve()
      const statement = wrapped.prepare('select 2')
      await wrapped.batch([statement as unknown as D1PreparedStatement])
    })
    expect(db.withSession).toHaveBeenCalledTimes(1)
    expect(sessions[0]?.constraint).toBe('first-primary')
    expect(sessions[0]?.prepare).toHaveBeenCalledTimes(2)
    expect(sessions[0]?.batch).toHaveBeenCalledTimes(1)
    expect(db.prepare).not.toHaveBeenCalled()
  })

  it('each drawing starts its own session, so a drawing after a save never reads through an older one', async () => {
    const { db } = fakeDatabase()
    const wrapped = drawingDatabase(db as unknown as D1Database)
    const before = await drawing(() => wrapped.prepare('select 1'))
    const after = await drawing(() => wrapped.prepare('select 1'))
    expect(before).toEqual({ on: 'session 1', query: 'select 1' })
    expect(after).toEqual({ on: 'session 2', query: 'select 1' })
  })

  it('two drawings at once never share a session', async () => {
    const { db } = fakeDatabase()
    const wrapped = drawingDatabase(db as unknown as D1Database)
    const draw = (name: string) =>
      drawing(async () => {
        const first = wrapped.prepare(`${name} 1`) as unknown as { on: string }
        await new Promise((resolve) => setTimeout(resolve, 1))
        const second = wrapped.prepare(`${name} 2`) as unknown as { on: string }
        return [first.on, second.on]
      })
    const [a, b] = await Promise.all([draw('a'), draw('b')])
    expect(a?.[0]).toBe(a?.[1])
    expect(b?.[0]).toBe(b?.[1])
    expect(a?.[0]).not.toBe(b?.[0])
  })

  it('a database without sessions (an older local emulator) is read as is', async () => {
    const { db } = fakeDatabase()
    const plain = { ...db, withSession: undefined }
    const wrapped = drawingDatabase(plain as unknown as D1Database)
    expect(await drawing(() => wrapped.prepare('select 1'))).toEqual({
      on: 'main',
      query: 'select 1',
    })
  })

  it('exec and withSession go to the database itself', async () => {
    const { db } = fakeDatabase()
    const wrapped = drawingDatabase(db as unknown as D1Database)
    await drawing(() => wrapped.exec('pragma optimize'))
    expect(db.exec).toHaveBeenCalledWith('pragma optimize')
    wrapped.withSession('first-unconstrained')
    expect(db.withSession).toHaveBeenLastCalledWith('first-unconstrained')
  })
})
