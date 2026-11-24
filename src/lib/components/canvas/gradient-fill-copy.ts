import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Gradient fill',
  type: 'Type',
  linear: 'Linear',
  radial: 'Radial',
  angle: 'Angle (°)',
  opacity: 'Opacity (%)',
  stop: 'Colour stop',
  color: 'Colour',
  position: 'Position (%)',
  add: 'Add colour',
  reverse: 'Reverse colours',
  removeStop: 'Remove colour stop',
  review: 'Review gradient',
  preview: 'Gradient preview',
  apply: 'Apply gradient',
  remove: 'Clear gradient',
  selectionHelp: 'Select one unlocked, closed CAD curve, polyline or ellipse without clipping or links. Native drawing shapes must be converted to curves.',
  help: 'Changing colours or opacity keeps the current gradient placement. Changing the type or angle fits the gradient to the curve. At 0° a linear gradient points right. At 90° it points up.',
  refit: 'Fit gradient to curve',
  stopsHelp: 'Order 2–256 stops from 0% to 100%. Give two colours the same position for a sharp transition.',
  replaceTexture: 'Applying this gradient replaces the current material image.',
  clearHelp: 'Clear gradient restores the underlying plain fill.',
  done: 'Gradient applied in one undo step.',
  removed: 'Gradient cleared in one undo step.',
  geometry: 'Enter an angle from −360° to 360°, opacity from 0% to 100%, and 2–256 stops ordered from 0% to 100%. Complete every numeric field.',
  'gradient-selection': 'Select one unlocked, closed CAD curve, polyline or ellipse without clipping or links.',
  stale: 'The drawing, selection or options changed. Review the gradient again before applying.',
  'gradient-failed': 'The gradient could not be updated. Review the selection and try again.',
  capacity: 'The gradient would exceed the drawing’s save limit. Use fewer colour stops or simplify the drawing, then review again.',
  readonly: 'This drawing is read-only. Gradient editing is unavailable.',
  locked: 'Unlock the selected object and its parent groups before editing its gradient.',
};

export type GradientFillLabel = keyof typeof en;

const ru: Record<GradientFillLabel, string> = {
  title: 'Градиентная заливка',
  type: 'Тип',
  linear: 'Линейный',
  radial: 'Радиальный',
  angle: 'Угол (°)',
  opacity: 'Непрозрачность (%)',
  stop: 'Цветовая точка',
  color: 'Цвет',
  position: 'Положение (%)',
  add: 'Добавить цвет',
  reverse: 'Обратить цвета',
  removeStop: 'Удалить цветовую точку',
  review: 'Проверить градиент',
  preview: 'Предпросмотр градиента',
  apply: 'Применить градиент',
  remove: 'Убрать градиент',
  selectionHelp: 'Выберите одну незаблокированную замкнутую кривую CAD, полилинию или эллипс без обрезки и связей. Обычные фигуры сначала преобразуйте в кривые.',
  help: 'При изменении цветов или непрозрачности положение градиента сохраняется. При смене типа или угла градиент подгоняется под кривую. Линейный градиент при 0° направлен вправо, при 90° вверх.',
  refit: 'Подогнать градиент под кривую',
  stopsHelp: 'Расположите от 2 до 256 цветовых точек в порядке от 0% до 100%. Для резкого перехода задайте двум цветам одинаковое положение.',
  replaceTexture: 'Применение градиента заменит текущее изображение материала.',
  clearHelp: 'Удаление градиента восстанавливает исходную однотонную заливку.',
  done: 'Градиент применён одним шагом отмены.',
  removed: 'Градиент удалён одним шагом отмены.',
  geometry: 'Укажите угол от −360° до 360°, непрозрачность 0–100% и от 2 до 256 цветовых точек в порядке от 0% до 100%. Заполните все числовые поля.',
  'gradient-selection': 'Выберите одну незаблокированную замкнутую кривую CAD, полилинию или эллипс без обрезки и связей.',
  stale: 'Чертёж, выделение или параметры изменились. Проверьте градиент заново перед применением.',
  'gradient-failed': 'Не удалось обновить градиент. Проверьте выделение и повторите попытку.',
  capacity: 'Градиент превысит лимит сохранения чертежа. Уменьшите число цветовых точек или упростите чертёж, затем проверьте снова.',
  readonly: 'Чертёж доступен только для чтения. Редактирование градиента недоступно.',
  locked: 'Перед редактированием градиента разблокируйте выбранный объект и его родительские группы.',
};

const lv: Record<GradientFillLabel, string> = {
  title: 'Gradienta aizpildījums',
  type: 'Veids',
  linear: 'Lineārs',
  radial: 'Radiāls',
  angle: 'Leņķis (°)',
  opacity: 'Necaurspīdīgums (%)',
  stop: 'Krāsas pietura',
  color: 'Krāsa',
  position: 'Pozīcija (%)',
  add: 'Pievienot krāsu',
  reverse: 'Apgriezt krāsas',
  removeStop: 'Noņemt krāsas pieturu',
  review: 'Pārskatīt gradientu',
  preview: 'Gradienta priekšskatījums',
  apply: 'Lietot gradientu',
  remove: 'Noņemt gradientu',
  selectionHelp: 'Atlasiet vienu neaizslēgtu, slēgtu CAD līkni, polilīniju vai elipsi bez apgriešanas vai saitēm. Parastās figūras vispirms pārveidojiet par līknēm.',
  help: 'Mainot krāsas vai necaurspīdīgumu, gradienta novietojums saglabājas. Mainot veidu vai leņķi, gradients tiek pielāgots līknei. Pie 0° lineārais gradients ir vērsts pa labi, pie 90° uz augšu.',
  refit: 'Pielāgot gradientu līknei',
  stopsHelp: 'Sakārtojiet 2–256 krāsu pieturas no 0% līdz 100%. Asai pārejai piešķiriet divām krāsām vienādu pozīciju.',
  replaceTexture: 'Lietojot gradientu, tiks aizstāts pašreizējais materiāla attēls.',
  clearHelp: 'Noņemot gradientu, tiek atjaunots pamatā esošais vienkrāsas aizpildījums.',
  done: 'Gradients lietots vienā atsaukšanas solī.',
  removed: 'Gradients noņemts vienā atsaukšanas solī.',
  geometry: 'Ievadiet leņķi no −360° līdz 360°, necaurspīdīgumu no 0% līdz 100% un 2–256 krāsu pieturas secībā no 0% līdz 100%. Aizpildiet visus skaitliskos laukus.',
  'gradient-selection': 'Atlasiet vienu neaizslēgtu, slēgtu CAD līkni, polilīniju vai elipsi bez apgriešanas vai saitēm.',
  stale: 'Rasējums, atlase vai iestatījumi ir mainījušies. Pirms lietošanas vēlreiz pārskatiet gradientu.',
  'gradient-failed': 'Gradientu neizdevās atjaunināt. Pārbaudiet atlasi un mēģiniet vēlreiz.',
  capacity: 'Gradients pārsniegtu rasējuma saglabāšanas ierobežojumu. Samaziniet krāsu pieturu skaitu vai vienkāršojiet rasējumu, pēc tam pārskatiet vēlreiz.',
  readonly: 'Šis rasējums ir tikai lasāms. Gradientu nevar rediģēt.',
  locked: 'Pirms gradienta rediģēšanas atslēdziet atlasīto objektu un tā vecākgrupas.',
};

export function useGradientFillText() {
  const language = useSyncExternalStore(locale.subscribe, () => get(locale), () => 'en');
  const dictionary = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: GradientFillLabel) => dictionary[key];
}

export function gradientFillError(error: unknown): GradientFillLabel {
  const code = (error as { code?: string })?.code ?? (error as Error)?.message;
  if (code === 'material-selection') return 'gradient-selection';
  return ['geometry', 'gradient-selection', 'stale', 'gradient-failed', 'capacity', 'readonly', 'locked'].includes(code)
    ? code as GradientFillLabel : 'gradient-failed';
}
