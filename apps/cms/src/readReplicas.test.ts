import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The database's nearby read-only copies are reached ONLY through lib/drawingDatabase.ts (faster-taps
 * plan, Task 7), never through Payload's own switch, which opens one session per Worker copy and
 * could let the store keep a page from before a save for a day (drawingDatabase.test.ts says how).
 */
const config = readFileSync(new URL('./payload.config.ts', import.meta.url), 'utf8')

describe('payload.config.ts and the database copies', () => {
  it('hands the D1 adapter the drawing-aware database', () => {
    expect(config).toMatch(/binding:\s*drawingDatabase\(/)
  })

  it("never switches on Payload's own read-replica option", () => {
    expect(config).not.toMatch(/readReplicas\s*:/)
  })
})
