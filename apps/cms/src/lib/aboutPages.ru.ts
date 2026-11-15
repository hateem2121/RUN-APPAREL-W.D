import { COUNTRY_NAME, formatAddress, POSTAL_ADDRESS } from '@run-apparel/shared'
import type { ABOUT_PAGE, FACTORY_PAGE } from './aboutPages'
import { AUTHORS } from './bylines'
import { CUTTING_LINES, FACTS, LEGAL_NAME, PRECISION_MACHINES, SITE_COMPANY } from './companyFacts'
import { LEAD_TIME_RU, ruFigure, SHIPS_TO_RU } from './faqs.ru'
import { POLICIES_RU } from './policies.ru'
import { FAMILY_SINCE } from './press'

/**
 * Russian twin of `aboutPages.ts` (`ABOUT_PAGE`, `FACTORY_PAGE`, `ENVIRONMENTAL_LINES`): same
 * shape, same order, same tuple lengths; prose translated only.
 *
 * ⚠️ THE OWNER APPROVED THE ENGLISH ON 2026-10-09; nothing here says more. Every figure is read from
 * the constant the English reads (`FACTS`, `PRECISION_MACHINES`, `CUTTING_LINES`, `FAMILY_SINCE`),
 * and `LEAD_TIME` / `SHIPS_TO` are their one Russian in `faqs.ru.ts`. 1889 is the family's start,
 * never a founding date. Durus is «родственная компания» (owner, 2026-11-04). People's and
 * companies' names stay in Latin letters, as every brand name does. The postal address
 * (`formatAddress`, the factory hero's label) stays the English one: it is where mail is sent.
 *
 * `Widen` keeps the English shape — the same keys, the same number of entries in every tuple, the
 * same photo ids' places — while letting each string be Russian.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: Widen<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T

const factValue = (prefix: string): string =>
  FACTS.find((fact) => fact.label.startsWith(prefix))?.value ?? ''

const PEOPLE = factValue('People')
const CAPACITY = factValue('Pieces per month')
const FLOOR = factValue('Sq m')
const MINIMUM = factValue('Minimum')
const SAMPLE_DAYS = factValue('Working days')

/** The /about page's words. */
export const ABOUT_PAGE_RU: Widen<typeof ABOUT_PAGE> = {
  path: '/about',
  title: 'О нас: семья мастеров Сиалкота с 1889 года',
  description: `Пошив спортивной одежды под вашим брендом (OEM/ODM) в Сиалкоте, Пакистан. Родственная компания ${SITE_COMPANY}; семья в производстве и экспорте с ${FAMILY_SINCE} года.`,
  hero: {
    partLeft: 'С 1889',
    partRight: 'ВСЁ ЕЩЁ',
    /** The serif accent, lowercase italic as the accent always is: "still running" → «всё ещё в строю». */
    accent: 'в строю',
    subtitle: `Спортивная одежда под вашим брендом из Сиалкота, Пакистан. Семья, которая стоит за ней, производит и экспортирует из этого города с ${FAMILY_SINCE} года.`,
  },
  quickAnswer:
    'С 1889 года одна семья в Сиалкоте делает экипировку для спортсменов всего мира: сначала кожаные футбольные мячи, сегодня — одежду из функциональных тканей. RUN APPAREL — компания этой семьи, которая занимается одеждой, и родственная компания DURUS INDUSTRIES. Мы разрабатываем и экспортируем спортивную одежду под брендами партнёров, которые не останавливаются на достигнутом.',
  /** The mission (owner's words in English), rendered as a quote. */
  mission:
    'Обеспечивать партнёров по всему миру экологичной функциональной одеждой, которая помогает добиваться единства, выносливости и высоких результатов, — соединяя этичное мастерство с технологической точностью.',
  whatWeMake: {
    lead: 'Мы делаем не только спортивную одежду. Наши основные категории —',
    links: [
      { name: 'командная форма', href: '/custom-teamwear-manufacturer' },
      { name: 'одежда для фитнеса', href: '/custom-activewear-manufacturer' },
      { name: 'повседневная одежда', href: '/private-label-casual-wear-manufacturer' },
      { name: 'верхняя одежда', href: '/custom-outerwear-manufacturer' },
    ],
    close: 'а также спортивные аксессуары, и всё это — по одному стандарту.',
  },
  /** Decorative, aria-hidden; the same words appear in real text in `whatWeMake`. */
  marquee: [
    'КОМАНДНАЯ ФОРМА',
    'ОДЕЖДА ДЛЯ ФИТНЕСА',
    'ПОВСЕДНЕВНАЯ ОДЕЖДА',
    'ВЕРХНЯЯ ОДЕЖДА',
    'СПОРТИВНЫЕ АКСЕССУАРЫ',
  ],
  timeline: {
    label: '[ С 1889 ГОДА ДО НАШИХ ДНЕЙ ]',
    heading: 'Долгая дистанция.',
    entries: [
      {
        year: '1889',
        title: 'Первый мяч.',
        body: 'Allah Ditta Ghafuree, мастер по коже из Сиалкота, начинает семейное ремесло. Он вручную изготавливает кожаные футбольные мячи в городе, которому предстоит стать мировым центром спортивных товаров.',
      },
      {
        year: '1904',
        title: 'Мастерская становится производством.',
        body: 'Компания получает название Ghafuree Industries. Квасцово-хромовое дубление, рамы для растяжки кожи и ламинирование мячей задают новые стандарты для каждого следующего мяча.',
      },
      {
        year: '1904–1980',
        title: 'Годы роста.',
        // The owner's English of 2026-10-09, word for word: nothing added (no years of leadership,
        // no worker count — both ruled out).
        body: 'Allah Ditta Ghafuree помогает довести ежедневный выпуск футбольных мячей в Пакистане до 200 000. Его сыновья расширяют дело: Sandal Trading Corporation в 1942 году, Loyal Sports в 1952 году. К 1958 году они уже экспортировали в Европу.',
      },
      {
        year: '1956–1992',
        title: 'Инженерный подход к мячу.',
        body: 'M. Iqbal Sandal приходит в Loyal Sports в 1956 году. Соединение полиуретана с кожей, синтетические ламинированные футбольные мячи и ламинирование с фактурой волокна делают мячи идеально круглыми. Эти методы помогают привести ведущие мировые футбольные бренды на пакистанские производства.',
      },
      {
        year: '1992',
        title: 'Durus.',
        body: `Семья объединяет свои предприятия в одно: ${SITE_COMPANY}. По-арабски «Durus» означает силу, прочность и выносливость.`,
      },
      {
        year: 'Сегодня',
        title: 'RUN.',
        body: 'Члены семьи основывают RUN APPAREL, родственную компанию DURUS INDUSTRIES, чтобы заниматься одеждой отдельно от спортивного инвентаря. Она шьёт свою одежду в зданиях DURUS INDUSTRIES. Компания создана для спортивных брендов, команд, корпоративных программ и фитнес-организаций. Сегодня ею руководит четвёртое поколение семьи. Город тот же; стандарт — тоже.',
      },
    ],
  },
  people: {
    label: '[ ЛЮДИ ]',
    heading: 'Четыре поколения спустя.',
    name: {
      name: AUTHORS.hateem.name,
      // `AUTHORS.hateem.jobTitle` ("Business Development Director"), as `guides.ru.ts` writes it.
      role: 'Директор по развитию бизнеса',
      line: 'Четвёртое поколение семьи-основателя',
    },
    cards: [
      {
        title: 'Мерчендайзинг',
        body: 'Один контакт — от технического задания (ТЗ, техпакета) до отгрузки.',
      },
      {
        title: 'Производство',
        body: 'Линии раскроя и высокоточные станки, с контрольной точкой на каждом этапе.',
      },
      {
        title: 'Персонал',
        body: 'Здесь в одной команде работают квалифицированные люди: мастера, инженеры, дизайнеры и специалисты по производству.',
      },
    ],
  },
  /** The count-up band: every figure from a constant, as the English reads it. */
  factsBand: [
    { label: 'Семья в производстве с', value: FAMILY_SINCE, labelFirst: true },
    { label: 'Человек на производстве', value: PEOPLE },
    // `PRECISION_MACHINES.label` and `CUTTING_LINES.label`, in Russian; the values are theirs.
    { label: 'Высокоточных станков', value: PRECISION_MACHINES.value },
    { label: 'Линии раскроя', value: CUTTING_LINES.value },
    { label: 'Изделий в месяц', value: CAPACITY },
    { label: 'Кв. м под крышей', value: FLOOR },
  ],
  factsTable: [
    { term: 'Юридическое наименование', detail: LEGAL_NAME },
    {
      term: 'Родственная компания',
      detail: `${SITE_COMPANY}, в зданиях которой мы шьём нашу одежду`,
    },
    { term: 'Головной офис', detail: formatAddress() },
    { term: 'Модель работы', detail: 'Производство под брендом заказчика (OEM/ODM)' },
    {
      term: 'Минимальный заказ',
      detail: `${MINIMUM} изделий на модель — наша стандартная минимальная партия. Меньше тоже возможно, но по более высокой цене за изделие.`,
    },
    { term: 'Образцы', detail: `Обычно ${SAMPLE_DAYS} рабочих дней до готового образца` },
    { term: 'Доставка', detail: SHIPS_TO_RU },
    { term: 'Срок производства', detail: LEAD_TIME_RU },
  ],
  certificates: {
    heading: 'Наша система сертификации',
  },
  crossLink: { name: 'Посмотрите, как это делается', href: '/inside-the-factory' },
}

/**
 * `ENVIRONMENTAL_LINES`: the environmental policy's four commitment lines, read from the Russian
 * policy's own list, so the two Russian pages can never disagree.
 */
export const ENVIRONMENTAL_LINES_RU: readonly string[] = (() => {
  const policy = POLICIES_RU.find((entry) => entry.path === '/policies/environmental')
  const commit = policy?.sections.find((section) => section.id === 'commit')
  const list = commit?.blocks.find((block) => block.kind === 'list')
  return list?.kind === 'list' ? list.items : []
})()

/** The /inside-the-factory page's words. */
export const FACTORY_PAGE_RU: Widen<typeof FACTORY_PAGE> = {
  path: '/inside-the-factory',
  title: 'Внутри фабрики: производство в Сиалкоте',
  description: `Раскрой, печать, пошив, контроль качества и упаковка на площади ${ruFigure(FLOOR)} кв. м в Сиалкоте; около 83% электроэнергии — от солнца. Пять этапов, пять проверок.`,
  /** The hero's mono label, built from the shared address constant as the English builds it. */
  label: `[ ${POSTAL_ADDRESS.street} · ${POSTAL_ADDRESS.locality} · ${COUNTRY_NAME} ]`,
  hero: {
    heading: 'Внутри',
    accent: 'фабрики',
    subtitle:
      'Каждый заказ проходит пять этапов, и на каждом этапе есть своя контрольная точка. Так шьётся спортивная одежда под вашим брендом.',
  },
  walkthrough: {
    heading: 'Пять этапов. Пять контрольных точек.',
    stages: [
      {
        title: 'Подготовка и планирование',
        body: 'Мы обсуждаем ваши задачи, создаём виртуальный прототип, подбираем сертифицированные материалы и вместе утверждаем образец.',
        badge: 'Техническое задание (ТЗ, техпакет) утверждено.',
        photos: ['showroom'],
      },
      {
        title: 'Подготовка и закупка материалов',
        body: 'Поступающую ткань проверяют на устойчивость окраски, усадку и прочность на разрыв и проводят её предварительную обработку, прежде чем что-либо попадёт в цех.',
        badge: 'Материалы допущены в цех.',
        photos: ['lab'],
      },
      {
        title: 'Раскрой и первичная обработка',
        // The owner's choice of 2026-11-06 (see `aboutPages.ts`): no percentage of fabric used.
        body: 'Программа раскладки размещает лекала так, чтобы использовать как можно больше ткани, а наш раскройный цех кроит их на автоматическом раскройном комплексе или ножом.',
        badge: 'Точность размеров подтверждена.',
        photos: [],
      },
      {
        title: 'Сборка, отделка и персонализация',
        body: 'Изделия шьются оверлочными, распошивальными и плоскими (флэтлок) швами, укрепляются и проходят отделку. Сублимационная печать и точная вышивка добавляют индивидуальное оформление.',
        badge: 'Качество сборки подтверждено.',
        photos: ['stitching', 'screen-printing'],
      },
      {
        title: 'Контроль качества, упаковка и отгрузка',
        body: 'Каждая партия проверяется на линии и ещё раз на финальной инспекции по AQL. Готовые изделия проходят испытания стиркой: на усадку, устойчивость окраски к стирке и внешний вид после стирки. Затем — доработка, этикетки и записи для прослеживаемости, а обратная связь помогает постоянно улучшать процесс.',
        badge: 'Партия принята, отгрузка разрешена.',
        photos: ['inspection', 'final-check', 'tagging', 'packing'],
      },
    ],
    policyLinks: ['/policies/health-and-safety', '/policies/quality', '/policies/labor-rights'],
    close: {
      text: 'Эти пять этапов проходят на одной площадке, в шести зданиях. Шаги, которые вы проходите как заказчик, от первого сообщения до отгрузки, описаны в руководстве',
      linkName: 'Как устроен заказ одежды под ваш бренд',
      href: '/guides/how-a-private-label-order-works',
    },
  },
  /** Decorative, aria-hidden; the same words appear as the stage titles. */
  marquee: ['ПОДГОТОВКА', 'МАТЕРИАЛЫ', 'РАСКРОЙ', 'СБОРКА', 'КОНТРОЛЬ И УПАКОВКА'],
  gallery: {
    heading: 'Пройдитесь по цеху.',
    sets: [
      { label: 'Печать', photos: ['screen-printing'] },
      { label: 'Пошив', photos: ['stitching'] },
      { label: 'Контроль качества', photos: ['inspection', 'final-check', 'lab'] },
      { label: 'Упаковка', photos: ['tagging', 'packing'] },
      { label: 'Здание', photos: ['exterior'], full: true },
    ],
  },
  howWeRunIt: {
    label: '[ РАДИ ЛУЧШЕГО ЗАВТРА ]',
    heading: 'Как мы ведём дело',
    stat: 'Около 83%',
    statWords: 'электроэнергии фабрики дают солнечные панели на нашей крыше',
    // The policy's own solar line is left out here, as in English: the stat above says it.
    lines: ENVIRONMENTAL_LINES_RU.filter((line) => !line.startsWith('Солнечные панели на крыше')),
    link: { name: 'Наша экологическая политика', href: '/policies/environmental' },
  },
  crossLink: { name: 'Наша история с 1889 года', href: '/about' },
}
