import {useSyncExternalStore} from 'react';
import {locale} from 'svelte-i18n';
import {get} from 'svelte/store';

const en = {
  title:'Snap options',open:'Snap options…',enabled:'Object guides and CAD snapping',gridShow:'Show grid and snap moved objects',targets:'Snap targets',
  endpoints:'Endpoints and nodes',midpoints:'Segment midpoints',centers:'Centres',quadrants:'Quadrants',intersections:'Line intersections',nearest:'Nearest point',grid:'Grid points',
  tolerance:'Snap distance (screen px)',gridSpacing:'Grid step',range:'Allowed range',
  toleranceInvalid:'Enter a snap distance from 2 to 30 screen pixels.',gridInvalid:'Enter a grid step within the allowed range.',failed:'The drawing changed or the setting could not be saved. Try again.',
  scope:'CAD targets apply to polylines, Bézier curves, circles, arcs and dimensions, including CAD node and dimension endpoint editing.',
  keys:'Ctrl temporarily toggles object guides and CAD snapping. Shift angle constraints take priority.',off:'Object guides and CAD snapping are off. You can still configure CAD targets below.',
  gridHelp:'Showing the grid also snaps moved objects to it, even with object guides and CAD snapping off. Ctrl bypasses this. CAD “Grid points” is independent; both use this grid step.',intersectionsHelp:'Line intersections use straight segments only.',readOnly:'Snap targets and distances are read-only in this drawing.'
};
type Key=keyof typeof en;
const ru:Record<Key,string> = {
  title:'Параметры привязки',open:'Параметры привязки…',enabled:'Направляющие объектов и привязки CAD',gridShow:'Показать сетку и привязывать перемещаемые объекты',targets:'Объекты привязки',
  endpoints:'Концы и узлы',midpoints:'Середины сегментов',centers:'Центры',quadrants:'Квадранты',intersections:'Пересечения линий',nearest:'Ближайшая точка',grid:'Точки сетки',
  tolerance:'Радиус привязки (пикс. экрана)',gridSpacing:'Шаг сетки',range:'Допустимый диапазон',
  toleranceInvalid:'Введите радиус привязки от 2 до 30 экранных пикселей.',gridInvalid:'Введите шаг сетки в допустимом диапазоне.',failed:'Чертёж изменился или настройку не удалось сохранить. Повторите попытку.',
  scope:'Привязки CAD работают с полилиниями, кривыми Безье, окружностями, дугами и размерами, включая редактирование узлов CAD и концов размеров.',
  keys:'Ctrl временно переключает направляющие объектов и привязки CAD. Ограничение угла клавишей Shift имеет приоритет.',off:'Направляющие объектов и привязки CAD выключены. Параметры CAD ниже по-прежнему можно изменить.',
  gridHelp:'Видимая сетка привязывает перемещаемые объекты, даже если направляющие объектов и привязки CAD выключены. Ctrl отключает эту привязку. Опция CAD «Точки сетки» независима; шаг сетки общий.',intersectionsHelp:'Пересечения определяются только для прямых сегментов.',readOnly:'В этом чертеже параметры и расстояния привязки доступны только для чтения.'
};
const lv:Record<Key,string> = {
  title:'Piesaistes iestatījumi',open:'Piesaistes iestatījumi…',enabled:'Objektu vadlīnijas un CAD piesaiste',gridShow:'Rādīt režģi un piesaistīt pārvietotos objektus',targets:'Piesaistes punkti',
  endpoints:'Galapunkti un mezgli',midpoints:'Segmentu viduspunkti',centers:'Centri',quadrants:'Kvadranti',intersections:'Līniju krustpunkti',nearest:'Tuvākais punkts',grid:'Režģa punkti',
  tolerance:'Piesaistes attālums (ekrāna px)',gridSpacing:'Režģa solis',range:'Atļautais diapazons',
  toleranceInvalid:'Ievadiet piesaistes attālumu no 2 līdz 30 ekrāna pikseļiem.',gridInvalid:'Ievadiet režģa soli atļautajā diapazonā.',failed:'Zīmējums mainījās vai iestatījumu neizdevās saglabāt. Mēģiniet vēlreiz.',
  scope:'CAD piesaistes darbojas polilīnijām, Bezjē līknēm, apļiem, lokiem un izmēriem, arī rediģējot CAD mezglus un izmēru galapunktus.',
  keys:'Ctrl īslaicīgi pārslēdz objektu vadlīnijas un CAD piesaisti. Shift leņķa ierobežojumam ir priekšroka.',off:'Objektu vadlīnijas un CAD piesaiste ir izslēgtas. CAD iestatījumus joprojām var mainīt zemāk.',
  gridHelp:'Redzams režģis piesaista pārvietotos objektus, pat ja objektu vadlīnijas un CAD piesaiste ir izslēgtas. Ctrl šo piesaisti atslēdz. CAD opcija “Režģa punkti” ir neatkarīga; režģa solis ir kopīgs.',intersectionsHelp:'Krustpunktus nosaka tikai taisniem segmentiem.',readOnly:'Šajā zīmējumā piesaistes punkti un attālumi ir tikai lasāmi.'
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useSnapText(){
  const language=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));
  const copy=language?.startsWith('ru')?ru:language?.startsWith('lv')?lv:en;
  return (key:Key)=>copy[key];
}
