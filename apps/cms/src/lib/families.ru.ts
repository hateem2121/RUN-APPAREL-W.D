import type { Family } from './families'

/**
 * Russian twin of `families.ts`: same shape (one entry per family, same field names); translate
 * prose only.
 *
 * ⚠️ A FAMILY'S ENGLISH `name` IS THE PRODUCTS COLLECTION'S `category`, MATCHED BY STRING EQUALITY,
 * and its `slug` is a public address, so neither changes; these are the words shown in their place.
 * `FAMILY_NAMES_RU` is keyed by that English `name`, `FAMILY_TEXT_RU` and `FAMILY_PHOTO_ALT_RU` by
 * `slug`, with `Family`'s own field names.
 */

export const FAMILY_NAMES_RU: Readonly<Record<string, string>> = {
  Sportswear: 'Спортивная одежда',
  'Teamwear & Uniforms': 'Командная форма и униформа',
  'Casual Wear': 'Повседневная одежда',
  Outerwear: 'Верхняя одежда',
  'Sports Accessories': 'Спортивные аксессуары',
}

/** The home page card's line and the words over its list, by family slug. */
export const FAMILY_TEXT_RU: Readonly<
  Record<string, { readonly body: Family['body']; readonly listLabel: string }>
> = {
  sportswear: {
    body: 'Спортивная экипировка для тренировочных нагрузок и дней соревнований.',
    listLabel: 'Назначение',
  },
  'teamwear-uniforms': {
    body: 'Форма для команд, униформа для персонала и комплекты в едином стиле — большими партиями.',
    listLabel: 'Назначение',
  },
  'casual-wear': {
    body: 'Вещи на каждый день — по тому же стандарту пошива.',
    listLabel: 'В ассортименте',
  },
  outerwear: {
    body: 'Слои для любой погоды, рассчитанные на движение, а не только на защиту.',
    listLabel: 'В ассортименте',
  },
  'sports-accessories': {
    body: 'Детали, которые завершают комплект.',
    listLabel: 'В ассортименте',
  },
}

/** `FAMILY_PHOTOS`' alt text, by family slug. */
export const FAMILY_PHOTO_ALT_RU: Readonly<Record<string, string>> = {
  'sports-accessories': 'Синий сетчатый рюкзак RUN, рядом с ним чёрный и красный.',
}
