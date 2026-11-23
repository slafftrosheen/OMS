import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  help: 'Select editable CAD artwork and a closed shape. Clipping hides artwork outside the boundary. For cutting, use Trim or Intersect.',
  guide: 'Clip boundary', preview: 'Show boundary', apply: 'Apply clip', release: 'Release last clip',
  targets: 'Objects to clip ({count})', stale: 'The drawing changed. Show the boundary again.',
  locked: 'Unlock the artwork to change its clip.',
  clipGuide: 'Select a closed shape with an unclipped boundary.',
  clipArtwork: 'Select individual editable CAD curves, paths, ellipses or arcs.',
  clipLimit: 'The clip exceeds drawing limits. Use fewer or simpler paths.',
  failed: 'Could not change the clip.', applied: 'Clip applied.', released: 'Last clip released.',
};
type Label = keyof typeof en;
const lv: Record<Label, string> = {
  help: 'Atlasiet rediģējamus CAD objektus un slēgtu formu. Maska paslēpj objektu daļas ārpus robežas. Griešanai izmantojiet apgriešanu vai šķēlumu.',
  guide: 'Maskas robeža', preview: 'Rādīt robežu', apply: 'Lietot masku', release: 'Noņemt pēdējo masku',
  targets: 'Maskējamie objekti ({count})', stale: 'Zīmējums ir mainījies. Parādiet robežu vēlreiz.',
  locked: 'Atbloķējiet objektus, lai mainītu masku.',
  clipGuide: 'Atlasiet slēgtu formu bez maskas.',
  clipArtwork: 'Atlasiet atsevišķas rediģējamas CAD līknes, ceļus, elipses vai lokus.',
  clipLimit: 'Maska pārsniedz zīmējuma ierobežojumus. Samaziniet ceļu skaitu vai sarežģītību.',
  failed: 'Masku neizdevās mainīt.', applied: 'Maska lietota.', released: 'Pēdējā maska noņemta.',
};
const ru: Record<Label, string> = {
  help: 'Выберите редактируемые CAD-объекты и замкнутую фигуру. Маска скрывает части объектов за границей. Для резки используйте обрезку или пересечение.',
  guide: 'Граница маски', preview: 'Показать границу', apply: 'Применить маску', release: 'Снять последнюю маску',
  targets: 'Объекты под маской ({count})', stale: 'Чертёж изменился. Покажите границу ещё раз.',
  locked: 'Разблокируйте объекты, чтобы изменить маску.',
  clipGuide: 'Выберите замкнутую фигуру без маски.',
  clipArtwork: 'Выберите отдельные редактируемые CAD-кривые, контуры, эллипсы или дуги.',
  clipLimit: 'Маска превышает ограничения чертежа. Уменьшите число или сложность контуров.',
  failed: 'Не удалось изменить маску.', applied: 'Маска применена.', released: 'Последняя маска снята.',
};

const subscribe = (notify: () => void) => locale.subscribe(notify);
export function useArtworkClipText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (label: Label) => copy[label];
}
