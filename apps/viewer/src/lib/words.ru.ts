import type { ViewerWords } from './words'

/**
 * THE GARMENT PAGE'S OWN WORDS IN RUSSIAN (owner, 2026-11-16). Loaded only by a Russian page, in
 * its own chunk (`lib/ru.ts`), so an English visitor never downloads them. Notes on the choices
 * are in `words.ts`.
 */
export const WORDS_RU: ViewerWords = {
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
