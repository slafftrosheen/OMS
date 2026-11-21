import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  fullscreenFailed: 'Could not switch full-screen mode.',
  circles: 'Circles and ellipses',
  construction: 'Straight-edge construction',
  measureEdges: 'Select one straight segment for its length and heading, or two for the smaller angle between them. In node mode, select two adjacent Bézier nodes for a straight edge.',
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
  created: 'Geometry added.',
  failed: 'Could not add geometry. Check the values and available canvas space.',
  documentRequired: 'Set up document units first.',
  clipart: 'Production clipart',
  clipartHelp: 'Insert editable vectors at the centre of the view.',
  mountingSlot: 'Mounting slot',
  mountingPlate: 'Four-hole mounting plate',
  registrationTarget: 'Registration target',
  drillMark: 'Drill centre mark',
  mountingSlotDetail: '6 mm wide, rounded ends',
  mountingPlateDetail: '4 × Ø6 mm, 80 × 20 mm hole spacing',
  registrationTargetDetail: 'Ø12 mm ring and crosshairs',
  drillMarkDetail: 'Crosshairs'
} as const;

type Label = keyof typeof en;

const lv: Record<Label, string> = {
  fullscreen: 'Pilnekrāna režīms', exitFullscreen: 'Iziet no pilnekrāna režīma', fullscreenFailed: 'Nevar pārslēgt pilnekrāna režīmu.',
  circles: 'Apļi un elipses',
  construction: 'Taisnu malu konstruēšana',
  measureEdges: 'Atlasiet vienu taisnu nogriezni, lai redzētu tā garumu un virzienu, vai divus nogriežņus, lai izmērītu mazāko leņķi starp tiem. Mezglu režīmā atlasiet divus blakus esošus Bezjē mezglus uz taisnas malas.',
  length: 'Nogriežņa garums', heading: 'Virziens', deltaX: 'Horizontālais attālums', deltaY: 'Vertikālais attālums',
  angle: 'Leņķis starp taisnēm', parallelDistance: 'Attālums starp paralēlēm', offset: 'Nobīdes attālums', side: 'Nobīdes puse',
  left: 'Pa kreisi no līnijas virziena', right: 'Pa labi no līnijas virziena', both: 'Abas puses',
  createParallel: 'Izveidot paralēli', createAngled: 'Zīmēt līniju', angledLine: 'Zīmēt pēc garuma un leņķa',
  headingHelp: '0° ir pa labi, 90° uz augšu. Atlasītās taisnās līnijas sākums nosaka sākumpunktu. Pārējos gadījumos līnija sākas skata centrā.',
  created: 'Ģeometrija pievienota.', failed: 'Nevar pievienot ģeometriju. Pārbaudiet ievadītās vērtības un brīvo vietu.',
  documentRequired: 'Vispirms iestatiet dokumenta mērvienības.', clipart: 'Ražošanas sagataves',
  clipartHelp: 'Ievietojiet rediģējamus vektorus skata centrā.',
  mountingSlot: 'Iegarena montāžas atvere', mountingPlate: 'Montāžas plāksne ar četrām atverēm',
  registrationTarget: 'Savietošanas atzīme', drillMark: 'Urbšanas centra atzīme',
  mountingSlotDetail: '6 mm plata, noapaļoti gali', mountingPlateDetail: '4 × Ø6 mm, atstatums 80 × 20 mm',
  registrationTargetDetail: 'Ø12 mm aplis un krusts', drillMarkDetail: 'Krusts'
};

const ru: Record<Label, string> = {
  fullscreen: 'Полноэкранный режим', exitFullscreen: 'Выйти из полноэкранного режима', fullscreenFailed: 'Не удалось переключить полноэкранный режим.',
  circles: 'Окружности и эллипсы',
  construction: 'Построения по прямым',
  measureEdges: 'Выберите один отрезок для измерения длины и направления или два отрезка для измерения меньшего угла между ними. В режиме узлов выберите два соседних узла Безье на прямом участке.',
  length: 'Длина отрезка', heading: 'Направление', deltaX: 'Размах по горизонтали', deltaY: 'Размах по вертикали',
  angle: 'Угол между прямыми', parallelDistance: 'Расстояние между параллельными', offset: 'Величина смещения', side: 'Сторона смещения',
  left: 'Слева по направлению линии', right: 'Справа по направлению линии', both: 'С обеих сторон',
  createParallel: 'Создать параллельную', createAngled: 'Построить отрезок', angledLine: 'Построение по длине и углу',
  headingHelp: '0° направлено вправо, 90° вверх. Начало выбранного отрезка задаёт исходную точку. В остальных случаях отрезок строится из центра вида.',
  created: 'Геометрия добавлена.', failed: 'Не удалось добавить геометрию. Проверьте введённые значения и свободное место.',
  documentRequired: 'Сначала задайте единицы документа.', clipart: 'Производственные шаблоны',
  clipartHelp: 'Вставьте редактируемые векторы в центр вида.',
  mountingSlot: 'Монтажный паз', mountingPlate: 'Монтажная пластина с четырьмя отверстиями',
  registrationTarget: 'Метка совмещения', drillMark: 'Метка центра сверления',
  mountingSlotDetail: 'Ширина 6 мм, скруглённые концы', mountingPlateDetail: '4 × Ø6 мм, шаг отверстий 80 × 20 мм',
  registrationTargetDetail: 'Окружность Ø12 мм и перекрестие', drillMarkDetail: 'Перекрестие'
};

const subscribe = (notify: () => void) => locale.subscribe(notify);

export function useProductionToolsText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => 'en');
  const dictionary = language?.startsWith('lv') ? lv : language?.startsWith('ru') ? ru : en;
  return (key: Label) => dictionary[key];
}
