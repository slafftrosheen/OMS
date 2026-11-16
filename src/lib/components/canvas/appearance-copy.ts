import { useSyncExternalStore } from 'react';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
const en = {
  title: 'Copy appearance', copy: 'Copy from selection', apply: 'Apply to selection',
  hint: 'Copy one object, select targets, then apply the properties you need. Groups apply to every supported member.',
  fill: 'Color & fill', outline: 'Outline', opacity: 'Object opacity', source: 'Copied from',
  native: 'Drawing styles', curve: 'Bézier paint', targetCount: '{count} target objects',
  limits: 'Native drawing color controls fill and outline together. Bézier gradients fit each target. Convert CAD paths, ellipses and arcs to curves before copying their paint. Material fills, artwork, fonts and text are not copied.',
  copied: 'Appearance copied. Select the target objects.', applied: 'Appearance applied.', unchanged: 'The selected appearance already matches.',
  sourceRequired: 'Select one drawing object or Bézier curve. Convert CAD paths, ellipses and arcs to curves first.', noClipboard: 'Copy an object’s appearance first.',
  targetRequired: 'Select the objects to change.', protected: 'The selection is locked or read-only.',
  incompatible: 'Use drawing styles with drawing objects, or Bézier paint with Bézier curves. Convert CAD paths, ellipses and arcs to curves first. Material fills and open filled curves are excluded.',
  fieldsRequired: 'Choose at least one property to apply.', selectionChanged: 'The selection changed. Review it and apply again.',
  saveLimit: 'This appearance would exceed the drawing save limit.', failed: 'Appearance could not be applied. No objects were changed.'
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: 'Копировать оформление', copy: 'Копировать с выделенного', apply: 'Применить к выделенному',
  hint: 'Скопируйте оформление одного объекта, выделите нужные объекты и примените выбранные свойства. В группе изменяются все поддерживаемые объекты.',
  fill: 'Цвет и заливка', outline: 'Контур', opacity: 'Непрозрачность объекта', source: 'Источник',
  native: 'Стили рисунка', curve: 'Оформление кривой Безье', targetCount: 'Объектов: {count}',
  limits: 'У обычных объектов цвет общий для заливки и контура. Градиент Безье подгоняется к каждому объекту. Сначала преобразуйте CAD-контуры, эллипсы и дуги в кривые. Материалы, изображения, шрифты и текст не копируются.',
  copied: 'Оформление скопировано. Выделите целевые объекты.', applied: 'Оформление применено.', unchanged: 'Выбранное оформление уже совпадает.',
  sourceRequired: 'Выделите один объект рисунка или кривую Безье. Сначала преобразуйте CAD-контуры, эллипсы и дуги в кривые.', noClipboard: 'Сначала скопируйте оформление объекта.',
  targetRequired: 'Выделите объекты для изменения.', protected: 'Выделение заблокировано или доступно только для чтения.',
  incompatible: 'Стили рисунка применяются к обычным объектам, оформление Безье — к кривым Безье. Сначала преобразуйте CAD-контуры, эллипсы и дуги в кривые. Материалы и открытые контуры с заливкой исключены.',
  fieldsRequired: 'Выберите хотя бы одно свойство.', selectionChanged: 'Выделение изменилось. Проверьте его и повторите.',
  saveLimit: 'Оформление превысит допустимый размер рисунка.', failed: 'Не удалось применить оформление. Объекты не изменены.'
};
const lv: Record<Key, string> = {
  title: 'Kopēt noformējumu', copy: 'Kopēt no atlasītā', apply: 'Lietot atlasītajiem',
  hint: 'Kopējiet viena objekta noformējumu, atlasiet mērķus un lietojiet vajadzīgās īpašības. Grupā tiek mainīti visi atbalstītie objekti.',
  fill: 'Krāsa un aizpildījums', outline: 'Kontūra', opacity: 'Objekta necaurspīdīgums', source: 'Kopēts no',
  native: 'Zīmējuma stili', curve: 'Bezjē noformējums', targetCount: '{count} mērķa objekti',
  limits: 'Parastu objektu krāsa ir kopīga aizpildījumam un kontūrai. Bezjē gradients pielāgojas katram mērķim. Vispirms pārveidojiet CAD kontūras, elipses un lokus par līknēm. Materiāli, attēli, fonti un teksts netiek kopēti.',
  copied: 'Noformējums nokopēts. Atlasiet mērķa objektus.', applied: 'Noformējums lietots.', unchanged: 'Atlasītais noformējums jau sakrīt.',
  sourceRequired: 'Atlasiet vienu zīmējuma objektu vai Bezjē līkni. Vispirms pārveidojiet CAD kontūras, elipses un lokus par līknēm.', noClipboard: 'Vispirms kopējiet objekta noformējumu.',
  targetRequired: 'Atlasiet maināmos objektus.', protected: 'Atlase ir bloķēta vai tikai lasāma.',
  incompatible: 'Zīmējuma stili ir paredzēti parastiem objektiem, Bezjē noformējums — Bezjē līknēm. Vispirms pārveidojiet CAD kontūras, elipses un lokus par līknēm. Materiālu aizpildījumi un atvērtas aizpildītas līknes ir izslēgtas.',
  fieldsRequired: 'Atlasiet vismaz vienu īpašību.', selectionChanged: 'Atlase mainījusies. Pārbaudiet to un mēģiniet vēlreiz.',
  saveLimit: 'Šis noformējums pārsniegtu zīmējuma saglabāšanas limitu.', failed: 'Noformējumu neizdevās lietot. Objekti nav mainīti.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useAppearanceText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
