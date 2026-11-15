import type { CASE_STUDIES_HUB, CASE_STUDY_FACTS, CASE_STUDY_STORY } from './caseStudies'

/**
 * Russian twin of the case-study hub's words (`caseStudies.ts`, Russian section, 2026-11-15): same
 * questions, ids, links and order. The case studies themselves are CMS text and stay English.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T

export const CASE_STUDY_FACT_LABELS_RU: Readonly<
  Record<(typeof CASE_STUDY_FACTS)[number]['field'], string>
> = {
  whatWasMade: 'Что сшили',
  clientDescription: 'Для кого',
  quantity: 'Сколько',
  timeline: 'За какой срок',
}

export const CASE_STUDY_STORY_LABELS_RU: Readonly<
  Record<(typeof CASE_STUDY_STORY)[number]['field'], string>
> = {
  challenge: 'Задача',
  whatWeDid: 'Что мы сделали',
  result: 'Результат',
}

export const CASE_STUDIES_HUB_RU: Widen<typeof CASE_STUDIES_HUB> = {
  title: 'Кейсы',
  metaTitle: 'Кейсы: одежда, сшитая в Сиалкоте',
  eyebrow: '[ Кейсы ]',
  heading: 'Доказательства,',
  headingAccent: 'а не обещания.',
  includes: [
    ...Object.values(CASE_STUDY_FACT_LABELS_RU),
    ...Object.values(CASE_STUDY_STORY_LABELS_RU),
    'Слова заказчика — с его разрешения',
  ],
  firstStory: 'Хотите стать нашим первым кейсом?',
  questions: [
    {
      id: 'who-is-the-customer',
      heading: 'Кто заказчик в каждом кейсе?',
      answer:
        'Реальный заказчик, чей заказ мы выполнили до конца. Мы не называем его и не приводим ничего, что на него укажет: логотип, этикетку, город или дату запуска. Заказчик читает текст и письменно его согласует.',
      points: [
        'Ваш собственный заказ. Он попадёт в кейс, только если вы прочитаете текст и письменно согласитесь. Наш ответ про NDA — в разделе «Вопросы и ответы».',
        'Фотографии. Фото из нашего цеха показывает заказ только с письменного согласия заказчика и без этикеток, логотипов и узнаваемого дизайна в кадре.',
        'Цифры. Количества указаны диапазоном, даты — месяцем и годом.',
      ],
      links: [
        {
          phrase: 'Наш ответ про NDA — в разделе «Вопросы и ответы»',
          href: '/faq/working-with-us#nda',
        },
      ],
    },
    {
      id: 'is-it-real',
      heading: 'Как проверить, что кейс настоящий?',
      answer:
        'Каждый кейс описывает один выполненный заказ по нашим документам: заказу на поставку, согласованиям, отчёту об инспекции и отгрузочным документам, которые мы храним у себя. Наш мерчандайзер пишет его по материалам заказа, заказчик согласует текст, а M. Hateem Jamshaid читает и утверждает его целиком.',
      points: [
        'Один заказ — одна история. Кейс никогда не объединяет несколько заказов и не рассказывает о заказе, которого мы не выполняли.',
        'Рекомендации. Как мы даём контакты заказчиков для рекомендаций, объясняет наше руководство по проверке поставщика.',
      ],
      links: [
        {
          phrase: 'наше руководство по проверке поставщика',
          href: '/guides/how-to-vet-a-clothing-manufacturer',
        },
      ],
    },
    {
      id: 'your-order',
      heading: 'Мой заказ пройдёт так же?',
      answer:
        'Не обязательно. Каждый кейс — это один заказ, который M. Hateem Jamshaid выбирает среди выполненных заказов, документы по которым у нас сохранились. В каждом названа одна проблема: что пошло не так, когда мы это обнаружили и как исправили. Цена, минимальный тираж и срок вашего заказа указаны в вашем коммерческом предложении.',
      points: [
        'Никакого вознаграждения за согласие. Ни одному заказчику ничего не давали и не предлагали за согласие на кейс — и не будут.',
      ],
      links: [],
    },
  ],
  description:
    'Кейсы RUN APPAREL из Сиалкота: что сшили, для кого, сколько, за какой срок и что мы сделали. Статьи на английском.',
}
