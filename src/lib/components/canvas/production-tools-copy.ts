import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  tools: 'Tools', selectTools: 'Select and edit', drawTools: 'Draw and construct',
  annotateTools: 'Text and dimensions', productionTools: 'Production and finishes', editShapeTools: 'Nodes and eraser',
  clipartCategories: 'Clipart categories', mounting: 'Mounting', signBlanks: 'Sign blanks', printMarks: 'Production marks',
  insertClipart: 'Insert on canvas', setDocumentUnits: 'Set document units', widthMm: 'Width (mm)', heightMm: 'Height (mm)', diameterMm: 'Diameter (mm)',
  invalidClipartSize: 'Enter dimensions with room for the preset’s holes, corners or marks.',
  mountingRail: 'Two-hole mounting rail', cableEntry: 'Cable entry hole', signBlank: 'Rounded rectangular sign blank', trimMarks: 'Trim marks',
  mountingRailDetail: '2 × Ø6 mm holes, centres 10 mm from each end.',
  cableEntryDetail: 'A closed circular cutout.', signBlankDetail: 'Closed outline with 5 mm corner radii.',
  trimMarksDetail: '5 mm marks with a 3 mm gap. Dimensions include the marks.',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  fullscreenFailed: 'Could not switch full-screen mode.',
  circles: 'Circles and ellipses',
  construction: 'Straight-edge construction',
  measureEdges: 'Select one straight segment for its length and heading, two segments for their angle, or one corner node where two straight segments meet.',
  length: 'Segment length',
  heading: 'Heading',
  deltaX: 'Horizontal span',
  deltaY: 'Vertical span',
  angle: 'Included line angle',
  parallelDistance: 'Parallel separation',
  offset: 'Offset distance',
  side: 'Offset side',
  left: 'Left of line direction',
  right: 'Right of line direction',
  both: 'Both sides',
  createParallel: 'Create parallel',
  createAngled: 'Draw line',
  angledLine: 'Draw by length and angle',
  headingHelp: '0° points right, 90° up. A selected straight line supplies the starting point. In other cases the line starts at the view centre.',
  edgeAngle: 'Smaller angle between edges', lineStart: 'Starting point', autoLineStart: 'Selected edge or view center',
  exactLineStart: 'Enter X and Y', relativeHeading: 'Angle relative to selected edge', guideFromEdge: 'Create guideline from edge',
  created: 'Geometry added.',
  failed: 'Could not add geometry. Check the values and available canvas space.',
  documentRequired: 'Set up document units first.',
  clipart: 'Production clipart',
  clipartHelp: 'Choose a template and enter its dimensions in millimetres. Vectors are inserted at the centre of the view.',
  mountingSlot: 'Mounting slot',
  mountingPlate: 'Four-hole mounting plate',
  registrationTarget: 'Registration target',
  drillMark: 'Drill centre mark',
  mountingSlotDetail: 'Height sets the diameter of the rounded ends. Width is the overall length.',
  mountingPlateDetail: '4 × Ø6 mm holes, centres 10 mm from the edges.',
  registrationTargetDetail: 'Crosshairs with a ring at 60% of the overall width.',
  drillMarkDetail: 'Crosshairs'
} as const;

type Label = keyof typeof en;

const lv: Record<Label, string> = {
  tools: 'Rīki', selectTools: 'Atlase un rediģēšana', drawTools: 'Zīmēšana un konstruēšana',
  annotateTools: 'Teksts un izmēri', productionTools: 'Ražošana un apdare', editShapeTools: 'Mezgli un dzēšgumija',
  clipartCategories: 'Sagatavju kategorijas', mounting: 'Montāža', signBlanks: 'Izkārtņu sagataves', printMarks: 'Ražošanas atzīmes',
  insertClipart: 'Ievietot zīmējumā', setDocumentUnits: 'Iestatīt dokumenta mērvienības', widthMm: 'Platums (mm)', heightMm: 'Augstums (mm)', diameterMm: 'Diametrs (mm)',
  invalidClipartSize: 'Ievadiet izmērus, kuros ietilpst sagataves atveres, stūri vai atzīmes.',
  mountingRail: 'Montāžas sliede ar divām atverēm', cableEntry: 'Kabeļa atvere', signBlank: 'Taisnstūra sagatave ar noapaļotiem stūriem', trimMarks: 'Apgriešanas atzīmes',
  mountingRailDetail: '2 × Ø6 mm, atveru centri 10 mm no galiem.',
  cableEntryDetail: 'Slēgta apaļa izgriezuma kontūra.', signBlankDetail: 'Slēgta kontūra ar stūru rādiusu 5 mm.',
  trimMarksDetail: '5 mm atzīmes ar 3 mm atstarpi. Izmēros iekļautas atzīmes.',
  fullscreen: 'Pilnekrāna režīms', exitFullscreen: 'Iziet no pilnekrāna režīma', fullscreenFailed: 'Nevar pārslēgt pilnekrāna režīmu.',
  circles: 'Apļi un elipses',
  construction: 'Taisnu malu konstruēšana',
  measureEdges: 'Atlasiet vienu taisnu nogriezni garumam un virzienam, divus nogriežņus leņķim vai vienu stūra mezglu, kur satiekas divi taisni nogriežņi.',
  length: 'Nogriežņa garums', heading: 'Virziens', deltaX: 'Horizontālais attālums', deltaY: 'Vertikālais attālums',
  angle: 'Leņķis starp taisnēm', parallelDistance: 'Attālums starp paralēlēm', offset: 'Nobīdes attālums', side: 'Nobīdes puse',
  left: 'Pa kreisi no līnijas virziena', right: 'Pa labi no līnijas virziena', both: 'Abas puses',
  createParallel: 'Izveidot paralēli', createAngled: 'Zīmēt līniju', angledLine: 'Zīmēt pēc garuma un leņķa',
  headingHelp: '0° ir pa labi, 90° uz augšu. Atlasītās taisnās līnijas sākums nosaka sākumpunktu. Pārējos gadījumos līnija sākas skata centrā.',
  edgeAngle: 'Mazākais leņķis starp malām', lineStart: 'Sākumpunkts', autoLineStart: 'Atlasītā mala vai skata centrs',
  exactLineStart: 'Ievadīt X un Y', relativeHeading: 'Leņķis pret atlasīto malu', guideFromEdge: 'Izveidot vadlīniju no malas',
  created: 'Ģeometrija pievienota.', failed: 'Nevar pievienot ģeometriju. Pārbaudiet ievadītās vērtības un brīvo vietu.',
  documentRequired: 'Vispirms iestatiet dokumenta mērvienības.', clipart: 'Ražošanas sagataves',
  clipartHelp: 'Izvēlieties sagatavi un norādiet izmērus milimetros. Vektori tiks ievietoti skata centrā.',
  mountingSlot: 'Iegarena montāžas atvere', mountingPlate: 'Montāžas plāksne ar četrām atverēm',
  registrationTarget: 'Savietošanas atzīme', drillMark: 'Urbšanas centra atzīme',
  mountingSlotDetail: 'Augstums nosaka noapaļoto galu diametru. Platums ir kopējais garums.', mountingPlateDetail: '4 × Ø6 mm, atveru centri 10 mm no malām.',
  registrationTargetDetail: 'Krusts un aplis ar diametru 60% no kopējā platuma.', drillMarkDetail: 'Krusts'
};

const ru: Record<Label, string> = {
  tools: 'Инструменты', selectTools: 'Выбор и правка', drawTools: 'Рисование и построение',
  annotateTools: 'Текст и размеры', productionTools: 'Производство и оформление', editShapeTools: 'Узлы и ластик',
  clipartCategories: 'Категории шаблонов', mounting: 'Монтаж', signBlanks: 'Заготовки вывесок', printMarks: 'Производственные метки',
  insertClipart: 'Вставить на холст', setDocumentUnits: 'Задать единицы документа', widthMm: 'Ширина (мм)', heightMm: 'Высота (мм)', diameterMm: 'Диаметр (мм)',
  invalidClipartSize: 'Введите размеры, достаточные для отверстий, углов или меток шаблона.',
  mountingRail: 'Монтажная планка с двумя отверстиями', cableEntry: 'Отверстие для кабельного ввода', signBlank: 'Прямоугольная заготовка со скруглениями', trimMarks: 'Метки обрезки',
  mountingRailDetail: '2 × Ø6 мм, центры в 10 мм от торцов.',
  cableEntryDetail: 'Замкнутый круглый вырез.', signBlankDetail: 'Замкнутый контур, радиус углов 5 мм.',
  trimMarksDetail: 'Метки длиной 5 мм с зазором 3 мм. Размеры включают метки.',
  fullscreen: 'Полноэкранный режим', exitFullscreen: 'Выйти из полноэкранного режима', fullscreenFailed: 'Не удалось переключить полноэкранный режим.',
  circles: 'Окружности и эллипсы',
  construction: 'Построения по прямым',
  measureEdges: 'Выберите один отрезок для измерения длины и направления, два отрезка для измерения угла или один угловой узел на стыке двух прямых участков.',
  length: 'Длина отрезка', heading: 'Направление', deltaX: 'Размах по горизонтали', deltaY: 'Размах по вертикали',
  angle: 'Угол между прямыми', parallelDistance: 'Расстояние между параллельными', offset: 'Величина смещения', side: 'Сторона смещения',
  left: 'Слева по направлению линии', right: 'Справа по направлению линии', both: 'С обеих сторон',
  createParallel: 'Создать параллельную', createAngled: 'Построить отрезок', angledLine: 'Построение по длине и углу',
  headingHelp: '0° направлено вправо, 90° вверх. Начало выбранного отрезка задаёт исходную точку. В остальных случаях отрезок строится из центра вида.',
  edgeAngle: 'Меньший угол между отрезками', lineStart: 'Начальная точка', autoLineStart: 'Выбранный отрезок или центр вида',
  exactLineStart: 'Ввести X и Y', relativeHeading: 'Угол относительно выбранного отрезка', guideFromEdge: 'Создать направляющую по отрезку',
  created: 'Геометрия добавлена.', failed: 'Не удалось добавить геометрию. Проверьте введённые значения и свободное место.',
  documentRequired: 'Сначала задайте единицы документа.', clipart: 'Производственные шаблоны',
  clipartHelp: 'Выберите шаблон и укажите размеры в миллиметрах. Векторы вставляются в центр вида.',
  mountingSlot: 'Монтажный паз', mountingPlate: 'Монтажная пластина с четырьмя отверстиями',
  registrationTarget: 'Метка совмещения', drillMark: 'Метка центра сверления',
  mountingSlotDetail: 'Высота задаёт диаметр скруглений. Ширина — общая длина паза.', mountingPlateDetail: '4 × Ø6 мм, центры в 10 мм от краёв.',
  registrationTargetDetail: 'Перекрестие и окружность диаметром 60% общей ширины.', drillMarkDetail: 'Перекрестие'
};

const subscribe = (notify: () => void) => locale.subscribe(notify);

export function useProductionToolsText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => 'en');
  const dictionary = language?.startsWith('lv') ? lv : language?.startsWith('ru') ? ru : en;
  return (key: Label) => dictionary[key];
}
