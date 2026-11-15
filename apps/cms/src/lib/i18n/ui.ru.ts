/**
 * THE RUSSIAN FOR THE WORDS SERVER COMPONENTS WRITE THEMSELVES (Russian section, 2026-11-15),
 * keyed by the exact English in the component. `ui.ts` explains the shape; `ui.test.ts` fails when
 * a component asks for a key missing here, or a key here is asked for by nothing.
 */
export const UI_RU: Readonly<Record<string, string>> = {
  // Byline
  'Written by': 'Автор',
  'Last checked': 'Последняя проверка',
  'Last reviewed': 'Последний пересмотр',
  // The closing block on guides and articles (ArticleParts.tsx)
  'Tell us what you’re making.': 'Расскажите, что вам нужно сшить.',
  'Send the styles, quantities and specs you have. A sketch is enough to start. We reply within 24 hours.':
    'Пришлите модели, количества и ТЗ, какие есть. Для начала достаточно эскиза. Ответим в течение 24 часов.',
  'Start a conversation': 'Начать разговор',
  // The order steps (OrderSteps.tsx)
  Stage: 'Этап',
  Step: 'Шаг',
  'your move': 'ваш ход',
  'our move': 'наш ход',
  You: 'Вы',
  We: 'Мы',
  // A guide (GuidePage.tsx)
  '[ Buyer guide ]': '[ Руководство для заказчика ]',
  '[ Buyer guides ]': '[ Руководства для заказчиков ]',
  'Read this guide': 'Читать руководство',
  Sources: 'Источники',
  Read: 'Прочитано',
  Published: 'Опубликовано',
  Updated: 'Обновлено',
  'More to read': 'Что ещё почитать',
  'Read next': 'Читать дальше',
  'What we make': 'Что мы производим',
  Answers: 'Ответы',
  'All questions': 'Все вопросы',
  'All guides': 'Все руководства',
}
