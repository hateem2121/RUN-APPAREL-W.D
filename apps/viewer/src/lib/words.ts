import type { Locale } from '@run-apparel/shared'
import { COMING_SOON_NOTICE, LOAD_NOTICE, STALL_NOTICE } from '../components/stageConfig'
import { TIME_LEFT_EN, type TimeLeftWords } from './timeLeft'
import { pageLocale } from './locale'

/**
 * THE GARMENT PAGE'S OWN WORDS, IN ENGLISH AND RUSSIAN (owner, 2026-11-16: Russian garment pages at
 * `/ru/products/<product>/<colour>`, the page's words in Russian, the garment's CMS-typed text as
 * the team types it). The English is the page's text as it stood that day, moved here unchanged;
 * `words.test.ts` holds the two halves to the same keys.
 *
 * Russian notes. «Расцветка» is the trade's word for a colorway. A garment's and a colour's names
 * are CMS text in Latin capitals and are never declined, so every Russian sentence that carries
 * one is built around it («${name}, расцветка ${colour}»), not inflected through it. «Изделие» is
 * a garment and a sports accessory alike, so the English «garment/product» noun has one Russian
 * word. The pre-filled email and WhatsApp messages stay English: they are addressed to the team
 * in Sialkot, who work in English.
 */
export type ViewerWords = {
  readonly retiredNotice: string
  readonly moreBelow: string
  readonly contactNumber: string
  readonly emailUs: string
  readonly whatsappUs: string
  /** "Develop this with" + accent "us" + ".": the contact heading. */
  readonly developWith: readonly [string, string]
  readonly filledIn: (noun: string) => string
  readonly askAbout: (noun: string) => string
  readonly moreFromCategory: string
  /** "More" + accent category + "in 3D.": the related garments heading. */
  readonly moreIn: (category: string) => readonly [string, string, string]
  readonly seeAllIn3d: (category: string) => string
  readonly customisationNumber: string
  /** "FROM IDEA TO" + accent "production" + ".". */
  readonly fromIdeaTo: readonly [string, string]
  readonly customisationIntro: string
  readonly howWeBuild: string
  readonly developmentReference: string
  readonly readMore: string
  readonly readLess: string
  readonly colourwayCount: string
  readonly colourwaysAreExamples: string
  readonly colourways: string
  readonly selectColourway: string
  readonly cameraPositions: string
  readonly cameraViews: { readonly front: string; readonly back: string; readonly side: string }
  readonly couldNotConnect: string
  readonly loadNotice: string
  readonly comingSoonNotice: string
  readonly stallNotice: string
  readonly try3dAgain: string
  readonly productReference: string
  readonly productPicture: string
  readonly interactiveReference: string
  readonly viewInYourSpace: string
  readonly studioRenderAlt: (name: string, colour: string) => string
  readonly rotate: string
  readonly hintTouch: string
  readonly hintPointer: string
  readonly downloadRetrying: (attempt: number, max: number) => string
  readonly announceShowingPicture: (name: string, colour: string) => string
  readonly announceDownloadDone: string
  readonly announceDownloadStopped: (attempt: number, max: number) => string
  readonly announceLoading: string
  readonly announceLoadingPercent: (percent: number) => string
  readonly announceShowing: (name: string, colour: string) => string
  readonly keyboardHelp: string
  readonly labelNoConnection: string
  readonly labelUnavailableNow: string
  readonly labelPageError: string
  readonly labelReferenceUnavailable: string
  readonly headingOffline: string
  readonly headingDidNotLoad: string
  readonly headingPageError: string
  readonly headingNoLongerLive: string
  readonly bodyOffline: string
  readonly bodyDidNotLoad: string
  readonly bodyPageError: string
  readonly bodyNoLongerLive: string
  readonly trying: string
  readonly tryAgain: string
  readonly seeProductsIn3d: string
  readonly hdFailed: string
  readonly hdImageName: (name: string, colour: string) => string
  readonly fullScreenName: (name: string, colour: string) => string
  readonly viewIn3d: string
  readonly viewIn3dLabel: string
  readonly fullLabel: readonly [string, string]
  readonly hdLabelMore: string
  readonly close: string
  readonly noteLabel: string
  readonly closeRender: string
  readonly renderHelp: string
  readonly dialogName: (name: string, colour: string) => string
  readonly useArrows: string
  readonly loadingHd: string
  readonly previousColour: (colour: string) => string
  readonly nextColour: (colour: string) => string
  readonly almostReady: string
  readonly timeLeft: TimeLeftWords
  readonly preparing: string
  readonly working: string
  readonly preparingEllipsis: string
  readonly mbDownloaded: (mb: string) => string
  readonly mbDone: (mb: string) => string
  readonly mbLeft: (mb: string) => string
  readonly modelDownload: string
  readonly reloadPage: string
  readonly waitingForConnection: string
  readonly offlineReloadNote: string
  readonly breadcrumb: string
  readonly home: string
  readonly products: string
  readonly pictureFailed: string
  readonly tryPictureAgain: string
}

const EN: ViewerWords = {
  retiredNotice:
    'The colorway printed on your tag is no longer in production. This page is showing the ' +
    'current default colorway for this garment.',
  moreBelow: 'More below',
  contactNumber: '\u211604 · Start the conversation',
  emailUs: 'Email Us',
  whatsappUs: 'WhatsApp Us',
  developWith: ['Develop this with ', 'us'],
  filledIn: (noun) =>
    `We have already filled in this ${noun}’s code and colorway. Please add your company, your market and the quantity you need, then send.`,
  askAbout: (noun) => `Ask about this ${noun}`,
  moreFromCategory: '№03 · More from this category',
  moreIn: (category) => ['More ', category, ' in 3D.'],
  seeAllIn3d: (category) => `See all ${category.trim().toLowerCase()} in 3D`,
  customisationNumber: '№02 · Customization',
  fromIdeaTo: ['FROM IDEA TO ', 'production'],
  customisationIntro:
    'Send us a finished design, a tech pack, artwork, a reference image, or simply an idea. Our team develops it with you into a production-ready garment.',
  howWeBuild: 'How we build your product',
  developmentReference:
    'This is a development reference, not a finished stock product. We can change the fabric, color, fit, trims, branding and performance details to suit your brand.',
  readMore: 'Read more',
  readLess: 'Read less',
  colourwayCount: 'COLORWAY',
  colourwaysAreExamples:
    'These colorways are examples. We match your own colors to your requirements.',
  colourways: 'Colorways',
  selectColourway: 'Select colorway',
  cameraPositions: 'Camera positions',
  cameraViews: { front: 'front', back: 'back', side: 'side' },
  couldNotConnect: 'The 3D view could not connect. You can try again or use the picture.',
  loadNotice: LOAD_NOTICE,
  comingSoonNotice: COMING_SOON_NOTICE,
  stallNotice: STALL_NOTICE,
  try3dAgain: 'TRY 3D AGAIN',
  productReference: 'Product reference',
  productPicture: 'Product picture',
  interactiveReference: 'Interactive 3D product reference',
  viewInYourSpace: 'View in your space',
  studioRenderAlt: (name, colour) => `${name} in ${colour}, studio render`,
  rotate: 'Rotate',
  hintTouch: 'DRAG TO ROTATE · PINCH TO ZOOM',
  hintPointer: 'DRAG TO ROTATE · SCROLL TO ZOOM',
  downloadRetrying: (attempt, max) => `DOWNLOAD STOPPED · TRYING AGAIN (${attempt} OF ${max})`,
  announceShowingPicture: (name, colour) => `Showing the studio picture of ${name} in ${colour}.`,
  announceDownloadDone: 'Download complete. Preparing the interactive 3D model.',
  announceDownloadStopped: (attempt, max) =>
    `The download stopped. Trying again, ${attempt} of ${max}.`,
  announceLoading: 'Loading the interactive 3D model.',
  announceLoadingPercent: (percent) => `Loading the interactive 3D model, ${percent} percent.`,
  announceShowing: (name, colour) => `Showing ${name} in ${colour}.`,
  keyboardHelp:
    'Drag or press the arrow keys to rotate. Scroll, pinch, or press Page Up and Page Down to zoom.',
  labelNoConnection: '[ NO CONNECTION ]',
  labelUnavailableNow: '[ TEMPORARILY UNAVAILABLE ]',
  labelPageError: '[ PAGE ERROR ]',
  labelReferenceUnavailable: '[ REFERENCE UNAVAILABLE ]',
  headingOffline: 'This device is offline',
  headingDidNotLoad: 'This reference did not load',
  headingPageError: 'This page ran into a problem',
  headingNoLongerLive: 'This reference is no longer live',
  bodyOffline:
    'This page is still here. Your device just has no connection right now. This page will load itself as soon as the signal returns.',
  bodyDidNotLoad:
    'Nothing has been discontinued: we could not reach the reference just now. Please try again in a moment.',
  bodyPageError:
    'Nothing has been discontinued: the garment is still here, but this page stopped working. Reload the page to see it again, or tell our team and we will send you the reference.',
  bodyNoLongerLive:
    'The QR code you scanned points to a garment we no longer show here. Browse the current references, or tell our team what you were looking at and we will send you the current reference for it.',
  trying: 'Trying…',
  tryAgain: 'Try Again',
  seeProductsIn3d: 'See products in 3D',
  hdFailed: 'The full-screen picture did not load. Reload the page to try again.',
  hdImageName: (name, colour) => `HD image: studio render of ${name} in ${colour}`,
  fullScreenName: (name, colour) => `Full screen: studio render of ${name} in ${colour}`,
  viewIn3d: 'View in 3D',
  viewIn3dLabel: 'VIEW IN ',
  fullLabel: ['FULL', ' SCREEN'],
  hdLabelMore: ' IMAGE',
  close: 'Close',
  noteLabel: '[ NOTE ]',
  closeRender: 'Close the studio render',
  renderHelp:
    'A CLO 3D studio render, not a photograph. Pinch, double-tap, scroll or press plus and minus to zoom; drag to move around.',
  dialogName: (name, colour) => `Studio render: ${name} in ${colour}`,
  useArrows: ' Use the arrows to see the other colours.',
  loadingHd: 'LOADING HD IMAGE',
  previousColour: (colour) => `Previous colour: ${colour}`,
  nextColour: (colour) => `Next colour: ${colour}`,
  almostReady: 'Almost ready',
  timeLeft: TIME_LEFT_EN,
  preparing: 'Preparing',
  working: 'Working',
  preparingEllipsis: 'Preparing…',
  mbDownloaded: (mb) => `${mb} MB downloaded`,
  mbDone: (mb) => `${mb} MB done`,
  mbLeft: (mb) => `${mb} MB left`,
  modelDownload: '3D model download',
  reloadPage: 'Reload Page',
  waitingForConnection: 'Waiting for Connection…',
  offlineReloadNote:
    'This device is offline. The button will work again as soon as the signal returns.',
  breadcrumb: 'Breadcrumb',
  home: 'Home',
  products: 'Products',
  pictureFailed: 'The picture could not load.',
  tryPictureAgain: 'TRY PICTURE AGAIN',
}

const RU: ViewerWords = {
  retiredNotice:
    'Расцветка, указанная на вашей бирке, больше не производится. На этой странице показана ' +
    'текущая основная расцветка этого изделия.',
  moreBelow: 'Ниже ещё',
  contactNumber: '\u211604 · Начнём разговор',
  emailUs: 'Написать на почту',
  whatsappUs: 'Написать в\u00a0WhatsApp',
  developWith: ['Разработаем это ', 'вместе'],
  filledIn: () =>
    'Мы уже указали артикул и\u00a0расцветку этого изделия. Добавьте название компании, рынок и\u00a0нужное количество\u00a0— и\u00a0отправьте.',
  askAbout: () => 'Спросить об этом изделии',
  moreFromCategory: '№03 · Ещё из этой категории',
  moreIn: (category) => ['Ещё: ', category, ' в\u00a03D.'],
  seeAllIn3d: (category) => `Все модели категории «${category.trim()}» в\u00a03D`,
  customisationNumber: '№02 · Индивидуальный пошив',
  fromIdeaTo: ['ОТ ИДЕИ ДО ', 'производства'],
  customisationIntro:
    'Пришлите готовый дизайн, техпакет, макет, фото образца или просто идею. Наша команда вместе с\u00a0вами доведёт её до изделия, готового к\u00a0производству.',
  howWeBuild: 'Как мы создаём ваше изделие',
  developmentReference:
    'Это образец для разработки, а\u00a0не\u00a0готовый товар со\u00a0склада. Мы можем изменить ткань, цвет, посадку, фурнитуру, брендинг и\u00a0функциональные детали под ваш бренд.',
  readMore: 'Читать дальше',
  readLess: 'Свернуть',
  colourwayCount: 'РАСЦВЕТКА',
  colourwaysAreExamples: 'Эти расцветки\u00a0— примеры. Мы подберём цвета под ваши требования.',
  colourways: 'Расцветки',
  selectColourway: 'Выбор расцветки',
  cameraPositions: 'Ракурсы',
  cameraViews: { front: 'спереди', back: 'сзади', side: 'сбоку' },
  couldNotConnect: 'Не удалось загрузить 3D-просмотр. Попробуйте ещё раз или посмотрите фото.',
  loadNotice:
    '3D-просмотр недоступен. Цвета, ткань и\u00a0характеристики на\u00a0этой странице верны, и\u00a0вы по-прежнему можете отправить запрос ниже.',
  comingSoonNotice:
    '3D-просмотр этого изделия скоро появится. Фото, цвета, ткань и\u00a0характеристики на\u00a0этой странице верны, и\u00a0вы можете отправить запрос ниже.',
  stallNotice:
    '3D-модель перестала загружаться. Нажмите «ЕЩЁ РАЗ В\u00a03D» или зайдите позже. Цвета, ткань и\u00a0характеристики на\u00a0этой странице верны, и\u00a0вы по-прежнему можете отправить запрос ниже.',
  try3dAgain: 'ЕЩЁ РАЗ В\u00a03D',
  productReference: 'Образец изделия',
  productPicture: 'Фото изделия',
  interactiveReference: 'Интерактивная 3D-модель изделия',
  viewInYourSpace: 'Посмотреть в своём пространстве',
  studioRenderAlt: (name, colour) => `${name}, расцветка ${colour}: студийный рендер`,
  rotate: 'Повернуть',
  hintTouch: 'ПОТЯНИТЕ, ЧТОБЫ ПОВЕРНУТЬ · ДВА ПАЛЬЦА\u00a0— МАСШТАБ',
  hintPointer: 'ПОТЯНИТЕ, ЧТОБЫ ПОВЕРНУТЬ · КОЛЕСО\u00a0— МАСШТАБ',
  downloadRetrying: (attempt, max) => `ЗАГРУЗКА ПРЕРВАЛАСЬ · ПРОБУЕМ СНОВА (${attempt} ИЗ ${max})`,
  announceShowingPicture: (name, colour) =>
    `Показано студийное фото: ${name}, расцветка ${colour}.`,
  announceDownloadDone: 'Загрузка завершена. Готовим интерактивную 3D-модель.',
  announceDownloadStopped: (attempt, max) =>
    `Загрузка прервалась. Пробуем снова: ${attempt} из\u00a0${max}.`,
  announceLoading: 'Загружаем интерактивную 3D-модель.',
  announceLoadingPercent: (percent) => `Загружаем интерактивную 3D-модель: ${percent}\u00a0%.`,
  announceShowing: (name, colour) => `Показано: ${name}, расцветка ${colour}.`,
  keyboardHelp:
    'Чтобы повернуть модель, потяните её или нажимайте клавиши со\u00a0стрелками. Чтобы изменить масштаб, прокрутите колесо мыши, сведите или разведите пальцы либо нажмите Page Up и\u00a0Page Down.',
  labelNoConnection: '[ НЕТ СВЯЗИ ]',
  labelUnavailableNow: '[ ВРЕМЕННО НЕДОСТУПНО ]',
  labelPageError: '[ ОШИБКА СТРАНИЦЫ ]',
  labelReferenceUnavailable: '[ ОБРАЗЕЦ НЕДОСТУПЕН ]',
  headingOffline: 'Нет подключения к\u00a0интернету',
  headingDidNotLoad: 'Образец не\u00a0загрузился',
  headingPageError: 'На этой странице произошла ошибка',
  headingNoLongerLive: 'Этот образец больше не\u00a0доступен',
  bodyOffline:
    'Страница никуда не\u00a0делась: просто у\u00a0устройства сейчас нет связи. Она загрузится сама, как только сигнал вернётся.',
  bodyDidNotLoad:
    'Ничего не\u00a0снято с\u00a0производства: нам просто не\u00a0удалось сейчас загрузить образец. Попробуйте ещё раз чуть позже.',
  bodyPageError:
    'Ничего не\u00a0снято с\u00a0производства: изделие на\u00a0месте, но\u00a0страница перестала работать. Перезагрузите её или напишите нашей команде\u00a0— мы пришлём вам образец.',
  bodyNoLongerLive:
    'QR-код, который вы отсканировали, ведёт к\u00a0изделию, которое мы здесь больше не\u00a0показываем. Посмотрите актуальные образцы или напишите нашей команде, что вы искали,\u00a0— мы пришлём вам актуальный образец.',
  trying: 'Пробуем…',
  tryAgain: 'Попробовать снова',
  seeProductsIn3d: 'Смотреть изделия в\u00a03D',
  hdFailed:
    'Фото во\u00a0весь экран не\u00a0загрузилось. Перезагрузите страницу, чтобы попробовать снова.',
  hdImageName: (name, colour) => `HD-фото, студийный рендер: ${name}, расцветка ${colour}`,
  fullScreenName: (name, colour) =>
    `Во\u00a0весь экран, студийный рендер: ${name}, расцветка ${colour}`,
  viewIn3d: 'Смотреть в\u00a03D',
  viewIn3dLabel: 'СМОТРЕТЬ В ',
  fullLabel: ['ЭКРАН', ''],
  hdLabelMore: ' ФОТО',
  close: 'Закрыть',
  noteLabel: '[ ПРИМЕЧАНИЕ ]',
  closeRender: 'Закрыть студийный рендер',
  renderHelp:
    'Студийный рендер CLO 3D, а\u00a0не\u00a0фотография. Чтобы изменить масштаб, сведите пальцы, дважды коснитесь, прокрутите колесо или нажмите плюс и\u00a0минус; чтобы сдвинуть изображение, потяните его.',
  dialogName: (name, colour) => `Студийный рендер: ${name}, расцветка ${colour}`,
  useArrows: ' Стрелками можно листать другие расцветки.',
  loadingHd: 'ЗАГРУЖАЕМ HD-ФОТО',
  previousColour: (colour) => `Предыдущая расцветка: ${colour}`,
  nextColour: (colour) => `Следующая расцветка: ${colour}`,
  almostReady: 'Почти готово',
  timeLeft: {
    estimating: 'Оцениваем время',
    almostDone: 'Почти всё',
    secondsLeft: 'Осталось несколько секунд',
    aboutMin: (minutes) => `Осталось около ${minutes}\u00a0мин`,
    aboutSec: (seconds) => `Осталось около ${seconds}\u00a0с`,
  },
  preparing: 'Подготовка',
  working: 'Загрузка',
  preparingEllipsis: 'Готовим…',
  mbDownloaded: (mb) => `Загружено ${mb}\u00a0МБ`,
  mbDone: (mb) => `Загружено ${mb}\u00a0МБ`,
  mbLeft: (mb) => `Осталось ${mb}\u00a0МБ`,
  modelDownload: 'Загрузка 3D-модели',
  reloadPage: 'Перезагрузить страницу',
  waitingForConnection: 'Ждём подключения…',
  offlineReloadNote:
    'Нет подключения к\u00a0интернету. Кнопка снова заработает, как только появится сигнал.',
  breadcrumb: 'Навигационная цепочка',
  home: 'Главная',
  products: 'Продукция',
  pictureFailed: 'Фото не\u00a0загрузилось.',
  tryPictureAgain: 'ЗАГРУЗИТЬ ФОТО СНОВА',
}

export const WORDS: Readonly<Record<Locale, ViewerWords>> = { en: EN, ru: RU }

/** The garment page's own words, in the page's language. */
export function words(): ViewerWords {
  return WORDS[pageLocale()]
}
