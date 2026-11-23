import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Repeat along path',
  help: 'Select the artwork and a separate guide on the page. Set the guide below. Copies are centred on the path and the originals stay in place.',
  guide: 'Guide', mode: 'Spacing method', countMode: 'Evenly spaced', pitchMode: 'Fixed pitch',
  count: 'Copies', pitch: 'Centre-to-centre pitch', start: 'Start inset', end: 'End inset',
  offset: 'Side offset', offsetHelp: 'Positive values shift copies to the left in the direction of travel.',
  tangent: 'Rotate copies with the path', reverse: 'Reverse path direction',
  preview: 'Preview', apply: 'Create copies', clear: 'Clear preview', setup: 'Document setup',
  length: 'Guide length', generated: 'Objects to create', actualPitch: 'Pitch', applied: 'Copies created.',
  stale: 'The selection, drawing or settings changed. Preview again.',
  pathDocument: 'Set document units before repeating along a path.',
  pathSelection: 'Select at least one object in addition to the guide.',
  pathGuide: 'Choose a single continuous line, path, curve, arc or unlabelled shape as the guide.',
  pathProtected: 'Select editable artwork or complete groups at page level. Clipped or bound objects cannot be repeated here.',
  pathInvalid: 'Check the spacing and offset, and use a guide with non-zero length.',
  pathTooComplex: 'The guide exceeds the preview detail limit. Simplify the guide and try again.',
  pathInsets: 'The start and end insets leave no length for copies.',
  pathCopyLimit: 'This layout exceeds the copy or drawing limit. Reduce the count, increase the pitch or simplify the artwork.',
  pathBounds: 'The artwork or proposed copies exceed the drawing bounds.',
  failed: 'Could not create the copies. The operation was rolled back.',
};
export type PathRepeatLabel = keyof typeof en;
const lv: Record<PathRepeatLabel, string> = {
  title: 'Atkārtot pa līkni',
  help: 'Atlasiet zīmējumu un atsevišķu vadlīniju lapā. Izvēlieties vadlīniju zemāk. Kopijas tiek centrētas uz līknes, un oriģināli paliek uz vietas.',
  guide: 'Vadlīnija', mode: 'Izvietošanas veids', countMode: 'Vienādos attālumos', pitchMode: 'Noteikts solis',
  count: 'Kopijas', pitch: 'Attālums starp centriem', start: 'Atkāpe sākumā', end: 'Atkāpe beigās',
  offset: 'Sānu nobīde', offsetHelp: 'Pozitīva vērtība pārvieto kopijas pa kreisi kustības virzienā.',
  tangent: 'Pagriezt kopijas līknes virzienā', reverse: 'Apgriezt līknes virzienu',
  preview: 'Priekšskatīt', apply: 'Izveidot kopijas', clear: 'Notīrīt priekšskatījumu', setup: 'Dokumenta iestatījumi',
  length: 'Vadlīnijas garums', generated: 'Izveidojamie objekti', actualPitch: 'Solis', applied: 'Kopijas izveidotas.',
  stale: 'Atlase, zīmējums vai iestatījumi ir mainīti. Priekšskatiet vēlreiz.',
  pathDocument: 'Vispirms iestatiet dokumenta mērvienības.',
  pathSelection: 'Papildus vadlīnijai atlasiet vismaz vienu objektu.',
  pathGuide: 'Par vadlīniju izvēlieties vienu nepārtrauktu līniju, kontūru, līkni, loku vai figūru bez teksta.',
  pathProtected: 'Atlasiet lapā rediģējamus objektus vai pilnas grupas. Apgrieztus vai saistītus objektus šeit nevar atkārtot.',
  pathInvalid: 'Pārbaudiet soli un nobīdi un izmantojiet vadlīniju ar garumu virs nulles.',
  pathTooComplex: 'Vadlīnija pārsniedz priekšskatījuma detalizācijas limitu. Vienkāršojiet vadlīniju.',
  pathInsets: 'Starp sākuma un beigu atkāpēm nav vietas kopijām.',
  pathCopyLimit: 'Izkārtojums pārsniedz kopiju vai zīmējuma limitu. Samaziniet skaitu, palieliniet soli vai vienkāršojiet objektus.',
  pathBounds: 'Objekti vai to kopijas pārsniedz zīmējuma robežas.',
  failed: 'Kopijas neizdevās izveidot. Darbība tika atcelta.',
};
const ru: Record<PathRepeatLabel, string> = {
  title: 'Повтор вдоль кривой',
  help: 'Выберите объекты и отдельную направляющую на странице. Укажите направляющую ниже. Центры копий лягут на кривую, оригиналы останутся на месте.',
  guide: 'Направляющая', mode: 'Способ размещения', countMode: 'Равномерно', pitchMode: 'Фиксированный шаг',
  count: 'Копии', pitch: 'Шаг между центрами', start: 'Отступ от начала', end: 'Отступ от конца',
  offset: 'Боковое смещение', offsetHelp: 'Положительное значение смещает копии влево по ходу кривой.',
  tangent: 'Поворачивать копии по касательной', reverse: 'Обратить направление',
  preview: 'Предпросмотр', apply: 'Создать копии', clear: 'Сбросить предпросмотр', setup: 'Настройка документа',
  length: 'Длина направляющей', generated: 'Будет создано объектов', actualPitch: 'Шаг', applied: 'Копии созданы.',
  stale: 'Выделение, чертёж или параметры изменились. Обновите предпросмотр.',
  pathDocument: 'Сначала задайте единицы документа.',
  pathSelection: 'Выберите хотя бы один объект помимо направляющей.',
  pathGuide: 'Выберите одну непрерывную линию, контур, кривую, дугу или фигуру без текста.',
  pathProtected: 'Выберите редактируемые объекты или целые группы на странице. Обрезанные или связанные объекты нельзя повторить здесь.',
  pathInvalid: 'Проверьте шаг и смещение и используйте направляющую ненулевой длины.',
  pathTooComplex: 'Направляющая слишком сложна для предпросмотра. Упростите кривую.',
  pathInsets: 'Между начальным и конечным отступами нет места для копий.',
  pathCopyLimit: 'Превышен лимит копий или чертежа. Уменьшите количество, увеличьте шаг или упростите объекты.',
  pathBounds: 'Объекты или их копии выходят за пределы чертежа.',
  failed: 'Не удалось создать копии. Операция отменена.',
};
const subscribe = (notify: () => void) => locale.subscribe(notify);
export function usePathRepeatText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: PathRepeatLabel) => copy[key];
}

export function isPathRepeatLabel(value: string): value is PathRepeatLabel {
  return Object.hasOwn(en, value);
}
