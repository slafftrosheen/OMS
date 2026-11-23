import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  task: 'Arrange task', transform: 'Transformations', align: 'Align and distribute',
  artworkClip: 'Clip artwork to shape',
  repeat: 'Step and repeat', radial: 'Rotate / circular copies', nest: 'Nest on sheet', pathRepeat: 'Repeat along path', mirror: 'Mirror copy across line',
  paletteHint: 'CAD: click a swatch for fill, right-click for outline. Open paths use outline colour. Native objects keep their own fill style.',
};
type Label = keyof typeof en;
const ru: Record<Label,string> = {
  artworkClip: 'Маска по фигуре',
  task: 'Задача размещения', transform: 'Преобразования', align: 'Выравнивание и распределение',
  repeat: 'Шаг и повтор', radial: 'Поворот / копии по окружности', nest: 'Раскладка на лист', pathRepeat: 'Повтор вдоль кривой', mirror: 'Зеркальная копия относительно линии',
  paletteHint: 'CAD: щелчок по цвету меняет заливку, правый щелчок — контур. У открытых кривых меняется контур. Обычные объекты сохраняют свой тип заливки.',
};
const lv: Record<Label,string> = {
  artworkClip: 'Maskēt objektus ar formu',
  task: 'Izkārtošanas uzdevums', transform: 'Pārveidojumi', align: 'Līdzināšana un sadalīšana',
  repeat: 'Solis un atkārtošana', radial: 'Pagriešana / kopijas pa apli', nest: 'Izkārtot uz loksnes', pathRepeat: 'Atkārtot pa līkni', mirror: 'Spoguļkopija pret līniju',
  paletteHint: 'CAD: klikšķis uz krāsas maina aizpildījumu, labais klikšķis — kontūru. Atvērtām līknēm mainās kontūra. Parastie objekti saglabā savu aizpildījuma veidu.',
};
export type ArrangeTask = 'transform' | 'align' | 'repeat' | 'radial' | 'nest' | 'pathRepeat' | 'mirror' | 'artworkClip';
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useArrangeTaskText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Label) => copy[key];
}
