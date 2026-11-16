import {
  CHROME_RU,
  FAMILY_RU,
  GARMENT_TYPE_RU,
  PRODUCT_LINE_LABELS_RU,
  ruFooter,
  specGroupsRu,
} from '@run-apparel/shared'
import type { RussianPack } from './locale'
import { WORDS_RU } from './words.ru'

/**
 * THE RUSSIAN GARMENT PAGE'S WORDS, AS ONE CHUNK (2026-11-16). `main.tsx` imports this file
 * dynamically, and only on `/ru/products/…`, so an English page's script holds none of it
 * (`lib/locale.ts` says why, with the measurement).
 */
export const RU_PACK: RussianPack = {
  words: WORDS_RU,
  chrome: CHROME_RU,
  footerLine: ruFooter,
  familyName: (english) => FAMILY_RU[english] ?? english,
  garmentType: (english) => GARMENT_TYPE_RU[english] ?? english,
  productLineLabel: (path, english) => PRODUCT_LINE_LABELS_RU[path] ?? english,
  specGroups: specGroupsRu,
}
