import type { Guide } from './guides'
import { LIBRARY_GUIDES_RU_A } from './guideLibrary.ru.a'
import { LIBRARY_GUIDES_RU_B } from './guideLibrary.ru.b'

/**
 * The Russian twin of `LIBRARY_GUIDES` (Russian section, 2026-11-15), in the English order. Written
 * in two halves at once (guides 1–9 and 10–19); `ruParity.test.ts` holds the whole list to the
 * English one, path by path.
 */
export const LIBRARY_GUIDES_RU: readonly Guide[] = [...LIBRARY_GUIDES_RU_A, ...LIBRARY_GUIDES_RU_B]
