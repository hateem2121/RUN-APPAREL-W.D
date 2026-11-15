/**
 * Russian twin of `sports.ts`: same shape (one entry per sport, in its order); translate prose only.
 *
 * Keyed by each sport's English `label` in `TEAMWEAR_SPORTS`. The `key` (a radio's value) and the
 * `words` (matched against the English garment type in the CMS) stay as they are, so only the
 * button's words change.
 */
export const SPORT_NAMES_RU: Readonly<Record<string, string>> = {
  Soccer: 'Футбол',
  'American football': 'Американский футбол',
  Cycling: 'Велоспорт',
  'Tennis & pickleball': 'Теннис и пиклбол',
  Training: 'Тренировки',
  'Water sports': 'Водные виды спорта',
}
