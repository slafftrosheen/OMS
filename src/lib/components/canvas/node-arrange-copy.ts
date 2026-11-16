import {useSyncExternalStore} from 'react';
import {get} from 'svelte/store';
import {locale} from 'svelte-i18n';
const en={
  title:'Align and move nodes',selection:'Selected nodes',all:'Select all nodes',clear:'Clear nodes',none:'Select one Bézier object to edit its nodes.',
  pick:'Shift-click anchor handles to add or remove nodes. Use Ctrl/⌘ and Shift in this list for multiple or range selection.',
  drag:'Dragging a handle edits that anchor only. Use Move nodes to move the selected set together.',
  staleSelection:'Node selection clears after outside curve edits to avoid targeting changed node indices. Select the nodes again.',
  action:'Operation',move:'Move nodes',left:'Align left',centerX:'Align horizontal centres',right:'Align right',top:'Align top',centerY:'Align vertical centres',bottom:'Align bottom',
  distributeX:'Distribute horizontally',distributeY:'Distribute vertically',x:'Move X',y:'Move Y',axes:'Align/distribute uses page axes. Positive X moves right; positive Y moves up in CAD units (down in pixels).',
  review:'Review node changes',apply:'Apply node changes',preview:'Node change preview',changed:'Moved nodes',stale:'Drawing, selection or options changed. Review again.',
  done:'Node changes applied.',failed:'Could not change these nodes. Check selection, permissions and coordinate limits.',count:'Move needs at least one node; align two; distribute three.',
  protected:'These nodes are locked or read-only.',unchanged:'The selected nodes are already in this position.',before:'Original',after:'Result',node:'Contour : node'
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
  title:'Выравнивание и перемещение узлов',selection:'Выбранные узлы',all:'Выбрать все узлы',clear:'Снять выбор',none:'Выберите один объект Безье для редактирования узлов.',
  pick:'Shift+щелчок по узлу добавляет или снимает выбор. В списке используйте Ctrl/⌘ и Shift для выбора нескольких узлов или диапазона.',
  drag:'Перетаскивание маркера меняет только этот узел. Для совместного перемещения используйте «Переместить узлы».',
  staleSelection:'После других правок кривой выбор узлов сбрасывается, чтобы не затронуть изменившиеся индексы. Выберите узлы снова.',
  action:'Операция',move:'Переместить узлы',left:'По левому краю',centerX:'По центру горизонтали',right:'По правому краю',top:'По верхнему краю',centerY:'По центру вертикали',bottom:'По нижнему краю',
  distributeX:'Распределить по горизонтали',distributeY:'Распределить по вертикали',x:'Сдвиг X',y:'Сдвиг Y',axes:'Выравнивание и распределение выполняются по осям страницы. Положительный X — вправо; положительный Y — вверх в CAD (вниз в пикселях).',
  review:'Просмотреть изменения',apply:'Применить изменения',preview:'Предпросмотр узлов',changed:'Перемещено узлов',stale:'Чертёж, выбор или параметры изменились. Обновите просмотр.',
  done:'Изменения узлов применены.',failed:'Не удалось изменить узлы. Проверьте выбор, права и пределы координат.',count:'Для сдвига нужен один узел, выравнивания — два, распределения — три.',
  protected:'Узлы заблокированы или доступны только для чтения.',unchanged:'Узлы уже находятся в этом положении.',before:'Исходное',after:'Результат',node:'Контур : узел'
};
const lv:Record<Key,string>={
  title:'Mezglu līdzināšana un pārvietošana',selection:'Atlasītie mezgli',all:'Atlasīt visus mezglus',clear:'Notīrīt atlasi',none:'Atlasiet vienu Bezjē objektu, lai rediģētu mezglus.',
  pick:'Shift un klikšķis uz mezgla pievieno vai noņem to. Sarakstā izmantojiet Ctrl/⌘ un Shift vairāku mezglu vai diapazona atlasei.',
  drag:'Velkot turi, mainās tikai šis mezgls. Lai pārvietotu visu atlasi, izmantojiet mezglu pārvietošanu.',
  staleSelection:'Pēc citām līknes izmaiņām mezglu atlase tiek notīrīta, lai nepārvietotu nepareizus indeksus. Atlasiet mezglus vēlreiz.',
  action:'Darbība',move:'Pārvietot mezglus',left:'Līdzināt pa kreisi',centerX:'Līdzināt horizontāli centrā',right:'Līdzināt pa labi',top:'Līdzināt augšā',centerY:'Līdzināt vertikāli centrā',bottom:'Līdzināt apakšā',
  distributeX:'Sadalīt horizontāli',distributeY:'Sadalīt vertikāli',x:'X nobīde',y:'Y nobīde',axes:'Līdzināšana un sadalīšana notiek lapas asīs. Pozitīvs X ir pa labi; pozitīvs Y ir augšup CAD vienībās (lejup pikseļos).',
  review:'Pārskatīt mezglu izmaiņas',apply:'Lietot izmaiņas',preview:'Mezglu priekšskatījums',changed:'Pārvietotie mezgli',stale:'Zīmējums, atlase vai iestatījumi mainījās. Pārskatiet vēlreiz.',
  done:'Mezglu izmaiņas lietotas.',failed:'Neizdevās mainīt mezglus. Pārbaudiet atlasi, tiesības un koordinātu robežas.',count:'Pārvietošanai vajag vienu mezglu, līdzināšanai divus, sadalīšanai trīs.',
  protected:'Mezgli ir bloķēti vai tikai lasāmi.',unchanged:'Mezgli jau atrodas šajā pozīcijā.',before:'Sākotnējais',after:'Rezultāts',node:'Kontūra : mezgls'
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useNodeArrangeText(){const lang=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));const copy=lang?.startsWith('ru')?ru:lang?.startsWith('lv')?lv:en;return (key:Key)=>copy[key];}
