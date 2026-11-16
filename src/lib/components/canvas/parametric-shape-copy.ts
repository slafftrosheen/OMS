import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
const en = {
  title: 'Polygons and stars', kind: 'Shape', polygon: 'Polygon', star: 'Star', 'complex-star': 'Complex star',
  points: 'Sides / points', step: 'Connect every nth point', ratio: 'Inner radius (%)', width: 'Outer width', height: 'Outer height',
  centerX: 'Center X', centerY: 'Center Y', rotation: 'Rotation (°)', proportions: 'Keep proportions', viewCenter: 'Use view center',
  corner: 'Polygon corners', sharp: 'Sharp', fillet: 'Rounded', chamfer: 'Chamfered', cornerSize: 'Radius / cut distance',
  preview: 'Preview', apply: 'Create shape', created: 'Shape created. Use F10 to edit its nodes.', stale: 'Settings or drawing changed. Preview again.',
  failed: 'The shape could not be created. No drawing changes were applied.', input: 'Enter valid dimensions and center coordinates, 3–64 points, and rotation from −360° to 360°.',
  invalidRatio: 'Inner radius must be at least 10% and less than 100%.', invalidStep: 'The connection step must be an integer from 2 to less than half the point count.',
  invalidCorner: 'Corner size must be positive and leave space between adjacent corners. Corner finishing is available for polygons only.',
  size: 'Actual bounds', contours: 'Closed contours', nodeCount: 'Nodes', dimensionsHelp: 'Dimensions describe the outer ellipse before rotation and corner finishing. Actual shape bounds are shown in the preview.',
  crossingHelp: 'Complex-star paths cross by design; some point/step combinations form separate closed contours. Review cutting paths before production.',
  cornerHelp: 'Rounded corners use cubic curve approximations. Chamfer distance is measured along each adjoining edge.', setup: 'Set document units and scale first.'
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: 'Многоугольники и звёзды', kind: 'Фигура', polygon: 'Многоугольник', star: 'Звезда', 'complex-star': 'Сложная звезда',
  points: 'Стороны / вершины', step: 'Соединять каждую n-ю вершину', ratio: 'Внутренний радиус (%)', width: 'Внешняя ширина', height: 'Внешняя высота',
  centerX: 'Центр X', centerY: 'Центр Y', rotation: 'Поворот (°)', proportions: 'Сохранять пропорции', viewCenter: 'Центр видимой области',
  corner: 'Углы многоугольника', sharp: 'Острые', fillet: 'Скруглённые', chamfer: 'Фаски', cornerSize: 'Радиус / длина среза',
  preview: 'Предпросмотр', apply: 'Создать фигуру', created: 'Фигура создана. F10 — редактирование узлов.', stale: 'Настройки или чертёж изменились. Повторите предпросмотр.',
  failed: 'Не удалось создать фигуру. Чертёж не изменён.', input: 'Введите размеры и координаты центра, 3–64 вершины и поворот от −360° до 360°.',
  invalidRatio: 'Внутренний радиус должен быть не меньше 10% и меньше 100%.', invalidStep: 'Шаг соединения — целое число от 2 до значения меньше половины числа вершин.',
  invalidCorner: 'Размер угла должен быть положительным; соседние углы не должны пересекаться. Обработка углов доступна только для многоугольников.',
  size: 'Фактические габариты', contours: 'Замкнутые контуры', nodeCount: 'Узлы', dimensionsHelp: 'Размеры задают внешний эллипс до поворота и обработки углов. Фактические габариты показаны в предпросмотре.',
  crossingHelp: 'Линии сложной звезды пересекаются; некоторые сочетания числа вершин и шага образуют отдельные замкнутые контуры. Проверьте траектории перед резкой.',
  cornerHelp: 'Скругления приближены кубическими кривыми. Длина фаски измеряется вдоль каждой смежной стороны.', setup: 'Сначала задайте единицы и масштаб документа.'
};
const lv: Record<Key, string> = {
  title: 'Daudzstūri un zvaigznes', kind: 'Figūra', polygon: 'Daudzstūris', star: 'Zvaigzne', 'complex-star': 'Sarežģīta zvaigzne',
  points: 'Malas / virsotnes', step: 'Savienot katru n-to virsotni', ratio: 'Iekšējais rādiuss (%)', width: 'Ārējais platums', height: 'Ārējais augstums',
  centerX: 'Centrs X', centerY: 'Centrs Y', rotation: 'Pagrieziens (°)', proportions: 'Saglabāt proporcijas', viewCenter: 'Skata centrs',
  corner: 'Daudzstūra stūri', sharp: 'Asi', fillet: 'Noapaļoti', chamfer: 'Noslīpināti', cornerSize: 'Rādiuss / nogriezuma garums',
  preview: 'Priekšskatīt', apply: 'Izveidot figūru', created: 'Figūra izveidota. F10 — mezglu rediģēšana.', stale: 'Iestatījumi vai zīmējums mainījies. Atkārtojiet priekšskatījumu.',
  failed: 'Figūru neizdevās izveidot. Zīmējums nav mainīts.', input: 'Ievadiet derīgus izmērus, centra koordinātas, 3–64 virsotnes un pagriezienu no −360° līdz 360°.',
  invalidRatio: 'Iekšējam rādiusam jābūt vismaz 10% un mazāk par 100%.', invalidStep: 'Savienojuma solim jābūt veselam skaitlim no 2 līdz vērtībai, kas mazāka par pusi virsotņu skaita.',
  invalidCorner: 'Stūra izmēram jābūt pozitīvam, un blakus stūri nedrīkst pārklāties. Stūru apstrāde pieejama tikai daudzstūriem.',
  size: 'Faktiskie gabarīti', contours: 'Slēgtas kontūras', nodeCount: 'Mezgli', dimensionsHelp: 'Izmēri nosaka ārējo elipsi pirms pagriešanas un stūru apstrādes. Faktiskie gabarīti redzami priekšskatījumā.',
  crossingHelp: 'Sarežģītas zvaigznes līnijas krustojas; dažas virsotņu un soļa kombinācijas veido atsevišķas slēgtas kontūras. Pirms ražošanas pārbaudiet griešanas ceļus.',
  cornerHelp: 'Noapaļoti stūri ir kubisku līkņu tuvinājumi. Nogriezuma garumu mēra gar katru blakus malu.', setup: 'Vispirms iestatiet dokumenta mērvienības un mērogu.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useParametricShapeText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
export function parametricShapeError(error: unknown): Key {
  const code = error instanceof Error ? error.message : '';
  return code === 'shape-ratio' ? 'invalidRatio' : code === 'shape-step' ? 'invalidStep'
    : ['shape-corner', 'corners', 'corner-size'].includes(code) ? 'invalidCorner' : 'input';
}
