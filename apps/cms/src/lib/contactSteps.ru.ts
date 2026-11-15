import { FACTS } from './companyFacts'
import type { ContactStep } from './contactSteps'

/**
 * Russian twin of `contactSteps.ts`: same shape, same order, same `number`s; translate prose only.
 * The figures are read from `FACTS`, as the English reads them.
 */

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')

export const CONTACT_STEPS_HEADING_RU = 'Что дальше'

export const CONTACT_STEPS_RU: readonly ContactStep[] = [
  {
    number: '№01',
    title: 'Ваше письмо читает человек',
    body: 'Каждый запрос и каждый приложенный файл читает сотрудник нашей команды в Сиалкоте.',
  },
  {
    number: '№02',
    title: 'Отвечаем так, как удобно вам',
    body: 'По электронной почте, звонком или в WhatsApp на номер, который вы укажете.',
  },
  {
    number: '№03',
    title: 'Сначала — образец',
    body: `Образец обычно готов за ${SAMPLE_DAYS} рабочих дней. В серию ничего не идёт, пока вы его не утвердите; заказ — от ${MINIMUM} изделий на модель.`,
  },
]
