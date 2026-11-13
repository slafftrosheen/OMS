import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale, t } from 'svelte-i18n';

const en = {
  drawPolyline: 'CAD polyline', polylineKeys: 'Click vertices · Enter: finish · first vertex: close · Snap: enabled targets · Ctrl: temporarily toggle Snap · Shift: 45° takes priority · Backspace: undo vertex · Escape: cancel', copyContourHelp: 'Replaces the straight line with an editable contour. Lines connected to external objects cannot be converted.', readOnly: 'Read only', gapX: 'Horizontal gap', gapY: 'Vertical gap', arcEdit: 'Selected arc', updateArc: 'Update arc', arcUpdated: 'Arc updated.', noArc: 'Select one CAD arc to edit its radius and angles.', convertPath: 'Convert to editable contour', converted: 'Line converted to an editable contour.', minimumGeometry: 'The geometry exceeds the drawing limits. Reduce the dimensions or scale.', cad: 'CAD', layout: 'Layout', document: 'Document units & scale', unit: 'Drawing unit', scale: 'Drawing scale 1 :', precision: 'Decimal places', nudge: 'Nudge distance', apply: 'Apply settings',
  legacy: 'This document uses canvas pixels. Apply settings to enable physical dimensions.',
  scaleHelp: 'At 1:1, 96 canvas px = 1 inch (25.4 mm). Scale 1:N changes the physical meaning of existing geometry, not the zoom or object positions.',
  coordinateHelp: 'X increases right; Y increases up from the document origin. Dimensions and gaps use the drawing unit.',
  settingsInvalid: 'Use a valid scale, 0–6 decimal places and a positive nudge distance.', settingsSaved: 'Document settings applied.',
  origin: 'Document origin', selectionOrigin: 'Origin at selection lower left', resetOrigin: 'Reset origin', anchor: 'Transform reference point', proportional: 'Keep proportions',
  anchorTopLeft: 'Top left', anchorTop: 'Top centre', anchorTopRight: 'Top right', anchorLeft: 'Middle left', anchorCenter: 'Centre', anchorRight: 'Middle right', anchorBottomLeft: 'Bottom left', anchorBottom: 'Bottom centre', anchorBottomRight: 'Bottom right',
  create: 'Exact geometry', kind: 'Object type', rectangle: 'Rectangle', ellipse: 'Ellipse', circle: 'Circle', line: 'Line', arc: 'Arc', polyline: 'Polyline / polygon',
  x: 'X', y: 'Y', width: 'Width', height: 'Height', radius: 'Radius', length: 'Length', angle: 'Angle (°)', rotation: 'Rotation (°)', startAngle: 'Start angle (°)', endAngle: 'End angle (°)',
  geometryHelp: 'Rectangles and ellipses: lower-left X/Y before rotation. Circles and arcs: centre X/Y. Angles run counterclockwise.',
  createObject: 'Create object', created: 'Object created.', invalidGeometry: 'Enter finite coordinates and positive dimensions. Arc angles must describe a non-zero sweep under 360°.',
  points: 'Vertices: X,Y', pointsHelp: 'One X,Y pair per line, using decimal points. 2–256 vertices; closed contours require at least 3.', invalidPoints: 'Enter 2–256 valid X,Y pairs (at least 3 for a closed contour).',
  closed: 'Close contour', editPoints: 'Selected path vertices', updatePoints: 'Update vertices', pointsUpdated: 'Path vertices updated.', noPath: 'Select one CAD polyline to edit its vertices.',
  measure: 'Measure & calibrate', selectionRequired: 'Select one object to measure or transform.', selectionSize: 'Selected object', horizontal: 'Horizontal', vertical: 'Vertical', aligned: 'Aligned', dimensionKind: 'Dimension direction', addDimension: 'Add dimension',
  dimensionHelp: 'Dimensions are snapshots. Recreate them after changing geometry or scale. Aligned dimensions use the first and last CAD path vertices, or the page-bounds diagonal for other objects.', dimensionCreated: 'Dimension added.',
  invalidLength: 'Enter a positive physical length.', knownLength: 'Known physical length', calibrateAxis: 'Calibrate using', calibrate: 'Calibrate scale', calibrateHelp: 'Sets the document scale from the selected object’s local width or height, independent of rotation. Object positions do not change.', calibrated: 'Document scale calibrated.',
  dxf: 'DXF export', exportScope: 'Export scope', selected: 'Selected objects', all: 'All page objects', dxfHelp: 'DXF uses model space at 1:1 in millimetres, regardless of the drawing unit or screen zoom. Review the report before download.',
  curveExport: 'Bézier output', splineExport: 'Exact SPLINE', polylineExport: 'Flattened polylines', exportTolerance: 'Curve tolerance (mm)', exportToleranceInvalid: 'Enter a tolerance from 0.001 to 1 mm.',
  splineExportHelp: 'SPLINE preserves Bézier curves exactly. Check whether your cutter accepts SPLINE entities.', polylineExportHelp: 'For cutters that do not accept SPLINE, approximate Bézier curves with straight segments within this tolerance. Other geometry keeps its DXF type.',
  review: 'Review export', download: 'Download DXF', entities: 'Entities', closedContours: 'Closed contours', openContours: 'Open contours', dimensions: 'Export bounds (mm)', omitted: 'Omitted objects',
  acknowledge: 'I have reviewed and accept the listed omissions.', noOmissions: 'No objects omitted.', noEntities: 'No supported geometry in this scope.', stale: 'The drawing, selection, settings or export options changed. Review the export again.',
  exportFailed: 'DXF could not be prepared. Check the selected geometry and drawing limits.', exported: 'DXF downloaded.',
  unsupported: 'Unsupported object type', annotation: 'Annotation or label', form: 'Order form', invalid: 'Invalid geometry', curved: 'Curved or freehand path', clipped: 'Clipped geometry', empty: 'Empty geometry',
  failed: 'The change could not be applied. Check the values, selection and locks.', invalidNumber: 'Enter a finite value; width and height must be positive.',
  nudgeHelp: 'Arrow keys: nudge in drawing units · Shift: ×10 · Ctrl/⌘: ×0.1', repeatHint: 'Repeat gaps use drawing units. Rows and columns include the original.',
} as const;
type CadDictionary = { [K in keyof typeof en]: string };
const ru: CadDictionary = {
  drawPolyline: 'CAD-ломаная', polylineKeys: 'Клик: вершина · Enter: завершить · первая вершина: замкнуть · Привязка: включённые цели · Ctrl: временно переключить привязку · Shift: 45° с приоритетом · Backspace: убрать вершину · Escape: отменить', copyContourHelp: 'Заменяет прямую линию редактируемым контуром. Линии, связанные с внешними объектами, преобразовать нельзя.', readOnly: 'Только чтение', gapX: 'Зазор по горизонтали', gapY: 'Зазор по вертикали', arcEdit: 'Выбранная дуга', updateArc: 'Обновить дугу', arcUpdated: 'Дуга обновлена.', noArc: 'Выберите одну CAD-дугу для редактирования радиуса и углов.', convertPath: 'Преобразовать в редактируемый контур', converted: 'Линия преобразована в редактируемый контур.', minimumGeometry: 'Геометрия превышает ограничения чертежа. Уменьшите размеры или масштаб.', cad: 'CAD', layout: 'Макет', document: 'Единицы и масштаб', unit: 'Единица чертежа', scale: 'Масштаб 1 :', precision: 'Знаков после запятой', nudge: 'Шаг перемещения', apply: 'Применить настройки',
  legacy: 'Документ использует пиксели холста. Примените настройки для работы с физическими размерами.',
  scaleHelp: 'При масштабе 1:1, 96 px холста = 1 дюйм (25,4 мм). Масштаб 1:N меняет физические размеры существующей геометрии, но не приближение и не положение объектов.',
  coordinateHelp: 'X направлен вправо, Y — вверх от начала координат. Размеры и интервалы указаны в единицах чертежа.',
  settingsInvalid: 'Укажите допустимый масштаб, 0–6 знаков после запятой и положительный шаг.', settingsSaved: 'Настройки документа применены.',
  origin: 'Начало координат', selectionOrigin: 'Начало в левом нижнем углу объекта', resetOrigin: 'Сбросить начало координат', anchor: 'Опорная точка преобразования', proportional: 'Сохранять пропорции',
  anchorTopLeft: 'Сверху слева', anchorTop: 'Сверху по центру', anchorTopRight: 'Сверху справа', anchorLeft: 'Слева по центру', anchorCenter: 'Центр', anchorRight: 'Справа по центру', anchorBottomLeft: 'Снизу слева', anchorBottom: 'Снизу по центру', anchorBottomRight: 'Снизу справа',
  create: 'Точная геометрия', kind: 'Тип объекта', rectangle: 'Прямоугольник', ellipse: 'Эллипс', circle: 'Окружность', line: 'Линия', arc: 'Дуга', polyline: 'Ломаная / многоугольник',
  x: 'X', y: 'Y', width: 'Ширина', height: 'Высота', radius: 'Радиус', length: 'Длина', angle: 'Угол (°)', rotation: 'Поворот (°)', startAngle: 'Начальный угол (°)', endAngle: 'Конечный угол (°)',
  geometryHelp: 'Прямоугольник и эллипс: X/Y левого нижнего угла до поворота. Окружность и дуга: X/Y центра. Углы — против часовой стрелки.',
  createObject: 'Создать объект', created: 'Объект создан.', invalidGeometry: 'Введите конечные координаты и положительные размеры. Размах дуги должен быть больше 0° и меньше 360°.',
  points: 'Вершины: X,Y', pointsHelp: 'Одна пара X,Y в строке, дробная часть через точку. 2–256 вершин; для замкнутого контура не менее 3.', invalidPoints: 'Введите 2–256 корректных пар X,Y (не менее 3 для замкнутого контура).',
  closed: 'Замкнуть контур', editPoints: 'Вершины выбранного контура', updatePoints: 'Обновить вершины', pointsUpdated: 'Вершины обновлены.', noPath: 'Выберите одну CAD-ломаную для редактирования вершин.',
  measure: 'Измерение и калибровка', selectionRequired: 'Выберите один объект для измерения или преобразования.', selectionSize: 'Выбранный объект', horizontal: 'Горизонтальный', vertical: 'Вертикальный', aligned: 'Параллельный', dimensionKind: 'Направление размера', addDimension: 'Добавить размер',
  dimensionHelp: 'Размеры фиксируются при создании. Пересоздайте их после изменения геометрии или масштаба. Параллельный размер использует первую и последнюю вершины CAD-ломаной, для других объектов — диагональ габаритов на странице.', dimensionCreated: 'Размер добавлен.',
  invalidLength: 'Введите положительную физическую длину.', knownLength: 'Известная физическая длина', calibrateAxis: 'Калибровать по', calibrate: 'Калибровать масштаб', calibrateHelp: 'Задаёт масштаб документа по локальной ширине или высоте выбранного объекта независимо от поворота. Положение объектов не меняется.', calibrated: 'Масштаб документа откалиброван.',
  dxf: 'Экспорт DXF', exportScope: 'Область экспорта', selected: 'Выбранные объекты', all: 'Все объекты страницы', dxfHelp: 'DXF использует пространство модели 1:1 в миллиметрах независимо от единиц чертежа и приближения. Проверьте отчёт перед скачиванием.',
  curveExport: 'Вывод кривых Безье', splineExport: 'Точные SPLINE', polylineExport: 'Аппроксимация ломаными', exportTolerance: 'Допуск кривых (мм)', exportToleranceInvalid: 'Введите допуск от 0,001 до 1 мм.',
  splineExportHelp: 'SPLINE точно сохраняет кривые Безье. Проверьте, поддерживает ли ваш резак элементы SPLINE.', polylineExportHelp: 'Для резаков без поддержки SPLINE кривые Безье заменяются прямыми сегментами с заданным допуском. Остальная геометрия сохраняет свой тип DXF.',
  review: 'Проверить экспорт', download: 'Скачать DXF', entities: 'Элементы', closedContours: 'Замкнутые контуры', openContours: 'Открытые контуры', dimensions: 'Габариты экспорта (мм)', omitted: 'Пропущенные объекты',
  acknowledge: 'Я проверил(а) и принимаю перечисленные пропуски.', noOmissions: 'Пропущенных объектов нет.', noEntities: 'В этой области нет поддерживаемой геометрии.', stale: 'Чертёж, выбор, настройки или параметры экспорта изменились. Проверьте экспорт снова.',
  exportFailed: 'Не удалось подготовить DXF. Проверьте геометрию и ограничения чертежа.', exported: 'DXF скачан.',
  unsupported: 'Неподдерживаемый тип объекта', annotation: 'Аннотация или текст', form: 'Форма заказа', invalid: 'Некорректная геометрия', curved: 'Кривая или свободная линия', clipped: 'Обрезанная геометрия', empty: 'Пустая геометрия',
  failed: 'Не удалось применить изменение. Проверьте значения, выбор и блокировки.', invalidNumber: 'Введите конечное значение; ширина и высота должны быть положительными.',
  nudgeHelp: 'Стрелки: шаг в единицах чертежа · Shift: ×10 · Ctrl/⌘: ×0.1', repeatHint: 'Интервалы заданы в единицах чертежа. Строки и столбцы включают оригинал.',
};
const lv: CadDictionary = {
  drawPolyline: 'CAD lauzta līnija', polylineKeys: 'Klikšķis: virsotne · Enter: pabeigt · pirmā virsotne: aizvērt · Piesaiste: iespējotie punkti · Ctrl: īslaicīgi pārslēgt piesaistīšanu · Shift: 45° ir prioritāte · Backspace: noņemt virsotni · Escape: atcelt', copyContourHelp: 'Aizstāj taisno līniju ar rediģējamu kontūru. Ar ārējiem objektiem saistītas līnijas nevar pārveidot.', readOnly: 'Tikai lasīšanai', gapX: 'Horizontālā atstarpe', gapY: 'Vertikālā atstarpe', arcEdit: 'Atlasītais loks', updateArc: 'Atjaunināt loku', arcUpdated: 'Loks atjaunināts.', noArc: 'Atlasiet vienu CAD loku, lai rediģētu rādiusu un leņķus.', convertPath: 'Pārveidot par rediģējamu kontūru', converted: 'Līnija pārveidota par rediģējamu kontūru.', minimumGeometry: 'Ģeometrija pārsniedz rasējuma ierobežojumus. Samaziniet izmērus vai mērogu.', cad: 'CAD', layout: 'Izkārtojums', document: 'Vienības un mērogs', unit: 'Rasējuma vienība', scale: 'Mērogs 1 :', precision: 'Zīmes aiz komata', nudge: 'Pārvietošanas solis', apply: 'Lietot iestatījumus',
  legacy: 'Dokuments izmanto audekla pikseļus. Lietojiet iestatījumus fiziskiem izmēriem.',
  scaleHelp: 'Mērogā 1:1, 96 audekla px = 1 colla (25,4 mm). Mērogs 1:N maina esošās ģeometrijas fiziskos izmērus, nevis tuvinājumu vai objektu pozīcijas.',
  coordinateHelp: 'X palielinās pa labi, Y — uz augšu no dokumenta sākumpunkta. Izmēri un atstarpes ir rasējuma vienībās.',
  settingsInvalid: 'Norādiet derīgu mērogu, 0–6 decimālzīmes un pozitīvu pārvietošanas soli.', settingsSaved: 'Dokumenta iestatījumi lietoti.',
  origin: 'Koordinātu sākumpunkts', selectionOrigin: 'Sākumpunkts objekta apakšējā kreisajā stūrī', resetOrigin: 'Atiestatīt sākumpunktu', anchor: 'Pārveidojuma atskaites punkts', proportional: 'Saglabāt proporcijas',
  anchorTopLeft: 'Augšā pa kreisi', anchorTop: 'Augšā centrā', anchorTopRight: 'Augšā pa labi', anchorLeft: 'Vidū pa kreisi', anchorCenter: 'Centrs', anchorRight: 'Vidū pa labi', anchorBottomLeft: 'Apakšā pa kreisi', anchorBottom: 'Apakšā centrā', anchorBottomRight: 'Apakšā pa labi',
  create: 'Precīza ģeometrija', kind: 'Objekta veids', rectangle: 'Taisnstūris', ellipse: 'Elipse', circle: 'Aplis', line: 'Līnija', arc: 'Loks', polyline: 'Lauzta līnija / daudzstūris',
  x: 'X', y: 'Y', width: 'Platums', height: 'Augstums', radius: 'Rādiuss', length: 'Garums', angle: 'Leņķis (°)', rotation: 'Pagrieziens (°)', startAngle: 'Sākuma leņķis (°)', endAngle: 'Beigu leņķis (°)',
  geometryHelp: 'Taisnstūris un elipse: apakšējā kreisā stūra X/Y pirms pagrieziena. Aplis un loks: centra X/Y. Leņķi — pretēji pulksteņrādītājam.',
  createObject: 'Izveidot objektu', created: 'Objekts izveidots.', invalidGeometry: 'Ievadiet galīgas koordinātas un pozitīvus izmērus. Loka leņķim jābūt lielākam par 0° un mazākam par 360°.',
  points: 'Virsotnes: X,Y', pointsHelp: 'Viens X,Y pāris katrā rindā, decimāldaļai izmantojot punktu. 2–256 virsotnes; slēgtam kontūram vismaz 3.', invalidPoints: 'Ievadiet 2–256 derīgus X,Y pārus (slēgtam kontūram vismaz 3).',
  closed: 'Aizvērt kontūru', editPoints: 'Atlasītā kontūra virsotnes', updatePoints: 'Atjaunināt virsotnes', pointsUpdated: 'Virsotnes atjauninātas.', noPath: 'Atlasiet vienu CAD lauzto līniju, lai rediģētu virsotnes.',
  measure: 'Mērīšana un kalibrēšana', selectionRequired: 'Atlasiet vienu objektu mērīšanai vai pārveidošanai.', selectionSize: 'Atlasītais objekts', horizontal: 'Horizontāls', vertical: 'Vertikāls', aligned: 'Paralēls', dimensionKind: 'Izmēra virziens', addDimension: 'Pievienot izmēru',
  dimensionHelp: 'Izmēri ir fiksēti izveides brīdī. Pēc ģeometrijas vai mēroga izmaiņām izveidojiet tos no jauna. Paralēlais izmērs izmanto CAD līnijas pirmo un pēdējo virsotni vai citu objektu lapas gabarītu diagonāli.', dimensionCreated: 'Izmērs pievienots.',
  invalidLength: 'Ievadiet pozitīvu fizisko garumu.', knownLength: 'Zināmais fiziskais garums', calibrateAxis: 'Kalibrēt pēc', calibrate: 'Kalibrēt mērogu', calibrateHelp: 'Iestata dokumenta mērogu pēc atlasītā objekta lokālā platuma vai augstuma neatkarīgi no pagrieziena. Objektu pozīcijas nemainās.', calibrated: 'Dokumenta mērogs kalibrēts.',
  dxf: 'DXF eksports', exportScope: 'Eksporta tvērums', selected: 'Atlasītie objekti', all: 'Visi lapas objekti', dxfHelp: 'DXF izmanto modeļa telpu 1:1 milimetros neatkarīgi no rasējuma vienībām un tuvinājuma. Pirms lejupielādes pārbaudiet atskaiti.',
  curveExport: 'Bezjē līkņu izvade', splineExport: 'Precīzs SPLINE', polylineExport: 'Aproksimētas lauztas līnijas', exportTolerance: 'Līkņu pielaide (mm)', exportToleranceInvalid: 'Ievadiet pielaidi no 0,001 līdz 1 mm.',
  splineExportHelp: 'SPLINE precīzi saglabā Bezjē līknes. Pārbaudiet, vai griezējs atbalsta SPLINE elementus.', polylineExportHelp: 'Griezējiem bez SPLINE atbalsta Bezjē līknes tiek aizstātas ar taisniem segmentiem norādītajā pielaidē. Pārējā ģeometrija saglabā savu DXF veidu.',
  review: 'Pārbaudīt eksportu', download: 'Lejupielādēt DXF', entities: 'Elementi', closedContours: 'Slēgti kontūri', openContours: 'Atvērti kontūri', dimensions: 'Eksporta izmēri (mm)', omitted: 'Izlaistie objekti',
  acknowledge: 'Esmu pārbaudījis un piekrītu norādītajiem izlaidumiem.', noOmissions: 'Nav izlaistu objektu.', noEntities: 'Šajā tvērumā nav atbalstītas ģeometrijas.', stale: 'Rasējums, atlase, iestatījumi vai eksporta parametri mainījās. Pārbaudiet eksportu vēlreiz.',
  exportFailed: 'Neizdevās sagatavot DXF. Pārbaudiet ģeometriju un rasējuma ierobežojumus.', exported: 'DXF lejupielādēts.',
  unsupported: 'Neatbalstīts objekta veids', annotation: 'Anotācija vai teksts', form: 'Pasūtījuma veidlapa', invalid: 'Nederīga ģeometrija', curved: 'Līkne vai brīvrokas līnija', clipped: 'Apgriezta ģeometrija', empty: 'Tukša ģeometrija',
  failed: 'Izmaiņu nevarēja piemērot. Pārbaudiet vērtības, atlasi un bloķēšanu.', invalidNumber: 'Ievadiet galīgu vērtību; platumam un augstumam jābūt pozitīviem.',
  nudgeHelp: 'Bulttaustiņi: solis rasējuma vienībās · Shift: ×10 · Ctrl/⌘: ×0.1', repeatHint: 'Atstarpes ir rasējuma vienībās. Rindas un kolonnas ietver oriģinālu.',
};
export type CadLabel = keyof typeof en;
const subscribe = (notify: () => void) => {
  const stopLocale = locale.subscribe(notify); const stopText = t.subscribe(notify);
  return () => { stopLocale(); stopText(); };
};
export function useCadText() {
  useSyncExternalStore(subscribe, () => get(t), () => get(t));
  const language = useSyncExternalStore(subscribe, () => get(locale), () => 'en');
  const dictionary = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return { label: (key: CadLabel) => dictionary[key] };
}
