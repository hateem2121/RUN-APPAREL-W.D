/**
 * Russian twin of the words in `factoryPhotos.ts`: every `alt` and `caption` of `FACTORY_PHOTOS`
 * and `WHOLE_PHOTOS`, keyed by the photo's `slug`, field names as in English (`caption` only where
 * the English has one; no caption is drawn since 2026-10-05, but the words stay, as in English).
 * `ABOUT_PORTRAITS` carries no words (years and tones only), so it has no entry here. The four
 * `whole-*` buyer-page photos reuse their cut twin's Russian `alt`, as the English does (`altOf`).
 * The heroes' `alt`s, which have no slug, follow as their own constants.
 *
 * The two archive portraits keep the names in Latin letters, as the English page prints them,
 * because a test holds each name to the timeline's text; a Cyrillic spelling is the owner's call.
 */

export type FactoryPhotoTextRu = { alt: string; caption?: string }

const SCREEN_PRINTING_ALT =
  'Печатник протягивает краску ракелем по трафаретной сетке, рядом банки с цветной краской.'
const INSPECTION_ALT = 'Контролёр держит зелёную куртку на молнии под линейным светильником.'
const STITCHING_ALT =
  'Ряды швейных машин, операторы в красных рубашках, в проходе красные ящики с кроеными деталями.'
const TAGGING_ALT = 'Руки прикрепляют бирку к тёмно-синим брюкам пистолетом для бирок.'
const EXTERIOR_ALT =
  'Краснокирпичное здание фабрики с широкой лестницей перед входом, облачное небо.'

export const FACTORY_PHOTO_TEXT_RU: Readonly<Record<string, FactoryPhotoTextRu>> = {
  // FACTORY_PHOTOS, in its order.
  exterior: {
    alt: EXTERIOR_ALT,
    caption: 'Здание DURUS INDUSTRIES в Сиалкоте, где RUN APPAREL ведёт производство',
  },
  'solar-roof': {
    alt: 'Производственный комплекс сверху: крыша покрыта солнечными панелями.',
    caption: 'Солнечные панели по всей крыше',
  },
  showroom: {
    alt: 'Манекены в чёрной и синей компрессионной одежде перед бетонной стеной с логотипом RUN APPAREL.',
    caption: 'Наш шоурум',
  },
  'screen-printing': { alt: SCREEN_PRINTING_ALT, caption: 'Шелкография' },
  inspection: { alt: INSPECTION_ALT, caption: 'Контроль под лампой' },
  stitching: { alt: STITCHING_ALT, caption: 'Швейный цех' },
  lab: {
    alt: 'Два лаборанта в халатах за рабочими столами, рядом световая кабина для оценки цвета и сушильный шкаф.',
    caption: 'Испытательная лаборатория',
  },
  tagging: { alt: TAGGING_ALT, caption: 'Навешивание бирок' },
  'final-check': {
    alt: 'Зелёная спортивная куртка на освещённом столе рядом с листами контроля, за ней висят другие куртки.',
    caption: 'Финальная проверка',
  },
  packing: {
    alt: 'Рука в перчатке вкладывает чёрную футболку с этикеткой RUN в прозрачный пакет.',
    caption: 'Упаковка',
  },
  // WHOLE_PHOTOS, in its order.
  'portrait-ghafuree': { alt: 'Чёрно-белый портрет: Allah Ditta Ghafuree.' },
  'portrait-sandal': { alt: 'Чёрно-белый портрет: M. Iqbal Sandal.' },
  'whole-screen-printing': { alt: SCREEN_PRINTING_ALT },
  'whole-inspection': { alt: INSPECTION_ALT },
  'whole-stitching': { alt: STITCHING_ALT },
  'whole-tagging': { alt: TAGGING_ALT },
  'whole-ball-stitching': {
    alt: 'Ряды работников вручную сшивают футбольные мячи за белыми столами в длинном светлом цехе.',
  },
  'whole-yarn-cones': {
    alt: 'Бобина штапельной хлопковой пряжи рядом с бобиной комплексной полиэфирной нити, на каждой указан номер.',
  },
  'whole-taped-seams': {
    alt: 'Изнанка развёрнутой куртки: с одной стороны швы только прострочены, с другой закрыты герметизирующей лентой.',
  },
  'whole-neck-labels': {
    alt: 'Три этикетки RUN APPAREL рядом: тканая, печатная атласная и бесшовная, напечатанная внутри горловины.',
  },
}

/** `HERO_PHOTO.alt`: the home hero, the stitching floor. */
export const HERO_PHOTO_ALT_RU =
  'Ряды швейных машин в цехе пошива, операторы в красных рубашках за работой, в проходе красные ящики с кроеными деталями.'

/** `CONTACT_HERO_PHOTO.alt`: the showroom. */
export const CONTACT_HERO_PHOTO_ALT_RU =
  'Шоурум RUN APPAREL: манекены в чёрной и синей компрессионной одежде и стойки с одеждой перед бетонной стеной с логотипом RUN APPAREL.'

/** `ABOUT_HERO_PHOTO.alt`: the building, the same words as `exterior`'s, as in English. */
export const ABOUT_HERO_PHOTO_ALT_RU = EXTERIOR_ALT

/**
 * A photo with its Russian words, for a Russian page (Russian section, 2026-11-15): the same
 * picture, files and sizes, only `alt` (and `caption`, where it has one) replaced. A photo with no
 * Russian entry throws, so a new English photo cannot reach a Russian page with English alt text.
 */
export function ruPhoto<T extends { slug: string; alt: string; caption?: string }>(photo: T): T {
  const words = FACTORY_PHOTO_TEXT_RU[photo.slug]
  if (!words)
    throw new Error(`factoryPhotos.ru.ts has no Russian words for the photo ${photo.slug}`)
  return { ...photo, ...words }
}
