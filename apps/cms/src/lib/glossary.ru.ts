import { FACTS } from './companyFacts'
import { CERTIFICATION_LINES_RU, FAQ_TOPICS_RU, figureIn, LEAD_TIME_RU } from './faqs.ru'
import type { GLOSSARY_INDEX, GlossaryTerm } from './glossary'
import { GUIDES } from './guides'

/**
 * Russian twin of `glossary.ts`: same shape, same order, same ids, categories and `seeAlso`;
 * translate prose only.
 *
 * `category` stays the English key (`GlossaryCategory`); `GLOSSARY_CATEGORIES_RU` gives each its
 * Russian heading, in the same order as `GLOSSARY_CATEGORIES`. A fabric's weight is read out of
 * the English guide point's title (`fabricRu`), the standards are the Russian FAQ's answers, whole
 * (`standardRu`), and the minimum, sample time and lead time come from `FACTS` and `faqs.ru.ts`,
 * so no figure is typed twice. The other definitions are the English ones, translated.
 */

type GlossaryIndex = typeof GLOSSARY_INDEX

export const GLOSSARY_INDEX_RU: {
  readonly [K in keyof GlossaryIndex]: K extends 'path' ? GlossaryIndex[K] : string
} = {
  path: '/glossary',
  title: 'Глоссарий',
  metaTitle: 'Термины пошива и экспорта простыми словами',
  description:
    'Термины швейного производства и экспорта простыми словами: ткани и GSM, печать, швы и отделка, Инкотермс, стандарты и аудиты, о которых спрашивают заказчики.',
  heading: 'Каждый термин —',
  headingAccent: 'простыми словами.',
}

/** The headings of `GLOSSARY_CATEGORIES`, index for index. */
export const GLOSSARY_CATEGORIES_RU: readonly string[] = [
  'Ткани',
  'Волокна',
  'Печать и декор',
  'Конструкция и свойства',
  'Заказ и производство',
  'Условия поставки',
  'Стандарты и аудиты',
  'Компания и право',
]

const FABRICS_GUIDE = '/guides/sportswear-fabrics-and-weights'
const PRINTING_GUIDE = '/guides/garment-printing-methods'
const SHIPPING_GUIDE = '/guides/shipping-and-import-duties'
const ORDER_GUIDE = '/guides/how-a-private-label-order-works'
const MINIMUM_GUIDE = '/guides/minimum-order-and-samples'
const REFERENCE_GUIDE = '/guides/3d-garment-reference'
const PACKAGING_GUIDE = '/guides/private-label-packaging'
const QUALITY_FAQ = '/faq/quality-and-certifications'
const FIBERS_GUIDE = '/guides/sportswear-fibers'
const STITCH_GUIDE = '/guides/stitch-and-seam-types'
const MACHINERY_GUIDE = '/guides/apparel-manufacturing-machinery'
const SOFTWARE_GUIDE = '/guides/apparel-design-software'
const TECH_PACK_GUIDE = '/guides/tech-pack-template'
const TEAM_KITS_GUIDE = '/guides/how-to-order-team-kits'
const TECHNOLOGY_GUIDE = '/guides/apparel-manufacturing-technology'
const DYEING_GUIDE = '/guides/dyeing-and-color-matching'
const PATTERN_GUIDE = '/guides/sportswear-pattern-making'

/** The English guide point's title, found as `glossary.ts` finds it. Throws on a missing one. */
function guideTitle(path: string, titleStart: string): string {
  const guide = GUIDES.find((entry) => entry.path === path)
  for (const section of guide?.sections ?? []) {
    for (const block of section.blocks) {
      if (block.kind === 'point' && block.title.startsWith(titleStart)) return block.title
    }
  }
  throw new Error(`glossary.ru.ts: no point "${titleStart}" in ${path}`)
}

/** "Single jersey, 120 to 200 GSM" → «Обычно от 120 до 200 г/м². <text>», the figures read. */
function fabricRu(id: string, name: string, titleStart: string, text: string): GlossaryTerm {
  const title = guideTitle(FABRICS_GUIDE, titleStart)
  return {
    id,
    name,
    category: 'Fabrics',
    definition: `Обычно от ${figureIn(title, 0)} до ${figureIn(title, 1)} г/м². ${text}`,
    seeAlso: [FABRICS_GUIDE],
  }
}

function printingRu(id: string, name: string, definition: string): GlossaryTerm {
  return { id, name, category: 'Printing and decoration', definition, seeAlso: [PRINTING_GUIDE] }
}

function shippingRu(id: string, name: string, definition: string): GlossaryTerm {
  return {
    id,
    name,
    category: 'Shipping terms',
    definition,
    seeAlso: [SHIPPING_GUIDE, '/faq/shipping-and-importing'],
  }
}

/** A standard: the Russian FAQ's answer, whole, so the two pages say the same thing. */
function standardRu(id: string, name: string, faqId: string): GlossaryTerm {
  const entry = FAQ_TOPICS_RU.flatMap((topic) => topic.entries).find((each) => each.id === faqId)
  if (!entry) throw new Error(`glossary.ru.ts: no FAQ entry "${faqId}"`)
  return {
    id,
    name,
    category: 'Standards and audits',
    definition: entry.detail ? `${entry.answer} ${entry.detail}` : entry.answer,
    seeAlso: [`${QUALITY_FAQ}#${faqId}`],
  }
}

const MINIMUM = FACTS.find((entry) => entry.label.startsWith('Minimum'))?.value ?? ''
const SAMPLE_DAYS = FACTS.find((entry) => entry.label.startsWith('Working days'))?.value ?? ''

export const GLOSSARY_TERMS_RU: readonly GlossaryTerm[] = [
  {
    id: 'gsm',
    name: 'GSM',
    category: 'Fabrics',
    definition: 'GSM — граммы на квадратный метр (г/м²), то есть плотность ткани.',
    seeAlso: [FABRICS_GUIDE],
  },
  fabricRu(
    'single-jersey',
    'Кулирная гладь (сингл-джерси)',
    'Single jersey',
    'Хлопок, полиэстер или их смесь, часто с небольшим добавлением спандекса. Из неё шьют футболки, майки, беговые футболки и одежду для зала.',
  ),
  fabricRu(
    'interlock',
    'Интерлок',
    'Interlock',
    'Хлопок, полиэстер или переработанный полиэстер, часто со спандексом. Гладкий с обеих сторон. Из него шьют футболки премиум-класса, поло и командные джерси.',
  ),
  fabricRu(
    'pique',
    'Пике',
    'Pique',
    'Хлопок, полиэстер или их смесь. Рельефная фактура. Из него шьют поло, одежду для гольфа и тенниса.',
  ),
  fabricRu(
    'mesh',
    'Сетка',
    'Mesh',
    'Полиэстер, переработанный полиэстер или нейлон, часто со спандексом. Трикотаж с открытой структурой. Из неё шьют джерси, беговые футболки и вентиляционные вставки.',
  ),
  fabricRu(
    'birdseye-mesh',
    'Сетка «птичий глаз»',
    'Birdseye mesh',
    'Полиэстер или переработанный полиэстер, часто со спандексом. Мелкая точечная фактура. Из неё шьют рубашки для гольфа, одежду для тенниса и спортивные футболки.',
  ),
  fabricRu(
    'french-terry',
    'Футер (френч-терри)',
    'French terry',
    'Хлопок или смесь хлопка с полиэстером, иногда со спандексом. С изнанки — петли. Из него шьют худи, свитшоты и спортивные брюки.',
  ),
  fabricRu(
    'fleece',
    'Флис',
    'Fleece',
    'Полиэстер, переработанный полиэстер или смесь с хлопком. Начёсанная тёплая поверхность. Из него шьют куртки, худи и пуловеры.',
  ),
  fabricRu(
    'rib',
    'Рибана (кашкорсе)',
    'Rib',
    'Хлопок или полиэстер со спандексом. Очень хорошо тянется. Из неё делают горловины, манжеты, пояса и облегающие изделия.',
  ),
  fabricRu(
    'waffle',
    'Вафельное полотно',
    'Waffle',
    'Хлопок, иногда со спандексом или полиэстером. Фактура «соты». Из него шьют базовые слои и термобельё.',
  ),
  fabricRu(
    'jacquard',
    'Жаккард',
    'Jacquard',
    'Полиэстер или смесь с хлопком, часто со спандексом. Рисунок вывязан в самом полотне. Из него шьют командную форму и спортивную одежду премиум-класса.',
  ),
  {
    id: 'softshell',
    name: 'Софтшелл',
    category: 'Fabrics',
    definition: 'Эластичная ткань верхнего слоя, с которой дождь скатывается каплями.',
    seeAlso: [],
  },

  {
    id: 'polyester',
    name: 'Полиэстер',
    category: 'Fibers',
    definition: 'Прочный, лёгкий и быстро сохнет; держит форму и цвет стирку за стиркой.',
    seeAlso: [FIBERS_GUIDE],
  },
  {
    id: 'recycled-polyester',
    name: 'Переработанный полиэстер',
    category: 'Fibers',
    definition:
      'Полиэстер из переработанного пластика, например из использованных бутылок, а не из нового сырья.',
    seeAlso: [FIBERS_GUIDE],
  },
  {
    id: 'nylon',
    name: 'Нейлон (полиамид)',
    category: 'Fibers',
    definition: 'Нейлон, он же полиамид: гладкий, прочный, лёгкий и быстро сохнет.',
    seeAlso: [FIBERS_GUIDE],
  },
  {
    id: 'spandex',
    name: 'Спандекс (эластан)',
    category: 'Fibers',
    definition:
      'То, что даёт ткани растяжение: она движется вместе с телом и возвращается в форму.',
    seeAlso: [FIBERS_GUIDE],
  },
  {
    id: 'cotton',
    name: 'Хлопок',
    category: 'Fibers',
    definition: 'Мягкое натуральное волокно, которое пропускает воздух и приятно к телу.',
    seeAlso: [FIBERS_GUIDE],
  },
  {
    id: 'organic-cotton',
    name: 'Органический хлопок',
    category: 'Fibers',
    definition: 'Хлопок, выращенный без синтетических пестицидов и удобрений; мягкий и дышащий.',
    seeAlso: [],
  },
  {
    id: 'neoprene',
    name: 'Неопрен',
    category: 'Fibers',
    definition:
      'Химическое название — полихлоропрен: резиноподобный вспененный материал, который сохраняет тепло даже мокрым. Неопрен продаётся по толщине: чем толще, тем теплее, чем тоньше, тем легче гнётся.',
    seeAlso: [],
  },

  printingRu(
    'screen-printing',
    'Шелкография',
    'Краска продавливается через сетчатый трафарет на изделие. Подходит для ярких дизайнов в несколько цветов и для больших тиражей.',
  ),
  printingRu(
    'sublimation',
    'Сублимационная печать',
    'Под действием температуры краситель переходит в волокна ткани, и принт становится частью полотна. Подходит для полиэстера и сплошных принтов, например для командных джерси.',
  ),
  printingRu(
    'dtf',
    'DTF (печать на плёнке)',
    'Рисунок печатается на плёнке и переносится на изделие под нагревом. Подходит для большинства тканей и цветов.',
  ),
  printingRu(
    'dtg',
    'DTG (прямая печать по изделию)',
    'Рисунок печатается прямо на изделии — так же, как струйный принтер печатает на бумаге. Подходит для хлопка и многоцветных дизайнов.',
  ),
  printingRu(
    'heat-transfer-vinyl',
    'Виниловый термотрансфер',
    'Вырезанный винил переносится на ткань под нагревом. Подходит для имён и номеров.',
  ),
  printingRu(
    'embroidery',
    'Вышивка',
    'Рисунок вышивается нитками. Подходит для логотипов и нашивок.',
  ),
  printingRu(
    'special-inks',
    'Специальные краски',
    'Вспенивающиеся (пуф), силиконовые, высокоплотные и светоотражающие краски — для объёмного или светоотражающего эффекта.',
  ),
  {
    id: 'placement-print',
    name: 'Локальная печать',
    category: 'Printing and decoration',
    definition:
      'Принт в одном фиксированном месте изделия, например логотип на груди или номер на спине, а не по всей ткани.',
    seeAlso: [PRINTING_GUIDE],
  },

  {
    id: 'flatlock-seam',
    name: 'Плоский шов (флэтлок)',
    category: 'Construction and performance',
    definition: 'Плоские швы, которые гладко прилегают к коже и не натирают.',
    seeAlso: [STITCH_GUIDE],
  },
  {
    id: 'overlock-seam',
    name: 'Оверлочный шов',
    category: 'Construction and performance',
    definition:
      'Шов, строчка которого обвивает срез ткани: сшивает и обрабатывает его за один проход, чтобы край не осыпался.',
    seeAlso: [STITCH_GUIDE],
  },
  {
    id: 'bar-tack',
    name: 'Закрепка',
    category: 'Construction and performance',
    definition:
      'Короткая плотная зигзагообразная строчка, которая укрепляет место под нагрузкой, например угол кармана или шлёвку.',
    seeAlso: [STITCH_GUIDE],
  },
  {
    id: 'raglan-sleeve',
    name: 'Рукав реглан',
    category: 'Construction and performance',
    definition: 'Рукав, вшитый по диагонали от горловины до подмышки, — для свободы движения рук.',
    seeAlso: [],
  },
  {
    id: 'taped-seams',
    name: 'Проклеенные швы',
    category: 'Construction and performance',
    definition: 'Лента, проклеенная поверх швов, чтобы дождь не проникал через проколы от иглы.',
    seeAlso: [STITCH_GUIDE],
  },
  {
    id: 'bonded-seams',
    name: 'Клеевые швы',
    category: 'Construction and performance',
    definition: 'Швы, соединённые термоклеевой лентой, — для прочности и лучшей защиты от дождя.',
    seeAlso: [STITCH_GUIDE],
  },
  {
    id: 'ripstop',
    name: 'Рипстоп',
    category: 'Construction and performance',
    definition:
      'Ткань с вплетённой сеткой из прочных нитей, которая не даёт разрывам расползаться.',
    seeAlso: [],
  },
  {
    id: 'dwr',
    name: 'Пропитка DWR',
    category: 'Construction and performance',
    definition: 'Стойкое водоотталкивающее покрытие (DWR), с которого дождь скатывается каплями.',
    seeAlso: [],
  },
  {
    id: 'moisture-wicking',
    name: 'Отвод влаги',
    category: 'Construction and performance',
    definition: 'Отводит пот от кожи, чтобы вы оставались суше.',
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'four-way-stretch',
    name: 'Растяжение в 4 направлениях',
    category: 'Construction and performance',
    definition:
      'Тянется и поперёк, и вдоль полотна, поэтому движется вместе с вами в любую сторону.',
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'compression-fit',
    name: 'Компрессионная посадка',
    category: 'Construction and performance',
    definition: 'Плотное облегание, которое поддерживает тело и уменьшает колебания.',
    seeAlso: [FABRICS_GUIDE],
  },

  {
    id: 'private-label',
    name: 'Private label (под вашим брендом)',
    category: 'Ordering and production',
    definition: 'Private label означает, что одежда выходит под вашим брендом, а не под нашим.',
    seeAlso: [PACKAGING_GUIDE],
  },
  {
    id: 'cut-and-sew',
    name: 'Крой и пошив',
    category: 'Ordering and production',
    definition: 'Изделия, которые шьют, раскраивая ткань на детали по лекалам и соединяя их.',
    seeAlso: [ORDER_GUIDE, MACHINERY_GUIDE],
  },
  {
    id: 'tech-pack',
    name: 'Техническое задание (ТЗ, техпакет)',
    category: 'Ordering and production',
    definition:
      'Документ, который описывает изделие для фабрики: размеры, ткани, фурнитуру, цвета и макеты. Для начала достаточно эскиза; образец изделия или ТЗ — ещё лучше.',
    seeAlso: [TECH_PACK_GUIDE, ORDER_GUIDE, SOFTWARE_GUIDE],
  },
  {
    id: 'progressive-bundle-system',
    name: 'Пачечная поточная система',
    category: 'Ordering and production',
    definition:
      'Способ организации швейного потока, при котором каждый оператор выполняет одну небольшую операцию, а пачки кроя переходят от операции к операции.',
    seeAlso: [MACHINERY_GUIDE],
  },
  {
    id: 'modular-production',
    name: 'Модульное производство',
    category: 'Ordering and production',
    definition:
      'Способ организации швейного потока, при котором небольшая бригада универсальных швей шьёт изделие целиком или его часть.',
    seeAlso: [MACHINERY_GUIDE],
  },
  {
    id: 'dxf-aama',
    name: 'DXF-AAMA',
    category: 'Ordering and production',
    definition:
      'Разновидность файла DXF для передачи плоских деталей лекал между САПР конструирования одежды; градация хранится в самом файле или в файле правил рядом с ним.',
    seeAlso: [SOFTWARE_GUIDE],
  },
  {
    id: 'gltf-glb',
    name: 'glTF (GLB)',
    category: 'Ordering and production',
    definition:
      'Открытый формат файлов для 3D-моделей без лицензионных отчислений; файл GLB хранит всю 3D-сцену в одном двоичном файле.',
    seeAlso: [SOFTWARE_GUIDE],
  },
  {
    id: 'plm',
    name: 'PLM (управление жизненным циклом изделия)',
    category: 'Ordering and production',
    definition:
      'Программа, которая открывает данные об изделии всем, кто над ним работает, от дизайна до производства.',
    seeAlso: [SOFTWARE_GUIDE],
  },
  {
    id: 'team-kit',
    name: 'Игровая форма команды',
    category: 'Ordering and production',
    definition: 'Футболка, трусы, гетры, щитки и обувь, обязательные по Правилам игры.',
    seeAlso: [TEAM_KITS_GUIDE],
  },
  {
    id: 'digital-product-passport',
    name: 'Цифровой паспорт продукта',
    category: 'Standards and audits',
    definition:
      'Цифровая запись о продукте, доступная по коду на нём, которую ЕС планирует сделать обязательной для текстиля в рамках своих правил экодизайна.',
    seeAlso: [TECHNOLOGY_GUIDE],
  },
  {
    id: 'rfid',
    name: 'RFID',
    category: 'Ordering and production',
    definition:
      'Радиочастотная идентификация: метка, которая считывается по радио без прямой видимости и позволяет отслеживать изделие от фабрики до магазина.',
    seeAlso: [TECHNOLOGY_GUIDE],
  },
  {
    id: 'dope-dyeing',
    name: 'Крашение в массе',
    category: 'Fibers',
    definition:
      'Окрашивание синтетического волокна, при котором пигмент вводят в расплав до формования волокна, так что цвет проходит насквозь.',
    seeAlso: [TECHNOLOGY_GUIDE, DYEING_GUIDE],
  },
  {
    id: 'point-of-measure',
    name: 'Точка измерения',
    category: 'Ordering and production',
    definition:
      'Место на изделии, где снимают мерку, например ширину груди или длину рукава, с пояснением, как её снимать.',
    seeAlso: [TECH_PACK_GUIDE],
  },
  {
    id: 'bill-of-materials',
    name: 'Спецификация материалов',
    category: 'Ordering and production',
    definition:
      'Перечень всего, из чего сделано изделие: ткани, нитки, фурнитура, этикетки и упаковка.',
    seeAlso: [TECH_PACK_GUIDE],
  },
  {
    id: 'flat',
    name: 'Технический эскиз (флэт)',
    category: 'Ordering and production',
    definition:
      'Линейный рисунок изделия в разложенном виде, спереди и сзади, с показом швов и деталей.',
    seeAlso: [TECH_PACK_GUIDE],
  },
  {
    id: 'grading',
    name: 'Градация лекал',
    category: 'Ordering and production',
    definition:
      'Построение лекал всех размеров ряда от одного базового размера с заданными приращениями в каждой точке измерения.',
    seeAlso: [PATTERN_GUIDE, TECH_PACK_GUIDE],
  },
  {
    id: 'moq',
    name: 'MOQ (минимальная партия)',
    category: 'Ordering and production',
    definition: `Наименьшее количество изделий, которое фабрика выпускает в одном заказе. В RUN APPAREL это ${MINIMUM} изделий на модель.`,
    seeAlso: [MINIMUM_GUIDE, '/faq/orders-and-samples#minimum-order'],
  },
  {
    id: 'sample',
    name: 'Образец',
    category: 'Ordering and production',
    definition: `Одно изделие, которое шьют до серийного производства, чтобы вы его утвердили. Образец обычно готов за ${SAMPLE_DAYS} рабочих дней, а его стоимость засчитывается в счёт серийного заказа.`,
    seeAlso: [MINIMUM_GUIDE],
  },
  {
    id: 'lead-time',
    name: 'Срок производства',
    category: 'Ordering and production',
    definition: `Время от подтверждения заказа до готовой партии. ${LEAD_TIME_RU}`,
    seeAlso: ['/faq/orders-and-samples#lead-time'],
  },
  {
    id: '3d-garment-reference',
    name: '3D-модель изделия',
    category: 'Ordering and production',
    definition:
      'Изделие, которое можно вращать и приближать на экране. Вы и ваша команда проверяете конструкцию, посадку и расположение макета ещё до того, как раскроят образец.',
    seeAlso: [REFERENCE_GUIDE, SOFTWARE_GUIDE, '/products'],
  },
  {
    id: 'colorway',
    name: 'Расцветка',
    category: 'Ordering and production',
    definition: 'Одна цветовая версия изделия. У каждой расцветки изделия своя страница.',
    seeAlso: [REFERENCE_GUIDE],
  },

  {
    id: 'incoterms',
    name: 'Инкотермс',
    category: 'Shipping terms',
    definition:
      'Правила Международной торговой палаты о том, кто оплачивает и организует каждую часть перевозки.',
    seeAlso: [SHIPPING_GUIDE, '/faq/shipping-and-importing#incoterms'],
  },
  shippingRu(
    'exw',
    'EXW (франко-завод)',
    'Вы забираете товар с нашего производства. Вы оплачиваете фрахт, страховку, ввозную пошлину и налоги.',
  ),
  shippingRu(
    'fca',
    'FCA (франко-перевозчик)',
    'По запросу. Мы проводим экспортное таможенное оформление и передаём товар вашему перевозчику в согласованном месте. Дальше фрахт оплачиваете вы, импортные формальности в своей стране оформляете вы, ввозную пошлину и налоги тоже платите вы.',
  ),
  shippingRu(
    'fob',
    'FOB (свободно на борту)',
    'Мы грузим товар на судно в порту Пакистана. Вы оплачиваете морской фрахт, ввозную пошлину и налоги.',
  ),
  shippingRu(
    'cfr-cif',
    'CFR и CIF',
    'Мы оплачиваем морской фрахт до вашего порта, а при CIF — ещё и страховку. Ввозную пошлину и налоги платите вы.',
  ),
  shippingRu(
    'dap',
    'DAP (поставка в месте назначения)',
    'Мы доставляем товар в место, указанное в коммерческом предложении. Таможенное оформление в своей стране проходите вы, ввозная пошлина и налоги — тоже ваши.',
  ),
  shippingRu(
    'ddp',
    'DDP (поставка с оплатой пошлин)',
    'Мы доставляем товар до вашей двери с уже оплаченными ввозной пошлиной и налогами. Они включены в цену.',
  ),

  standardRu('sedex-smeta', 'Sedex и SMETA', 'sedex-smeta'),
  standardRu('iso-9001', 'ISO 9001', 'iso-9001'),
  standardRu('oeko-tex', 'OEKO-TEX STANDARD 100', 'oeko-tex'),
  standardRu('grs', 'GRS', 'grs'),
  standardRu('amfori-bsci', 'amfori BSCI', 'amfori-bsci'),

  {
    id: 'secp',
    name: 'SECP',
    category: 'Company and legal',
    definition: `Комиссия по ценным бумагам и биржам Пакистана. ${CERTIFICATION_LINES_RU[2].replace('зарегистрированы в Комиссии по ценным бумагам и биржам Пакистана (SECP).', 'зарегистрированы в ней.')}`,
    seeAlso: [],
  },
]
