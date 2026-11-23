import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Mirror copy across line',
  help: 'Reflect selected artwork across a straight guide or a line between two drawing coordinates. The result is an editable curve.',
  axis: 'Reflection axis', selectedGuide: 'Selected straight guide', coordinates: 'Two coordinates', guide: 'Guide',
  startX: 'Start X', startY: 'Start Y', endX: 'End X', endY: 'End Y',
  preview: 'Preview', apply: 'Create mirrored copies', clear: 'Clear preview', setup: 'Document setup',
  result: 'Curves to create', done: 'Mirrored copies created.', stale: 'The drawing or axis changed. Preview again.',
  mirrorDocument: 'Set document units before mirroring artwork.',
  mirrorAxis: 'Enter two distinct points within the drawing bounds.',
  mirrorGuide: 'Select a guide made of one straight segment.',
  selectArtwork: 'Select artwork to mirror.',
  mirrorSelection: 'Select at least one object to mirror in addition to the guide.',
  mirrorProtected: 'Select editable artwork on the page or individual objects inside a group.',
  mirrorLimit: 'The selection exceeds the mirror limit. Select fewer or simpler objects.',
  mirrorBounds: 'The reflection exceeds the drawing bounds.',
  unsupported: 'The selection contains geometry or styling that cannot be converted to curves here.',
  failed: 'Could not create the mirrored copies.',
};
export type MirrorCopyLabel = keyof typeof en;
const lv: Record<MirrorCopyLabel, string> = {
  title: 'Spoguļkopija pret līniju',
  help: 'Atspoguļojiet atlasītos objektus pret taisnu vadlīniju vai līniju starp divām koordinātām. Rezultāts ir rediģējama līkne.',
  axis: 'Atspoguļošanas ass', selectedGuide: 'Atlasīta taisna vadlīnija', coordinates: 'Divas koordinātas', guide: 'Vadlīnija',
  startX: 'Sākuma X', startY: 'Sākuma Y', endX: 'Beigu X', endY: 'Beigu Y',
  preview: 'Priekšskatīt', apply: 'Izveidot spoguļkopijas', clear: 'Notīrīt priekšskatījumu', setup: 'Dokumenta iestatījumi',
  result: 'Izveidojamās līknes', done: 'Spoguļkopijas izveidotas.', stale: 'Zīmējums vai ass ir mainīta. Priekšskatiet vēlreiz.',
  mirrorDocument: 'Vispirms iestatiet dokumenta mērvienības.',
  mirrorAxis: 'Ievadiet divus atšķirīgus punktus zīmējuma robežās.',
  mirrorGuide: 'Atlasiet vadlīniju ar vienu taisnu segmentu.',
  selectArtwork: 'Atlasiet atspoguļojamos objektus.',
  mirrorSelection: 'Papildus vadlīnijai atlasiet vismaz vienu objektu.',
  mirrorProtected: 'Atlasiet rediģējamus objektus lapā vai atsevišķus objektus grupā.',
  mirrorLimit: 'Atlase pārsniedz atspoguļošanas limitu. Atlasiet mazāk objektu vai vienkāršojiet tos.',
  mirrorBounds: 'Atspoguļojums pārsniedz zīmējuma robežas.',
  unsupported: 'Atlase satur ģeometriju vai stilu, ko šeit nevar pārveidot par līknēm.',
  failed: 'Neizdevās izveidot spoguļkopijas.',
};
const ru: Record<MirrorCopyLabel, string> = {
  title: 'Зеркальная копия относительно линии',
  help: 'Отразите выбранные объекты относительно прямой направляющей или линии между двумя координатами. Результат останется редактируемой кривой.',
  axis: 'Ось отражения', selectedGuide: 'Выбранная прямая направляющая', coordinates: 'Две координаты', guide: 'Направляющая',
  startX: 'Начало X', startY: 'Начало Y', endX: 'Конец X', endY: 'Конец Y',
  preview: 'Предпросмотр', apply: 'Создать зеркальные копии', clear: 'Очистить предпросмотр', setup: 'Настройка документа',
  result: 'Будет создано кривых', done: 'Зеркальные копии созданы.', stale: 'Чертёж или ось изменились. Обновите предпросмотр.',
  mirrorDocument: 'Сначала задайте единицы документа.',
  mirrorAxis: 'Введите две разные точки в пределах чертежа.',
  mirrorGuide: 'Выберите направляющую из одного прямого отрезка.',
  selectArtwork: 'Выберите объекты для отражения.',
  mirrorSelection: 'Выберите хотя бы один объект помимо направляющей.',
  mirrorProtected: 'Выберите редактируемые объекты на странице или отдельные объекты внутри группы.',
  mirrorLimit: 'Выделение превышает лимит зеркальных копий. Уменьшите количество объектов или упростите их.',
  mirrorBounds: 'Отражение выходит за границы чертежа.',
  unsupported: 'Некоторые контуры или стили выделенных объектов нельзя преобразовать в кривые.',
  failed: 'Не удалось создать зеркальные копии.',
};
const subscribe = (notify: () => void) => locale.subscribe(notify);

export function useMirrorCopyText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (label: MirrorCopyLabel) => copy[label];
}

export function mirrorCopyError(code: string): MirrorCopyLabel {
  if (code === 'conversion-native-style' || code === 'geometry' || code === 'unsupported') return 'unsupported';
  return Object.hasOwn(en, code) ? code as MirrorCopyLabel : 'failed';
}
