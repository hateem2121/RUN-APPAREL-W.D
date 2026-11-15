import { FACTS } from './companyFacts'
import { LEAD_TIME_RU } from './faqs.ru'
import type { OrderPhase, OrderStep } from './orderProcess'

/**
 * Russian twin of `orderProcess.ts` (`ORDER_PHASES`): same shape, same order, same photos; translate
 * prose only.
 *
 * `name` and `actor` are typed keys (`'Talk'`, `'You'`…) and stay English; their Russian words are
 * `ORDER_PHASE_NAMES_RU` and `ORDER_ACTORS_RU`. The sample time is read from `FACTS` and the lead
 * time is `faqs.ru.ts`'s, whose figures come from `LEAD_TIME`, so no number is typed twice.
 */

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

/** The words for each phase's `name`. */
export const ORDER_PHASE_NAMES_RU: Readonly<Record<OrderPhase['name'], string>> = {
  Talk: 'Обсуждение',
  Develop: 'Разработка',
  Make: 'Производство',
  Deliver: 'Доставка',
}

/** The words for each step's `actor`. */
export const ORDER_ACTORS_RU: Readonly<Record<OrderStep['actor'], string>> = {
  You: 'Вы',
  We: 'Мы',
}

export const ORDER_PHASES_RU: readonly OrderPhase[] = [
  {
    name: 'Talk',
    steps: [
      {
        actor: 'You',
        title: 'Пришлите то, что есть',
        photo: 'showroom',
        body: 'Эскиз, образец изделия или полное техническое задание (ТЗ). Мы отвечаем в течение 24 часов.',
        detail:
          'Ваши файлы видит только команда вашего заказа, а ваши лекала никогда не используются для других заказчиков.',
      },
      {
        actor: 'We',
        title: 'Коммерческое предложение',
        photo: 'lab',
        body: 'Ткань, фурнитура, размеры и цена. Расчёт бесплатный и ни к чему вас не обязывает.',
        detail:
          'Минимальную партию модели обычно можно разделить по размерам; деление по цветам зависит от ткани и метода печати.',
      },
    ],
  },
  {
    name: 'Develop',
    steps: [
      {
        actor: 'We',
        title: 'Ваш образец',
        photo: 'screen-printing',
        body: `Обычно готов за ${fact('Working days')} рабочих дней. Стоимость образца засчитывается в счёт серийного заказа.`,
        detail:
          'Нужен цвет по Pantone? До запуска серии вы утверждаете лабораторную выкраску или пробный оттиск.',
      },
      {
        actor: 'You',
        title: 'Утверждение',
        photo: 'inspection',
        body: 'В серию ничего не идёт, пока вы не утвердите образец.',
        detail: 'Мы храним ваши лекала и образцы до следующего заказа.',
      },
    ],
  },
  {
    name: 'Make',
    steps: [
      {
        actor: 'We',
        title: 'Серийное производство',
        photo: 'exterior',
        body: LEAD_TIME_RU,
        detail:
          'Семь методов печати на собственном производстве — от шелкографии и сублимационной печати до вышивки.',
      },
      {
        actor: 'We',
        title: 'Контроль',
        photo: 'final-check',
        body: 'Каждая партия проверяется на линии и ещё раз на финальной инспекции по AQL.',
        detail: 'Перед упаковкой проверяются швы, размеры, принт и цвет.',
      },
    ],
  },
  {
    name: 'Deliver',
    steps: [
      {
        actor: 'We',
        title: 'Упаковка и отгрузка',
        photo: 'packing',
        body: 'Отгрузка на выбранных вами условиях: EXW, FCA, FOB, CFR, CIF, DAP или DDP — вплоть до доставки до двери с оплаченной пошлиной.',
        detail:
          'Упаковка на ваш вкус: этикетки на горловине и с символами ухода, навесные бирки, пакеты и коробки, без минимального объёма для индивидуальной упаковки.',
      },
      {
        actor: 'You',
        title: 'Заказ у вас',
        photo: 'tagging',
        body: 'Готов для вашей команды, вашего магазина или мероприятия.',
        detail:
          'С коммерческим инвойсом, упаковочным листом, сертификатом происхождения и авианакладной или коносаментом.',
      },
    ],
  },
]
