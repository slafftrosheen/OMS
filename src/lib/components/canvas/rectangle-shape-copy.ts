import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Rectangles and corners', width: 'Width', height: 'Height', centerX: 'Center X', centerY: 'Center Y', rotation: 'Rotation (°)',
  proportions: 'Keep proportions', viewCenter: 'Use view center', linked: 'Same corners', allCorners: 'All four corners',
  linkedHelp: 'Linking copies the top-left corner to all corners. Unlink to edit each corner independently.',
  topLeft: 'Top left', topRight: 'Top right', bottomRight: 'Bottom right', bottomLeft: 'Bottom left', cornerKind: 'Corner shape',
  sharp: 'Sharp', round: 'Rounded', scallop: 'Scalloped', chamfer: 'Chamfered', radius: 'Radius', cut: 'Cut distance',
  cornerLimit: 'Maximum per corner: half the shorter side.', preview: 'Preview', apply: 'Create rectangle',
  created: 'Rectangle created. Use F10 to edit its nodes.', failed: 'The rectangle could not be created. No drawing changes were applied.',
  stale: 'Settings or drawing changed. Preview again.', setup: 'Set document units and scale first.', actualSize: 'Actual bounds',
  dimensionsHelp: 'Width and height are the outer dimensions before rotation. Corner names refer to the unrotated rectangle. Zero size makes a sharp corner.',
  curveHelp: 'Rounded and scalloped corners use cubic curves within 0.005 mm of the circle. Chamfers are straight cuts measured along each edge.',
  input: 'Enter positive dimensions, finite center coordinates and rotation from −360° to 360°.',
  invalidCorner: 'Each radius or cut must be between zero and half the shorter side. Oversize corners are rejected to prevent crossing paths.'
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: 'Прямоугольники и углы', width: 'Ширина', height: 'Высота', centerX: 'Центр X', centerY: 'Центр Y', rotation: 'Поворот (°)',
  proportions: 'Сохранять пропорции', viewCenter: 'Центр рабочей области', linked: 'Одинаковые углы', allCorners: 'Все четыре угла',
  linkedHelp: 'При связывании верхний левый угол копируется на остальные. Отключите связь для отдельной настройки каждого угла.',
  topLeft: 'Верхний левый', topRight: 'Верхний правый', bottomRight: 'Нижний правый', bottomLeft: 'Нижний левый', cornerKind: 'Форма угла',
  sharp: 'Острый', round: 'Скруглённый', scallop: 'С выемкой', chamfer: 'С фаской', radius: 'Радиус', cut: 'Длина среза',
  cornerLimit: 'Максимум на угол: половина меньшей стороны.', preview: 'Предпросмотр', apply: 'Создать прямоугольник',
  created: 'Прямоугольник создан. F10 — редактирование узлов.', failed: 'Не удалось создать прямоугольник. Чертёж не изменён.',
  stale: 'Настройки или чертёж изменились. Повторите предпросмотр.', setup: 'Сначала задайте единицы и масштаб документа.', actualSize: 'Фактические габариты',
  dimensionsHelp: 'Ширина и высота задают внешние размеры до поворота. Названия углов относятся к неповёрнутому прямоугольнику. Нулевой размер создаёт острый угол.',
  curveHelp: 'Скругления и выемки — кубические кривые с отклонением от окружности до 0,005 мм. Длина фаски измеряется вдоль каждой стороны.',
  input: 'Введите положительные размеры, конечные координаты центра и поворот от −360° до 360°.',
  invalidCorner: 'Радиус или срез должен быть от нуля до половины меньшей стороны. Слишком большие углы отклоняются во избежание пересечения контуров.'
};
const lv: Record<Key, string> = {
  title: 'Taisnstūri un stūri', width: 'Platums', height: 'Augstums', centerX: 'Centrs X', centerY: 'Centrs Y', rotation: 'Pagrieziens (°)',
  proportions: 'Saglabāt proporcijas', viewCenter: 'Skata centrs', linked: 'Vienādi stūri', allCorners: 'Visi četri stūri',
  linkedHelp: 'Sasaistot augšējais kreisais stūris tiek kopēts uz pārējiem. Atslēdziet saiti, lai rediģētu katru stūri atsevišķi.',
  topLeft: 'Augšējais kreisais', topRight: 'Augšējais labais', bottomRight: 'Apakšējais labais', bottomLeft: 'Apakšējais kreisais', cornerKind: 'Stūra forma',
  sharp: 'Ass', round: 'Noapaļots', scallop: 'Ieliekts', chamfer: 'Noslīpināts', radius: 'Rādiuss', cut: 'Nogriezuma garums',
  cornerLimit: 'Maksimums katram stūrim: puse īsākās malas.', preview: 'Priekšskatīt', apply: 'Izveidot taisnstūri',
  created: 'Taisnstūris izveidots. F10 — mezglu rediģēšana.', failed: 'Taisnstūri neizdevās izveidot. Zīmējums nav mainīts.',
  stale: 'Iestatījumi vai zīmējums mainījies. Atkārtojiet priekšskatījumu.', setup: 'Vispirms iestatiet dokumenta mērvienības un mērogu.', actualSize: 'Faktiskie gabarīti',
  dimensionsHelp: 'Platums un augstums ir ārējie izmēri pirms pagriešanas. Stūru nosaukumi attiecas uz nepagriezto taisnstūri. Nulles izmērs veido asu stūri.',
  curveHelp: 'Noapaļoti un ieliekti stūri ir kubiskas līknes ar novirzi no riņķa līnijas līdz 0,005 mm. Nogriezuma garumu mēra gar katru malu.',
  input: 'Ievadiet pozitīvus izmērus, galīgas centra koordinātas un pagriezienu no −360° līdz 360°.',
  invalidCorner: 'Rādiusam vai nogriezumam jābūt no nulles līdz pusei īsākās malas. Pārāk lieli stūri tiek noraidīti, lai kontūras nekrustotos.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useRectangleShapeText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
export function rectangleShapeError(error: unknown): Key {
  return error instanceof Error && error.message === 'rectangle-corner' ? 'invalidCorner' : 'input';
}
