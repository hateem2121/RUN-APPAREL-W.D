import type { SpecGroupKey } from './specs.ts'

/**
 * RUSSIAN TWIN OF THE SPEC NOTES AND HEADINGS (owner's choice, 2026-11-16: Russian copies of the
 * 3D garment pages at /ru/products/<product>/<colour>, the page's own words in Russian, the
 * garment's CMS-typed text in English).
 *
 * Keyed by the SAME `noteKey` keys as `specNotes.ts`, so one lookup serves both languages and a
 * term with no Russian line falls back to its English line (`specNote(…, 'ru')`), never to
 * nothing. `specNotes.ru.test.ts` holds the two key sets equal, so a new English note fails the
 * suite until it has its twin here.
 *
 * Each line says what its English line says and nothing more (no new claims). Terms follow the
 * site's Russian glossary (`apps/cms/src/lib/glossary.ru.ts`), which already holds the approved
 * Russian for polyester, spandex, DWR, taped and bonded seams, flatlock and four-way stretch;
 * those lines are copied from it word for word. Fibre names as the Lopatin spelling dictionary
 * writes them: «полиэстер», «спандекс», «эластан», «нейлон». Fabric weight is «плотность» in
 * «г/м²», as the site's Russian guides and FAQ write it. Typography: a no-break space (written
 * as the escape, never the raw character) before a dash and between a number and its unit.
 *
 * Kept in Latin letters: DWR and DTF (the trade's own abbreviations, spelled out in Russian
 * beside them, as the glossary does), V in «V-образный», and FIFA Quality Pro (a programme's
 * name, as the site's Russian ball pages write it).
 */

export const FIBRE_NOTES_RU: Record<string, string> = {
  polyester: 'Прочный, лёгкий и быстро сохнет; держит форму и цвет стирку за стиркой.',
  'recycled polyester':
    'Полиэстер из переработанного пластика, например из использованных бутылок, а не из нового сырья.',
  spandex: 'То, что даёт ткани растяжение: она движется вместе с телом и возвращается в форму.',
  'spandex stretch':
    'То, что даёт ткани растяжение: она движется вместе с телом и возвращается в форму.',
  nylon: 'Гладкий, прочный и лёгкий; устойчив к истиранию и быстро сохнет.',
  'nylon (polyamide)': 'Нейлон, он же полиамид: гладкий, прочный, лёгкий и быстро сохнет.',
  cotton: 'Мягкое натуральное волокно, которое пропускает воздух и приятно к телу.',
  'organic cotton':
    'Хлопок, выращенный без синтетических пестицидов и удобрений; мягкий и дышащий.',
  'genuine leather (cowhide)':
    'Натуральная коровья кожа: износостойкая, не продувается и с ноской становится мягче.',
  polychloroprene:
    'Химическое название неопрена: резиноподобный вспененный материал, который сохраняет тепло даже мокрым.',
  'textured woven polyester':
    'Фактурный тканый полиэстер для внешнего слоя: лёгкий, прочный и ветрозащитный.',
  'polyester taffeta':
    'Гладкая лёгкая тканая подкладка, которая свободно скользит поверх другой одежды.',
}

export const FIT_NOTES_RU: Record<string, string> = {
  'contoured, masculine-specific cut':
    'Повторяет мужскую фигуру, поэтому плотно прилегает и нигде не тянет.',
  'contoured, female-specific cut':
    'Повторяет женскую фигуру, поэтому плотно прилегает и нигде не тянет.',
  'kinetic athletic fit': 'Облегает тело, но оставляет свободу там, где вы сгибаетесь и тянетесь.',
  'tactical engineered fit':
    'Скроено для движения: свобода тянуться и наклоняться без лишней ткани.',
  'tapered urban fit': 'Узкий крой, сужающийся книзу, для аккуратного городского вида.',
  'extended modern commuter fit': 'Длиннее обычной куртки, поэтому закрывает больше.',
  'articulated athletic fit':
    'Локти выкроены по форме руки: рукава не натягиваются, когда вы сгибаете руки и тянетесь.',
  'relaxed athletic fit':
    'Свободнее спортивной посадки: в ней легко двигаться и удобно носить слоями.',
  'streamlined aero fit':
    'Плотно и гладко прилегает, поэтому на скорости ничего не полощется на ветру.',
  'tapered pant silhouette': 'Брюки сужаются от бедра к щиколотке, для аккуратного силуэта.',
  'relaxed flow fit': 'Свободная и удобная, поэтому ткань легко движется вместе с вами.',
  'athletic tapered fit': 'Облегает корпус и сужается книзу.',
  'skinny fit': 'Облегает тело по всей длине.',
  'relaxed, refined fit':
    'Свободная и удобная, а крой достаточно аккуратный, чтобы выглядеть элегантно.',
  'sleek athletic cut': 'Узкий, гладко сидит по корпусу и создан для движения.',
  'cropped cut': 'Короче обычного, заканчивается выше талии.',
  'athletic fit': 'Облегает тело, но не сдавливает, поэтому движется вместе с вами.',
  'high-support compression': 'Плотное облегание, которое поддерживает тело и уменьшает колебания.',
  'anatomical, low-bulk fit':
    'Повторяет форму тела почти без лишней ткани, поэтому ничего не собирается в складки.',
  'flexible compression fit':
    'Плотно облегает и поддерживает, но тянется достаточно, чтобы свободно двигаться.',
  'athletic fit with ergonomic panel design':
    'Облегающая посадка со вставками, форма которых учитывает движения тела.',
  'modern athletic fit': 'Облегающий лаконичный спортивный силуэт, который не сдавливает.',
  'boxy fit': 'Свободный прямоугольный силуэт: ниспадает прямо от плеч.',
  'tailored, secure fit': 'Облегающий аккуратный крой, поэтому изделие не смещается при движении.',
  'ergonomic athletic fit': 'Спортивная посадка, выкроенная с учётом того, как движется тело.',
  'aero race fit':
    'Очень плотно и гладко прилегает, чтобы снизить сопротивление воздуха на гоночной скорости.',
  'race fit': 'Очень плотно облегает тело, поэтому ничего не полощется и не мешает.',
  'tailored lounge fit':
    'Достаточно свободная для отдыха и достаточно аккуратная, чтобы выйти в ней из дома.',
  'high-stretch, unrestricted fit':
    'Эластичная посадка, в которой можно свободно двигаться и на тренировке, и в повседневной носке.',
  'relaxed, flexible fit':
    'Свободная и эластичная, поэтому движется вместе с вами при каждом ударе.',
  'compression belt, conical skirt':
    'Плотный пояс на талии и юбка, которая расширяется книзу конусом.',
}

const DWR = 'Стойкое водоотталкивающее покрытие (DWR), с которого дождь скатывается каплями.'
const DTF =
  'Печать на плёнке (DTF): рисунок печатают на плёнке, а затем переносят на ткань прессом с нагревом.'
const EVA = 'Лёгкая подкладка из пеноматериала, которая смягчает удары и держит форму.'
const SCREEN = 'Краска продавливается через трафарет: яркий, плотный и стойкий цвет.'
const SUBLIMATION = 'Рисунок окрашивает саму ткань, поэтому не трескается и не отслаивается.'
const STRETCH_RECYCLED_POLY =
  'Эластичный трикотаж из переработанного полиэстера, который движется вместе с вами.'
const NOT_SEE_THROUGH = 'Держит форму и не начинает просвечивать от носки.'
const FOUR_WAY =
  'Тянется и поперёк, и вдоль полотна, поэтому движется вместе с вами в любую сторону.'

export const FEATURE_NOTES_RU: Record<string, string> = {
  // R-AJM, R-AU, R-AJ (American football)
  'double mesh interlock':
    'Двухслойный сетчатый трикотаж: воздухопроницаемый, но достаточно прочный для контактной игры.',
  'eva foam pad': EVA,
  'eva padding': EVA,
  'silicone printing':
    'Объёмный резиноподобный принт с чёткими краями, которые выдерживают контактную игру.',
  'contrasting ribbed v-neck trim':
    'Эластичная окантовка V-образного выреза из рибаны другого цвета.',
  'padded pants with run elastic waistband':
    'Брюки с накладками из пеноматериала в области таза, на бёдрах и коленях и эластичным поясом.',
  'double interlock knit': 'Плотный гладкий двойной трикотаж, который держит форму.',
  // R-KMJ, R-ATJ, R-MSS, R-ALJ, R-VCJ (softshells and the leather jacket)
  'hydro-repellent softshell':
    'Эластичная ткань верхнего слоя, с которой дождь скатывается каплями.',
  'structural scuba hood with visor':
    'Облегающий капюшон, который держит форму, с козырьком от дождя.',
  'core ventilation system':
    'Вентиляционные отверстия выпускают тепло тела, чтобы вы не перегревались в движении.',
  'shock-cord hem': 'Эластичный шнур по низу: затяните его, чтобы не задувал ветер.',
  'reinforced bonded seams':
    'Швы, соединённые термоклеевой лентой,\u00a0— для прочности и лучшей защиты от дождя.',
  '1.2 mm cowhide leather':
    'Натуральная коровья кожа толщиной 1,2\u00a0мм: прочная, но достаточно лёгкая, чтобы свободно двигаться.',
  'multi-point adjustable storm hood':
    'Штормовой капюшон регулируется в нескольких точках и плотно прилегает.',
  'waterproof utility zippers': 'Молнии, которые не пропускают дождь.',
  'adjustable velcro cuffs': 'Хлястики на липучке затягивают манжеты от ветра и дождя.',
  '3d articulated shoulder panels':
    'Фигурные плечевые вставки позволяют свободно поднимать руки и тянуться.',
  'insulated taffeta lining': 'Гладкая подкладка из тафты с утеплителем внутри, для тепла.',
  'reinforced knee panels': 'Дополнительные слои на коленях, где брюки изнашиваются раньше всего.',
  'taped waterproof seams':
    'Лента, проклеенная поверх швов, чтобы дождь не проникал через проколы от иглы.',
  'windproof membrane': 'Тонкий слой внутри ткани, который не пропускает ветер.',
  'high-neck scuba hood with toggles':
    'Высокий облегающий капюшон, который затягивается фиксаторами от ветра.',
  'dual-entry utility pockets': 'Карманы со входом с двух сторон.',
  'adjustable storm cuffs': 'Манжеты затягиваются, чтобы не пропускать ветер и дождь.',
  'matte memory-shine finish': 'Матовая отделка с мягким, едва заметным блеском.',
  'thermal regulating fabric': 'Ткань, которая греет в холод и не даёт перегреться.',
  'adjustable scuba hood system':
    'Облегающий капюшон регулируется, чтобы плотно сидеть вокруг лица.',
  'dwr weather-resistant finish': DWR,
  'tactical chest zippers': 'Молнии на груди, до которых легко дотянуться на ходу.',
  'dual-layer storm cuffs': 'Внутренняя и внешняя манжеты вместе защищают от ветра и дождя.',
  '3d engineered paneling':
    'Вставки повторяют форму тела, поэтому куртка не теряет силуэт в движении.',
  // R-PPS, R-ATW (sherpa, windbreaker)
  'high-loft sherpa fleece':
    'Толстый пушистый флис, который удерживает тёплый воздух, как овечья шерсть.',
  'bonded mesh lining':
    'Сетчатая подкладка, склеенная с флисом, поэтому оба слоя работают как один.',
  'durable ripstop overlays':
    'Накладки из прочного рипстопа с вплетённой сеткой, которая не даёт разрывам расползаться.',
  'zippered chest pocket': 'Нагрудный карман на молнии, чтобы мелочи не потерялись.',
  'double-needle reinforced stitching': 'Две параллельные строчки делают швы долговечными.',
  'ultralight wind-resistant shell': 'Очень лёгкий внешний слой, который защищает от ветра.',
  'ventilated back yoke': 'Вентиляционные прорези в верхней части спины выпускают тепло.',
  'breathable mesh lining': 'Воздухопроницаемая сетка внутри, через которую уходят тепло и пот.',
  'dwr water-repellent finish': DWR,
  'packable construction': 'Складывается компактно, чтобы его было легко убрать.',
  // R-ET, R-CCH, R-CSP (tracksuit, hoodie, pullover)
  'pullover hood with drawcord': 'Худи без застёжки, со шнурком, который затягивает капюшон.',
  'contrast raglan sleeves': 'Рукава другого цвета, вшитые по диагонали, для свободы движения рук.',
  'tapered pant with ribbed cuffs': 'Брюки сужаются к эластичным манжетам из рибаны на щиколотках.',
  'elastic waist': 'Эластичный пояс: легко надевать, и он не сползает.',
  'wrinkle-resistant fabric': 'Ткань почти не мнётся и выглядит аккуратно даже после поездки.',
  'screen print': SCREEN,
  'soft-touch tech fleece': 'Гладкий мягкий флис, который сохраняет тепло.',
  'structured raglan paneling':
    'Диагональные швы рукава формируют линию плеч и дают свободу рукам.',
  'wide bell sleeves': 'Рукава, расширяющиеся к запястью.',
  'oversized hood construction': 'Большой объёмный капюшон для расслабленного образа.',
  'ribbed hemline': 'Эластичная рибана по низу, которая держит форму.',
  'high-density screen print': 'Плотный объёмный принт шелкографией с чёткими краями.',
  'brushed thermal fleece interior': 'Мягкая начёсанная изнанка, которая удерживает тепло.',
  'stand-up mock neck': 'Невысокий воротник-стойка, который согревает шею.',
  'half-zip ventilation': 'Укороченная молния: расстегните её, чтобы охладиться.',
  'ribbed cuffs and hem': 'Эластичные манжеты и низ из рибаны, которые держат форму.',
  'double-stitch construction': 'Швы прошиты дважды для дополнительной прочности.',
  // R-TAZ (half-zip polo)
  'modern blade collar': 'Лаконичный плоский воротник с чётким краем.',
  'semi-auto lock zipper placket':
    'Молния фиксируется, когда бегунок опущен, и сама не расстёгивается.',
  'split-hem construction': 'Короткие боковые разрезы по низу для свободы движений.',
  'odor-resistant moisture wicking': 'Отводит пот от кожи и помогает сдерживать запах.',
  '4-way stretch mobility': FOUR_WAY,
  // R-ZT, R-CAT (yoga tights)
  'squat-proof opacity': 'Не просвечивает при растяжении, даже в глубоком приседе.',
  'color-lock dyeing': 'Способ крашения, при котором цвет сохраняется после многих стирок.',
  'poly stretch knit':
    'Эластичный трикотаж из полиэстера, который движется вместе с вами и держит форму.',
  'fade and pill resistant': 'Устойчивость к выцветанию и к катышкам, которые появляются от носки.',
  'compression architecture': 'Плотная поддержка, заложенная в самом трикотаже.',
  'high-rise ergonomic waistband': 'Высокий анатомический пояс, который не смещается при движении.',
  'hydrophobic fiber technology': 'Волокна, которые отталкивают пот, а не впитывают его.',
  'puri knit fabric': 'Трикотаж, который держит форму и не просвечивает даже на горячей йоге.',
  'shape and opacity retention': NOT_SEE_THROUGH,
  // R-PRS, R-IFS, R-HFJ, R-AFP (running shirt, sweatshirt, training tops)
  'quarter-zip airflow regulation':
    'Короткая молния у горловины: расстегните её, чтобы впустить воздух, когда становится жарко.',
  'mesh knit and piqué knit panels':
    'Вставки из воздухопроницаемой сетки и рельефного пике\u00a0— для вентиляции и структуры.',
  'recycled polyester':
    'Ткань сделана из переработанного пластика, например из использованных бутылок.',
  'side pocket': 'Боковой карман для мелочей.',
  'metal zip': 'Прочная металлическая молния.',
  'flex jersey knit': 'Мягкий эластичный трикотаж джерси, который движется вместе с вами.',
  'clean crew neckline': 'Простой круглый вырез горловины.',
  'precision-finished cuffs and hem': 'Аккуратно обработанные манжеты и низ, которые держат форму.',
  'fade-resistant color': 'Цвет устойчив к выцветанию от стирки к стирке.',
  'digital printing':
    'Рисунок печатается прямо из цифрового файла, с тонкой детализацией и множеством цветов.',
  'power knit and waffle knit panels':
    'Гладкий эластичный трикотаж и фактурное вафельное полотно\u00a0— для драпировки и приятного ощущения на теле.',
  'poly stretch fabric': 'Эластичная ткань из полиэстера, которая движется вместе с вами.',
  'upper stitch detailing':
    'Видимая декоративная строчка в верхней части изделия, которая подчёркивает мастерство пошива.',
  'waffle knit': 'Вафельный трикотаж с фактурой «соты»: мягкий на ощупь и сохраняет тепло.',
  'invisible zip': 'Потайная молния в шве\u00a0— для аккуратного вида.',
  'convertible stand collar':
    'Воротник стоит, когда молния застёгнута, и раскрывается, когда она расстёгнута.',
  'recycled polyester stretch': STRETCH_RECYCLED_POLY,
  // Printing, on many garments
  'dtf print': DTF,
  'dtf print and embroidery':
    'Печать на плёнке (DTF) с переносом под прессом, а также вышивка нитками.',
  'screen printing': SCREEN,
  'full sublimation print':
    'Рисунок окрашивает ткань по всей площади, поэтому не трескается и не отслаивается.',
  'sublimation printing': SUBLIMATION,
  'digital sublimation print': SUBLIMATION,
  // R-WCT, R-ECT, R-WZU, R-ASB (crop tops, vest, sports bra)
  'compression interlock': 'Плотный облегающий трикотаж, который обхватывает и поддерживает тело.',
  'athletic spandex': 'Высокоэластичная ткань, которая движется вместе с телом.',
  'moisture-wicking blend': 'Смесовая ткань, которая отводит пот от кожи.',
  'ventilated cropped cut': 'Укороченный крой пропускает воздух, чтобы вам не было жарко.',
  'single jersey knit': 'Лёгкий гладкий трикотаж, как у классической футболки.',
  'thumb holes': 'Отверстия для больших пальцев на манжетах, чтобы рукава оставались на месте.',
  'breathable contoured coverage':
    'Дышащая ткань, повторяющая форму тела: тело закрыто, но вам не жарко.',
  'matching high-waist shorts':
    'Шорты из той же ткани с высокой посадкой, которые носят в комплекте.',
  'recycled-polyester power mesh':
    'Прочная эластичная сетка из переработанного полиэстера, в которой не жарко.',
  'reversible zip': 'Молния работает с обеих сторон, поэтому жилет можно носить на две стороны.',
  'mesh panel construction':
    'Сетчатые вставки пропускают воздух там, где тело нагревается сильнее всего.',
  'elastane strap': 'Бретель с эластаном (спандексом): надёжно держит и тянется вместе с вами.',
  'high-support compression': 'Плотная поддержка, которая уменьшает колебания.',
  'spacer knit fabric': 'Упругий двухслойный трикотаж, который дышит и отводит пот.',
  'moisture-wicking': 'Отводит пот от кожи, чтобы вы оставались суше.',
  'strappy back design': 'Несколько бретелей на спине для поддержки и вентиляции.',
  // R-SNP (wetsuit)
  'laminated high-stretch neoprene':
    'Эластичный неопрен с приклеенной тканью: греет и не стесняет движений.',
  'ergonomic neckline': 'Горловина такой формы, что голову можно свободно поворачивать.',
  'anatomically engineered panels': 'Вставки по форме тела для плотного прилегания в воде.',
  'reinforced chest and shoulder zones':
    'Более прочный материал на груди и плечах, где износ сильнее всего.',
  'flatlock and bonded seams': 'Плоские прошитые и клеевые швы: долговечные и не натирают.',
  // R-XMT, R-MXT (training vest, training top)
  'breathable mesh panels': 'Сетчатые вставки пропускают воздух там, где тело нагревается.',
  'sleeveless athletic design': 'Без рукавов: полная свобода движения рук и вентиляция.',
  'temperature-regulating performance':
    'Создано, чтобы вам было комфортно, когда тело разогревается и остывает.',
  'flatlock stitching': 'Плоские швы, которые гладко прилегают к коже и не натирают.',
  'full-length front zipper': 'Молния во всю длину: легко надеть, снять и быстро остыть.',
  'invisible side zip panels': 'Боковые вставки с потайными молниями\u00a0— для аккуратного вида.',
  'moisture-wicking quick-dry fabric': 'Отводит пот от кожи и быстро сохнет.',
  // R-VPJ, R-CSS, R-FFT, R-CVN, R-SRS (soccer)
  'interlock knit': 'Гладкий двойной трикотаж: мягкий и держит форму.',
  'sponsor logo zones': 'Участки, оставленные свободными для логотипов спонсоров.',
  'diagonal chest and shoulder panels':
    'Однотонные вставки, расположенные под углом на груди и плечах.',
  'cotton-poly balance fabric':
    'Смесь хлопка и полиэстера: мягкость хлопка и прочность полиэстера.',
  'fold-over polo collar': 'Классический отложной воротник поло.',
  'aero liner mesh': 'Лёгкая воздухопроницаемая сетка, которая не даёт игрокам перегреваться.',
  'adjustable sides': 'Бока затягиваются, и изделие сидит плотнее свободной манишки.',
  'lightweight 80–100 gsm build': 'Очень лёгкая ткань, 80–100\u00a0г/м².',
  'quick-dry lightweight fabric': 'Лёгкая ткань, которая быстро сохнет.',
  'contrast sleeve panels': 'Рукава другого цвета.',
  '6-panel construction': 'Сшито из шести деталей для посадки по фигуре.',
  'cylindrical sleeve piping for airflow':
    'Округлый кант вдоль рукавов, который направляет воздух вокруг шеи.',
  'v-shape collar': 'V-образный воротник, открытый у шеи.',
  'folded sleeve and waist hems':
    'Подогнутые и прошитые края рукавов и низа\u00a0— для аккуратной отделки.',
  'recycled-polyester velocity jersey interlock':
    'Гладкий лёгкий двойной трикотаж джерси из переработанного полиэстера.',
  // R-MRP, R-TTP, R-GTD, R-BCD, R-MM, R-WSA (tennis)
  'suitable for tennis and pickleball':
    'Создано для корта: подходит и для тенниса, и для пиклбола.',
  'recycled interlock knit': 'Гладкий двойной трикотаж из переработанного полиэстера.',
  'engineered seam placement': 'Швы расположены так, чтобы помогать движению и не мешать.',
  'flex jersey panels': 'Эластичные вставки из джерси там, где тело сгибается.',
  'poly-stretch interlock': 'Эластичный двойной трикотаж из полиэстера, который держит форму.',
  'bra and skirt set': 'Комплект из спортивного бюстгальтера и юбки, которые носят вместе.',
  'high-flexibility construction': 'Создано, чтобы тянуться и гнуться при каждом ударе.',
  '22-panel faceted construction': 'Из 22 скошенных панелей, как грани бриллианта.',
  'interlock spandex': 'Гладкий эластичный двойной трикотаж, который движется вместе с вами.',
  'textured compression belt': 'Плотный фактурный пояс, который держит платье на месте.',
  'conical skirt construction': 'Юбка конического кроя, расширяющаяся книзу.',
  // R-XMP, RXPS (cycling)
  'multi-density chamois pad':
    'Велосипедная вставка с более жёсткими и более мягкими зонами\u00a0— для долгих поездок.',
  'breathable mesh bib straps': 'Воздухопроницаемые сетчатые лямки, которые держат шорты на месте.',
  'silicone leg grippers': 'Силиконовые полосы на концах штанин, чтобы они не задирались.',
  'moisture-wicking fabric': 'Ткань, которая отводит пот от кожи, чтобы вы оставались суше.',
  'moisture management': 'Отводит пот от кожи, чтобы вам было сухо.',
  'four-way stretch': FOUR_WAY,
  'quick-dry handle': 'Ткань гладкая на ощупь и быстро сохнет.',
  // R-SPS (lounge set)
  'micro rib fleece':
    'Мягкий трикотаж с тонкими выпуклыми рубчиками, который добавляет фактуры и тепла.',
  'structured quarter-zip polo collar': 'Воротник поло держит форму; у горловины короткая молния.',
  'wide-leg flow pants': 'Брюки, широкие от бедра до низа, свободно движутся при ходьбе.',
  'elastic high-rise waist': 'Эластичный пояс с высокой посадкой, который не сползает.',
  'premium ribbed trim': 'Эластичная окантовка из рибаны, которая держит форму.',
}

/**
 * The weight bands in Russian, band for band, with the SAME `below` thresholds as `WEIGHT_BANDS`
 * (the test holds them equal). Each band completes «эта ткань …».
 */
export const WEIGHT_BANDS_RU: readonly { readonly below: number; readonly band: string }[] = [
  { below: 120, band: 'очень лёгкая и тонкая' },
  { below: 170, band: 'лёгкая, её удобно носить слоями' },
  { below: 230, band: 'средней плотности, добротная, но не сковывает движений' },
  { below: 300, band: 'тяжелее средней: прочная и износостойкая' },
  { below: Number.POSITIVE_INFINITY, band: 'тяжёлая и толстая, для тепла' },
]

/** `weightNote`'s fixed sentences in Russian. */
export const WEIGHT_NOTES_RU = {
  neoprene: 'Неопрен продаётся по толщине: чем толще, тем теплее, чем тоньше, тем легче гнётся.',
  thickness: 'Измеряется по толщине: чем толще, тем прочнее, чем тоньше, тем легче и мягче.',
  insulation: 'Вес утеплителя внутри, в г/м²: чем больше граммов, тем теплее.',
  band: (band: string) => `Плотность\u00a0— вес ткани в г/м²; эта ткань ${band}.`,
} as const

/** `SPEC_HEADINGS` in Russian. Fabric weight is «плотность», as the site's Russian guides say. */
export const SPEC_HEADINGS_RU: Record<SpecGroupKey, string> = {
  fabric: 'Ткань',
  weight: 'Плотность',
  fit: 'Посадка',
  performance: 'Особенности',
}

/**
 * The ball's headings in Russian. A ball's weight is its weight («Вес»), and the FIFA line uses
 * «по нормам», as the site's Russian ball FAQ does («в соответствии с нормами FIFA Quality Pro»).
 */
export const ACCESSORY_HEADINGS_RU: Record<SpecGroupKey, string> = {
  fabric: 'Материалы',
  weight: 'Вес',
  fit: 'Размер',
  performance: 'По нормам FIFA Quality Pro',
}
