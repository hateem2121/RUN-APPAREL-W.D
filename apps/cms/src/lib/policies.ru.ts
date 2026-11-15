import { CERTIFICATION_LINES_RU, CERTIFICATION_PROMISE_RU } from './faqs.ru'
import type { GuideBlock } from './guides'
import { type Policy, type PolicySection, POLICIES_INDEX, policyAt } from './policies'

/**
 * Russian twin of `policies.ts` (`POLICIES`, `POLICIES_INDEX`, `POLICY_CLOSING`, `POLICY_ACTION`):
 * same shape, same order, same section ids; prose translated only.
 *
 * ⚠️ THE OWNER APPROVED THE ENGLISH WORDS (2026-10-07, 2026-10-15, 2026-11-10); these say the same
 * thing and nothing more. Each page's `path`, `lastReviewed` and `group` are read from the English
 * page itself (`fromEnglish`), so the Russian page can never carry a review date the English does
 * not. The hub's certificate lines are `CERTIFICATION_LINES_RU` (`faqs.ru.ts`), the one Russian of
 * `CERTIFICATION_LINES`, so every Russian page names each holder the same way. "Buyer" is
 * «заказчик»; "without retaliation" is «без ответных мер против того, кто его подал».
 */

/** The four section headings every policy page carries, in this order (PLAN.md D2). */
const SECTION_HEADINGS_RU: Record<PolicySection['id'], string> = {
  commit: 'Наши обязательства',
  'day-to-day': 'Как это работает каждый день',
  concerns: 'Как подать обращение',
  responsible: 'Кто отвечает',
}

const section = (
  id: 'commit' | 'day-to-day' | 'concerns' | 'responsible',
  blocks: readonly GuideBlock[],
): PolicySection => ({
  id,
  heading: SECTION_HEADINGS_RU[id] ?? '',
  blocks,
})

const list = (...items: readonly string[]): GuideBlock => ({ kind: 'list', items })

/** The English page's address, review date and group: never retyped, so the two cannot drift. */
const fromEnglish = (path: string): Pick<Policy, 'path' | 'lastReviewed' | 'group'> => {
  const english = policyAt(path)
  return { path: english.path, lastReviewed: english.lastReviewed, group: english.group }
}

/** "A concern is handled without retaliation." — the same line on every workplace policy. */
const NO_RETALIATION = 'Обращение рассматривается без ответных мер против того, кто его подал.'

export const POLICIES_RU: readonly Policy[] = [
  {
    ...fromEnglish('/policies/workplace-conduct'),
    title: 'Поведение на работе',
    metaTitle: 'Политика поведения на работе',
    description:
      'Как мы относимся друг к другу на работе: правила цеха, что происходит, если правило нарушено, и как обращение попадает в отдел кадров.',
    heading: 'Как мы относимся друг к другу,',
    headingAccent: 'в цеху.',
    lede: 'Эта политика описывает, как мы относимся друг к другу на работе, и действует для всех на нашем производстве.',
    sections: [
      section('commit', [
        list(
          'Мы относимся ко всем с уважением. Оскорбления и драки исключены.',
          'Каждый носит средства защиты, которые нужны для его работы, а защитные ограждения станков остаются на месте.',
          'Мы начинаем работу вовремя. Посещаемость отмечается каждый день.',
          'Мы бережно относимся к материалам, которые нам доверены.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'Посещаемость отмечается каждый день, поэтому отработанные часы и оплата всегда задокументированы.',
        },
        {
          kind: 'text',
          text: 'Нарушение правил рассматривается поэтапно: сначала устное предупреждение, затем письменное, затем увольнение.',
        },
      ]),
      section('concerns', [
        list('С повседневными проблемами обращайтесь в отдел кадров.', NO_RETALIATION),
      ]),
      section('responsible', [{ kind: 'text', text: 'За эту политику отвечает отдел кадров.' }]),
    ],
  },
  {
    ...fromEnglish('/policies/health-and-safety'),
    title: 'Охрана труда',
    metaTitle: 'Политика охраны труда и безопасности',
    description:
      'Средства защиты там, где они нужны, обучение безопасности и пожарные учения каждые 6 месяцев, обозначенные пожарные выходы и учёт каждого несчастного случая.',
    heading: 'Безопасная работа —',
    headingAccent: 'каждый день.',
    lede: 'Эта политика описывает, как мы обеспечиваем безопасность на производстве, и действует для всех, кто на нём находится.',
    sections: [
      section('commit', [
        list(
          'Каждый получает средства защиты там, где этого требует работа, а защитные ограждения станков остаются на месте.',
          'Обучение технике безопасности проходит каждые 6 месяцев.',
          'Пожарные учения и обучение пожарной безопасности проходят каждые 6 месяцев.',
          'Пожарные выходы обозначены и свободны на каждом этаже.',
          'Каждый несчастный случай записывается в журнал несчастных случаев.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'О несчастном случае сообщают мастеру, и он записывает его в журнал несчастных случаев.',
        },
        {
          kind: 'text',
          text: 'Дважды в год всё производство проходит обучение технике безопасности и пожарные учения.',
        },
      ]),
      section('concerns', [
        list(
          'О несчастном случае сообщайте своему мастеру.',
          'С остальными вопросами безопасности обращайтесь в отдел кадров.',
          NO_RETALIATION,
        ),
      ]),
      section('responsible', [
        {
          kind: 'text',
          text: 'За безопасность на производстве отвечает специалист по кадрам и соблюдению требований.',
        },
      ]),
    ],
  },
  {
    ...fromEnglish('/policies/health-and-vaccination'),
    title: 'Здоровье и вакцинация',
    metaTitle: 'Политика охраны здоровья и вакцинации',
    description:
      'Медпункт, медицинское обеспечение для семьи, добровольная и бесплатная вакцинация; прививка не является условием работы в RUN APPAREL.',
    heading: 'Здоровье —',
    headingAccent: 'для каждого из нас.',
    lede: 'Эта политика описывает повседневную медицинскую помощь и вакцинацию на производстве и действует для всех, кто здесь работает.',
    sections: [
      section('commit', [
        list(
          'У нас есть медпункт, и медицинская помощь доступна на месте.',
          'Наше медицинское обеспечение распространяется на работника и его семью.',
          'Кампании вакцинации на фабрике добровольные и бесплатные.',
          'Мы следуем национальным рекомендациям Пакистана по охране здоровья и вакцинации на рабочем месте.',
          'Мы не требуем вакцинации как условия приёма на работу: мы делаем её доступной и поощряем осознанный выбор.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'С повседневными вопросами здоровья на работе помогает медпункт.',
        },
        {
          kind: 'text',
          text: 'Кампания вакцинации всегда бесплатная и добровольная. Мы рекомендуем вакцинацию, а решение каждый принимает сам.',
        },
        {
          kind: 'text',
          text: 'Каждый получает средства защиты, которые нужны для его работы: маски, защитные ограждения станков и средства защиты слуха там, где этого требует работа.',
        },
        {
          kind: 'text',
          text: 'Пожарные учения и обучение пожарной безопасности проходят каждые 6 месяцев.',
        },
        { kind: 'text', text: 'Есть чистая питьевая вода, вентиляция и перерывы на отдых.' },
      ]),
      section('concerns', [
        list('С вопросами о здоровье обращайтесь в отдел кадров.', NO_RETALIATION),
      ]),
      section('responsible', [{ kind: 'text', text: 'Отдел кадров.' }]),
    ],
  },
  {
    ...fromEnglish('/policies/equal-opportunity'),
    title: 'Равные возможности',
    metaTitle: 'Политика равных возможностей',
    description:
      'Как RUN APPAREL нанимает и повышает: проверка навыков, результаты работы, равная оплата за равный труд, женщины и мужчины на любых должностях.',
    heading: 'Равные шансы —',
    headingAccent: 'на любой должности.',
    lede: 'Эта политика описывает, как мы нанимаем и повышаем, и действует для каждого кандидата и каждого работника.',
    sections: [
      section('commit', [
        list(
          'Женщин и мужчин нанимают на любые должности.',
          'Найм основан на практической проверке навыков.',
          'Повышение основано на результатах работы.',
          'Равная оплата за равный труд.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'Решение о найме принимается по тому, что кандидат показывает на проверке навыков.',
        },
        {
          kind: 'text',
          text: 'Решение о повышении принимается по тому, как человек справляется со своей работой.',
        },
        {
          kind: 'text',
          text: 'Люди на одной должности, которые выполняют одну и ту же работу, получают одинаковую оплату.',
        },
      ]),
      section('concerns', [
        list('С вопросами о справедливом отношении обращайтесь в отдел кадров.', NO_RETALIATION),
      ]),
      section('responsible', [{ kind: 'text', text: 'Отдел кадров.' }]),
    ],
  },
  {
    ...fromEnglish('/policies/labor-rights'),
    title: 'Трудовые права и запрет детского труда',
    description:
      'Приём с 18 лет по удостоверению личности, работа пн–сб, добровольные оплачиваемые сверхурочные, оплата не ниже минимума, без сборов и изъятия документов.',
    heading: 'Ваши права на работе —',
    headingAccent: 'в письменном виде.',
    lede: 'Эта политика описывает возраст приёма на работу, рабочее время, оплату и ваши права на работе и действует для всех, кто здесь работает.',
    sections: [
      section('commit', [
        list(
          'Здесь не работает никто младше 18 лет. Мы проверяем национальное удостоверение личности каждого нового работника.',
          // The owner approved the English of this sentence on 2026-10-07; the live settings' hours
          // box carries the same Monday-to-Saturday week (see `policies.ts`).
          'Обычный рабочий график — с понедельника по субботу, с 08:00 до 17:00.',
          'Сверхурочная работа добровольная и оплачивается дополнительно.',
          'Оплата не ниже установленного законом минимума.',
          'Мы никогда не берём плату или залог за трудоустройство и никогда не удерживаем ничьи документы, удостоверяющие личность.',
          'Работники вправе вступить в профсоюз или комитет. Сейчас их нет.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'Возраст проверяется при приёме на работу по национальному удостоверению личности.',
        },
        {
          kind: 'text',
          text: 'Сверхурочная работа — всегда добровольный выбор, и дополнительные часы оплачиваются дополнительно.',
        },
      ]),
      section('concerns', [
        list(
          'С вопросами о рабочем времени, оплате или отношении обращайтесь в отдел кадров.',
          NO_RETALIATION,
        ),
      ]),
      section('responsible', [{ kind: 'text', text: 'Отдел кадров.' }]),
    ],
  },
  {
    ...fromEnglish('/policies/quality'),
    title: 'Качество',
    metaTitle: 'Политика качества: проверки каждого заказа',
    description:
      'Проверки, которые проходит каждый заказ RUN APPAREL: ткань при поступлении, работа на пошиве, размеры и подписанная финальная инспекция перед упаковкой.',
    heading: 'Проверено —',
    headingAccent: 'на каждом этапе.',
    lede: 'Эта политика описывает, как проверяется заказ — от поступления ткани до упакованной коробки.',
    sections: [
      section('commit', [
        list(
          'Ткань проверяется при поступлении.',
          'Работа проверяется во время пошива.',
          'Размеры изделий проверяются.',
          'Перед упаковкой проводится финальная инспекция.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'Проверки идут по порядку: ткань при поступлении, работа во время пошива, размеры, затем финальная инспекция перед упаковкой.',
        },
        {
          kind: 'text',
          text: 'Перед упаковкой менеджер по контролю качества и мерчендайзер вместе подписывают приёмку.',
        },
      ]),
      section('concerns', [
        {
          kind: 'text',
          text: 'Заказчик, который обнаружил проблему с заказом, может написать нам. Мы отвечаем в течение 24 часов.',
        },
      ]),
      section('responsible', [
        {
          kind: 'text',
          text: 'Менеджер по контролю качества вместе с мерчендайзером подписывает приёмку каждого заказа перед упаковкой.',
        },
      ]),
    ],
  },
  {
    ...fromEnglish('/policies/environmental'),
    title: 'Экология',
    metaTitle: 'Экологическая политика: солнце и обрезки',
    description:
      'Около 83% электроэнергии фабрики — от солнечных панелей, обрезки ткани идут в переработку или в дело, химикатов и сточных вод на производстве мало.',
    heading: 'Что мы используем',
    headingAccent: 'и что сберегаем.',
    lede: 'Эта политика описывает, как мы используем энергию и материалы на производстве.',
    sections: [
      section('commit', [
        // `aboutPages.ru.ts` leaves this first line out of the factory page by its opening words,
        // «Солнечные панели на крыше»: change them there too.
        list(
          'Солнечные панели на крыше дают около 83% электроэнергии фабрики.',
          'Обрезки ткани продаются переработчикам или идут на мелкие изделия и набивку.',
          'На нашем производстве используется очень мало химикатов, потому что крашение и отделку выполняют наши поставщики тканей.',
          'Сточных вод мало, потому что крашения на месте нет.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'Обрезки после раскроя собирают, а затем продают переработчикам или используют для мелких изделий и набивки.',
        },
        {
          kind: 'text',
          text: 'Крашение и отделка проходят у наших поставщиков тканей, поэтому наше производство использует очень мало химикатов и даёт мало сточных вод.',
        },
      ]),
      section('concerns', [
        {
          kind: 'text',
          text: 'Заказчик, который хочет узнать больше о наших материалах, может написать нам. Мы отвечаем в течение 24 часов.',
        },
      ]),
      section('responsible', [{ kind: 'text', text: 'За эту политику отвечает директор.' }]),
    ],
  },
]

/**
 * `T` with every string literal widened to `string`: the same keys and the same number of entries
 * in every tuple as the English, with Russian words allowed.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: Widen<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T

/** `POLICIES_INDEX`: the same keys, every word Russian, the addresses and links the English ones. */
export const POLICIES_INDEX_RU: Widen<typeof POLICIES_INDEX> = {
  path: POLICIES_INDEX.path,
  title: 'Политики',
  metaTitle: 'Политики: труд, безопасность и качество',
  description:
    'Политики, по которым RUN APPAREL относится к своим людям, шьёт одежду и ведёт дела. Мы соблюдаем их каждый день на нашем производстве в Сиалкоте.',
  heading: 'Как мы работаем —',
  headingAccent: 'в письменном виде.',
  lede: 'Фабрика должна уметь показать свои правила, а не только заявлять о них. Эти политики определяют, как мы относимся к своим людям, шьём одежду и ведём дела. Каждую из них мы соблюдаем каждый день на нашем производстве в Сиалкоте.',
  /** `CERTIFICATION_LINES`, in the one Russian every page uses; no logos (PLAN.md D1). */
  standards: CERTIFICATION_LINES_RU,
  standardsPromise: CERTIFICATION_PROMISE_RU,
  websiteLinks: [
    { href: '/privacy', name: 'Конфиденциальность' },
    { href: '/terms', name: 'Условия' },
  ],
}

/** `POLICY_CLOSING`: the closing line of every policy page. */
export const POLICY_CLOSING_RU =
  'Эта страница — краткое изложение нашей политики простыми словами. Заказчик или аудитор, которому нужен полный документ, может запросить его у нас.'

/** `POLICY_ACTION`: a secondary link, never a new primary button (PLAN.md Part D). */
export const POLICY_ACTION_RU = 'Задать вопрос о политике'
