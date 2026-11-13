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
  selectionHelp: 'Select one unlocked, closed curve without clipping or links. Convert shapes to curves first.',
  help: 'The gradient is fitted to the curve’s current local bounds when applied. Linear: 0° points right, 90° points up. Radial: a centred ellipse. Imported colours and type are loaded; applying refits any imported mapping.',
  stopsHelp: 'Use 2–256 colour stops in increasing position order. The first and last positions stay at 0% and 100%. Add colour inserts an interpolated colour halfway across the largest gap.',
  replaceTexture: 'Applying this gradient replaces the current material image.',
  clearHelp: 'Clear gradient restores the underlying plain fill.',
  done: 'Gradient applied in one undo step.',
  removed: 'Gradient cleared in one undo step.',
  geometry: 'Enter an angle from −360° to 360°, opacity from 0% to 100%, and 2–256 colours with strictly increasing positions from 0% to 100%. Complete every numeric field.',
  'gradient-selection': 'Select one unlocked, closed curve without clipping or links. Convert shapes to curves first.',
  stale: 'The drawing, selection or options changed. Review the gradient again before applying.',
  'gradient-failed': 'The gradient could not be updated. Review the selection and try again.',
  capacity: 'The gradient would exceed the drawing’s save limit. Use fewer colour stops or simplify the drawing, then review again.',
  readonly: 'This drawing is read-only. Gradient editing is unavailable.',
  locked: 'Unlock the selected curve and its parent groups before editing its gradient.',
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
  selectionHelp: 'Выберите одну незаблокированную замкнутую кривую без обрезки и связей. Сначала преобразуйте фигуры в кривые.',
  help: 'При применении градиент подгоняется под текущие локальные границы кривой. Линейный: 0° — вправо, 90° — вверх. Радиальный: эллипс по центру. Цвета и тип импортированного градиента загружаются; его размещение при применении подгоняется заново.',
  stopsHelp: 'Используйте 2–256 цветовых точек с возрастающими положениями. Первая и последняя остаются на 0% и 100%. «Добавить цвет» вставляет промежуточный цвет в середину самого большого интервала.',
  replaceTexture: 'Применение градиента заменит текущее изображение материала.',
  clearHelp: 'Удаление градиента восстанавливает исходную однотонную заливку.',
  done: 'Градиент применён одним шагом отмены.',
  removed: 'Градиент удалён одним шагом отмены.',
  geometry: 'Укажите угол от −360° до 360°, непрозрачность 0–100% и 2–256 цветов со строго возрастающими положениями от 0% до 100%. Заполните все числовые поля.',
  'gradient-selection': 'Выберите одну незаблокированную замкнутую кривую без обрезки и связей. Сначала преобразуйте фигуры в кривые.',
  stale: 'Чертёж, выделение или параметры изменились. Проверьте градиент заново перед применением.',
  'gradient-failed': 'Не удалось обновить градиент. Проверьте выделение и повторите попытку.',
  capacity: 'Градиент превысит лимит сохранения чертежа. Уменьшите число цветовых точек или упростите чертёж, затем проверьте снова.',
  readonly: 'Чертёж доступен только для чтения. Редактирование градиента недоступно.',
  locked: 'Перед редактированием градиента разблокируйте выбранную кривую и её родительские группы.',
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
  selectionHelp: 'Atlasiet vienu neaizslēgtu, slēgtu līkni bez apgriešanas vai saitēm. Vispirms pārveidojiet figūras par līknēm.',
  help: 'Lietojot gradientu, tas tiek pielāgots līknes pašreizējām lokālajām robežām. Lineārs: 0° pa labi, 90° uz augšu. Radiāls: centrēta elipse. Importētās krāsas un veids tiek ielādēti; lietojot tiek no jauna pielāgots arī importētais izvietojums.',
  stopsHelp: 'Izmantojiet 2–256 krāsu pieturas augošā pozīciju secībā. Pirmā un pēdējā pozīcija paliek 0% un 100%. «Pievienot krāsu» lielākās atstarpes vidū ievieto interpolētu krāsu.',
  replaceTexture: 'Lietojot gradientu, tiks aizstāts pašreizējais materiāla attēls.',
  clearHelp: 'Noņemot gradientu, tiek atjaunots pamatā esošais vienkrāsas aizpildījums.',
  done: 'Gradients lietots vienā atsaukšanas solī.',
  removed: 'Gradients noņemts vienā atsaukšanas solī.',
  geometry: 'Ievadiet leņķi no −360° līdz 360°, necaurspīdīgumu 0–100% un 2–256 krāsas ar stingri augošām pozīcijām no 0% līdz 100%. Aizpildiet visus skaitliskos laukus.',
  'gradient-selection': 'Atlasiet vienu neaizslēgtu, slēgtu līkni bez apgriešanas vai saitēm. Vispirms pārveidojiet figūras par līknēm.',
  stale: 'Rasējums, atlase vai iestatījumi ir mainījušies. Pirms lietošanas vēlreiz pārskatiet gradientu.',
  'gradient-failed': 'Gradientu neizdevās atjaunināt. Pārbaudiet atlasi un mēģiniet vēlreiz.',
  capacity: 'Gradients pārsniegtu rasējuma saglabāšanas ierobežojumu. Samaziniet krāsu pieturu skaitu vai vienkāršojiet rasējumu, pēc tam pārskatiet vēlreiz.',
  readonly: 'Šis rasējums ir tikai lasāms. Gradientu nevar rediģēt.',
  locked: 'Pirms gradienta rediģēšanas atslēdziet atlasīto līkni un tās vecākgrupas.',
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
