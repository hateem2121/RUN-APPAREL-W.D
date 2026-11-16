/**
 * THE ROBOT COPY'S OWN WORDS ON A RUSSIAN GARMENT PAGE (2026-11-16), the same words the app draws
 * (`src/lib/words.ru.ts`). Kept as a plain list, not inline in `preview.ts`, so the Russian checker
 * (`scripts/check-russian-text.mjs`) reads whole sentences rather than fragments of code.
 */
export const PREVIEW_RU = {
  colourwaysComingSoon: (count: number) => `Расцветок: ${count}. 3D-просмотр скоро появится.`,
  comingSoon: '3D-просмотр скоро появится.',
  allColourwaysIn3d: (count: number) => `Все расцветки (${count}) в\u00a03D.`,
  rotateIn3d: 'Поверните и рассмотрите изделие в\u00a03D.',
  shownIn: (colour: string) => `Расцветка: ${colour}.`,
  fabricComposition: 'Состав ткани',
  weight: 'Плотность',
  fit: 'Посадка',
  performance: 'Функциональные свойства',
  colourways: 'Расцветки',
  fromIdea: 'От идеи до производства.',
  seeAllIn: (family: string) => `Все модели категории «${family}» в\u00a03D`,
  moreIn: (family: string) => `Ещё: ${family} в\u00a03D.`,
  allProducts: 'Вся продукция',
  contact: (company: string) => `Связаться с ${company}`,
  home: 'Главная',
  products: 'Продукция',
} as const
