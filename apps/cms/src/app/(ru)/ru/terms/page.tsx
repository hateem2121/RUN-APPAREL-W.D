// The Russian twin of app/(frontend)/terms/page.tsx (Russian section, 2026-11-15): the same terms,
// sections, ids and links, every visible word in Russian. Read the English page's comments for why
// each term is here. NOT LEGAL ADVICE, as the English: a solicitor should review both before either
// carries any weight.
import type { Metadata } from 'next'
import { OnThisPage, type PageSection } from '../../../../components/site/OnThisPage'
import { getSiteSettings } from '../../../../lib/content'
import { buildMetadata } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Условия использования сайта и 3D-моделей',
  description:
    'Условия, на которых RUN APPAREL публикует этот сайт и 3D-модели изделий. 3D-модель носит ориентировочный характер; цвет подтверждается по физическому образцу.',
  path: '/terms',
  locale: 'ru',
})

/** The English page's terms, same ids in the same order ("On this page" draws this list). */
const SECTIONS = [
  { id: 'references-are-indicative', title: '3D-модели носят ориентировочный характер' },
  { id: 'nothing-is-an-offer', title: 'Ничто на сайте не является офертой' },
  { id: 'your-artwork', title: 'Ваши макеты остаются вашими' },
  { id: 'our-material', title: 'Наши материалы остаются нашими' },
  { id: 'availability', title: 'Доступность' },
] as const satisfies readonly PageSection[]

const heading = (id: (typeof SECTIONS)[number]['id']) => {
  const section = SECTIONS.find((entry) => entry.id === id)
  return (
    <h2 id={id} className="product-card__name prose__heading">
      {section?.title}
    </h2>
  )
}

export default async function RussianTermsPage() {
  const settings = await getSiteSettings()

  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Условия ]</p>
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
          <h1 className="display display--hero hero-legal">
            Ориентир, <span className="serif-accent">а не&nbsp;обещание.</span>
          </h1>
          <p className="site-lede">
            Что наши 3D-модели изделий подтверждают, а что нет, и что происходит с макетами, которые
            вы нам присылаете.
          </p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container legal">
          <OnThisPage sections={SECTIONS} locale="ru" />
          <div className="prose legal__body">
            <p>
              Этот сайт и размещённые на нём 3D-модели изделий публикует {settings.companyName} для
              корпоративных заказчиков, которые рассматривают возможность производства у нас.
            </p>

            {heading('references-are-indicative')}
            <p>
              Они показывают конструкцию, посадку и расположение макета. Цвет выглядит по-разному на
              разных экранах и при разном освещении, и визуализированное изделие не является точным
              цветовым соответствием готовой ткани. Цвет, плотность ткани и отделка подтверждаются
              по физическому образцу до начала производства.
            </p>

            {heading('nothing-is-an-offer')}
            <p>
              Цены, минимальные объёмы и сроки выполнения указываются в письменном виде по каждому
              запросу. Ничто на этом сайте не образует договора.
            </p>

            {heading('your-artwork')}
            <p>
              Технические задания (ТЗ, техпакеты), макеты и образцы, которые вы нам присылаете,
              остаются вашей собственностью и вашей интеллектуальной собственностью. Мы используем
              их только для расчёта стоимости и производства вашего заказа.
            </p>

            {heading('our-material')}
            <p>
              Фотографии, 3D-модели, тексты и товарные знаки на этом сайте принадлежат{' '}
              {settings.companyName}.
            </p>

            {heading('availability')}
            <p>
              Мы стараемся поддерживать доступность сайта и его 3D-моделей изделий, но не
              гарантируем её и не несём ответственности за убытки, возникшие из-за их недоступности.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
