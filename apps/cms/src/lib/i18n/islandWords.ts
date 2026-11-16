/**
 * THE FEW RUSSIAN WORDS THE HEADER'S CLIENT ISLANDS NEED (Russian section, 2026-11-15).
 *
 * ⚠️ NavLinks and ThemeSwitch TAKE NO PROPS, ON PURPOSE (publicSite.test.ts): Next copies every
 * prop of a client component into the page's HTML, which is how the settings global reached the
 * source on 2026-09-05. So they read the page's own address (`isRussianPath`) and pick their words
 * here. Kept to these few strings because this file ships in every page's script; the rest of the
 * Russian chrome stays on the server (chrome.ts, which takes its Russian menu links from here).
 */

export {
  isRussianPath,
  RU_MENU_LINKS,
  RU_NAV_LINKS,
  RU_THEME_NAMES,
  RU_THEME_WORDS,
} from '@run-apparel/shared'

/** The factory page's photo viewer (FactoryPhotoViewer, a client island). */
export const RU_PHOTO_VIEWER = {
  close: 'Закрыть фото',
  photos: 'Фото производства',
  previous: 'Предыдущее фото',
  next: 'Следующее фото',
}

/** The home page's live garment and its showcase (ProofShowcase, LiveGarment: client islands). */
export const RU_PROOF_WORDS = {
  placeholder: '[ 3D-модель ]',
  reference: 'Эта модель',
  colours: 'Расцветки',
  turn: 'Повернуть',
  dragToTurn: 'Потяните, чтобы повернуть',
  turnIn3d: 'Повернуть в 3D',
  modelAlt: (label: string) => `${label}: 3D-модель, которую можно повернуть`,
}

/** The glossary's search box (GlossaryFilter, a client island). «из 71 термина», «из 72 терминов». */
export const RU_GLOSSARY_FILTER = {
  label: 'Найти термин',
  count: (shown: number, total: number) =>
    `${shown} из ${total} ${new Intl.PluralRules('ru').select(total) === 'one' ? 'термина' : 'терминов'}`,
}

/**
 * The product card's colour buttons (CardGallery, a client island). Each label carries the
 * garment's or colour's own name, which stays as the CMS has it.
 */
export const RU_CARD_WORDS = {
  previous: (product: string) => `Предыдущая расцветка: ${product}`,
  next: (product: string) => `Следующая расцветка: ${product}`,
  colours: (product: string) => `Расцветки ${product}`,
  show: (colour: string) => `Показать расцветку ${colour}`,
}
