import {useSyncExternalStore} from 'react';
import {locale} from 'svelte-i18n';
import {get} from 'svelte/store';

const en = {
  title:'Snap options',open:'Snap options…',enabled:'Enable snapping',gridShow:'Show document grid',targets:'Snap targets',objects:'Objects',objectPoints:'CAD object snap points',
  endpoints:'Endpoints and nodes',midpoints:'Segment midpoints',centers:'Centres',quadrants:'Quadrants',intersections:'Intersections',nearest:'Nearest point',grid:'Grid points',
  guidelines:'Document guidelines',page:'Page edges and points',pageSizeRequired:'Set a calibrated sheet size to use page snapping.',pageSetup:'Page setup',guidelinesHelp:'CAD tools snap to document guidelines after exact object targets and before nearest points or the grid. Locked and hidden guidelines remain snap targets while this option is on. Pick snaps selection bounds to guidelines too.',
  perpendicular:'Perpendicular to straight edges and Bézier curves',tangent:'Tangent to circles, arcs, ellipses and Bézier curves',
  constructionHelp:'Perpendicular and tangent targets start from the last polyline vertex or first dimension point. Pick that point first, then move near the connection you want. Bézier contacts use the original cubic, including isolated tangent contacts. Cusps and coincident connections are skipped. Perpendiculars to circles, arcs and ellipses are not included. At most 64 nearby cubic segments are checked per pointer move.',
  tolerance:'Snap distance (screen px)',gridSpacing:'Grid step',range:'Allowed range',
  toleranceInvalid:'Enter a snap distance from 2 to 30 screen pixels.',gridInvalid:'Enter a grid step within the allowed range.',failed:'The drawing changed or the setting could not be saved. Try again.',
  scope:'CAD targets apply to polylines, Bézier curves, circles, arcs and dimensions, including CAD node and dimension endpoint editing.',
  keys:'Ctrl temporarily toggles object guides and CAD snapping. Shift angle constraints take priority.',off:'Snapping is off. You can still configure targets below.',
  gridHelp:'Grid points applies to CAD tools and Pick movement. The grid display has its own switch.',intersectionsHelp:'Intersections of straight segments with segments, circles, ellipses, circular arcs or cubic Bézier curves; cubic Béziers with each other, circles, ellipses or circular arcs; and circles or circular arcs with each other. Only isolated points on the drawn shapes and within arc limits are used, including tangent contacts and endpoints. Coincident or partly overlapping curve pairs are omitted. Noncircular ellipse intersections with ellipses, circles or arcs are not included.',readOnly:'Snap targets and distances are read-only in this drawing.'
};
type Key=keyof typeof en;
const ru:Record<Key,string> = {
  title:'Параметры привязки',open:'Параметры привязки…',enabled:'Включить привязку',gridShow:'Показать сетку документа',targets:'Цели привязки',objects:'Объекты',objectPoints:'Точки привязки к объектам CAD',
  endpoints:'Концы и узлы',midpoints:'Середины сегментов',centers:'Центры',quadrants:'Квадранты',intersections:'Пересечения',nearest:'Ближайшая точка',grid:'Точки сетки',
  guidelines:'Направляющие документа',page:'Края и точки страницы',pageSizeRequired:'Задайте размер листа и масштаб для привязки к странице.',pageSetup:'Параметры страницы',guidelinesHelp:'Инструменты CAD привязываются к направляющим после точных точек объектов и перед ближайшими точками или сеткой. Заблокированные и скрытые направляющие остаются целями привязки, пока эта опция включена. Инструмент выбора также привязывает границы выделения к направляющим.',
  perpendicular:'Перпендикуляр к прямым и кривым Безье',tangent:'Касательная к окружностям, дугам, эллипсам и кривым Безье',
  constructionHelp:'Перпендикуляр и касательная строятся из последней вершины полилинии или первой точки размера. Сначала задайте эту точку, затем подведите курсор к нужному месту соединения. Точки на кривых Безье вычисляются на исходном кубическом сегменте, включая отдельные точки касания. Особые точки с нулевой производной и соединения нулевой длины пропускаются. Перпендикуляры к окружностям, дугам и эллипсам не включены. За движение курсора проверяется до 64 кубических сегментов рядом с курсором.',
  tolerance:'Радиус привязки (пикс. экрана)',gridSpacing:'Шаг сетки',range:'Допустимый диапазон',
  toleranceInvalid:'Введите радиус привязки от 2 до 30 экранных пикселей.',gridInvalid:'Введите шаг сетки в допустимом диапазоне.',failed:'Чертёж изменился или настройку не удалось сохранить. Повторите попытку.',
  scope:'Привязки CAD работают с полилиниями, кривыми Безье, окружностями, дугами и размерами, включая редактирование узлов CAD и концов размеров.',
  keys:'Ctrl временно переключает направляющие объектов и привязки CAD. Ограничение угла клавишей Shift имеет приоритет.',off:'Привязка отключена. Цели привязки можно настроить ниже.',
  gridHelp:'Точки сетки используются инструментами CAD и при перемещении инструментом выбора. Отображение сетки включается отдельно.',intersectionsHelp:'Пересечения прямых отрезков с отрезками, окружностями, эллипсами, дугами окружностей или кубическими кривыми Безье; кубических кривых Безье друг с другом, с окружностями, эллипсами или дугами окружностей; окружностей и их дуг между собой. Учитываются только отдельные точки на нарисованных фигурах и в пределах дуг, включая точки касания и концы. Пары совпадающих или частично перекрывающихся кривых пропускаются. Пересечения эллипса, не являющегося окружностью, с эллипсом, окружностью или дугой не поддерживаются.',readOnly:'В этом чертеже параметры и расстояния привязки доступны только для чтения.'
};
const lv:Record<Key,string> = {
  title:'Piesaistes iestatījumi',open:'Piesaistes iestatījumi…',enabled:'Iespējot piesaisti',gridShow:'Rādīt dokumenta režģi',targets:'Piesaistes mērķi',objects:'Objekti',objectPoints:'CAD objektu piesaistes punkti',
  endpoints:'Galapunkti un mezgli',midpoints:'Segmentu viduspunkti',centers:'Centri',quadrants:'Kvadranti',intersections:'Krustpunkti',nearest:'Tuvākais punkts',grid:'Režģa punkti',
  guidelines:'Dokumenta vadlīnijas',page:'Lapas malas un punkti',pageSizeRequired:'Norādiet lapas izmēru un mērogu, lai izmantotu piesaisti lapai.',pageSetup:'Lapas iestatījumi',guidelinesHelp:'CAD rīki piesaistās dokumenta vadlīnijām pēc precīzajiem objektu punktiem un pirms tuvākajiem punktiem vai režģa. Bloķētas un paslēptas vadlīnijas paliek piesaistes mērķi, kamēr šī opcija ir ieslēgta. Atlases rīks piesaista arī atlases robežas pie vadlīnijām.',
  perpendicular:'Perpendikuls pret taisnām malām un Bezjē līknēm',tangent:'Pieskare apļiem, lokiem, elipsēm un Bezjē līknēm',
  constructionHelp:'Perpendikulu un pieskari veido no pēdējās polilīnijas virsotnes vai pirmā izmēra punkta. Vispirms norādiet šo punktu, tad pārvietojiet kursoru pie vēlamā savienojuma. Bezjē punkti tiek aprēķināti uz sākotnējās kubiskās līknes, arī atsevišķi pieskares punkti. Punkti ar nulles atvasinājumu un nulles garuma savienojumi tiek izlaisti. Perpendikuli pret apļiem, lokiem un elipsēm nav iekļauti. Katrā kursora kustībā pārbauda līdz 64 tuvumā esošiem kubiskiem segmentiem.',
  tolerance:'Piesaistes attālums (ekrāna px)',gridSpacing:'Režģa solis',range:'Atļautais diapazons',
  toleranceInvalid:'Ievadiet piesaistes attālumu no 2 līdz 30 ekrāna pikseļiem.',gridInvalid:'Ievadiet režģa soli atļautajā diapazonā.',failed:'Zīmējums mainījās vai iestatījumu neizdevās saglabāt. Mēģiniet vēlreiz.',
  scope:'CAD piesaistes darbojas polilīnijām, Bezjē līknēm, apļiem, lokiem un izmēriem, arī rediģējot CAD mezglus un izmēru galapunktus.',
  keys:'Ctrl īslaicīgi pārslēdz objektu vadlīnijas un CAD piesaisti. Shift leņķa ierobežojumam ir priekšroka.',off:'Piesaiste ir izslēgta. Piesaistes mērķus joprojām var iestatīt zemāk.',
  gridHelp:'Režģa punkti darbojas ar CAD rīkiem un pārvietojot objektus ar atlases rīku. Režģa rādīšanu ieslēdz atsevišķi.',intersectionsHelp:'Taisnu nogriežņu krustpunkti ar nogriežņiem, apļiem, elipsēm, apļu lokiem vai kubiskām Bezjē līknēm; kubisku Bezjē līkņu krustpunkti savā starpā un ar apļiem, elipsēm vai apļu lokiem; apļu un to loku krustpunkti savā starpā. Tiek izmantoti tikai atsevišķi punkti uz uzzīmētajām figūrām un loku robežās, arī pieskares punkti un galapunkti. Līkņu pāri, kas sakrīt vai daļēji pārklājas, tiek izlaisti. Nav iekļauti krustpunkti starp elipsi, kas nav aplis, un elipsi, apli vai loku.',readOnly:'Šajā zīmējumā piesaistes punkti un attālumi ir tikai lasāmi.'
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useSnapText(){
  const language=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));
  const copy=language?.startsWith('ru')?ru:language?.startsWith('lv')?lv:en;
  return (key:Key)=>copy[key];
}
