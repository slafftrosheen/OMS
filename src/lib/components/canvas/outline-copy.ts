import {useSyncExternalStore} from 'react';
import {get} from 'svelte/store';
import {locale} from 'svelte-i18n';
const en={
 title:'Outline pen',help:'Only checked properties change. Mixed values remain unchanged until edited. Lengths use the document unit and scale.',
 selection:'Select CAD paths, curves, ellipses or groups containing only CAD artwork.',count:'Objects',mixed:'Mixed',change:'Change',
 stroke:'Colour',none:'No outline',strokeWidth:'Width',strokeOpacity:'Opacity (%)',lineCap:'Line ends',lineJoin:'Corners',miterLimit:'Miter limit',dash:'Dash pattern',dashOffset:'Dash offset',
 widthPresets:'Standard widths',applyWidth:'Apply width',convertForOutline:'Convert selection to editable curves',converted:'Selection converted. Set an exact outline width.',
 butt:'Flat',round:'Round',square:'Square',miter:'Miter',bevel:'Bevel',
 solid:'Solid',dashed:'Dashed',dotted:'Dotted',dashdot:'Dash-dot',custom:'Custom',dashHelp:'Alternating dash and gap lengths, separated by spaces or commas. Empty means solid. Presets use the current width.',
 review:'Review outline',apply:'Apply outline',sample:'Style sample (not to scale)',changed:'The drawing or options changed. Review again.',invalid:'Check the selected outline values. Dash patterns allow up to 32 nonnegative lengths with at least one positive value.',
 limit:'The selection or resulting document exceeds the editing limit.',protected:'The selection is read-only, locked or contains protected content.',failed:'The outline could not be applied. No changes were kept.',done:'Outline applied.',empty:'Change at least one property.',noStroke:'No visible outline',reset:'Reset changes',
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
 title:'Перо контура',help:'Меняются только отмеченные свойства. Различающиеся значения сохраняются, пока вы их не измените. Длины учитывают единицы и масштаб документа.',
 selection:'Выберите CAD-кривые, пути, эллипсы или группы только с CAD-графикой.',count:'Объекты',mixed:'Разные',change:'Изменить',
 stroke:'Цвет',none:'Без контура',strokeWidth:'Толщина',strokeOpacity:'Непрозрачность (%)',lineCap:'Концы линий',lineJoin:'Углы',miterLimit:'Предел острого стыка',dash:'Штриховка',dashOffset:'Смещение штрихов',
 widthPresets:'Стандартные толщины',applyWidth:'Применить толщину',convertForOutline:'Преобразовать выделенное в кривые',converted:'Выделение преобразовано. Задайте точную толщину контура.',
 butt:'Плоские',round:'Скруглённые',square:'Квадратные',miter:'Острый стык',bevel:'Скошенные',
 solid:'Сплошная',dashed:'Штрихи',dotted:'Точки',dashdot:'Штрихпунктир',custom:'Своя',dashHelp:'Длины штрихов и пробелов через пробел или запятую. Пустое поле — сплошная линия. Шаблоны учитывают текущую толщину.',
 review:'Проверить контур',apply:'Применить контур',sample:'Образец стиля (без масштаба)',changed:'Рисунок или параметры изменились. Проверьте ещё раз.',invalid:'Проверьте параметры контура. До 32 неотрицательных длин штрихов; хотя бы одна должна быть положительной.',
 limit:'Превышен предел выделения или размера документа.',protected:'Выделение заблокировано, доступно только для чтения или содержит защищённые объекты.',failed:'Не удалось применить контур. Изменения отменены.',done:'Контур применён.',empty:'Измените хотя бы одно свойство.',noStroke:'Контур не виден',reset:'Сбросить изменения',
};
const lv:Record<Key,string>={
 title:'Kontūras spalva',help:'Mainās tikai atzīmētās īpašības. Atšķirīgas vērtības saglabājas, līdz tās rediģējat. Garumi izmanto dokumenta mērvienību un mērogu.',
 selection:'Atlasiet CAD ceļus, līknes, elipses vai grupas tikai ar CAD grafiku.',count:'Objekti',mixed:'Atšķirīgi',change:'Mainīt',
 stroke:'Krāsa',none:'Bez kontūras',strokeWidth:'Biezums',strokeOpacity:'Necaurspīdīgums (%)',lineCap:'Līniju gali',lineJoin:'Stūri',miterLimit:'Smailā savienojuma robeža',dash:'Svītru raksts',dashOffset:'Svītru nobīde',
 widthPresets:'Standarta biezumi',applyWidth:'Piemērot biezumu',convertForOutline:'Pārvērst atlasi rediģējamās līknēs',converted:'Atlase pārvērsta līknēs. Norādiet precīzu kontūras biezumu.',
 butt:'Plakani',round:'Noapaļoti',square:'Kvadrātveida',miter:'Smaili',bevel:'Nošķelti',
 solid:'Nepārtraukta',dashed:'Svītrota',dotted:'Punktota',dashdot:'Svītra-punkts',custom:'Pielāgota',dashHelp:'Mainīgi svītru un atstarpju garumi, atdalīti ar atstarpēm vai komatiem. Tukšs lauks nozīmē nepārtrauktu līniju. Paraugi izmanto pašreizējo biezumu.',
 review:'Pārskatīt kontūru',apply:'Piemērot kontūru',sample:'Stila paraugs (bez mēroga)',changed:'Zīmējums vai iestatījumi ir mainījušies. Pārskatiet vēlreiz.',invalid:'Pārbaudiet kontūras vērtības. Rakstā var būt līdz 32 nenegatīviem garumiem, vismaz vienam pozitīvam.',
 limit:'Atlase vai iegūtais dokuments pārsniedz rediģēšanas ierobežojumu.',protected:'Atlase ir tikai lasāma, bloķēta vai satur aizsargātus objektus.',failed:'Kontūru neizdevās piemērot. Izmaiņas atceltas.',done:'Kontūra piemērota.',empty:'Mainiet vismaz vienu īpašību.',noStroke:'Kontūra nav redzama',reset:'Atiestatīt izmaiņas',
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useOutlineText(){const language=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));const copy=language?.startsWith('ru')?ru:language?.startsWith('lv')?lv:en;return (key:Key)=>copy[key];}
export function outlineError(error:unknown):Key{
 const code=(error as {code?:string})?.code;
 return code==='readonly'||code==='locked'?'protected':code==='selection'?'selection':code==='limit'?'limit':code==='invalid'?'invalid':'failed';
}
