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
  'How an order works': 'Как проходит заказ',
  'See products in 3D': 'Смотреть изделия в 3D',
  'Every garment below has its own 3D page. Turn it, zoom in and check the print, the fabric composition, the weight and the fit. Share the link with your team before anyone pays for a sample.':
    'У каждого изделия ниже есть своя 3D-страница. Поверните его, приблизьте и проверьте принт, состав ткани, плотность и посадку. Отправьте ссылку команде до того, как кто-то оплатит образец.',
  'Questions buyers ask': 'Вопросы заказчиков',
  'More answers in the FAQ': 'Другие ответы — в разделе «Вопросы и ответы»',
  'Send the styles, quantities and specs you have. A sketch is enough to start. We reply within 24 hours, and the quote is free and commits you to nothing.':
    'Пришлите модели, количества и ТЗ, какие есть. Для начала достаточно эскиза. Ответим в течение 24 часов; расчёт бесплатный и ни к чему вас не обязывает.',
  Email: 'Написать на',
  'Other ranges': 'Другие направления',
  Sport: 'Вид спорта',
  All: 'Все',
  '[ FAQ ]': '[ Вопросы и ответы ]',
  'More detail': 'Подробнее',
  'On this page': 'На этой странице',
  'Buyer guides': 'Руководства для заказчиков',
  'The five we hear most': 'Пять самых частых вопросов',
  More: 'Подробнее',
  'Every topic': 'Все темы',
  '[ Glossary ]': '[ Глоссарий ]',
  'Terms by letter': 'Термины по буквам',
  '[ Contact ]': '[ Контакты ]',
  'Reach us directly by email or on WhatsApp, whichever suits you. We reply within 24 hours.':
    'Напишите нам на почту или в WhatsApp — как вам удобнее. Ответим в течение 24 часов.',
  'Email us': 'Написать на почту',
  'WhatsApp us': 'Написать в WhatsApp',
  'What helps us reply faster': 'Что поможет ответить быстрее',
  'Styles and quantities, your target fabric or a reference garment, any artwork, and the date you need it by. None of it is required to start the conversation.':
    'Модели и количества, нужная ткань или изделие-референс, макеты и срок, к которому нужен заказ. Для начала разговора ничего из этого не обязательно.',
  'Asking about': 'Вопрос об изделии',
  Name: 'Имя',
  'Job title': 'Должность',
  Company: 'Компания',
  Country: 'Страна',
  Phone: 'Телефон',
  Subject: 'Тема',
  'Your subject': 'Ваша тема',
  Message: 'Сообщение',
  'Send inquiry': 'Отправить запрос',
  'Or email us instead': 'Или напишите нам на почту',
  '[ Partnerships ]': '[ Сотрудничество ]',
  'New programs, quotes and samples.': 'Новые проекты, расчёты и образцы.',
  '[ Call or WhatsApp ]': '[ Звонок или WhatsApp ]',
  'Call this number': 'Позвонить по этому номеру',
  'Fastest for a quick question.': 'Быстрее всего для короткого вопроса.',
  'Where we are': 'Где мы находимся',
  '[ 3D product references ]': '[ 3D-модели изделий ]',
  'These are development references, not a shop. Open one to turn the garment, inspect the construction and see exactly how the artwork sits before a sample is ever cut.':
    'Это модели для разработки, а не магазин. Откройте любую, чтобы повернуть изделие, рассмотреть конструкцию и точно увидеть, как ляжет принт, ещё до раскроя образца.',
  'The references are being updated. Email us and we will send the current set directly.':
    'Модели сейчас обновляются. Напишите нам — пришлём актуальный набор напрямую.',
  'Product families on this page': 'Разделы продукции на этой странице',
  'One standard means one factory, one set of hands and one set of tolerances. Every family below is cut, stitched and finished on the same site, to the same specification, whether it is a hundred pieces or a hundred thousand.':
    'Один стандарт — это одна фабрика, одни руки и одни допуски. Каждое направление ниже кроят, шьют и отделывают на одном производстве, по одной спецификации, будь то сто изделий или сто тысяч.',
  'We can build a 3D reference of your garment on request, before a sample is cut.':
    'По запросу мы сделаем 3D-модель вашего изделия ещё до раскроя образца.',
  'Confirmed capacity, not marketing. If any of these matters to your program, ask and we will put it in writing.':
    'Подтверждённые мощности, а не маркетинг. Если какая-то из этих цифр важна для вашего проекта, спросите — мы подтвердим её в письменном виде.',
}
