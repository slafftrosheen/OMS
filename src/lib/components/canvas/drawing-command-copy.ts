import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
import type { DrawingCommandId, DrawingMenuId, DrawingSubmenuId, DrawingToolId, DrawingToolSection } from './drawing-command-map';

type Words = {
  menus: Record<DrawingMenuId, string>;
  submenus: Record<DrawingSubmenuId, string>;
  commands: Record<DrawingCommandId, string>;
  tools: Partial<Record<DrawingToolId, string>>;
  sections: Record<DrawingToolSection, string>;
  groups: Record<string, string>;
  ui: Record<UiKey, string>;
  shapes: Record<string, string>;
};
type UiKey = 'exportSettings' | 'toolDirectory' | 'quickAccessTitle' | 'quickAccessPlaceholder' | 'quickAccessEmpty' | 'quickAccessHint'
  | 'shortcutsTitle' | 'shortcutsCommands' | 'shortcutsTools' | 'shortcutsContext' | 'alignKeysNote' | 'cursor' | 'fill' | 'outline' | 'noFill'
  | 'noOutline' | 'mixed' | 'objectsSelected' | 'onLayer' | 'noSelection' | 'noColour' | 'noColourHint' | 'menuBar' | 'close' | 'run' | 'more'
  | 'standardCut' | 'standardExport' | 'repeated' | 'pageFrame' | 'nothingToRepeat' | 'disabledHint' | 'tool' | 'command' | 'docker' | 'readOnlyTool' | 'paletteHint';

const en: Words = {
  menus: { file: 'File', edit: 'Edit', view: 'View', layout: 'Layout', object: 'Object', effects: 'Effects', bitmaps: 'Bitmaps', text: 'Text', tools: 'Tools', window: 'Window', help: 'Help' },
  submenus: { exportFormats: 'Export', order: 'Order', transformations: 'Transformations', alignDistribute: 'Align and distribute', shapingTools: 'Shaping', nodeTools: 'Nodes', shapeProperties: 'Shape properties', options: 'Options', dockers: 'Dockers' },
  commands: {
    import: 'Import…', importDxf: 'Import DXF…', importVector: 'Import PDF, SVG, EPS or CDR…', export: 'Export…', exportDxf: 'Review and export DXF', publishPdf: 'Publish to PDF…', files: 'Order files', preflight: 'Preflight check',
    undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', duplicate: 'Duplicate', repeat: 'Step and repeat…', delete: 'Delete', 'select-all': 'Select all', selectSame: 'Select similar…', findReplace: 'Find and replace…', copyProperties: 'Copy properties from…',
    'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', fit: 'Zoom to all objects', 'fit-selection': 'Zoom to selection', fitPage: 'Zoom to page', 'zoom-reset': 'Actual size (100%)', fullscreen: 'Full screen', rulers: 'Rulers', grid: 'Grid', guidesVisible: 'Guidelines', snap: 'Snap to objects', snapOptions: 'Snap options…', surface: 'Blueprint surface', penSettings: 'Pen and tablet…',
    pageSetup: 'Page setup', document: 'Document units and scale', guidesSetup: 'Guidelines setup…', measure: 'Dimensions and construction', nest: 'Nest on sheet…', clipart: 'Production clipart',
    group: 'Group', ungroup: 'Ungroup', combine: 'Combine', breakApart: 'Break apart', lock: 'Lock selection', productionLayers: 'Production layers', front: 'To front', back: 'To back', forward: 'Forward one', backward: 'Back one', reverseOrder: 'Reverse order', relativeOrder: 'In front of or behind…',
    transform: 'Position, scale and rotate…', 'rotate-left': 'Rotate 90° left', 'rotate-right': 'Rotate 90° right', 'flip-horizontal': 'Mirror horizontally', 'flip-vertical': 'Mirror vertically', mirrorCopy: 'Mirror copy across line…', skew: 'Rotate and skew handles',
    'align-left': 'Align left', 'align-right': 'Align right', 'align-top': 'Align top', 'align-bottom': 'Align bottom', 'align-center': 'Align centres horizontally', 'align-middle': 'Align centres vertically', 'distribute-horizontal': 'Distribute horizontally', 'distribute-vertical': 'Distribute vertically', arrange: 'Align and distribute…',
    shaping: 'Weld, trim and intersect…', join: 'Join curves…', knife: 'Knife…', convert: 'Convert to curves', outlineObject: 'Convert outline to object', nodes: 'Edit nodes', nodeArrange: 'Align nodes…', nodeReduce: 'Reduce nodes…',
    rectangleCorners: 'Rectangle corners…', polygonShape: 'Polygon and star…', ellipseSegments: 'Pie and arc…', paint: 'Fill…', outline: 'Outline pen…',
    contour: 'Contour (offset)…', midline: 'Centreline…', radial: 'Radial repeat…', repeatPath: 'Repeat along path…', lettering: 'Lettering…', trace: 'Trace bitmap…', textDocker: 'Text', fonts: 'Fonts…',
    'dock-properties': 'Properties', 'dock-objects': 'Objects', 'dock-text': 'Text', 'dock-arrange': 'Arrange', 'dock-measure': 'Dimensions', 'dock-guides': 'Guidelines', 'dock-snap': 'Snapping', 'dock-pen': 'Pen and tablet', 'dock-cad': 'CAD and production', 'dock-clipart': 'Production clipart',
    repeatLast: 'Repeat last command', duplicateInPlace: 'Duplicate in place', selectNext: 'Select next object', selectPrevious: 'Select previous object', centerToPage: 'Centre to page', togglePick: 'Switch to Pick and back', options: 'Options…',
    closeDocker: 'Close docker', quickAccess: 'Quick access…', shortcuts: 'Keyboard shortcuts',
  },
  tools: { 'free-transform': 'Free transform', knife: 'Knife', zoom: 'Zoom', highlight: 'Highlighter', star: 'Star', triangle: 'Triangle', diamond: 'Diamond', frame: 'Frame', 'fx-contour': 'Contour', 'fx-repeat': 'Step and repeat', 'fx-radial': 'Radial repeat', 'fx-shaping': 'Shaping', eyedropper: 'Attributes eyedropper', outline: 'Outline pen', pentagon: 'Polygon' },
  sections: { selectTools: 'Select and edit', drawTools: 'Draw and construct', annotateTools: 'Text and dimensions', effectTools: 'Interactive effects', productionTools: 'Production and finishes' },
  groups: { select: 'Pick tools', nodes: 'Shape and crop', hand: 'Zoom and pan', curves: 'Curves', artistic: 'Artistic media', rectangle: 'Rectangle', ellipse: 'Circles and ellipses', shapes: 'Polygons and stars', text: 'Text', dimension: 'Dimensions', annotations: 'Connectors', effects: 'Interactive effects', eyedropper: 'Eyedropper', paint: 'Fill and outline', clipart: 'Production clipart' },
  ui: {
    repeated: 'Repeated', pageFrame: 'Page frame added', nothingToRepeat: 'Nothing to repeat yet',
    exportSettings: 'Export settings', toolDirectory: 'All tools', quickAccessTitle: 'Quick access', quickAccessPlaceholder: 'Type a command or tool…', quickAccessEmpty: 'Nothing matches. Try another word.',
    quickAccessHint: '↑ ↓ to move · Enter to run · Esc to close', shortcutsTitle: 'Keyboard shortcuts', shortcutsCommands: 'Commands', shortcutsTools: 'Tools', shortcutsContext: 'With two or more objects selected',
    alignKeysNote: 'L, R, T, B, C and E align the selection to the last selected object.', cursor: 'Cursor', fill: 'Fill', outline: 'Outline', noFill: 'No fill', noOutline: 'No outline', mixed: 'Mixed',
    objectsSelected: 'objects selected', onLayer: 'on', noSelection: 'Nothing selected', noColour: 'No colour', noColourHint: 'Click: remove fill. Right-click: remove outline.', menuBar: 'Menu bar', close: 'Close', run: 'Run',
    more: 'More', standardCut: 'Cut', standardExport: 'Export', disabledHint: 'Not available for the current selection', tool: 'Tool', command: 'Command', docker: 'Docker', readOnlyTool: 'Not available in read-only mode',
    paletteHint: 'Click a colour to fill, right-click to outline.',
  },
  shapes: { rectangle: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Diamond', pentagon: 'Polygon', star: 'Star', geo: 'Shape', text: 'Text', group: 'Group', line: 'Line', arrow: 'Connector', draw: 'Artistic stroke', highlight: 'Highlight', image: 'Bitmap', frame: 'Frame', 'cad-bezier': 'Curve', 'cad-path': 'Curve', 'cad-polyline': 'Polyline', 'cad-arc': 'Arc', 'cad-circle': 'Circle', 'cad-dimension': 'Dimension', 'order-annotation': 'Order note', curve: 'Object' },
};

const lv: Words = {
  menus: { file: 'Fails', edit: 'Rediģēt', view: 'Skats', layout: 'Izkārtojums', object: 'Objekts', effects: 'Efekti', bitmaps: 'Rastrs', text: 'Teksts', tools: 'Rīki', window: 'Logs', help: 'Palīdzība' },
  submenus: { exportFormats: 'Eksports', order: 'Secība', transformations: 'Transformācijas', alignDistribute: 'Līdzināt un izkliedēt', shapingTools: 'Formēšana', nodeTools: 'Mezgli', shapeProperties: 'Formas īpašības', options: 'Iestatījumi', dockers: 'Paneļi' },
  commands: {
    import: 'Importēt…', importDxf: 'Importēt DXF…', importVector: 'Importēt PDF, SVG, EPS vai CDR…', export: 'Eksportēt…', exportDxf: 'Pārbaudīt un eksportēt DXF', publishPdf: 'Publicēt PDF…', files: 'Pasūtījuma faili', preflight: 'Pirmsdrukas pārbaude',
    undo: 'Atsaukt', redo: 'Atcelt atsaukšanu', cut: 'Izgriezt', copy: 'Kopēt', paste: 'Ielīmēt', duplicate: 'Dublēt', repeat: 'Solis un atkārtot…', delete: 'Dzēst', 'select-all': 'Atlasīt visu', selectSame: 'Atlasīt līdzīgos…', findReplace: 'Atrast un aizstāt…', copyProperties: 'Kopēt īpašības no…',
    'zoom-in': 'Tuvināt', 'zoom-out': 'Tālināt', fit: 'Tuvināt visiem objektiem', 'fit-selection': 'Tuvināt atlasei', fitPage: 'Tuvināt lapai', 'zoom-reset': 'Faktiskais izmērs (100%)', fullscreen: 'Pilnekrāns', rulers: 'Lineāli', grid: 'Režģis', guidesVisible: 'Palīglīnijas', snap: 'Piesaiste objektiem', snapOptions: 'Piesaistes iestatījumi…', surface: 'Rasējuma virsma', penSettings: 'Pildspalva un planšete…',
    pageSetup: 'Lapas iestatījumi', document: 'Dokumenta mērvienības un mērogs', guidesSetup: 'Palīglīniju iestatīšana…', measure: 'Izmēri un konstruēšana', nest: 'Izkārtot loksnē…', clipart: 'Ražošanas sagataves',
    group: 'Grupēt', ungroup: 'Atgrupēt', combine: 'Apvienot', breakApart: 'Sadalīt', lock: 'Bloķēt atlasi', productionLayers: 'Ražošanas slāņi', front: 'Uz priekšu', back: 'Uz aizmuguri', forward: 'Vienu uz priekšu', backward: 'Vienu atpakaļ', reverseOrder: 'Apgriezt secību', relativeOrder: 'Priekšā vai aiz…',
    transform: 'Pozīcija, mērogs un pagrieziens…', 'rotate-left': 'Pagriezt 90° pa kreisi', 'rotate-right': 'Pagriezt 90° pa labi', 'flip-horizontal': 'Spoguļot horizontāli', 'flip-vertical': 'Spoguļot vertikāli', mirrorCopy: 'Spoguļkopija pret līniju…', skew: 'Pagrieziena un slīpuma turi',
    'align-left': 'Līdzināt pa kreisi', 'align-right': 'Līdzināt pa labi', 'align-top': 'Līdzināt augšā', 'align-bottom': 'Līdzināt apakšā', 'align-center': 'Līdzināt centrus horizontāli', 'align-middle': 'Līdzināt centrus vertikāli', 'distribute-horizontal': 'Izkliedēt horizontāli', 'distribute-vertical': 'Izkliedēt vertikāli', arrange: 'Līdzināt un izkliedēt…',
    shaping: 'Sapludināt, apgriezt, krustot…', join: 'Savienot līknes…', knife: 'Nazis…', convert: 'Pārvērst līknēs', outlineObject: 'Kontūru pārvērst objektā', nodes: 'Rediģēt mezglus', nodeArrange: 'Līdzināt mezglus…', nodeReduce: 'Samazināt mezglus…',
    rectangleCorners: 'Taisnstūra stūri…', polygonShape: 'Daudzstūris un zvaigzne…', ellipseSegments: 'Sektors un loks…', paint: 'Aizpildījums…', outline: 'Kontūras pildspalva…',
    contour: 'Kontūra (nobīde)…', midline: 'Viduslīnija…', radial: 'Radiāls atkārtojums…', repeatPath: 'Atkārtot pa līkni…', lettering: 'Burtu izkārtojums…', trace: 'Vektorizēt rastru…', textDocker: 'Teksts', fonts: 'Fonti…',
    'dock-properties': 'Īpašības', 'dock-objects': 'Objekti', 'dock-text': 'Teksts', 'dock-arrange': 'Izkārtot', 'dock-measure': 'Izmēri', 'dock-guides': 'Palīglīnijas', 'dock-snap': 'Piesaiste', 'dock-pen': 'Pildspalva un planšete', 'dock-cad': 'CAD un ražošana', 'dock-clipart': 'Ražošanas sagataves',
    repeatLast: 'Atkārtot pēdējo komandu', duplicateInPlace: 'Dublēt vietā', selectNext: 'Atlasīt nākamo objektu', selectPrevious: 'Atlasīt iepriekšējo objektu', centerToPage: 'Centrēt lapā', togglePick: 'Pārslēgt uz atlasi un atpakaļ', options: 'Iestatījumi…',
    closeDocker: 'Aizvērt paneli', quickAccess: 'Ātrā piekļuve…', shortcuts: 'Īsinājumtaustiņi',
  },
  tools: { 'free-transform': 'Brīvā transformācija', knife: 'Nazis', zoom: 'Tālummaiņa', highlight: 'Marķieris', star: 'Zvaigzne', triangle: 'Trijstūris', diamond: 'Rombs', frame: 'Rāmis', 'fx-contour': 'Kontūra', 'fx-repeat': 'Solis un atkārtot', 'fx-radial': 'Radiāls atkārtojums', 'fx-shaping': 'Formēšana', eyedropper: 'Īpašību pipete', outline: 'Kontūras pildspalva', pentagon: 'Daudzstūris' },
  sections: { selectTools: 'Atlase un rediģēšana', drawTools: 'Zīmēšana un konstruēšana', annotateTools: 'Teksts un izmēri', effectTools: 'Interaktīvie efekti', productionTools: 'Ražošana un apdare' },
  groups: { select: 'Atlases rīki', nodes: 'Forma un apgriešana', hand: 'Tālummaiņa un pārvietošana', curves: 'Līknes', artistic: 'Mākslinieciskie rīki', rectangle: 'Taisnstūris', ellipse: 'Riņķi un elipses', shapes: 'Daudzstūri un zvaigznes', text: 'Teksts', dimension: 'Izmēri', annotations: 'Savienotāji', effects: 'Interaktīvie efekti', eyedropper: 'Pipete', paint: 'Aizpildījums un kontūra', clipart: 'Ražošanas sagataves' },
  ui: {
    repeated: 'Atkārtots', pageFrame: 'Lapas rāmis pievienots', nothingToRepeat: 'Vēl nav ko atkārtot',
    exportSettings: 'Eksporta iestatījumi', toolDirectory: 'Visi rīki', quickAccessTitle: 'Ātrā piekļuve', quickAccessPlaceholder: 'Ierakstiet komandu vai rīku…', quickAccessEmpty: 'Nekas neatbilst. Mēģiniet citu vārdu.',
    quickAccessHint: '↑ ↓ pārvietoties · Enter izpildīt · Esc aizvērt', shortcutsTitle: 'Īsinājumtaustiņi', shortcutsCommands: 'Komandas', shortcutsTools: 'Rīki', shortcutsContext: 'Ja atlasīti divi vai vairāk objekti',
    alignKeysNote: 'L, R, T, B, C un E līdzina atlasi pēc pēdējā atlasītā objekta.', cursor: 'Kursors', fill: 'Aizpildījums', outline: 'Kontūra', noFill: 'Bez aizpildījuma', noOutline: 'Bez kontūras', mixed: 'Jaukts',
    objectsSelected: 'objekti atlasīti', onLayer: 'slānī', noSelection: 'Nekas nav atlasīts', noColour: 'Bez krāsas', noColourHint: 'Klikšķis: noņemt aizpildījumu. Labais klikšķis: noņemt kontūru.', menuBar: 'Izvēlņu josla', close: 'Aizvērt', run: 'Izpildīt',
    more: 'Vairāk', standardCut: 'Izgriezt', standardExport: 'Eksportēt', disabledHint: 'Nav pieejams pašreizējai atlasei', tool: 'Rīks', command: 'Komanda', docker: 'Panelis', readOnlyTool: 'Nav pieejams tikai lasīšanas režīmā',
    paletteHint: 'Klikšķis — aizpildījums, labais klikšķis — kontūra.',
  },
  shapes: { rectangle: 'Taisnstūris', ellipse: 'Elipse', triangle: 'Trijstūris', diamond: 'Rombs', pentagon: 'Daudzstūris', star: 'Zvaigzne', geo: 'Forma', text: 'Teksts', group: 'Grupa', line: 'Līnija', arrow: 'Savienotājs', draw: 'Mākslinieciska līnija', highlight: 'Marķējums', image: 'Rastrs', frame: 'Rāmis', 'cad-bezier': 'Līkne', 'cad-path': 'Līkne', 'cad-polyline': 'Lauzta līnija', 'cad-arc': 'Loks', 'cad-circle': 'Riņķis', 'cad-dimension': 'Izmērs', 'order-annotation': 'Pasūtījuma piezīme', curve: 'Objekts' },
};

const ru: Words = {
  menus: { file: 'Файл', edit: 'Правка', view: 'Вид', layout: 'Макет', object: 'Объект', effects: 'Эффекты', bitmaps: 'Растр', text: 'Текст', tools: 'Инструменты', window: 'Окно', help: 'Справка' },
  submenus: { exportFormats: 'Экспорт', order: 'Порядок', transformations: 'Преобразования', alignDistribute: 'Выровнять и распределить', shapingTools: 'Формирование', nodeTools: 'Узлы', shapeProperties: 'Свойства фигуры', options: 'Параметры', dockers: 'Докеры' },
  commands: {
    import: 'Импорт…', importDxf: 'Импорт DXF…', importVector: 'Импорт PDF, SVG, EPS или CDR…', export: 'Экспорт…', exportDxf: 'Проверить и экспортировать DXF', publishPdf: 'Опубликовать в PDF…', files: 'Файлы заказа', preflight: 'Предпечатная проверка',
    undo: 'Отменить', redo: 'Повторить', cut: 'Вырезать', copy: 'Копировать', paste: 'Вставить', duplicate: 'Дублировать', repeat: 'Шаг и повтор…', delete: 'Удалить', 'select-all': 'Выделить всё', selectSame: 'Выделить похожие…', findReplace: 'Найти и заменить…', copyProperties: 'Копировать свойства от…',
    'zoom-in': 'Увеличить', 'zoom-out': 'Уменьшить', fit: 'Масштаб по всем объектам', 'fit-selection': 'Масштаб по выделению', fitPage: 'Масштаб по странице', 'zoom-reset': 'Реальный размер (100%)', fullscreen: 'Во весь экран', rulers: 'Линейки', grid: 'Сетка', guidesVisible: 'Направляющие', snap: 'Привязка к объектам', snapOptions: 'Параметры привязки…', surface: 'Чертёжная подложка', penSettings: 'Перо и планшет…',
    pageSetup: 'Параметры страницы', document: 'Единицы и масштаб документа', guidesSetup: 'Настройка направляющих…', measure: 'Размеры и построения', nest: 'Раскладка на листе…', clipart: 'Производственные шаблоны',
    group: 'Сгруппировать', ungroup: 'Разгруппировать', combine: 'Объединить', breakApart: 'Разъединить', lock: 'Заблокировать выделенное', productionLayers: 'Производственные слои', front: 'На передний план', back: 'На задний план', forward: 'На один вперёд', backward: 'На один назад', reverseOrder: 'Обратный порядок', relativeOrder: 'Перед или за…',
    transform: 'Положение, масштаб и поворот…', 'rotate-left': 'Повернуть на 90° влево', 'rotate-right': 'Повернуть на 90° вправо', 'flip-horizontal': 'Отразить по горизонтали', 'flip-vertical': 'Отразить по вертикали', mirrorCopy: 'Зеркальная копия относительно линии…', skew: 'Маркеры поворота и наклона',
    'align-left': 'Выровнять по левому краю', 'align-right': 'Выровнять по правому краю', 'align-top': 'Выровнять по верху', 'align-bottom': 'Выровнять по низу', 'align-center': 'Выровнять центры по горизонтали', 'align-middle': 'Выровнять центры по вертикали', 'distribute-horizontal': 'Распределить по горизонтали', 'distribute-vertical': 'Распределить по вертикали', arrange: 'Выровнять и распределить…',
    shaping: 'Сварить, обрезать, пересечь…', join: 'Соединить кривые…', knife: 'Нож…', convert: 'Преобразовать в кривые', outlineObject: 'Абрис в объект', nodes: 'Редактировать узлы', nodeArrange: 'Выровнять узлы…', nodeReduce: 'Сократить узлы…',
    rectangleCorners: 'Углы прямоугольника…', polygonShape: 'Многоугольник и звезда…', ellipseSegments: 'Сектор и дуга…', paint: 'Заливка…', outline: 'Перо абриса…',
    contour: 'Контур (смещение)…', midline: 'Осевая линия…', radial: 'Радиальный повтор…', repeatPath: 'Повтор вдоль кривой…', lettering: 'Надпись…', trace: 'Трассировать растр…', textDocker: 'Текст', fonts: 'Шрифты…',
    'dock-properties': 'Свойства', 'dock-objects': 'Объекты', 'dock-text': 'Текст', 'dock-arrange': 'Упорядочить', 'dock-measure': 'Размеры', 'dock-guides': 'Направляющие', 'dock-snap': 'Привязка', 'dock-pen': 'Перо и планшет', 'dock-cad': 'CAD и производство', 'dock-clipart': 'Производственные шаблоны',
    repeatLast: 'Повторить последнюю команду', duplicateInPlace: 'Дублировать на месте', selectNext: 'Выделить следующий объект', selectPrevious: 'Выделить предыдущий объект', centerToPage: 'По центру страницы', togglePick: 'Переключиться на выбор и обратно', options: 'Параметры…',
    closeDocker: 'Закрыть докер', quickAccess: 'Быстрый доступ…', shortcuts: 'Сочетания клавиш',
  },
  tools: { 'free-transform': 'Свободное преобразование', knife: 'Нож', zoom: 'Масштаб', highlight: 'Маркер', star: 'Звезда', triangle: 'Треугольник', diamond: 'Ромб', frame: 'Рамка', 'fx-contour': 'Контур', 'fx-repeat': 'Шаг и повтор', 'fx-radial': 'Радиальный повтор', 'fx-shaping': 'Формирование', eyedropper: 'Пипетка свойств', outline: 'Перо абриса', pentagon: 'Многоугольник' },
  sections: { selectTools: 'Выбор и правка', drawTools: 'Рисование и построение', annotateTools: 'Текст и размеры', effectTools: 'Интерактивные эффекты', productionTools: 'Производство и отделка' },
  groups: { select: 'Инструменты выбора', nodes: 'Форма и обрезка', hand: 'Масштаб и панорама', curves: 'Кривые', artistic: 'Художественные средства', rectangle: 'Прямоугольник', ellipse: 'Окружности и эллипсы', shapes: 'Многоугольники и звёзды', text: 'Текст', dimension: 'Размеры', annotations: 'Соединители', effects: 'Интерактивные эффекты', eyedropper: 'Пипетка', paint: 'Заливка и абрис', clipart: 'Производственные шаблоны' },
  ui: {
    repeated: 'Повторено', pageFrame: 'Рамка страницы добавлена', nothingToRepeat: 'Пока нечего повторить',
    exportSettings: 'Параметры экспорта', toolDirectory: 'Все инструменты', quickAccessTitle: 'Быстрый доступ', quickAccessPlaceholder: 'Введите команду или инструмент…', quickAccessEmpty: 'Ничего не найдено. Попробуйте другое слово.',
    quickAccessHint: '↑ ↓ — перемещение · Enter — выполнить · Esc — закрыть', shortcutsTitle: 'Сочетания клавиш', shortcutsCommands: 'Команды', shortcutsTools: 'Инструменты', shortcutsContext: 'Если выделено два объекта или больше',
    alignKeysNote: 'L, R, T, B, C и E выравнивают выделение по последнему выбранному объекту.', cursor: 'Курсор', fill: 'Заливка', outline: 'Абрис', noFill: 'Без заливки', noOutline: 'Без абриса', mixed: 'Разные',
    objectsSelected: 'объектов выделено', onLayer: 'на', noSelection: 'Ничего не выделено', noColour: 'Без цвета', noColourHint: 'Щелчок: убрать заливку. Правый щелчок: убрать абрис.', menuBar: 'Строка меню', close: 'Закрыть', run: 'Выполнить',
    more: 'Ещё', standardCut: 'Вырезать', standardExport: 'Экспорт', disabledHint: 'Недоступно для текущего выделения', tool: 'Инструмент', command: 'Команда', docker: 'Докер', readOnlyTool: 'Недоступно в режиме просмотра',
    paletteHint: 'Щелчок по цвету — заливка, правый щелчок — абрис.',
  },
  shapes: { rectangle: 'Прямоугольник', ellipse: 'Эллипс', triangle: 'Треугольник', diamond: 'Ромб', pentagon: 'Многоугольник', star: 'Звезда', geo: 'Фигура', text: 'Текст', group: 'Группа', line: 'Линия', arrow: 'Соединитель', draw: 'Художественный штрих', highlight: 'Выделение', image: 'Растр', frame: 'Рамка', 'cad-bezier': 'Кривая', 'cad-path': 'Кривая', 'cad-polyline': 'Ломаная', 'cad-arc': 'Дуга', 'cad-circle': 'Окружность', 'cad-dimension': 'Размер', 'order-annotation': 'Заметка заказа', curve: 'Объект' },
};

export const drawingCommandDictionaries = { en, lv, ru } as const;
const subscribe = (notify: () => void) => locale.subscribe(notify);

export function useDrawingCommandText(): Words {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => 'en');
  return language?.startsWith('lv') ? lv : language?.startsWith('ru') ? ru : en;
}
