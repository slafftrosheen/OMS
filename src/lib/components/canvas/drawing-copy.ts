import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale, t } from 'svelte-i18n';

const copy = {
  en: {
    black: 'Black', blue: 'Blue', green: 'Green', grey: 'Grey', 'light-blue': 'Light blue', 'light-green': 'Light green', 'light-red': 'Light red', 'light-violet': 'Light violet', orange: 'Orange', red: 'Red', violet: 'Violet', white: 'White', yellow: 'Yellow',
    workspace: 'Drawing workspace', file: 'File', edit: 'Edit', object: 'Object', view: 'View',
    properties: 'Properties', objects: 'Objects', toolbox: 'Drawing tools', palette: 'Object colour',
    import: 'Import files', exportSvg: 'Export drawing as SVG', exportPng: 'Export drawing as PNG',
    exportHint: 'Exports drawn objects. Embedded forms and document viewers are not printable artwork.',
    exportFailed: 'Could not export this drawing.', uploadFailed: 'File upload failed. Try again.',
    empty: 'Draw, import a file or add an object.', selected: 'selected', items: 'objects',
    selectAll: 'Select all', rotateLeft: 'Rotate left 90°', rotateRight: 'Rotate right 90°',
    flipHorizontal: 'Mirror horizontally', flipVertical: 'Mirror vertically',
    forward: 'Forward one', backward: 'Backward one', lock: 'Lock object', unlock: 'Unlock object',
    grid: 'Grid', snap: 'Snap to objects', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    readOnly: 'Read only', locked: 'Locked selection', singleObject: 'Select one object to edit its dimensions.',
    units: 'Canvas px', positionX: 'X position', positionY: 'Y position', width: 'Width', height: 'Height', rotation: 'Rotation',
    colourHint: 'Colour is shared by the outline and fill. Choose the fill style in Properties.',
    nextObject: 'Style for next object', selectionStyle: 'Selection style', noStyles: 'No drawing styles for this object.',
    fill: 'Fill', dash: 'Outline', size: 'Stroke / text size', opacity: 'Opacity',
    none: 'None', semi: 'Tinted', solid: 'Solid', pattern: 'Hatched', draw: 'Sketch', dashed: 'Dashed', dotted: 'Dotted',
    small: 'Small', medium: 'Medium', large: 'Large', extraLarge: 'Extra large',
    orderNote: 'Note', orderWarning: 'Warning', orderExplain: 'Explanation',
    showPanel: 'Show properties', closePanel: 'Close panel', zoom: 'Zoom',
    lockedParent: 'Unlock the parent object first.', changedFailed: 'This edit could not be applied.',
    rulers: 'Canvas rulers in pixels', keyboard: 'F6 rectangle · F7 ellipse · F8 text · F4 fit · Ctrl+D duplicate',
  },
  ru: {
    black: 'Чёрный', blue: 'Синий', green: 'Зелёный', grey: 'Серый', 'light-blue': 'Голубой', 'light-green': 'Светло-зелёный', 'light-red': 'Светло-красный', 'light-violet': 'Светло-фиолетовый', orange: 'Оранжевый', red: 'Красный', violet: 'Фиолетовый', white: 'Белый', yellow: 'Жёлтый',
    workspace: 'Рабочее поле', file: 'Файл', edit: 'Правка', object: 'Объект', view: 'Вид',
    properties: 'Свойства', objects: 'Объекты', toolbox: 'Инструменты рисования', palette: 'Цвет объекта',
    import: 'Импорт файлов', exportSvg: 'Экспорт рисунка в SVG', exportPng: 'Экспорт рисунка в PNG',
    exportHint: 'Экспортируются нарисованные объекты. Встроенные формы и просмотр документов не являются печатным макетом.',
    exportFailed: 'Не удалось экспортировать рисунок.', uploadFailed: 'Загрузка файла не удалась. Попробуйте ещё раз.',
    empty: 'Нарисуйте, загрузите файл или добавьте объект.', selected: 'выбрано', items: 'объектов',
    selectAll: 'Выделить всё', rotateLeft: 'Повернуть влево на 90°', rotateRight: 'Повернуть вправо на 90°',
    flipHorizontal: 'Отразить по горизонтали', flipVertical: 'Отразить по вертикали',
    forward: 'На уровень вперёд', backward: 'На уровень назад', lock: 'Заблокировать объект', unlock: 'Разблокировать объект',
    grid: 'Сетка', snap: 'Привязка к объектам', zoomIn: 'Приблизить', zoomOut: 'Отдалить',
    readOnly: 'Только чтение', locked: 'Объект заблокирован', singleObject: 'Выберите один объект для изменения размеров.',
    units: 'Пиксели холста', positionX: 'Позиция X', positionY: 'Позиция Y', width: 'Ширина', height: 'Высота', rotation: 'Поворот',
    colourHint: 'Цвет общий для контура и заливки. Тип заливки выбирается в свойствах.',
    nextObject: 'Стиль следующего объекта', selectionStyle: 'Стиль выделения', noStyles: 'У этого объекта нет стилей рисования.',
    fill: 'Заливка', dash: 'Контур', size: 'Толщина / размер текста', opacity: 'Непрозрачность',
    none: 'Нет', semi: 'Оттенок', solid: 'Сплошной', pattern: 'Штриховка', draw: 'Эскиз', dashed: 'Штрихи', dotted: 'Точки',
    small: 'Малый', medium: 'Средний', large: 'Большой', extraLarge: 'Очень большой',
    orderNote: 'Заметка', orderWarning: 'Предупреждение', orderExplain: 'Пояснение',
    showPanel: 'Показать свойства', closePanel: 'Закрыть панель', zoom: 'Масштаб',
    lockedParent: 'Сначала разблокируйте родительский объект.', changedFailed: 'Не удалось применить изменение.',
    rulers: 'Линейки холста в пикселях', keyboard: 'F6 прямоугольник · F7 эллипс · F8 текст · F4 вписать · Ctrl+D копия',
  },
  lv: {
    black: 'Melna', blue: 'Zila', green: 'Zaļa', grey: 'Pelēka', 'light-blue': 'Gaiši zila', 'light-green': 'Gaiši zaļa', 'light-red': 'Gaiši sarkana', 'light-violet': 'Gaiši violeta', orange: 'Oranža', red: 'Sarkana', violet: 'Violeta', white: 'Balta', yellow: 'Dzeltena',
    workspace: 'Zīmēšanas darbvieta', file: 'Fails', edit: 'Rediģēt', object: 'Objekts', view: 'Skats',
    properties: 'Īpašības', objects: 'Objekti', toolbox: 'Zīmēšanas rīki', palette: 'Objekta krāsa',
    import: 'Importēt failus', exportSvg: 'Eksportēt zīmējumu SVG', exportPng: 'Eksportēt zīmējumu PNG',
    exportHint: 'Eksportē zīmētos objektus. Iegultās veidlapas un dokumentu skatītāji nav drukājams makets.',
    exportFailed: 'Neizdevās eksportēt zīmējumu.', uploadFailed: 'Faila augšupielāde neizdevās. Mēģiniet vēlreiz.',
    empty: 'Zīmējiet, importējiet failu vai pievienojiet objektu.', selected: 'atlasīti', items: 'objekti',
    selectAll: 'Atlasīt visu', rotateLeft: 'Pagriezt pa kreisi par 90°', rotateRight: 'Pagriezt pa labi par 90°',
    flipHorizontal: 'Atspoguļot horizontāli', flipVertical: 'Atspoguļot vertikāli',
    forward: 'Vienu līmeni priekšā', backward: 'Vienu līmeni aizmugurē', lock: 'Bloķēt objektu', unlock: 'Atbloķēt objektu',
    grid: 'Režģis', snap: 'Piesaistīt objektiem', zoomIn: 'Tuvināt', zoomOut: 'Tālināt',
    readOnly: 'Tikai lasīšanai', locked: 'Atlase bloķēta', singleObject: 'Atlasiet vienu objektu, lai mainītu izmērus.',
    units: 'Audekla px', positionX: 'X pozīcija', positionY: 'Y pozīcija', width: 'Platums', height: 'Augstums', rotation: 'Pagrieziens',
    colourHint: 'Kontūrai un aizpildījumam ir kopīga krāsa. Aizpildījuma veidu izvēlieties īpašībās.',
    nextObject: 'Nākamā objekta stils', selectionStyle: 'Atlases stils', noStyles: 'Šim objektam nav zīmēšanas stilu.',
    fill: 'Aizpildījums', dash: 'Kontūra', size: 'Līnijas / teksta izmērs', opacity: 'Necaurspīdīgums',
    none: 'Nav', semi: 'Tonēts', solid: 'Vienlaidu', pattern: 'Svītrots', draw: 'Skice', dashed: 'Pārtraukts', dotted: 'Punktots',
    small: 'Mazs', medium: 'Vidējs', large: 'Liels', extraLarge: 'Ļoti liels',
    orderNote: 'Piezīme', orderWarning: 'Brīdinājums', orderExplain: 'Paskaidrojums',
    showPanel: 'Rādīt īpašības', closePanel: 'Aizvērt paneli', zoom: 'Mērogs',
    lockedParent: 'Vispirms atbloķējiet vecākobjektu.', changedFailed: 'Izmaiņu neizdevās piemērot.',
    rulers: 'Audekla lineāli pikseļos', keyboard: 'F6 taisnstūris · F7 elipse · F8 teksts · F4 ietilpināt · Ctrl+D kopija',
  }
};
export type DrawingLabel = keyof typeof copy.en;
const subscribe = (notify: () => void) => {
  const stopLocale = locale.subscribe(notify); const stopText = t.subscribe(notify);
  return () => { stopLocale(); stopText(); };
};

export function useDrawingText() {
  // The translator store also changes after a lazy-loaded dictionary arrives.
  useSyncExternalStore(subscribe, () => get(t), () => get(t));
  const language = useSyncExternalStore(subscribe, () => get(locale), () => 'en');
  const dictionary = copy[language?.startsWith('ru') ? 'ru' : language?.startsWith('lv') ? 'lv' : 'en'];
  return {
    label: (key: DrawingLabel) => dictionary[key],
    tr: (key: string) => get(t)(key),
  };
}
