import {useSyncExternalStore} from 'react';
import {get} from 'svelte/store';
import {locale} from 'svelte-i18n';
const en={
 title:'Convert outline to object',action:'Convert outline to object',
 help:'Create closed, editable cutting contours from solid CAD outlines. Width, line ends, joins and miter limit come from Outline pen.',
 tolerance:'Curve flattening tolerance (mm)',keep:'Keep original outlines',replaceHelp:'Replacement removes unfilled source paths. Original fills and material assets stay on their source objects with no outline.',
 overlap:'Original geometry remains alongside the new contours. Export the selected converted objects when only their cutting boundaries are wanted.',
 approximation:'The tolerance bounds centreline flattening and round-arc sagitta, not the total error of the widened outline. Curved end caps and corners follow sampled directions. Output uses straight segments; review wide strokes on tight curves.',
 transparency:'Splitting a translucent outline from its fill can change overlap appearance. Colour and outline opacity are retained.',
 acknowledge:'I reviewed the transparency and overlap warning.',
 review:'Preview conversion',apply:'Convert outline',preview:'Converted outline geometry',count:'Objects',nodes:'Nodes',size:'Size (mm)',
 changed:'The drawing or options changed. Preview again.',done:'Outlines converted. The new objects are selected.',
 selection:'Select solid CAD paths, curves, ellipses or groups containing only CAD artwork.',
 invalid:'Enter a flattening tolerance from 0.001 to 1 mm.',protected:'The selection is read-only, locked or contains protected content.',
 dashed:'Dashed outlines cannot be converted yet. Choose a solid outline explicitly in Outline pen first.',
 unsupported:'Clipped artwork, raster pages and unsupported shape types cannot be converted.',
 bound:'Remove shape bindings before converting an outline.',
 invisible:'Every selected object must have a visible, nonzero outline.',
 geometry:'The outline contains degenerate or extremely small segments that cannot be converted reliably.',
 limit:'The result exceeds the geometry, object or document saving limit. Try a smaller selection or larger tolerance.',
 failed:'Conversion could not be applied. No changes were kept.'
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
 title:'Преобразовать контур в объект',action:'Преобразовать контур в объект',
 help:'Создаёт замкнутые редактируемые линии реза из сплошных CAD-контуров. Толщина, концы, углы и предел острого стыка берутся из пера контура.',
 tolerance:'Допуск аппроксимации кривых (мм)',keep:'Сохранить исходные контуры',replaceHelp:'Замена удаляет исходные пути без заливки. Заливки и материалы остаются на исходных объектах без контура.',
 overlap:'Исходная геометрия остаётся рядом с новыми контурами. Экспортируйте выделенные преобразованные объекты, если нужны только их линии реза.',
 approximation:'Допуск ограничивает аппроксимацию осевой линии и стрелу дуги, а не общую погрешность расширенного контура. Концы и углы кривых следуют направлениям выборки. Результат состоит из прямых отрезков; проверьте толстые контуры на крутых изгибах.',
 transparency:'Отделение полупрозрачного контура от заливки может изменить вид наложений. Цвет и непрозрачность контура сохраняются.',
 acknowledge:'Я проверил предупреждение о прозрачности и наложениях.',
 review:'Предпросмотр преобразования',apply:'Преобразовать контур',preview:'Геометрия преобразованного контура',count:'Объекты',nodes:'Узлы',size:'Размер (мм)',
 changed:'Рисунок или параметры изменились. Повторите предпросмотр.',done:'Контуры преобразованы. Новые объекты выделены.',
 selection:'Выберите сплошные CAD-пути, кривые, эллипсы или группы только с CAD-графикой.',
 invalid:'Введите допуск аппроксимации от 0,001 до 1 мм.',protected:'Выделение заблокировано, доступно только для чтения или содержит защищённые объекты.',
 dashed:'Штриховые контуры пока не преобразуются. Сначала явно выберите сплошной контур в пере контура.',
 unsupported:'Обрезанная графика, растровые страницы и неподдерживаемые типы объектов не преобразуются.',
 bound:'Перед преобразованием удалите привязки объектов.',
 invisible:'У каждого выделенного объекта должен быть видимый ненулевой контур.',
 geometry:'В контуре есть вырожденные или слишком короткие сегменты, которые нельзя надёжно преобразовать.',
 limit:'Результат превышает предел геометрии, объектов или размера документа. Уменьшите выделение или увеличьте допуск.',
 failed:'Не удалось выполнить преобразование. Изменения отменены.'
};
const lv:Record<Key,string>={
 title:'Pārvērst kontūru par objektu',action:'Pārvērst kontūru par objektu',
 help:'Izveido slēgtas, rediģējamas griešanas kontūras no nepārtrauktām CAD līnijām. Biezumu, galus, savienojumus un smailes robežu nosaka kontūras spalva.',
 tolerance:'Līkņu aproksimācijas pielaide (mm)',keep:'Saglabāt sākotnējās kontūras',replaceHelp:'Aizstāšana izdzēš sākotnējos ceļus bez aizpildījuma. Aizpildījumi un materiāli paliek sākotnējos objektos bez kontūras.',
 overlap:'Sākotnējā ģeometrija paliek līdzās jaunajām kontūrām. Eksportējiet atlasītos pārveidotos objektus, ja vajadzīgas tikai to griešanas robežas.',
 approximation:'Pielaide ierobežo centra līnijas aproksimāciju un loka segmenta novirzi, nevis paplašinātās kontūras kopējo kļūdu. Līkņu gali un stūri seko paraugu virzieniem. Rezultātu veido taisni posmi; pārbaudiet biezas kontūras asos izliekumos.',
 transparency:'Puscaurspīdīgas kontūras atdalīšana no aizpildījuma var mainīt pārklājumu izskatu. Krāsa un kontūras necaurspīdīgums saglabājas.',
 acknowledge:'Esmu pārskatījis brīdinājumu par caurspīdīgumu un pārklājumiem.',
 review:'Priekšskatīt pārveidošanu',apply:'Pārvērst kontūru',preview:'Pārveidotās kontūras ģeometrija',count:'Objekti',nodes:'Mezgli',size:'Izmērs (mm)',
 changed:'Zīmējums vai iestatījumi ir mainījušies. Priekšskatiet vēlreiz.',done:'Kontūras pārveidotas. Jaunie objekti ir atlasīti.',
 selection:'Atlasiet nepārtrauktus CAD ceļus, līknes, elipses vai grupas tikai ar CAD grafiku.',
 invalid:'Ievadiet aproksimācijas pielaidi no 0,001 līdz 1 mm.',protected:'Atlase ir tikai lasāma, bloķēta vai satur aizsargātus objektus.',
 dashed:'Svītrotas kontūras vēl nevar pārveidot. Vispirms kontūras spalvā skaidri izvēlieties nepārtrauktu kontūru.',
 unsupported:'Apgrieztus attēlus, rastra lapas un neatbalstītus objektu tipus nevar pārveidot.',
 bound:'Pirms pārveidošanas noņemiet objektu piesaistes.',
 invisible:'Katram atlasītajam objektam vajadzīga redzama kontūra ar pozitīvu biezumu.',
 geometry:'Kontūrā ir deģenerēti vai ļoti īsi posmi, kurus nevar droši pārveidot.',
 limit:'Rezultāts pārsniedz ģeometrijas, objektu vai saglabāšanas ierobežojumu. Samaziniet atlasi vai palieliniet pielaidi.',
 failed:'Pārveidošanu neizdevās piemērot. Izmaiņas atceltas.'
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useOutlineToObjectText(){const language=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));const copy=language?.startsWith('ru')?ru:language?.startsWith('lv')?lv:en;return (key:Key)=>copy[key];}
export function outlineToObjectError(error:unknown):Key{
 const code=(error as {code?:string})?.code;
 if(code==='readonly'||code==='locked')return 'protected';
 return ['selection','invalid','dashed','unsupported','bound','invisible','geometry','limit'].includes(code??'')?code as Key:'failed';
}
