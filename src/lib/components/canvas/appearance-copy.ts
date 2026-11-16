import { useSyncExternalStore } from 'react';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
const en = {
  title: 'Copy appearance', copy: 'Copy from selection', apply: 'Apply to selection',
  hint: 'Copy one object, select targets, then apply the properties you need. Groups apply to every supported member.',
  fill: 'Color & fill', outline: 'Outline', opacity: 'Object opacity', source: 'Copied from',
  native: 'Drawing styles', curve: 'CAD paint', targetCount: '{count} target objects',
  limits: 'Native drawing color controls fill and outline together. CAD gradients fit each closed target. Arcs and open paths support outline and opacity. Material fills, artwork, fonts and text are not copied.',
  copied: 'Appearance copied. Select the target objects.', applied: 'Appearance applied.', unchanged: 'The selected appearance already matches.',
  sourceRequired: 'Select one drawing object or CAD path, ellipse, arc or Bézier curve.', noClipboard: 'Copy an object’s appearance first.',
  targetRequired: 'Select the objects to change.', protected: 'The selection is locked or read-only.',
  incompatible: 'Use drawing styles with drawing objects, or CAD paint with CAD artwork. Fills require closed contours; material fills are not copied.',
  fieldsRequired: 'Choose at least one property to apply.', selectionChanged: 'The selection changed. Review it and apply again.',
  saveLimit: 'This appearance would exceed the drawing save limit.', failed: 'Appearance could not be applied. No objects were changed.'
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: 'Копировать оформление', copy: 'Копировать с выделенного', apply: 'Применить к выделенному',
  hint: 'Скопируйте оформление одного объекта, выделите нужные объекты и примените выбранные свойства. В группе изменяются все поддерживаемые объекты.',
  fill: 'Цвет и заливка', outline: 'Контур', opacity: 'Непрозрачность объекта', source: 'Источник',
  native: 'Стили рисунка', curve: 'Оформление CAD', targetCount: 'Объектов: {count}',
  limits: 'У обычных объектов цвет общий для заливки и контура. Градиент CAD подгоняется к каждому замкнутому объекту. Дуги и открытые контуры поддерживают обводку и непрозрачность. Материалы, изображения, шрифты и текст не копируются.',
  copied: 'Оформление скопировано. Выделите целевые объекты.', applied: 'Оформление применено.', unchanged: 'Выбранное оформление уже совпадает.',
  sourceRequired: 'Выделите один объект рисунка, CAD-контур, эллипс, дугу или кривую Безье.', noClipboard: 'Сначала скопируйте оформление объекта.',
  targetRequired: 'Выделите объекты для изменения.', protected: 'Выделение заблокировано или доступно только для чтения.',
  incompatible: 'Стили рисунка применяются к обычным объектам, оформление CAD — к CAD-объектам. Заливка требует замкнутого контура; материалы не копируются.',
  fieldsRequired: 'Выберите хотя бы одно свойство.', selectionChanged: 'Выделение изменилось. Проверьте его и повторите.',
  saveLimit: 'Оформление превысит допустимый размер рисунка.', failed: 'Не удалось применить оформление. Объекты не изменены.'
};
const lv: Record<Key, string> = {
  title: 'Kopēt noformējumu', copy: 'Kopēt no atlasītā', apply: 'Lietot atlasītajiem',
  hint: 'Kopējiet viena objekta noformējumu, atlasiet mērķus un lietojiet vajadzīgās īpašības. Grupā tiek mainīti visi atbalstītie objekti.',
  fill: 'Krāsa un aizpildījums', outline: 'Kontūra', opacity: 'Objekta necaurspīdīgums', source: 'Kopēts no',
  native: 'Zīmējuma stili', curve: 'CAD noformējums', targetCount: '{count} mērķa objekti',
  limits: 'Parastu objektu krāsa ir kopīga aizpildījumam un kontūrai. CAD gradients pielāgojas katram slēgtam objektam. Loki un atvērtas kontūras atbalsta apmali un necaurspīdīgumu. Materiāli, attēli, fonti un teksts netiek kopēti.',
  copied: 'Noformējums nokopēts. Atlasiet mērķa objektus.', applied: 'Noformējums lietots.', unchanged: 'Atlasītais noformējums jau sakrīt.',
  sourceRequired: 'Atlasiet vienu zīmējuma objektu, CAD kontūru, elipsi, loku vai Bezjē līkni.', noClipboard: 'Vispirms kopējiet objekta noformējumu.',
  targetRequired: 'Atlasiet maināmos objektus.', protected: 'Atlase ir bloķēta vai tikai lasāma.',
  incompatible: 'Zīmējuma stili ir paredzēti parastiem objektiem, CAD noformējums — CAD objektiem. Aizpildījumam vajadzīga slēgta kontūra; materiāli netiek kopēti.',
  fieldsRequired: 'Atlasiet vismaz vienu īpašību.', selectionChanged: 'Atlase mainījusies. Pārbaudiet to un mēģiniet vēlreiz.',
  saveLimit: 'Šis noformējums pārsniegtu zīmējuma saglabāšanas limitu.', failed: 'Noformējumu neizdevās lietot. Objekti nav mainīti.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useAppearanceText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
