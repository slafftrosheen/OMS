import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  task: 'Arrange task', transform: 'Transformations', align: 'Align and distribute',
  repeat: 'Step and repeat', radial: 'Rotate / circular copies',
  paletteHint: 'CAD: click a swatch for fill, right-click for outline. Open paths use outline colour. Native objects keep their own fill style.',
};
type Label = keyof typeof en;
const ru: Record<Label,string> = {
  task: 'Задача размещения', transform: 'Преобразования', align: 'Выравнивание и распределение',
  repeat: 'Шаг и повтор', radial: 'Поворот / копии по окружности',
  paletteHint: 'CAD: щелчок по цвету меняет заливку, правый щелчок — контур. У открытых кривых меняется контур. Обычные объекты сохраняют свой тип заливки.',
};
const lv: Record<Label,string> = {
  task: 'Izkārtošanas uzdevums', transform: 'Pārveidojumi', align: 'Līdzināšana un sadalīšana',
  repeat: 'Solis un atkārtošana', radial: 'Pagriešana / kopijas pa apli',
  paletteHint: 'CAD: klikšķis uz krāsas maina aizpildījumu, labais klikšķis — kontūru. Atvērtām līknēm mainās kontūra. Parastie objekti saglabā savu aizpildījuma veidu.',
};
export type ArrangeTask = 'transform' | 'align' | 'repeat' | 'radial';
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useArrangeTaskText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Label) => copy[key];
}
