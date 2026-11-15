/**
 * Russian twin of `pageDescriptions.ts`: same shape, the same names with `_RU`; translate prose
 * only.
 *
 * Each description stays within `MAX_PAGE_DESCRIPTION` (160; the home one is exactly 160, which is
 * why it says «шт./модель») and the home title within the 60 characters a result shows whole. `WHAT_WE_ARE` returns English words, so its Russian is written
 * here; the home description's "50" is typed in the English too, and is kept as it is there.
 */

export const HOME_TITLE_RU = 'RUN APPAREL | Производитель спортивной одежды под ваш бренд'

export const HOME_DESCRIPTION_RU =
  'RUN APPAREL — производитель спортивной одежды под ваш бренд в Пакистане: командная форма, униформа, повседневная и верхняя одежда, аксессуары. От 50 шт./модель.'

/** `WHAT_WE_ARE`, in the case the sentence needs. */
const WHAT_WE_ARE_RU = 'производителем спортивной одежды под вашим брендом в Сиалкоте, Пакистан'

export const CONTACT_DESCRIPTION_RU = `Свяжитесь с RUN APPAREL, ${WHAT_WE_ARE_RU}. Мы отвечаем в течение 24 часов.`

export const PRODUCTS_DESCRIPTION_RU =
  'Вся одежда RUN APPAREL в 3D. Поверните изделие, посмотрите, как оно сшито, и проверьте принт до отправки образца.'
