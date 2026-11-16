import {useSyncExternalStore} from 'react';
import {get} from 'svelte/store';
import {locale} from 'svelte-i18n';

const en = {
  protected:'Select editable artwork. Order forms, frames, clipped objects and locked objects cannot be repeated.',
  limit:'This layout exceeds 500 new objects, the page limit or the drawing capacity. Reduce rows or columns.',
  title:'Step and Repeat', spacing:'Spacing', edgeGap:'Gap between edges', offset:'Distance between copies',
  horizontal:'Horizontal', vertical:'Vertical', right:'Right', left:'Left', down:'Down', up:'Up',
  preview:'Preview layout', apply:'Create copies', stale:'The drawing or settings changed. Preview the layout again.',
  layout:'Copy layout', original:'Original selection', copies:'Copies', generated:'New objects',
  extent:'Overall size', gapHelp:'Rows and columns include the original. A negative gap overlaps the selection bounds.',
  offsetHelp:'Distances are measured from the same point on each copy. Rows and columns include the original.',
  previewHelp:'The preview shows selection bounds. All copies remain editable.',
  invalid:'Enter valid rows, columns and distances. Repeated rows or columns need a nonzero step.'
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
  protected:'Выберите редактируемый рисунок. Формы заказа, рамки, обрезанные и заблокированные объекты нельзя повторять.',
  limit:'Расположение превышает 500 новых объектов, предел страницы или объём чертежа. Уменьшите число строк или столбцов.',
  title:'Шаг и повтор',spacing:'Интервалы',edgeGap:'Зазор между краями',offset:'Расстояние между копиями',
  horizontal:'По горизонтали',vertical:'По вертикали',right:'Вправо',left:'Влево',down:'Вниз',up:'Вверх',
  preview:'Просмотр расположения',apply:'Создать копии',stale:'Чертёж или параметры изменились. Обновите просмотр.',
  layout:'Расположение копий',original:'Исходное выделение',copies:'Копии',generated:'Новых объектов',
  extent:'Общий размер',gapHelp:'Строки и столбцы включают оригинал. Отрицательный зазор создаёт перекрытие границ выделения.',
  offsetHelp:'Расстояние измеряется от одинаковой точки каждой копии. Строки и столбцы включают оригинал.',
  previewHelp:'Просмотр показывает границы выделения. Все копии остаются редактируемыми.',
  invalid:'Укажите допустимые строки, столбцы и расстояния. Для повторения нужен ненулевой шаг.'
};
const lv:Record<Key,string>={
  protected:'Atlasiet rediģējamus zīmējuma objektus. Pasūtījuma formas, rāmjus, apgrieztus un bloķētus objektus nevar atkārtot.',
  limit:'Izkārtojums pārsniedz 500 jaunu objektu, lapas vai zīmējuma ietilpības ierobežojumu. Samaziniet rindu vai kolonnu skaitu.',
  title:'Solis un atkārtošana',spacing:'Atstarpes',edgeGap:'Atstarpe starp malām',offset:'Attālums starp kopijām',
  horizontal:'Horizontāli',vertical:'Vertikāli',right:'Pa labi',left:'Pa kreisi',down:'Uz leju',up:'Uz augšu',
  preview:'Priekšskatīt izkārtojumu',apply:'Izveidot kopijas',stale:'Zīmējums vai iestatījumi mainījās. Atjaunojiet priekšskatījumu.',
  layout:'Kopiju izkārtojums',original:'Sākotnējā atlase',copies:'Kopijas',generated:'Jauni objekti',
  extent:'Kopējais izmērs',gapHelp:'Rindas un kolonnas ietver oriģinālu. Negatīva atstarpe rada atlases robežu pārklāšanos.',
  offsetHelp:'Attālumu mēra no viena un tā paša punkta katrā kopijā. Rindas un kolonnas ietver oriģinālu.',
  previewHelp:'Priekšskatījumā redzamas atlases robežas. Visas kopijas var rediģēt.',
  invalid:'Ievadiet derīgu rindu, kolonnu un attālumu vērtību. Atkārtošanai nepieciešams solis, kas nav nulle.'
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useRepeatText(){
  const language=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));
  const copy=language?.startsWith('ru')?ru:language?.startsWith('lv')?lv:en;
  return (key:Key)=>copy[key];
}
