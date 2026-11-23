import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Nest on sheet', help: 'Packs the selected objects onto sheets by their outer boxes, largest first. Locked objects and objects inside groups or frames stay where they are.',
  sheet: 'Sheet', page: 'Drawing page', custom: 'Custom size', width: 'Sheet width', height: 'Sheet height',
  margin: 'Edge margin', gap: 'Spacing between parts', gapHint: 'Include the tool kerf in the spacing.',
  rotate: 'Allow 90° turns', maxSheets: 'Most sheets', preview: 'Preview layout', apply: 'Nest objects', clear: 'Clear preview',
  selection: 'Select at least two objects to nest.', parts: 'Parts', sheets: 'Sheets', placed: 'Placed', turned: 'Turned 90°',
  usage: 'Box coverage', usageHint: 'Share of the usable sheet covered by part boxes. Real material use is lower for round or irregular parts.',
  oversized: 'Too large for this sheet', unplaced: 'Did not fit within the sheet limit', applied: 'Objects nested.', failed: 'Could not move the objects. Nothing was changed.',
  stale: 'The drawing changed. Preview again.', nextSheets: 'Sheet 2 and later are laid out to the right of sheet 1.',
  nestSheetSize: 'Enter a sheet width and height above zero.', nestSpacing: 'The margin leaves no room on this sheet.', nestNoParts: 'Select at least two objects to nest.',
  documentRequired: 'Set up document units first.', sheetLabel: 'Sheet {n}',
  price: 'Price per sheet, € (optional)', material: 'Material to issue', cost: 'Material cost', perPart: 'Material per placed part'
};
type Label = keyof typeof en;
const lv: Record<Label, string> = {
  title: 'Izkārtot uz loksnes', help: 'Izkārto atlasītos objektus uz loksnēm pēc to ārējiem taisnstūriem, sākot ar lielākajiem. Bloķēti objekti un objekti grupās vai rāmjos paliek savās vietās.',
  sheet: 'Loksne', page: 'Zīmējuma lapa', custom: 'Pielāgots izmērs', width: 'Loksnes platums', height: 'Loksnes augstums',
  margin: 'Malas atkāpe', gap: 'Attālums starp detaļām', gapHint: 'Attālumā iekļaujiet instrumenta griezuma platumu.',
  rotate: 'Atļaut pagriezt par 90°', maxSheets: 'Lielākais lokšņu skaits', preview: 'Priekšskatīt izkārtojumu', apply: 'Izkārtot objektus', clear: 'Notīrīt priekšskatījumu',
  selection: 'Atlasiet vismaz divus objektus.', parts: 'Detaļas', sheets: 'Loksnes', placed: 'Izvietotas', turned: 'Pagrieztas par 90°',
  usage: 'Taisnstūru pārklājums', usageHint: 'Lietojamās loksnes daļa, ko aizņem detaļu taisnstūri. Apaļām vai neregulārām detaļām faktiskais materiāla patēriņš ir mazāks.',
  oversized: 'Par lielu šai loksnei', unplaced: 'Neietilpa lokšņu limitā', applied: 'Objekti izkārtoti.', failed: 'Objektus neizdevās pārvietot. Nekas netika mainīts.',
  stale: 'Zīmējums ir mainīts. Priekšskatiet vēlreiz.', nextSheets: '2. un nākamās loksnes tiek izkārtotas pa labi no 1. loksnes.',
  nestSheetSize: 'Ievadiet loksnes platumu un augstumu, kas lielāki par nulli.', nestSpacing: 'Ar šādu atkāpi loksnē nepaliek vietas.', nestNoParts: 'Atlasiet vismaz divus objektus.',
  documentRequired: 'Vispirms iestatiet dokumenta mērvienības.', sheetLabel: '{n}. loksne',
  price: 'Loksnes cena, € (nav obligāti)', material: 'Izsniedzamais materiāls', cost: 'Materiāla izmaksas', perPart: 'Materiāls uz izvietoto detaļu'
};
const ru: Record<Label, string> = {
  title: 'Раскладка на лист', help: 'Раскладывает выбранные объекты по листам по их габаритным прямоугольникам, начиная с крупных. Заблокированные объекты и объекты в группах или рамках остаются на месте.',
  sheet: 'Лист', page: 'Страница чертежа', custom: 'Свой размер', width: 'Ширина листа', height: 'Высота листа',
  margin: 'Отступ от края', gap: 'Расстояние между деталями', gapHint: 'Учтите ширину реза инструмента.',
  rotate: 'Разрешить поворот на 90°', maxSheets: 'Не больше листов', preview: 'Предпросмотр раскладки', apply: 'Разложить объекты', clear: 'Сбросить предпросмотр',
  selection: 'Выберите не менее двух объектов.', parts: 'Детали', sheets: 'Листы', placed: 'Размещено', turned: 'Повёрнуто на 90°',
  usage: 'Заполнение габаритами', usageHint: 'Доля полезной площади листа, занятая габаритами деталей. Для круглых и сложных деталей реальный расход материала меньше.',
  oversized: 'Не помещается на этот лист', unplaced: 'Не поместилось в лимит листов', applied: 'Объекты разложены.', failed: 'Не удалось переместить объекты. Ничего не изменено.',
  stale: 'Чертёж изменился. Обновите предпросмотр.', nextSheets: 'Лист 2 и следующие располагаются справа от листа 1.',
  nestSheetSize: 'Введите ширину и высоту листа больше нуля.', nestSpacing: 'При таком отступе на листе не остаётся места.', nestNoParts: 'Выберите не менее двух объектов.',
  documentRequired: 'Сначала настройте единицы документа.', sheetLabel: 'Лист {n}',
  price: 'Цена листа, € (необязательно)', material: 'Выдать материала', cost: 'Стоимость материала', perPart: 'Материал на размещённую деталь'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useNestText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Label, values?: Record<string, string | number>) =>
    values ? copy[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : copy[key];
}
