import { expect, test } from '@playwright/test'

// NEGATIVE CONTROL for ci.yml's `e2e` verdict job (2026-09-29). This test fails on
// purpose so one `e2e-shard` machine goes red and `e2e` must go red with it rather than
// being skipped. Reverted in the next commit, before this pull request merges.
test('planted failure: the e2e verdict must turn red', () => {
  expect(1, 'deliberate failure — see the comment above').toBe(2)
})
