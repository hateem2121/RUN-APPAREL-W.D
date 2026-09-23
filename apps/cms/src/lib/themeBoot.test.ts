import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from './themeBoot'

/** Runs the boot script against a fake `localStorage` and `document`, as the browser would. */
function run(stored: string | null | Error) {
  const setAttribute = vi.fn()
  const getItem = vi.fn(() => {
    if (stored instanceof Error) throw stored
    return stored
  })
  new Function('localStorage', 'document', THEME_BOOT_SCRIPT)(
    { getItem },
    { documentElement: { setAttribute } },
  )
  return { setAttribute, getItem }
}

describe('the theme boot script (XS-05)', () => {
  it("remembers the choice under the viewer's own key", () => {
    expect(THEME_STORAGE_KEY).toBe('run-theme')
    // A filesystem read across the app boundary, which a test may do (biome bans IMPORTS).
    const viewer = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'viewer', 'src', 'lib', 'theme.ts'),
      'utf8',
    )
    expect(viewer).toContain(`const STORAGE_KEY = '${THEME_STORAGE_KEY}'`)
  })

  it('applies a stored light or dark choice', () => {
    for (const theme of ['light', 'dark']) {
      const { setAttribute, getItem } = run(theme)
      expect(getItem).toHaveBeenCalledWith('run-theme')
      expect(setAttribute).toHaveBeenCalledWith('data-theme', theme)
    }
  })

  it('ignores anything else, and survives storage that throws', () => {
    expect(run(null).setAttribute).not.toHaveBeenCalled()
    expect(run('chartreuse').setAttribute).not.toHaveBeenCalled()
    expect(() => run(new Error('SecurityError'))).not.toThrow()
  })

  it('never writes, and cannot end its own <script> element', () => {
    // A plain visit must leave nothing on the device (e2e/headers.spec.ts): reading only.
    expect(THEME_BOOT_SCRIPT).not.toMatch(/setItem|removeItem|cookie/)
    expect(THEME_BOOT_SCRIPT).not.toContain('</')
  })
})
