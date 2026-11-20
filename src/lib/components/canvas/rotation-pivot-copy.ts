import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

export const enRotationPivot = {
  center: 'Rotation center',
  help: 'Drag the center, then drag a corner to rotate around it. Arrow keys move the center. Home, Enter or double-click resets it.',
  rotate: 'Rotate around the custom center. Shift or Ctrl: 15° steps. Escape: cancel. Left/Right: 1° steps.',
  resetCenter: 'Reset rotation center', moved: 'Rotation center moved.', reset: 'Rotation center reset.',
  rotated: 'Selection rotated.', canceled: 'Rotation change canceled.',
  stale: 'The drawing or view changed. Start the rotation again.',
  invalid: 'This rotation or center is outside the supported drawing limits.',
  failed: 'The rotation could not be applied. No partial changes were kept.',
};
type Copy = Record<keyof typeof enRotationPivot, string>;
const ru: Copy = {
  center: 'Центр вращения',
  help: 'Переместите центр, затем тяните угловую ручку для поворота вокруг него. Стрелки перемещают центр. Home, Enter или двойной щелчок возвращают его в середину.',
  rotate: 'Поворот вокруг заданного центра. Shift или Ctrl: шаг 15°. Escape: отмена. Влево/вправо: шаг 1°.',
  resetCenter: 'Сбросить центр вращения', moved: 'Центр вращения перемещён.', reset: 'Центр вращения сброшен.',
  rotated: 'Выделение повёрнуто.', canceled: 'Изменение вращения отменено.',
  stale: 'Чертёж или вид изменился. Начните поворот заново.',
  invalid: 'Этот поворот или центр выходит за допустимые пределы чертежа.',
  failed: 'Не удалось применить поворот. Частичные изменения не сохранены.',
};
const lv: Copy = {
  center: 'Rotācijas centrs',
  help: 'Pārvietojiet centru, pēc tam velciet stūra turi, lai pagrieztu ap to. Bulttaustiņi pārvieto centru. Home, Enter vai dubultklikšķis to atiestata.',
  rotate: 'Pagriezt ap norādīto centru. Shift vai Ctrl: 15° soļi. Escape: atcelt. Pa kreisi/pa labi: 1° soļi.',
  resetCenter: 'Atiestatīt rotācijas centru', moved: 'Rotācijas centrs pārvietots.', reset: 'Rotācijas centrs atiestatīts.',
  rotated: 'Atlase pagriezta.', canceled: 'Rotācijas izmaiņas atceltas.',
  stale: 'Rasējums vai skats mainījās. Sāciet pagriešanu vēlreiz.',
  invalid: 'Šī rotācija vai centrs pārsniedz atbalstītās rasējuma robežas.',
  failed: 'Rotāciju neizdevās lietot. Daļējas izmaiņas netika saglabātas.',
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useRotationPivotText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : enRotationPivot;
  return (key: keyof typeof enRotationPivot) => copy[key];
}
