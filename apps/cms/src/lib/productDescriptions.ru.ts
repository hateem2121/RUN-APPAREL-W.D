/**
 * The Russian short description of each live product, for the Russian product cards and the Russian
 * 3D garment pages (owner, 2026-11-21: "Translate all 45", then "Approve all 45" as drafted).
 *
 * ⚠️ EACH LINE CARRIES THE ENGLISH IT TRANSLATES, AND IS USED ONLY WHILE THE CMS STILL SAYS EXACTLY
 * THAT. The CMS field is typed in English and can change any day; a Russian line kept for old words
 * would describe a garment that is no longer there. So `russianDescription` compares the English
 * first and hands back nothing on a mismatch, and the page shows the English, as `GARMENT_TYPE_RU`
 * does for a type it has no word for. Change the English in the CMS → translate it here again.
 *
 * Server-only data: the CMS reads it for its cards and sends it in the garment API as
 * `shortDescriptionRu`; the garment page never bundles it (its script had 489 B left, 2026-11-21).
 * Brand and fabric names stay in Latin letters, as the other Russian files keep them; the ball
 * lines reuse the Russian soccer-ball page's FIFA and Trinity wording word for word.
 */
export const PRODUCT_DESCRIPTIONS_RU: Readonly<
  Record<string, { readonly en: string; readonly ru: string }>
> = {
  rxps: {
    en: 'A women’s performance cycling skinsuit in a nylon knit that stretches four ways. Pro compression spandex, a chamois pad in several densities and breathable mesh bib straps all sit under a full digital print. Silicone leg grippers, flatlock stitching and shaped panels hold you comfortably in an aero race position over long distances.',
    ru: 'Женский стартовый велокомбинезон из нейлонового трикотажа, который тянется в четырёх направлениях. Профессиональный компрессионный спандекс, памперс разной плотности и дышащие сетчатые лямки — всё под сплошной цифровой печатью. Силиконовые грипперы на штанинах, плоские швы (флэтлок) и анатомические панели удобно держат в аэродинамичной гоночной посадке на длинных дистанциях.',
  },
  'r-xmp': {
    en: 'Men’s performance cycling bib shorts for road, MTB and endurance riding. Pro compression spandex holds a chamois pad in several densities and breathable mesh bib straps, and the whole garment takes a full sublimation print. Silicone leg grippers, flatlock stitching and shaped panels keep everything in place over long distances.',
    ru: 'Мужские велошорты с лямками для шоссе, МТБ и длительных заездов. Профессиональный компрессионный спандекс удерживает памперс разной плотности и дышащие сетчатые лямки, а всё изделие покрывается сплошной сублимационной печатью. Силиконовые грипперы на штанинах, плоские швы и анатомические панели держат всё на месте на длинных дистанциях.',
  },
  'r-afp': {
    en: 'A men’s full-sleeve half pullover designed to move from the squat rack to the city street. A sleek athletic cut highlights the physique without restricting it, and the recycled-polyester stretch waffle knit gives both drape and a premium hand-feel. The versatile collar stands sharp for a polished look or unzips for something more relaxed.',
    ru: 'Мужской пуловер с длинным рукавом и молнией до середины груди — из зала прямо на городскую улицу. Спортивный приталенный крой подчёркивает фигуру, не стесняя движений, а вафельный стрейч-трикотаж из переработанного полиэстера хорошо драпируется и приятен на ощупь. Универсальный воротник стоит чётко для собранного образа или расстёгивается для более свободного вида.',
  },
  'r-atw': {
    en: 'A very light, wind-resistant nylon taffeta shell that takes a full sublimation print. A vented back yoke and a breathable mesh lining let heat out. Elastic cuffs and a longer back hem hold the close, aero fit, and a DWR finish repels water. Shaped seams and sleeves let you move freely, and it packs small. Made for road cycling, gravel and long outdoor training in any weather.',
    ru: 'Очень лёгкая ветрозащитная куртка из нейлоновой тафты под сплошную сублимационную печать. Вентилируемая кокетка на спине и дышащая сетчатая подкладка выводят тепло. Эластичные манжеты и удлинённый низ спинки сохраняют облегающую аэродинамичную посадку, а DWR-пропитка отталкивает воду. Фигурные швы и рукава дают свободу движений, а в сложенном виде куртка занимает мало места. Для шоссейного велоспорта, грэвела и долгих тренировок на улице в любую погоду.',
  },
  'r-atj': {
    en: 'A men’s utility jacket in 1.2 mm cowhide leather, with a lining that helps keep an even temperature and a storm hood you can adjust at several points. Waterproof zips and adjustable hook-and-loop cuffs seal it up. The finish sheds rain and moves sweat away, and double-needle stitching keeps the seams strong. Shaped shoulder panels move with you. It is a tough outer layer for every season, made for city commutes, outdoor training and changing weather.',
    ru: 'Мужская утилитарная куртка из коровьей кожи толщиной 1,2 мм, с подкладкой, которая помогает держать ровную температуру, и штормовым капюшоном с регулировкой в нескольких точках. Водонепроницаемые молнии и регулируемые манжеты на липучках закрывают её от непогоды. Отделка отталкивает дождь и отводит пот, а двойная строчка делает швы прочными. Фигурные плечевые панели двигаются вместе с вами. Прочный верхний слой на любой сезон — для поездок по городу, тренировок на улице и переменчивой погоды.',
  },
  'r-wzu': {
    en: 'A women’s zip-up vest that gives the support of a high-performance sports bra with the coverage of a crop vest. Breathable, flexible recycled-polyester power mesh keeps you cool through a workout or a day out. A reversible zip gives you a second way to wear it.',
    ru: 'Женский жилет на молнии: поддержка спортивного бюстгальтера с высокой поддержкой и закрытость укороченного топа. Дышащая эластичная сетка (пауэр-меш) из переработанного полиэстера сохраняет прохладу на тренировке и в течение дня. Реверсивная молния даёт второй способ носки.',
  },
  'r-mm': {
    en: 'A performance tennis dress built on the shape of the old mine cut diamond. It is made from 22 cut fabric panels, each shaped like one facet of the stone. As the player moves, the angled panels seem to shift and catch the light across the body.',
    ru: 'Теннисное платье, построенное по форме старинной шахтной огранки алмаза (old mine cut). Оно собрано из 22 раскроенных панелей, и каждая повторяет одну грань камня. Когда игрок движется, наклонные панели словно смещаются и ловят свет по всему силуэту.',
  },
  'r-aj': {
    en: 'A fitted women’s American football jersey with a shaped cut made for a woman’s body. A bold, distressed brushstroke graphic covers the body, and the V-neck has contrasting ribbed trim. It is made in a double interlock poly-stretch fabric, with both digital sublimation and silicone printing.',
    ru: 'Приталенное женское джерси для американского футбола с кроем по женской фигуре. Смелая графика из потёртых мазков кисти покрывает корпус, а V-образный вырез отделан контрастной рибаной. Изделие из двойного интерлока поли-стрейч, с цифровой сублимацией и силиконовой печатью.',
  },
  'r-ajm': {
    en: 'The men’s counterpart to the Aggressor jersey, defined by a contoured, masculine-specific cut and the same aggressive distressed brushstroke graphic across the body. A V-neck with contrasting ribbed trim completes it. Built in a double mesh interlock with silicone printing and EVA foam padding.',
    ru: 'Мужская версия джерси Aggressor: контурный мужской крой и та же агрессивная графика из потёртых мазков кисти по корпусу. Завершает его V-образный вырез с контрастной рибаной. Двойной сетчатый интерлок, силиконовая печать и защитные вставки из пены EVA.',
  },
  'r-css': {
    en: 'A soccer jersey with a subtle, tonal geometric pattern across the body and sleeves. It has a classic fold-over polo collar and a simple V-neck opening, so a traditional shape meets modern construction. Solid-colored panels run at an angle across the chest and shoulders and mark out the working zones of the athletic cut.',
    ru: 'Футбольное джерси с ненавязчивым геометрическим узором тон в тон на корпусе и рукавах. Классический отложной воротник-поло и простой V-образный вырез: традиционная форма встречается с современной конструкцией. Однотонные панели идут по диагонали через грудь и плечи и обозначают рабочие зоны спортивного кроя.',
  },
  'r-asb': {
    en: 'A high-support compression bra in a breathable spacer knit that pulls sweat away. It cuts down bounce and stays comfortable. The sleek strappy design holds through HIIT sessions and yoga flows alike, and supports you without holding you back.',
    ru: 'Компрессионный бюстгальтер с высокой поддержкой из дышащего трикотажа спейсер, который отводит пот. Уменьшает подпрыгивание и остаётся удобным. Аккуратный дизайн на тонких бретелях держит и на HIIT-тренировке, и на йоге — поддерживает, не сковывая.',
  },
  'r-cch': {
    en: 'A women’s crop hoodie in soft-touch tech fleece with structured raglan paneling and a modern cropped silhouette. Wide bell sleeves and an oversized hood give it shape, and a ribbed hemline finishes it. Breathable warmth and high-density logo printing make it a premium lifestyle layer for the yoga studio, recovery and urban streetwear.',
    ru: 'Женское укороченное худи из мягкого тек-флиса со структурными реглан-панелями и современным укороченным силуэтом. Широкие рукава-колокол и объёмный капюшон задают форму, низ отделан рибаной. Дышащее тепло и плотная печать логотипа делают его премиальным слоем для йога-студии, восстановления и городского стиля.',
  },
  'r-gtd': {
    en: 'A tennis dress made to handle the demands of the game and still look sharp. Every seam and panel is placed with care, so it supports your movement and flatters your shape at the same time. It brings high-tech function and modern design together, for match play and an active life off the court.',
    ru: 'Теннисное платье, рассчитанное на нагрузки игры и при этом стильное. Каждый шов и каждая панель размещены продуманно: платье поддерживает движения и подчёркивает фигуру. Высокотехнологичная функциональность и современный дизайн — для матчей и активной жизни вне корта.',
  },
  'r-au': {
    en: 'A men’s two-piece American football uniform: a shaped jersey over padded pants. The jersey has a contrasting chevron yoke, distressed brushstroke numbers, a panel for the player’s name and a ribbed V-neck trim. The pants have EVA foam pads at the hip, thigh and knee, above an elastic waistband with the RUN name. It is made in a double mesh interlock with silicone printing, so the graphics keep sharp edges through contact.',
    ru: 'Мужская форма для американского футбола из двух частей: приталенное джерси и брюки с защитой. На джерси — контрастная кокетка-шеврон, номера из потёртых мазков кисти, панель для фамилии игрока и V-образный вырез с рибаной. На брюках — вставки из пены EVA на бёдрах сбоку, спереди и на коленях, над эластичным поясом с надписью RUN. Двойной сетчатый интерлок с силиконовой печатью, поэтому графика сохраняет чёткие края при контакте.',
  },
  'r-ect': {
    en: 'A women’s two-piece training set: a cropped full-sleeve top with matching shorts. The premium ultra-soft single jersey offers breathable coverage that contours to the body, making it a natural pairing for studio sessions or the walk home afterwards. Thumb holes keep the sleeves in place through a full session, and a printed logo band finishes the hem of the top and the waist of the shorts.',
    ru: 'Женский тренировочный комплект из двух вещей: укороченный топ с длинным рукавом и шорты в тон. Премиальная ультрамягкая кулирная гладь дышит и облегает тело — естественная пара для занятий в студии и дороги домой. Отверстия для больших пальцев удерживают рукава на месте всю тренировку, а печатная лента с логотипом отделывает низ топа и пояс шорт.',
  },
  'r-et': {
    en: 'A men’s tech tracksuit: a pullover hoodie with tapered pants. Contrast raglan sleeves and a large tonal logo across the chest give it shape. Ribbed cuffs and an elastic waist make it easy to move in and to pull on and off. The fabric dries fast, moves sweat away and resists wrinkles, so it is a complete training set for team travel, warm-ups and everyday active wear.',
    ru: 'Мужской тек-спортивный костюм: худи-пуловер и зауженные брюки. Контрастные рукава-реглан и крупный логотип тон в тон на груди задают форму. Манжеты из рибаны и эластичный пояс дают свободу движений, и костюм легко надеть и снять. Ткань быстро сохнет, отводит пот и не мнётся — полный тренировочный комплект для командных поездок, разминок и повседневной активной носки.',
  },
  'r-srs': {
    en: 'A soccer tee built from six panels in total: two matching side panels, a front and a back panel, and two matching arm gussets with sleeves. Cylindrical piping in the same fabric runs along the sleeves to move air around the neck, a V-shaped collar is attached, and folded hems finish the sleeve and waist.',
    ru: 'Футбольная футболка из шести панелей: две одинаковые боковые, передняя и задняя и две одинаковые ластовицы с рукавами. Кант-шнур из той же ткани проходит по рукавам и улучшает циркуляцию воздуха у шеи, пришит V-образный воротник, а низ и края рукавов подогнуты.',
  },
  'r-snp': {
    en: 'A scuba suit combining high-stretch laminated neoprene with a tonal geometric design for a streamlined, low-bulk profile. The ergonomic neckline supports unrestricted movement, while anatomically engineered panels improve fit, hydrodynamics and thermal efficiency. Reinforced chest and shoulder zones raise abrasion resistance, and flatlock and bonded seams give long-lasting durability underwater.',
    ru: 'Гидрокостюм из высокоэластичного ламинированного неопрена с геометрическим рисунком тон в тон — обтекаемый и не громоздкий. Эргономичный вырез горловины не стесняет движений, а анатомические панели улучшают посадку, гидродинамику и сохранение тепла. Усиленные зоны груди и плеч лучше сопротивляются истиранию, а плоские и клеевые швы долго служат под водой.',
  },
  'r-pps': {
    en: 'A men’s sherpa jacket in a high-loft thermal fleece with bonded mesh lining and durable ripstop overlays. A secure zippered chest pocket, elastic cuffs and hem and a relaxed athletic fit make it easy to live in, while double-needle reinforced stitching and an articulated sleeve design hold up outdoors. Superior heat retention for outdoor adventure, urban commuting and après-ski layering.',
    ru: 'Мужская куртка-шерпа из объёмного термофлиса с приклеенной сетчатой подкладкой и прочными накладками из рипстопа. Нагрудный карман на молнии, эластичные манжеты и низ и свободная спортивная посадка делают её удобной в носке, а усиленная двойная строчка и анатомический крой рукавов выдерживают нагрузки на природе. Отлично держит тепло — для активного отдыха, поездок по городу и после катания на лыжах.',
  },
  'r-prs': {
    en: 'A running shirt built for versatility, with advanced moisture-wicking and a quarter-zip design for instant airflow regulation, so it adapts to body heat as intensity rises. Lightweight, high-stretch mesh and piqué knit fabric allows unrestricted movement, making it as suitable for intense training as for casual wear.',
    ru: 'Универсальная беговая футболка с эффективным отводом влаги и короткой молнией для мгновенной вентиляции: она подстраивается под температуру тела, когда растёт интенсивность. Лёгкая высокоэластичная сетка и трикотаж пике не стесняют движений — подходит и для интенсивных тренировок, и на каждый день.',
  },
  'r-hfj': {
    en: 'A men’s full-sleeve training jersey built for someone who moves straight from the gym to the street. A sleek athletic cut highlights the physique without restricting it, and the power knit and waffle knit panels give the piece its drape and premium hand-feel. Made to be the hardest-working layer in the wardrobe.',
    ru: 'Мужское тренировочное джерси с длинным рукавом для тех, кто идёт из зала прямо на улицу. Спортивный приталенный крой подчёркивает фигуру, не стесняя движений, а панели из пауэр-трикотажа и вафельного трикотажа дают изделию драпировку и премиальную фактуру. Самый рабочий слой в гардеробе.',
  },
  'r-vcj': {
    en: 'A men’s tech jacket in a high-density bonded softshell with an adjustable scuba hood system and a weather-resistant DWR finish. Tactical chest zippers, dual-layer storm cuffs and a thermal regulation lining handle changing conditions, and reinforced bar-tack stitching with 3D engineered paneling holds the shape. Multi-functional performance outerwear for urban training, warm-ups and outdoor exploration.',
    ru: 'Мужская тек-куртка из плотного клеевого софтшелла с регулируемым капюшоном-скуба и защитной DWR-пропиткой. Нагрудные молнии, двойные штормовые манжеты и терморегулирующая подкладка справляются с переменчивой погодой, а закрепки и объёмный 3D-крой держат форму. Многофункциональная верхняя одежда для городских тренировок, разминок и прогулок на природе.',
  },
  'r-xmt': {
    en: 'A men’s hybrid training vest in a lightweight performance fabric with breathable mesh panels and quick-dry, moisture-wicking material. The sleeveless athletic design uses ergonomic panel construction and a full sublimation print, with flatlock stitching for chafe-free comfort. Built as a multi-sport vest for gym, running, CrossFit, cycling and outdoor training.',
    ru: 'Мужская гибридная тренировочная майка из лёгкой функциональной ткани с дышащими сетчатыми вставками; материал быстро сохнет и отводит влагу. Спортивный крой без рукавов с эргономичными панелями и сплошной сублимационной печатью, плоские швы не натирают. Мультиспортивная майка для зала, бега, кроссфита, велоспорта и тренировок на улице.',
  },
  'r-ttp': {
    en: 'A tennis dress inspired by the tiger tail butterfly, a species known for both its beauty and its flexibility. Built in a recycled interlock knit with digital sublimation across the body, it carries that reference into a garment made for movement on court.',
    ru: 'Теннисное платье, вдохновлённое бабочкой «тигровый хвост» — видом, известным и красотой, и гибкостью. Переработанный интерлок с цифровой сублимацией по всему корпусу переносит этот образ в изделие, созданное для движения на корте.',
  },
  'r-mrp': {
    en: 'A tennis and pickleball court shirt built around the giant oceanic manta ray. The upper pattern is designed after the fish floating in open ocean, and the sleeves stand in for the eye area. Made in a single jersey recycled polyester with screen printing.',
    ru: 'Футболка для тенниса и пиклбола, созданная по мотивам гигантского океанического ската-манты. Узор верхней части повторяет ската, парящего в открытом океане, а рукава изображают область глаз. Кулирная гладь из переработанного полиэстера с шелкографией.',
  },
  'r-taz': {
    en: 'A men’s performance half-zip polo in a premium tech-piqué power knit, with a modern blade collar and a semi-auto lock zipper placket. Split-hem construction and reinforced shoulder seams sit alongside odor-resistant moisture wicking and four-way stretch mobility. Ready for custom sublimation or embroidery, it works for golf, team travel and the casual office alike.',
    ru: 'Мужское поло с короткой молнией из премиального тек-пике пауэр-трикотажа, с современным воротником blade и планкой с полуавтоматическим замком молнии. Разрезы по низу и усиленные плечевые швы сочетаются с отводом влаги без запаха и растяжением в четырёх направлениях. Готово к сублимации или вышивке на заказ — для гольфа, командных поездок и офиса в свободном стиле.',
  },
  'r-kmj': {
    en: 'A men’s technical jacket in an advanced hydro-repellent softshell with a structural scuba hood and integrated visor. A breathable core ventilation system, matte finish waterproof zippers and adjustable velcro cuffs with a shock-cord hem give full control over the weather. A moisture-wicking thermal lining, reinforced bonded seams and 3D articulated sleeves make it high-performance outerwear for training, urban commuting and element protection.',
    ru: 'Мужская техническая куртка из водоотталкивающего софтшелла с жёстким капюшоном-скуба и встроенным козырьком. Дышащая система вентиляции корпуса, матовые водонепроницаемые молнии, регулируемые манжеты на липучках и низ с кулиской дают полный контроль над погодой. Влагоотводящая термоподкладка, усиленные клеевые швы и анатомические 3D-рукава — высокотехнологичная верхняя одежда для тренировок, поездок по городу и защиты от непогоды.',
  },
  'r-alj': {
    en: 'A men’s longline jacket in a weather-resistant bonded softshell with a high-neck scuba hood and toggles. Dual-entry utility pockets and adjustable storm cuffs sit under a matte memory-shine finish, and the extended commuter cut adds coverage. Thermal regulating fabric, reinforced bar-tack stitching and articulated sleeve construction make it versatile for urban exploration and cold-weather training.',
    ru: 'Мужская удлинённая куртка из ветро- и влагозащитного клеевого софтшелла с высоким капюшоном-скуба на фиксаторах. Карманы с двумя входами и регулируемые штормовые манжеты сочетаются с матовой отделкой memory-shine, а удлинённый крой даёт больше защиты. Терморегулирующая ткань, закрепки и анатомический крой рукавов делают её универсальной для городских прогулок и тренировок в холод.',
  },
  'r-wct': {
    en: 'Engineered for high-output training, the cropped cut provides ventilation to keep you cool as the workout heats up. A compression interlock in a moisture-wicking athletic spandex delivers a lightweight, flexible feel that moves with the body rather than against it. Built for everything from lifting heavy to yoga flows.',
    ru: 'Укороченный крой для тренировок высокой интенсивности даёт вентиляцию и охлаждает, когда тренировка набирает обороты. Компрессионный интерлок из влагоотводящего спортивного спандекса — лёгкий и гибкий, двигается вместе с телом, а не против него. От тяжёлых весов до йоги.',
  },
  'r-mss': {
    en: 'A men’s commuter suit in a weather-resistant textured woven polyester shell with an insulated taffeta lining and a high-neck scuba hood. Utility zipper pockets, reinforced knee panels and adjustable toggle hem and cuffs make it practical, while moisture-wicking fibers, a windproof membrane and taped waterproof seams keep the weather out. Heavy-duty hardware throughout for city commuting, travel and outdoor lifestyle.',
    ru: 'Мужской утеплённый костюм для города: верх из ветро- и влагозащитного фактурного тканого полиэстера, утеплённая подкладка из тафты и высокий капюшон-скуба. Карманы на молнии, усиленные панели на коленях и регулируемые низ и манжеты с фиксаторами делают его практичным, а влагоотводящие волокна, ветрозащитная мембрана и проклеенные водонепроницаемые швы не пропускают непогоду. Прочная фурнитура — для поездок по городу, путешествий и активного образа жизни.',
  },
  'r-zt': {
    en: 'Women’s yoga tights fusing high-performance utility with modern aesthetics. Squat-proof opacity gives total confidence during deep stretches, while the sleek contouring silhouette carries from the yoga mat to the city street. Reinforced with sustainable color-lock dyeing, the poly stretch knit resists fading and pilling, so they look as strong on day 100 as on day one.',
    ru: 'Женские тайтсы для йоги, в которых функциональность сочетается с современной эстетикой. Непрозрачность при приседаниях даёт полную уверенность в глубоких растяжках, а гладкий облегающий силуэт уместен и на коврике, и на городской улице. Устойчивое окрашивание с фиксацией цвета: трикотаж поли-стрейч не выцветает и не скатывается, и на сотый день тайтсы выглядят как в первый.',
  },
  'r-bcd': {
    en: 'A tennis bra and skirt set designed for court and training performance, taking its structure from the natural geometry of bee hives. The materials are chosen for flexibility and a relaxed bond between skin and garment, so the player can attempt more flexible and more outstanding shots.',
    ru: 'Теннисный комплект из топа-бра и юбки для корта и тренировок; его структура заимствована у природной геометрии пчелиных сот. Материалы подобраны ради гибкости и свободного контакта ткани с кожей, чтобы игрок мог решиться на более гибкие и яркие удары.',
  },
  'r-mxt': {
    en: 'A men’s training top in performance stretch fabric, with a full-length front zipper for easy on-off and ventilation. Moisture-wicking quick-dry material and breathable construction keep it comfortable all day, and flatlock stitching reduces chafing. Lightweight but durable, it suits gym work, running, warm-ups and general active wear.',
    ru: 'Мужской тренировочный верх из функциональной стрейч-ткани с молнией во всю длину — легко надеть и удобно проветрить. Влагоотводящий быстросохнущий материал и дышащая конструкция сохраняют комфорт весь день, а плоские швы уменьшают натирание. Лёгкий, но прочный — для зала, бега, разминок и повседневной активности.',
  },
  'r-vpj': {
    en: 'A soccer jersey carrying a tonal abstract geometric sublimation across the main body for a dynamic visual texture. A clean V-neck opening keeps the traditional silhouette while contemporary construction delivers a modern athletic fit. Diagonal solid-colored panels across the chest and shoulders define functional zones and leave room for sponsor placement.',
    ru: 'Футбольное джерси с абстрактной геометрической сублимацией тон в тон по корпусу — она создаёт динамичную визуальную фактуру. Аккуратный V-образный вырез сохраняет традиционный силуэт, а современная конструкция даёт спортивную посадку. Диагональные однотонные панели на груди и плечах обозначают функциональные зоны и оставляют место для логотипов спонсоров.',
  },
  'r-csp': {
    en: 'A men’s half-zip midlayer with a brushed thermal fleece interior and a stand-up mock neck. A premium half-zip gives ventilation control, and ribbed cuffs and hem hold the shape. Moisture-wicking warmth and durable double-stitch construction make it an essential warm-up pullover for team training, sideline recovery and travel.',
    ru: 'Мужской средний слой с молнией до середины груди, начёсанным термофлисом внутри и воротником-стойкой. Качественная молния регулирует вентиляцию, а манжеты и низ из рибаны держат форму. Тепло с отводом влаги и прочная двойная строчка — незаменимый пуловер для разминок на командных тренировках, восстановления у бровки и поездок.',
  },
  'r-cat': {
    en: 'Women’s yoga tights built on a compression architecture that gives targeted muscle support to reduce fatigue during prolonged holds, with a high-rise ergonomic waistband for zero-distraction coverage. Hydrophobic fiber technology creates a moisture-transport system that expels sweat rather than absorbing it, and the puri knit fabric retains its shape and opacity through hot yoga or high-impact conditioning.',
    ru: 'Женские тайтсы для йоги с компрессионной конструкцией: точечная поддержка мышц снижает усталость в долгих статичных позах, а высокий эргономичный пояс надёжно закрывает и не отвлекает. Гидрофобные волокна выводят пот наружу, а не впитывают его, а трикотаж «пури» сохраняет форму и непрозрачность и в горячей йоге, и на интенсивных тренировках.',
  },
  'r-fft': {
    en: 'Designed for high-level training sessions, scrimmages and drills, where teams need quick, temporary differentiation between players for tactical reasons. The aero liner mesh keeps players from overheating, and adjustable sides give a more tailored and secure fit than a traditional loose-fitting bib.',
    ru: 'Для тренировок высокого уровня, двусторонних игр и упражнений, когда команды нужно быстро и на время разделить по тактическим причинам. Сетка aero liner не даёт игрокам перегреваться, а регулируемые бока дают более точную и надёжную посадку, чем обычная свободная манишка.',
  },
  'r-wsa': {
    en: 'A tennis dress drawn from the Great Pyramid of Egypt. The digital sublimation across the bra echoes the texture of the moon, the skirt takes the pyramid’s conical shape, and the compression belt is textured after the stone blocks themselves. Built in interlock spandex with cotton and neoprene detailing for court movement.',
    ru: 'Теннисное платье по мотивам Великой пирамиды Египта. Цифровая сублимация на бра повторяет фактуру Луны, юбка — коническую форму пирамиды, а компрессионный пояс фактурой напоминает сами каменные блоки. Спандекс-интерлок с отделкой из хлопка и неопрена — для движения на корте.',
  },
  'r-ifs': {
    en: 'A premium comfort sweatshirt in a soft, durable flex jersey with a smooth, breathable feel for all-day wear. The relaxed but refined fit allows unrestricted movement, making it equally suited to training warm-ups, travel and everyday use. A clean crew neckline and precision-finished cuffs and hem hold their shape, and the rich indigo-toned fabric is fade-resistant.',
    ru: 'Премиальный свитшот из мягкого и прочного трикотажа flex jersey — гладкий и дышащий, для носки весь день. Свободная, но аккуратная посадка не стесняет движений: подходит для разминок, поездок и на каждый день. Чистая горловина и тщательно обработанные манжеты и низ держат форму, а насыщенная ткань цвета индиго не выцветает.',
  },
  'r-cvn': {
    en: 'A soccer jersey that stands out for a sleek pattern, a sharp white chevron and contrast white sleeves. Lightweight quick-dry polyester and breathable moisture-wicking fabric keep airflow up, and an ergonomic athletic fit allows unrestricted movement through intense matches and training.',
    ru: 'Футбольное джерси с лаконичным узором, чётким белым шевроном и контрастными белыми рукавами. Лёгкий быстросохнущий полиэстер и дышащая влагоотводящая ткань улучшают вентиляцию, а эргономичный спортивный крой не стесняет движений на напряжённых матчах и тренировках.',
  },
  'r-sps': {
    en: 'A women’s co-ord in a heavyweight waffle-knit cotton blend, pairing a structured quarter-zip polo collar and boxy cropped silhouette with wide-leg flow pants. Tonal high-density branding, an elastic high-rise waist and premium ribbed trim give it a tailored lounge fit with textured thermal warmth. Built for remote work, casual travel and elevated off-duty style.',
    ru: 'Женский комплект из плотного вафельного трикотажа на основе хлопка: поло с воротником на короткой молнии и укороченным свободным силуэтом и широкие струящиеся брюки. Плотный логотип тон в тон, эластичный пояс с высокой посадкой и качественная рибана дают аккуратную домашнюю посадку и тепло фактурного трикотажа. Для удалённой работы, путешествий и стильного отдыха.',
  },
  kaizen: {
    en: 'A 16-panel pro match soccer ball in size 5, built with Trinity Technology: panels thermobonded, then machine stitched, the last panel closed by hand, then the seams sealed. The 0.6 mm Vimini-textured PU cover is laminated to 3 mm EPDM foam over a thread-wound butyl bladder. Lab tested according to FIFA Quality Pro limits. This model is not FIFA licensed and does not carry a FIFA mark. Competitions that require a FIFA mark need a licensed ball. The texture in 3D is a close visual match; the Vimini texture on the real ball differs slightly.',
    ru: 'Профессиональный матчевый футбольный мяч из 16 панелей, размер 5, по технологии Trinity Technology: панели термосклеиваются, затем сшиваются на машине, последнюю панель зашивают вручную, после чего швы герметизируют. Покрышка из PU толщиной 0,6 мм с фактурой Vimini ламинирована на пену EPDM 3 мм поверх бутиловой камеры с нитяной намоткой. Мяч прошёл лабораторные испытания в соответствии с нормами FIFA Quality Pro. Модель не лицензирована FIFA и не несёт знака FIFA. Для соревнований, где знак обязателен, нужен лицензированный мяч. Фактура в 3D близка к настоящей; фактура Vimini на реальном мяче немного отличается.',
  },
  maxfly: {
    en: 'A 20-panel match and training soccer ball in size 5, built with Trinity Technology: panels thermobonded, then machine stitched, the last panel closed by hand, then the seams sealed. The 1.5 mm golf-textured PU cover is laminated to a 2 mm foam lining over a thread-wound butyl bladder. Lab tested according to FIFA Quality Pro limits. This model is not FIFA licensed and does not carry a FIFA mark. Competitions that require a FIFA mark need a licensed ball.',
    ru: 'Матчевый и тренировочный футбольный мяч из 20 панелей, размер 5, по технологии Trinity Technology: панели термосклеиваются, затем сшиваются на машине, последнюю панель зашивают вручную, после чего швы герметизируют. Покрышка из PU толщиной 1,5 мм с фактурой «гольф» ламинирована на подложку из пены 2 мм поверх бутиловой камеры с нитяной намоткой. Мяч прошёл лабораторные испытания в соответствии с нормами FIFA Quality Pro. Модель не лицензирована FIFA и не несёт знака FIFA. Для соревнований, где знак обязателен, нужен лицензированный мяч.',
  },
  kura: {
    en: 'A 12-panel match and training soccer ball in size 5, built with Trinity Technology: panels thermobonded, then machine stitched, the last panel closed by hand, then the seams sealed. The 1.2 mm Prisma-textured PU cover is laminated to a 2.5 mm foam lining over a thread-wound butyl bladder. Lab tested according to FIFA Quality Pro limits. This model is not FIFA licensed and does not carry a FIFA mark. Competitions that require a FIFA mark need a licensed ball.',
    ru: 'Матчевый и тренировочный футбольный мяч из 12 панелей, размер 5, по технологии Trinity Technology: панели термосклеиваются, затем сшиваются на машине, последнюю панель зашивают вручную, после чего швы герметизируют. Покрышка из PU толщиной 1,2 мм с фактурой Prisma ламинирована на подложку из пены 2,5 мм поверх бутиловой камеры с нитяной намоткой. Мяч прошёл лабораторные испытания в соответствии с нормами FIFA Quality Pro. Модель не лицензирована FIFA и не несёт знака FIFA. Для соревнований, где знак обязателен, нужен лицензированный мяч.',
  },
  orbx: {
    en: 'A 32-panel training soccer ball in size 5, built with Trinity Technology: panels thermobonded, then machine stitched, the last panel closed by hand, then the seams sealed. The 1.3 mm PU cover is laminated to a 2.5 mm foam lining over a thread-wound butyl bladder. Lab tested according to FIFA Quality Pro limits. This model is not FIFA licensed and does not carry a FIFA mark. Competitions that require a FIFA mark need a licensed ball.',
    ru: 'Тренировочный футбольный мяч из 32 панелей, размер 5, по технологии Trinity Technology: панели термосклеиваются, затем сшиваются на машине, последнюю панель зашивают вручную, после чего швы герметизируют. Покрышка из PU толщиной 1,3 мм ламинирована на подложку из пены 2,5 мм поверх бутиловой камеры с нитяной намоткой. Мяч прошёл лабораторные испытания в соответствии с нормами FIFA Quality Pro. Модель не лицензирована FIFA и не несёт знака FIFA. Для соревнований, где знак обязателен, нужен лицензированный мяч.',
  },
}

/** The Russian description of `slug`, or "" when there is none for exactly this English text. */
export function russianDescription(slug: string, english: string): string {
  const entry = Object.hasOwn(PRODUCT_DESCRIPTIONS_RU, slug)
    ? PRODUCT_DESCRIPTIONS_RU[slug]
    : undefined
  return entry && entry.en === english.trim() ? entry.ru : ''
}
