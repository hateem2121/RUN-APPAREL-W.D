import { FACTS, LEAD_TIME, PAYMENT_TERMS } from './companyFacts'
import { FAQ_INDEX, type FaqTopic, OWNER_FIGURES } from './faqs'

/**
 * Russian twin of `faqs.ts`: same shape, same order, same ids and paths; prose translated only.
 *
 * Every figure is read from the constant the English reads (`FACTS`, `OWNER_FIGURES`), or, where an
 * English constant returns words (`LEAD_TIME`, `PAYMENT_TERMS`), out of that constant's own text
 * (`figureIn`), so no number is typed twice. `source` is never shown and stays as the English has
 * it: it names where the English words come from. The company sentences below (`RELATIONSHIP_RU`,
 * `CERTIFICATION_LINES_RU`…) are the Russian of `companyFacts.ts` and are exported so the other
 * Russian files say them one way. Durus is «родственная компания», never «дочерняя» or
 * «материнская» (owner, 2026-11-04); every certificate keeps its holder.
 */

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

/** The figure at `index` in an English constant's words. Throws at build if the words lose it. */
export function figureIn(text: string, index = 0): string {
  const found = text.match(/\d[\d,]*/g)?.[index]
  if (found === undefined) throw new Error(`faqs.ru.ts: no figure ${index} in "${text}"`)
  return found
}

/** A figure in Russian print: thousands apart by a non-breaking space ("100,000" → "100 000"). */
export function ruFigure(value: string): string {
  return value.replace(/(\d),(?=\d{3}\b)/g, '$1 ')
}

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')
const CAPACITY = fact('Pieces per month')

/** `SHIPS_TO`. */
export const SHIPS_TO_RU = 'По всему миру — где бы ни была ваша команда.'

/** `CERTIFICATION_LINES`: each holder named, SMETA an audit. */
export const CERTIFICATION_LINES_RU = [
  'Наша родственная компания DURUS INDUSTRIES, в зданиях которой мы шьём одежду: регистрация в SEDEX и аудит SMETA.',
  'Наши поставщики тканей и фурнитуры: сертификаты ISO 9001, OEKO-TEX и GRS, а также аудиты amfori BSCI.',
  'Обе компании зарегистрированы в Комиссии по ценным бумагам и биржам Пакистана (SECP).',
] as const

/** `CERTIFICATION_PROMISE`. */
export const CERTIFICATION_PROMISE_RU =
  'Мы полностью готовы пройти любую сертификацию, которой требует ваша программа.'

/** `PAYMENT_TERMS`, its figure read from the English. */
export const PAYMENT_TERMS_RU = `Производство начинается после предоплаты ${figureIn(PAYMENT_TERMS, 0)}%; остаток оплачивается до отгрузки.`

/** `LEAD_TIME`, its figures read from the English. */
export const LEAD_TIME_RU = `Обычно ${figureIn(LEAD_TIME, 0)}–${figureIn(LEAD_TIME, 1)} недели с момента подтверждения заказа; точная дата указана в коммерческом предложении.`

/** `SAMPLE_TIME`. */
export const SAMPLE_TIME_RU = `Обычно ${SAMPLE_DAYS} рабочих дней; точный срок указан в коммерческом предложении.`

/** `RELATIONSHIP`: «родственные компании», as the owner ruled. */
export const RELATIONSHIP_RU =
  'RUN APPAREL и DURUS INDUSTRIES — родственные компании. За обеими стоит одна семья. ' +
  'Каждая из них — самостоятельная компания. Мы шьём одежду в зданиях DURUS INDUSTRIES в Сиалкоте.'

/** The topic pages' lede: the hub's own second sentence. */
export const FAQ_TOPIC_LEDE_RU =
  'Если вашего вопроса здесь нет, спросите нас — мы отвечаем в течение 24 часов.'

type FaqIndex = typeof FAQ_INDEX

export const FAQ_INDEX_RU: {
  readonly [K in keyof FaqIndex]: K extends 'path' | 'mostAsked' ? FaqIndex[K] : string
} = {
  path: '/faq',
  title: 'Вопросы и ответы',
  metaTitle: 'Вопросы о пошиве одежды под свой бренд',
  description:
    'Ответы на то, о чём закупщики спрашивают RUN APPAREL до первого письма: заказы и образцы, качество и сертификаты, доставка, ткани и печать.',
  heading: 'Вопросы',
  headingAccent: 'и простые ответы.',
  lede: `Всё, о чём закупщики спрашивают нас, прежде чем написать. ${FAQ_TOPIC_LEDE_RU}`,
  mostAsked: FAQ_INDEX.mostAsked,
}

const ORDERS: FaqTopic = {
  path: '/faq/orders-and-samples',
  title: 'Вопросы: заказы и образцы',
  description: `Минимальная партия RUN APPAREL — ${MINIMUM} изделий на модель, образец обычно готов за ${SAMPLE_DAYS} рабочих дней, расчёт стоимости бесплатный. Ответы о заказах и образцах.`,
  heading: 'Заказы',
  headingAccent: 'и образцы.',
  entries: [
    {
      id: 'minimum-order',
      question: 'Какая минимальная партия у RUN APPAREL?',
      answer: `Минимальная партия у RUN APPAREL — ${MINIMUM} изделий на модель.`,
      detail: `Заказ на сто изделий и на сто тысяч выполняют одна и та же площадка и одна команда, по одному стандарту. Мощность — ${ruFigure(CAPACITY)} изделий в месяц.`,
      source: 'minimum-order guide, FACTS',
    },
    {
      id: 'sample-time',
      question: 'Сколько времени занимает образец?',
      answer: `${SAMPLE_TIME_RU} Серийное производство начинается только после того, как вы его утвердите.`,
      source: 'minimum-order guide, ORDER_PHASES',
    },
    {
      id: 'sample-fee',
      question: 'Засчитывается ли стоимость образца?',
      answer:
        'Да. Стоимость образца засчитывается в счёт серийного заказа. Если серийного заказа не последует, оплата за образец остаётся у нас.',
      source: 'minimum-order guide + owner (F1, 2026-10-07)',
    },
    {
      id: 'split-minimum',
      question: 'Можно ли разделить минимальную партию по размерам и цветам?',
      answer: `В пределах ${MINIMUM} изделий партию обычно можно разделить по размерам (например, ${OWNER_FIGURES.sizeSplit}). Деление по цветам зависит от ткани и метода печати; точное деление мы подтверждаем в коммерческом предложении.`,
      source: 'owner (F2, 2026-10-07), the draft sentence approved as written',
    },
    {
      id: 'fewer-than-minimum',
      question: `Можно ли заказать меньше ${MINIMUM} изделий?`,
      answer: `Да, но по более высокой цене за изделие. ${MINIMUM} изделий на модель — наша стандартная минимальная партия.`,
      source: 'owner (F3, 2026-10-07): "Do fewer than 50. But the cost increase."',
    },
    {
      id: 'payment-terms',
      question: 'Каковы условия оплаты?',
      answer: PAYMENT_TERMS_RU,
      source: 'owner (site check, 2026-10-26): "50% deposit, 50% before ship"',
    },
    {
      id: 'quote',
      question: 'Как получить расчёт стоимости?',
      answer:
        'Пришлите то, что у вас есть, — достаточно эскиза. Коммерческое предложение бесплатное, ни к чему вас не обязывает и указывает ткань, фурнитуру, размеры и цену.',
      source: 'minimum-order guide ("The quote"), contact page',
    },
    {
      id: 'what-to-send',
      question: 'Что прислать, чтобы начать?',
      answer:
        'Модели и количество, нужную ткань или образец изделия, любые макеты и дату, к которой нужен заказ. Ничего из этого не обязательно, чтобы начать разговор.',
      source: 'order guide, word for word',
    },
    {
      id: 'lead-time',
      question: 'Сколько длится серийное производство?',
      answer: LEAD_TIME_RU,
      source: 'LEAD_TIME',
    },
    {
      id: 'prices',
      question: 'Почему на сайте нет цен?',
      answer:
        'Каждое изделие шьётся под заказ, поэтому и цена рассчитывается под каждый заказ. Цены, минимальные партии и сроки мы указываем письменно в ответ на каждый запрос.',
      source: 'terms page; llms.txt ("made to order")',
    },
  ],
}

/** Who holds each mark here, as the English reads them (G6). */
const [SISTER_LINE, SUPPLIERS_LINE, SECP_LINE] = CERTIFICATION_LINES_RU

const QUALITY: FaqTopic = {
  path: '/faq/quality-and-certifications',
  title: 'Вопросы: качество и сертификаты',
  description:
    'Какие сертификаты и аудиты охватывают производство RUN APPAREL, кто держатель каждого и что означают Sedex, SMETA, ISO 9001, OEKO-TEX, GRS и amfori BSCI.',
  heading: 'Качество',
  headingAccent: 'и сертификаты.',
  entries: [
    {
      id: 'certifications',
      question: 'Какие сертификаты и аудиты охватывают производство RUN APPAREL?',
      answer: `${SISTER_LINE} ${SUPPLIERS_LINE}`,
      detail: `${SECP_LINE} ${CERTIFICATION_PROMISE_RU}`,
      source: 'CERTIFICATION_LINES, CERTIFICATION_PROMISE, word for word',
      facts: true,
    },
    {
      id: 'sedex-smeta',
      question: 'Что такое Sedex и SMETA?',
      answer:
        'Sedex — платформа, на которой поставщики делятся со своими заказчиками информацией об условиях труда. SMETA — социальный аудит Sedex: аудитор посещает площадку и проверяет условия труда, охрану труда и технику безопасности, экологию и деловую этику.',
      detail:
        'Наша родственная компания DURUS INDUSTRIES зарегистрирована в SEDEX и прошла аудит SMETA, а мы шьём одежду в её зданиях. У RUN APPAREL нет аудитов на собственное имя. SMETA — это аудит, а не сертификат.',
      source: 'sedex.com (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'iso-9001',
      question: 'Что означает ISO 9001 для моего заказа?',
      answer:
        'ISO 9001 — международный стандарт менеджмента качества: как компания планирует, проверяет и постоянно улучшает свою работу. Сертификаты ISO 9001 есть у наших поставщиков тканей и фурнитуры.',
      source: 'iso.org (read 2026-10-07; no edition named) + CERTIFICATION_LINES',
    },
    {
      id: 'oeko-tex',
      question: 'Что такое OEKO-TEX?',
      answer:
        'OEKO-TEX STANDARD 100 — маркировка текстиля, проверенного на вредные вещества, от пряжи до готового изделия. Сертификаты OEKO-TEX есть у наших поставщиков тканей и фурнитуры.',
      source: 'oeko-tex.com (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'grs',
      question: 'Что такое GRS?',
      answer:
        'GRS (Global Recycled Standard) подтверждает содержание переработанного сырья и отслеживает его на каждом этапе цепочки поставок, с социальными, экологическими и химическими требованиями.',
      detail:
        'Готовое изделие может заявлять соответствие GRS, только если сертифицирован каждый этап. Сертификаты GRS есть у наших поставщиков тканей и фурнитуры.',
      source: 'textileexchange.org (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'amfori-bsci',
      question: 'Что такое amfori BSCI?',
      answer:
        'amfori BSCI — социальный аудит, который проверяет условия труда на производственной площадке. Это не сертификация. Аудиты amfori BSCI проходят наши поставщики тканей и фурнитуры.',
      source: 'amfori.org (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'checks',
      question: 'Какие проверки проходит заказ перед отгрузкой?',
      answer:
        'Каждый заказ проверяется перед упаковкой: испытания, осмотр под светом и финальный контроль перед упаковкой.',
      detail:
        'Мы проверяем швы, размеры, принт и цвет во время производства и перед упаковкой и проводим инспекцию по выбранному вами уровню AQL. Перед отгрузкой вы получаете фотографии.',
      source: 'ORDER_PHASES step 6; detail: owner (F6, 2026-10-07)',
    },
    {
      id: 'order-certificates',
      question: 'Можно ли получить сертификаты и протоколы испытаний для моего заказа?',
      answer:
        'Да. Мы можем прислать копии сертификатов наших поставщиков, а также транзакционные сертификаты там, где сертифицирована каждая компания в цепочке. Можем и организовать лабораторные испытания за ваш счёт.',
      source: 'owner (F5, 2026-10-07)',
    },
    {
      id: 'market-certification',
      question: 'Можете ли вы пройти сертификацию, которой требует мой рынок?',
      answer: CERTIFICATION_PROMISE_RU,
      source: 'CERTIFICATION_PROMISE',
    },
  ],
}

const SHIPPING: FaqTopic = {
  path: '/faq/shipping-and-importing',
  title: 'Вопросы: доставка и импорт',
  description:
    'Как RUN APPAREL отгружает заказы из Пакистана, какие условия Инкотермс даёт (EXW, FCA, FOB, CFR, CIF, DAP, DDP), кто платит пошлину и как упакована одежда.',
  heading: 'Доставка',
  headingAccent: 'и импорт.',
  entries: [
    {
      id: 'how-we-ship',
      question: 'Как вы отправляете заказы из Пакистана?',
      answer:
        'Авиакурьером, авиа- или морским фрахтом — или заказ забирает ваш экспедитор. Способ доставки, условия и стоимость указываются в коммерческом предложении.',
      source: 'shipping guide',
    },
    {
      id: 'incoterms',
      question: 'На каких условиях Инкотермс вы даёте цены?',
      answer:
        'EXW, FCA по запросу, FOB, CFR, CIF, DAP и DDP. FOB, CFR и CIF применяются для морских перевозок.',
      detail:
        'EXW: вы забираете товар с нашего производства. FCA, по запросу: мы проводим экспортное таможенное оформление и передаём товар вашему перевозчику в согласованном месте. FOB: мы грузим товар на судно в порту Пакистана. CFR и CIF: мы оплачиваем морской фрахт до вашего порта, а при CIF — ещё и страховку. DAP: мы доставляем товар в место, указанное в коммерческом предложении. DDP: мы доставляем товар до вашей двери с уже оплаченными ввозной пошлиной и налогами. Эти условия следуют правилам Международной торговой палаты, которые называются Инкотермс.',
      source: 'shipping guide',
    },
    {
      id: 'import-duty',
      question: 'Кто платит ввозную пошлину?',
      answer:
        'При EXW, FCA, FOB, CFR, CIF и DAP — вы, когда товар прибывает в вашу страну. При DDP — мы, и она входит в цену. Размер пошлины зависит от вашей страны и изделия, а не от нас.',
      source: 'shipping guide, word for word',
    },
    {
      id: 'own-forwarder',
      question: 'Можно ли работать со своим экспедитором?',
      answer: 'Да. Ваш экспедитор забирает заказ у нас.',
      source: 'shipping guide',
    },
    {
      id: 'countries',
      question: 'В какие страны вы доставляете?',
      answer: SHIPS_TO_RU,
      source: 'SHIPS_TO',
    },
    {
      id: 'packing',
      question: 'Как упаковывается одежда?',
      answer:
        'Так, как нужно вам, под вашим брендом: этикетки на горловине и с уходом, навесные бирки, пакеты и коробки. Минимального объёма для индивидуальной упаковки нет.',
      source: 'packaging guide',
    },
    {
      id: 'transit-time',
      question: 'Сколько идёт доставка?',
      answer:
        'Зависит от способа: авиакурьер, авиафрахт или море. Срок доставки мы подтверждаем в коммерческом предложении.',
      source: 'owner (F7, 2026-10-07): no numbers on the site',
    },
    {
      id: 'shipping-documents',
      question: 'Какие документы прилагаются к отгрузке?',
      answer:
        'Коммерческий инвойс, упаковочный лист, сертификат происхождения и авианакладная или коносамент.',
      source: 'owner (F8, 2026-10-07)',
    },
  ],
}

const FABRICS: FaqTopic = {
  path: '/faq/fabrics-and-printing',
  title: 'Вопросы: ткани и печать',
  description:
    'Ткани, с которыми работает RUN APPAREL, что означает GSM, семь методов печати на нашей площадке и как выбрать ткань для изделия.',
  heading: 'Ткани',
  headingAccent: 'и печать.',
  entries: [
    {
      id: 'fabrics',
      question: 'С какими тканями вы работаете?',
      answer:
        'Кулирная гладь, интерлок, пике, сетка, футер (френч-терри), флис, сетка «птичий глаз», рибана, вафельное полотно и жаккард. Мы не ограничиваемся ими: изготовим полотно с нужной вам структурой, плотностью и свойствами.',
      source: 'fabrics guide',
    },
    {
      id: 'gsm',
      question: 'Что означает GSM?',
      answer: 'GSM — граммы на квадратный метр (г/м²), то есть плотность ткани.',
      detail:
        'Плотность кулирной глади обычно от 120 до 200 г/м², футера — от 200 до 280 г/м², флиса — от 200 до 350 г/м².',
      source: 'fabrics guide',
    },
    {
      id: 'printing-methods',
      question: 'Какие методы печати вы предлагаете?',
      answer:
        'Семь, и все на одной площадке: шелкография, сублимационная печать, DTF, DTG, виниловый термотрансфер, вышивка и специальные краски.',
      source: 'printing guide',
    },
    {
      id: 'sublimation',
      question: 'Что такое сублимационная печать?',
      answer:
        'Под действием температуры краситель переходит в волокна ткани, и принт становится частью полотна. Подходит для полиэстера и сплошных принтов, например для командных джерси.',
      source: 'printing guide, word for word',
    },
    {
      id: 'screen-or-dtf',
      question: 'Чем шелкография отличается от DTF?',
      answer:
        'При шелкографии краска продавливается через сетчатый трафарет на изделие; метод подходит для ярких дизайнов в несколько цветов и для больших тиражей. При DTF рисунок печатается на плёнке и переносится на ткань под нагревом; метод подходит для большинства тканей и цветов.',
      source: 'printing guide',
    },
    {
      id: 'embroidery',
      question: 'Вы делаете вышивку?',
      answer: 'Да, на той же площадке. Вышивка подходит для логотипов и нашивок.',
      source: 'printing guide',
    },
    {
      id: 'choose-fabric',
      question: 'Как выбрать подходящую ткань?',
      answer:
        'Расскажите, для чего изделие, или пришлите образец; ткань будет указана в коммерческом предложении.',
      source: 'order guide and fabrics guide',
    },
    {
      id: 'pantone',
      question: 'Можете ли вы подобрать цвет по Pantone?',
      answer:
        'Да. Мы подбираем цвет по присланному вами Pantone, а вы утверждаете лабораторный выкрас (окрашенную ткань) или пробный оттиск (образец печати) до серийного производства.',
      source: 'owner (F9, 2026-10-07)',
    },
    {
      id: 'recycled-organic',
      question: 'Можно ли использовать переработанные или органические ткани?',
      answer:
        'Да. Переработанные и органические ткани мы закупаем у сертифицированных поставщиков, и вы получаете подтверждающие сертификаты.',
      source: 'owner (F10, 2026-10-07)',
    },
    {
      id: 'own-fabric',
      question: 'Можно ли прислать свою ткань?',
      answer: 'Да. Мы можем раскроить, сшить и укомплектовать фурнитурой изделия из вашей ткани.',
      source: 'owner (F11, 2026-10-07)',
    },
  ],
}

const WORKING: FaqTopic = {
  path: '/faq/working-with-us',
  title: 'Вопросы: работа с нами',
  description:
    'Работа с RUN APPAREL: наша родственная компания DURUS INDUSTRIES, этапы заказа, кому принадлежат ваши макеты, визит на фабрику, NDA и проблемы с заказом.',
  heading: 'Работа',
  headingAccent: 'с нами.',
  entries: [
    {
      id: 'durus-industries',
      question: 'Входит ли RUN APPAREL в состав DURUS INDUSTRIES?',
      answer: `Нет. ${RELATIONSHIP_RU}`,
      source: 'RELATIONSHIP, word for word (owner, 2026-11-04)',
    },
    {
      id: 'order-steps',
      question: 'Как проходит заказ, шаг за шагом?',
      answer:
        'Заказ под вашим брендом в RUN APPAREL проходит четыре этапа и восемь шагов. На каждом шаге вы знаете, чей ход: ваш или наш. В серийное производство ничего не идёт, пока вы не утвердите образец.',
      source: 'order guide lede, word for word',
    },
    {
      id: 'artwork',
      question: 'Кому принадлежат макеты, которые я присылаю?',
      answer:
        'Вам. Технические задания, макеты и образцы, которые вы нам присылаете, остаются вашей собственностью. Мы используем их только для расчёта и производства вашего заказа.',
      source: 'order guide, word for word',
    },
    {
      id: 'protect-designs',
      question: 'Как вы защищаете мои дизайны?',
      answer:
        'Ваши файлы видит только команда, которая работает над вашим заказом. Ваши лекала и макеты никогда не используются для других заказчиков. Мы храним ваши лекала и образцы до следующего заказа.',
      source: 'owner (F12, 2026-10-07)',
    },
    {
      id: 'factory-visit',
      question: 'Можно ли посетить фабрику?',
      answer:
        'Да. Напишите нам на почту, чтобы договориться о визите. Если вы не можете приехать, мы покажем фабрику по видеосвязи.',
      source: 'owner (F13, 2026-10-07)',
    },
    {
      id: 'reply-time',
      question: 'Как быстро вы отвечаете?',
      answer: 'В течение 24 часов.',
      source: 'the reply promise (replyPromise.test.ts)',
    },
    {
      id: 'nda',
      question: 'Подпишете ли вы NDA?',
      answer: 'Да. Мы подписываем NDA заказчика, а если нужно — предложим свой.',
      source: 'owner (F14, 2026-10-07)',
    },
    {
      id: 'order-problem',
      question: 'Что делать, если с заказом возникла проблема?',
      answer: `Сообщите нам в течение ${OWNER_FIGURES.reportProblemDays} дней после доставки и приложите фотографии. В зависимости от проблемы мы перешьём изделия или оформим вам кредит-ноту.`,
      source: 'owner (F15, 2026-10-07)',
    },
  ],
}

/** The topic pages, in the hub's order. */
export const FAQ_TOPICS_RU: readonly FaqTopic[] = [ORDERS, QUALITY, SHIPPING, FABRICS, WORKING]
