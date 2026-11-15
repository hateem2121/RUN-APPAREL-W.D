import type { CAREER_PATH, CompanyPage, ROLE_GROUPS } from './companyPages'
import { LINEAGE_RU } from './companyFacts.ru'
import { CERTIFICATION_LINES_RU } from './faqs.ru'

/**
 * Russian twin of `companyPages.ts` (`WORK_HERE`, `CAREER_PATH`, `ROLE_GROUPS`, `CAREERS_PAGE`,
 * `COMMUNITY_PAGE`, `PRESS_PAGE`): same shape, same order, same section ids, photos and links;
 * prose translated only.
 *
 * ⚠️ THE OWNER APPROVED THE ENGLISH ON 2026-10-07; nothing here says more. The benefits are ONE
 * list shared by both pages, as in English. The applications inbox is NEVER typed here (the English
 * file's rule: the address is rendered from `SiteSettings`). Durus is «родственная компания»
 * (owner, 2026-11-04). `LINEAGE_RU` (from companyFacts.ru.ts) and `WHAT_WE_MAKE_ACCUSATIVE_RU` are the Russian of the `companyFacts.ts`
 * sentences the English pages borrow; the year is `FAMILY_SINCE`, never typed.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: Widen<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T

/**
 * `WHAT_WE_MAKE` (`companyFacts.ts`) in the ACCUSATIVE the press sentence needs («производит …»);
 * `companyFacts.ru.ts` has the nominative for the home hero.
 */
export const WHAT_WE_MAKE_ACCUSATIVE_RU =
  'командную форму, одежду для фитнеса, повседневную и верхнюю одежду, а также спортивные аксессуары'

/** `WORK_HERE`: the benefits everyone who works here gets, shared by Careers and Community. */
export const WORK_HERE_RU: readonly string[] = [
  'Письменный трудовой договор',
  'Оплачиваемый отпуск в экстренных случаях',
  'Праздничная премия на Ид и другие праздники',
  'Медицинское обеспечение для работника и его семьи',
  'Помощь с транспортом до производства и обратно',
  'Обучение и продвижение внутри компании',
]

/** `CAREER_PATH`: the real example under "Training and promotion", one step per role. */
export const CAREER_PATH_RU: Widen<typeof CAREER_PATH> = ['Помощник', 'Швейник', 'Мастер линии']

/** `ROLE_GROUPS`: floor roles need no CV, office roles include one. */
export const ROLE_GROUPS_RU: Widen<typeof ROLE_GROUPS> = [
  {
    name: 'Работа в цеху',
    roles: ['Швейники и операторы оборудования', 'Раскройщики и печатники', 'Контролёры качества'],
  },
  {
    name: 'Работа в офисе',
    roles: ['Мерчендайзеры и координаторы', 'Конструкторы лекал и дизайнеры', 'Администраторы'],
  },
]

export const CAREERS_PAGE_RU: CompanyPage = {
  path: '/careers',
  title: 'Вакансии',
  metaTitle: 'Вакансии фабрики спортивной одежды в Сиалкоте',
  description:
    'Станьте частью семьи мастеров в Сиалкоте. Письменный договор, оплачиваемый отпуск в экстренных случаях, премия, медицина, транспорт и обучение.',
  eyebrow: '[ Вакансии ]',
  heading: 'Станьте частью семьи',
  headingAccent: 'мастеров.',
  lede: `${LINEAGE_RU} Если вы гордитесь своим ремеслом, возможно, здесь найдётся место и для вас.`,
  sections: [
    {
      id: 'what-we-offer',
      heading: 'Что мы предлагаем',
      blocks: [{ kind: 'list', items: WORK_HERE_RU }],
    },
    {
      id: 'training',
      heading: 'Обучение и продвижение',
      blocks: [
        {
          kind: 'text',
          text: 'Обучение проходит прямо на рабочем месте. Многие из наших старших сотрудников начинали учениками.',
        },
        {
          kind: 'text',
          text: 'Один реальный пример, без имени: один человек из нашей команды начинал помощником, стал швейником, а сейчас работает мастером линии.',
        },
      ],
    },
    {
      id: 'roles',
      heading: 'Кого мы всегда ищем',
      blocks: [
        {
          kind: 'list',
          items: ROLE_GROUPS_RU.flatMap((group) => group.roles),
        },
        {
          kind: 'text',
          text: 'Подать заявку может каждый. Хороших кандидатов мы сохраняем в базе для будущих вакансий.',
        },
      ],
    },
    {
      id: 'apply',
      heading: 'Как подать заявку',
      blocks: [
        // The email line above this text is rendered from `SiteSettings` by `CompanyPage`.
        { kind: 'text', text: 'Расскажите, чем вы занимаетесь и как с вами связаться.' },
        {
          kind: 'text',
          text: 'К заявке на офисную должность — мерчендайзинг и координация, конструирование лекал и дизайн или администрирование — приложите резюме. Для работы в цеху оно не нужно.',
        },
      ],
    },
    {
      id: 'life',
      heading: 'Жизнь в RUN APPAREL',
      photo: 'stitching',
      blocks: [
        {
          kind: 'text',
          text: 'Цех — это место, где идёт работа, описанная в наших политиках: раскрой, печать, пошив, проверка и упаковка, на одной площадке в Сиалкоте.',
        },
      ],
    },
  ],
  links: [
    { href: '/community', name: 'Сообщество' },
    { href: '/policies', name: 'Политики' },
    { href: '/policies/equal-opportunity', name: 'Равные возможности' },
    { href: '/policies/workplace-conduct', name: 'Поведение на работе' },
    { href: '/policies/health-and-vaccination', name: 'Здоровье и вакцинация' },
    { href: '/contact', name: 'Контакты' },
  ],
}

export const COMMUNITY_PAGE_RU: CompanyPage = {
  path: '/community',
  title: 'Сообщество',
  metaTitle: 'Работа и сообщество в Сиалкоте с 1889 года',
  description:
    'Стабильная, достойная работа — самое важное, что RUN APPAREL делает для Сиалкота: люди, обучение и помощь в трудные времена.',
  eyebrow: '[ Сообщество ]',
  heading: 'Стабильная работа, честное ремесло —',
  headingAccent: 'с 1889 года.',
  lede: `Наше производство стоит среди жителей Сиалкота. Стабильная, достойная работа — самое важное, что мы делаем для Сиалкота. Их дети видят, что ремесло — это профессия, а не вынужденный выбор. ${LINEAGE_RU}`,
  sections: [
    {
      id: 'work',
      heading: 'Что значит работа здесь',
      blocks: [
        { kind: 'list', items: WORK_HERE_RU },
        {
          kind: 'text',
          text: 'Около 10–15% тех, кто здесь работает, — женщины, и им открыта любая должность.',
        },
        {
          kind: 'text',
          text: 'Опытные швейники и раскройщики обучают следующее поколение; многие опытные сотрудники здесь начинали учениками.',
        },
      ],
    },
    {
      id: 'hard-times',
      heading: 'Помощь в трудные времена',
      blocks: [
        {
          kind: 'text',
          text: 'Мы помогаем, когда сообщество переживает трудности: при наводнениях, в чрезвычайных ситуациях и в личных бедах.',
        },
      ],
    },
    {
      id: 'buyers',
      heading: 'Почему это важно для заказчиков',
      blocks: [
        {
          kind: 'text',
          text: 'Каждый заказ выполняют люди, о которых рассказывает эта страница. Наши письменные политики — то, благодаря чему эта работа остаётся стабильной.',
        },
      ],
    },
    {
      id: 'the-works',
      heading: 'Производство в фотографиях',
      photo: 'exterior',
      blocks: [
        {
          kind: 'text',
          text: 'Наши здания в Сиалкоте — производство, где действуют описанные выше политики.',
        },
      ],
    },
  ],
  links: [
    { href: '/careers', name: 'Вакансии' },
    { href: '/policies', name: 'Политики' },
    { href: '/', name: 'Кто мы' },
  ],
}

/** The press page. Its email address, photo list and fact rows are in `press.ts`, as in English. */
export const PRESS_PAGE_RU: CompanyPage = {
  path: '/press',
  title: 'Пресса',
  metaTitle: 'Пресс-кит: факты, фото и контакт для СМИ',
  description: 'Факты, фотографии и контакт для всех, кто пишет о RUN APPAREL.',
  eyebrow: '[ Пресса ]',
  heading: 'Для журналистов, исследователей',
  headingAccent: 'и всех любопытных.',
  lede: 'Факты, фотографии и контакт для всех, кто пишет о RUN APPAREL.',
  sections: [
    {
      id: 'about',
      heading: 'О RUN APPAREL',
      blocks: [
        { kind: 'text', text: LINEAGE_RU },
        {
          kind: 'text',
          text: `Компания производит на заказ ${WHAT_WE_MAKE_ACCUSATIVE_RU} в зданиях своей родственной компании DURUS INDUSTRIES: это шесть зданий в Сиалкоте, где проходят весь раскрой, печать, пошив, проверка и упаковка.`,
        },
        { kind: 'list', items: CERTIFICATION_LINES_RU },
      ],
    },
    { id: 'quick-facts', heading: 'Ключевые факты', blocks: [] },
    { id: 'photos', heading: 'Фотографии производства', blocks: [] },
    { id: 'news', heading: 'Новости', blocks: [] },
    {
      id: 'media-contact',
      heading: 'Контакт для СМИ',
      blocks: [{ kind: 'text', text: 'Мы отвечаем в течение 24 часов.' }],
    },
  ],
  links: [
    { href: '/community', name: 'Сообщество' },
    { href: '/careers', name: 'Вакансии' },
    { href: '/policies', name: 'Политики' },
    { href: '/journal', name: 'Журнал' },
    { href: '/products', name: 'Продукция' },
  ],
}
