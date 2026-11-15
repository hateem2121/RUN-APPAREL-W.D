import type { ReceiptWords } from './inquiryEmailHtml'
import { SUBJECT_LABELS_RU } from './inquiryForm.ru'

/**
 * The buyer's receipt in Russian (owner, 2026-11-15: "Translate it"), for an inquiry sent from
 * /ru/contact. Same shape as `RECEIPT_WORDS` in `inquiryEmailHtml.ts`; the English receipt is left
 * byte for byte as it was.
 *
 * «Запрос», not «заявка»: the contact page's own thank-you says «Мы получили ваш запрос», and the
 * receipt is the same moment in the buyer's inbox. «Заявка» stays the careers form's word.
 *
 * Reviewed 2026-11-15 by a helper briefed as a senior Russian B2B editor: the footer no longer says
 * this is the only email (the reply comes by email too), and no-break spaces keep «24 часов» and each
 * dash on their line.
 *
 * No moving header: `inquiry-received.gif` spells its three steps in English, and an English
 * picture in a Russian letter is the gap the language audit of 2026-11-15 closed on the pages.
 */
export const RECEIPT_WORDS_RU: ReceiptWords = {
  lang: 'ru',
  subject: (ref) => `Мы получили ваш запрос\u00a0— RUN APPAREL (${ref})`,
  preview: (ref) => `Мы получили ваш запрос (${ref}) и ответим в течение 24\u00a0часов.`,
  gif: null,
  reference: 'Номер запроса',
  heading: ['Что', 'дальше'],
  askedAbout: 'Тема запроса',
  topic: (subject) => SUBJECT_LABELS_RU[subject],
  steps: [
    'Наша команда в Сиалкоте прочитает ваше сообщение и приложенные файлы.',
    'Мы ответим по электронной почте в течение 24\u00a0часов (а часто и раньше) или позвоним по указанному вами номеру.',
    'Чтобы что-то добавить\u00a0— эскиз, техпакет или сроки,\u00a0— просто ответьте на это письмо.',
  ],
  sooner: 'Нужно быстрее?',
  callUs: (phone) => `Позвоните или напишите в WhatsApp: ${phone}.`,
  whatsapp: 'Написать в WhatsApp',
  range: 'Посмотреть ассортимент\u00a0→',
  rangePath: '/ru/products',
  thanks: (ref) => `Спасибо. Мы получили ваш запрос (${ref}).`,
  textHeading: 'Что дальше',
  textSooner: (phone) =>
    `Нужно быстрее? Позвоните или напишите в WhatsApp по номеру ${phone} либо просто ответьте на это письмо.`,
  textRange: 'Ассортимент',
  why: (ref) =>
    `Это письмо отправлено один раз, автоматически, в ответ на ваш запрос с сайта wear-run.com. Если будете писать нам, укажите номер ${ref}.`,
}
