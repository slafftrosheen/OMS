import {useSyncExternalStore} from 'react';
import {get} from 'svelte/store';
import {locale} from 'svelte-i18n';
const en={
 target:'Apply to',selectedObjects:'Selected objects',newObjects:'New drafting objects on this page',defaultsHelp:'Saved with this page for new drafting geometry. Freehand uses its own nib settings.',defaultsDone:'New-object outline saved.',saveDefaults:'Save new-object outline',widthUnit:'Width unit',widthMode:'Width type',customWidth:'Custom width',hairlineHelp:'Hairline stays 1 screen pixel. PDF/EPS use device hairlines; SVG/PNG use a positive 0.01 mm fallback at the drawing scale used when set.',cornersHelp:'These corners style the stroke junction. Geometric round, scallop and chamfer corners are available in Rectangle and Corners.',
 title:'Outline pen',help:'Only checked properties change. Mixed values remain unchanged until edited. Dash lengths use the document unit and scale; width has its own unit.',
 selection:'Select CAD paths, curves, ellipses or groups containing only CAD artwork.',count:'Objects',mixed:'Mixed',change:'Change',
 stroke:'Colour',none:'No outline',strokeWidth:'Width',hairline:'Hairline',strokeOpacity:'Opacity (%)',lineCap:'Line ends',lineJoin:'Stroke corners',miterLimit:'Miter limit',dash:'Dash pattern',dashOffset:'Dash offset',
 widthPresets:'Standard widths',applyWidth:'Apply width',applyColor:'Apply colour',convertForOutline:'Convert selection to editable curves',converted:'Selection converted. Set an exact outline width.',
 butt:'Flat',round:'Round',square:'Square',miter:'Miter',bevel:'Bevel',
 solid:'Solid',dashed:'Dashed',dotted:'Dotted',dashdot:'Dash-dot',custom:'Custom',dashHelp:'Alternating dash and gap lengths, separated by spaces or commas. Empty means solid. Presets use the current width, or 1 mm for hairlines.',
 review:'Review outline',apply:'Apply outline',sample:'Style sample (not to scale)',changed:'The drawing or options changed. Review again.',invalid:'Check the selected outline values. Dash patterns allow up to 32 nonnegative lengths with at least one positive value.',
 busy:'Finish or cancel the current drawing gesture first.',
 limit:'The selection or resulting document exceeds the editing limit.',protected:'The selection is read-only, locked or contains protected content.',failed:'The outline could not be applied. No changes were kept.',done:'Outline applied.',empty:'Change at least one property.',noStroke:'No visible outline',reset:'Reset changes',
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
 target:'Применить к',selectedObjects:'Выделенные объекты',newObjects:'Новые чертёжные объекты на странице',defaultsHelp:'Сохраняется на странице для новых чертёжных объектов. Рисование от руки использует собственные параметры пера.',defaultsDone:'Контур новых объектов сохранён.',saveDefaults:'Сохранить контур новых объектов',widthUnit:'Единица толщины',widthMode:'Тип толщины',customWidth:'Своя толщина',hairlineHelp:'Волосяной контур виден как 1 пиксель экрана. PDF/EPS используют аппаратную тонкую линию; SVG/PNG — положительную толщину 0,01 мм в масштабе на момент настройки.',cornersHelp:'Здесь настраиваются стыки штрихов. Геометрические скругления, вогнутые углы и фаски находятся в разделах «Прямоугольник» и «Углы».',
 title:'Перо контура',help:'Меняются только отмеченные свойства. Различающиеся значения сохраняются, пока вы их не измените. Длины штрихов учитывают единицы и масштаб документа; у толщины свои единицы.',
 selection:'Выберите CAD-кривые, пути, эллипсы или группы только с CAD-графикой.',count:'Объекты',mixed:'Разные',change:'Изменить',
 stroke:'Цвет',none:'Без контура',strokeWidth:'Толщина',hairline:'Волосяной контур',strokeOpacity:'Непрозрачность (%)',lineCap:'Концы линий',lineJoin:'Стыки контура',miterLimit:'Предел острого стыка',dash:'Штриховка',dashOffset:'Смещение штрихов',
 widthPresets:'Стандартные толщины',applyWidth:'Применить толщину',applyColor:'Применить цвет',convertForOutline:'Преобразовать выделенное в кривые',converted:'Выделение преобразовано. Задайте точную толщину контура.',
 butt:'Плоские',round:'Скруглённые',square:'Квадратные',miter:'Острый стык',bevel:'Скошенные',
 solid:'Сплошная',dashed:'Штрихи',dotted:'Точки',dashdot:'Штрихпунктир',custom:'Своя',dashHelp:'Длины штрихов и пробелов через пробел или запятую. Пустое поле — сплошная линия. Шаблоны учитывают текущую толщину или 1 мм для волосяного контура.',
 review:'Проверить контур',apply:'Применить контур',sample:'Образец стиля (без масштаба)',changed:'Рисунок или параметры изменились. Проверьте ещё раз.',invalid:'Проверьте параметры контура. До 32 неотрицательных длин штрихов; хотя бы одна должна быть положительной.',
 busy:'Сначала завершите или отмените текущее действие рисования.',
 limit:'Превышен предел выделения или размера документа.',protected:'Выделение заблокировано, доступно только для чтения или содержит защищённые объекты.',failed:'Не удалось применить контур. Изменения отменены.',done:'Контур применён.',empty:'Измените хотя бы одно свойство.',noStroke:'Контур не виден',reset:'Сбросить изменения',
};
const lv:Record<Key,string>={
 target:'Piemērot',selectedObjects:'Atlasītajiem objektiem',newObjects:'Jauniem rasējuma objektiem šajā lapā',defaultsHelp:'Saglabājas kopā ar lapu jauniem rasējuma objektiem. Brīvrokas rīks izmanto savus spalvas iestatījumus.',defaultsDone:'Jauno objektu kontūra saglabāta.',saveDefaults:'Saglabāt jauno objektu kontūru',widthUnit:'Biezuma mērvienība',widthMode:'Biezuma veids',customWidth:'Pielāgots biezums',hairlineHelp:'Mata līnija ekrānā ir 1 pikselis. PDF/EPS izmanto ierīces mata līnijas; SVG/PNG izmanto pozitīvu 0,01 mm aizvietojumu iestatīšanas mērogā.',cornersHelp:'Šie stūri nosaka kontūras savienojumu. Ģeometriski noapaļojumi, ieliekti stūri un nošķēlumi ir sadaļās Taisnstūris un Stūri.',
 title:'Kontūras spalva',help:'Mainās tikai atzīmētās īpašības. Atšķirīgas vērtības saglabājas, līdz tās rediģējat. Svītru garumi izmanto dokumenta mērvienību un mērogu; biezumam ir sava mērvienība.',
 selection:'Atlasiet CAD ceļus, līknes, elipses vai grupas tikai ar CAD grafiku.',count:'Objekti',mixed:'Atšķirīgi',change:'Mainīt',
 stroke:'Krāsa',none:'Bez kontūras',strokeWidth:'Biezums',hairline:'Mata līnija',strokeOpacity:'Necaurspīdīgums (%)',lineCap:'Līniju gali',lineJoin:'Kontūras savienojumi',miterLimit:'Smailā savienojuma robeža',dash:'Svītru raksts',dashOffset:'Svītru nobīde',
 widthPresets:'Standarta biezumi',applyWidth:'Piemērot biezumu',applyColor:'Piemērot krāsu',convertForOutline:'Pārvērst atlasi rediģējamās līknēs',converted:'Atlase pārvērsta līknēs. Norādiet precīzu kontūras biezumu.',
 butt:'Plakani',round:'Noapaļoti',square:'Kvadrātveida',miter:'Smaili',bevel:'Nošķelti',
 solid:'Nepārtraukta',dashed:'Svītrota',dotted:'Punktota',dashdot:'Svītra-punkts',custom:'Pielāgota',dashHelp:'Mainīgi svītru un atstarpju garumi, atdalīti ar atstarpēm vai komatiem. Tukšs lauks nozīmē nepārtrauktu līniju. Paraugi izmanto pašreizējo biezumu vai 1 mm mata līnijām.',
 review:'Pārskatīt kontūru',apply:'Piemērot kontūru',sample:'Stila paraugs (bez mēroga)',changed:'Zīmējums vai iestatījumi ir mainījušies. Pārskatiet vēlreiz.',invalid:'Pārbaudiet kontūras vērtības. Rakstā var būt līdz 32 nenegatīviem garumiem, vismaz vienam pozitīvam.',
 busy:'Vispirms pabeidziet vai atceliet pašreizējo zīmēšanas darbību.',
 limit:'Atlase vai iegūtais dokuments pārsniedz rediģēšanas ierobežojumu.',protected:'Atlase ir tikai lasāma, bloķēta vai satur aizsargātus objektus.',failed:'Kontūru neizdevās piemērot. Izmaiņas atceltas.',done:'Kontūra piemērota.',empty:'Mainiet vismaz vienu īpašību.',noStroke:'Kontūra nav redzama',reset:'Atiestatīt izmaiņas',
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useOutlineText(){const language=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));const copy=language?.startsWith('ru')?ru:language?.startsWith('lv')?lv:en;return (key:Key)=>copy[key];}
export function outlineError(error:unknown):Key{
 const code=(error as {code?:string})?.code;
 return code==='readonly'||code==='locked'?'protected':code==='busy'?'busy':code==='selection'?'selection':code==='limit'?'limit':code==='invalid'?'invalid':'failed';
}
