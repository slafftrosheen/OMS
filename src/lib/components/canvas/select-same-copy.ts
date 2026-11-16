import { useSyncExternalStore } from 'react';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
const en = {
  title: 'Select Same', criteria: 'Match every checked property', type: 'Object type',
  fill: 'Fill', outline: 'Outline', opacity: 'Object opacity',
  hint: 'Select one reference object with the Pick tool, choose properties and preview matches on this page.',
  preview: 'Preview matches', matches: '{count} matching objects of {total} artwork objects (including the reference).',
  reviewHint: 'The reference is retained for this preview. You can select other objects, then add the matches to that selection.',
  replace: 'Select matches', add: 'Add to selection', selected: '{count} objects selected.',
  sourceRequired: 'Select one drawing object, CAD curve or image as the reference.',
  fieldsRequired: 'Choose at least one property.', unsupported: 'The reference does not support every chosen property. Images support type and opacity; text has no outline.',
  pickRequired: 'Finish the drawing gesture and switch to the Pick tool first.',
  changed: 'The drawing or matching criteria changed. Preview again.', noMatches: 'No eligible objects match.',
  failed: 'Selection could not be changed.',
  limits: 'Current page only. Groups are searched by member; forms, file cards, frames and frame contents are excluded. Native styles and CAD paint match separately. Gradient and texture mappings are compared relative to object bounds. Opacity is the object’s own value; parent opacity is not compared. Locked artwork may be selected; artwork is never edited.'
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: 'Выбрать подобные', criteria: 'Совпадение всех отмеченных свойств', type: 'Тип объекта',
  fill: 'Заливка', outline: 'Контур', opacity: 'Непрозрачность объекта',
  hint: 'Выберите один образец инструментом выбора, отметьте свойства и просмотрите совпадения на этой странице.',
  preview: 'Найти совпадения', matches: 'Совпадений: {count} из {total} объектов (включая образец).',
  reviewHint: 'Образец сохранён для этого поиска. Можно выбрать другие объекты и добавить к ним совпадения.',
  replace: 'Выбрать совпадения', add: 'Добавить к выделению', selected: 'Выбрано объектов: {count}.',
  sourceRequired: 'Выберите один объект рисунка, кривую CAD или изображение как образец.',
  fieldsRequired: 'Выберите хотя бы одно свойство.', unsupported: 'Образец не поддерживает все выбранные свойства. У изображений доступны тип и непрозрачность; у текста нет контура.',
  pickRequired: 'Завершите рисование и включите инструмент выбора.',
  changed: 'Рисунок или условия изменились. Повторите поиск.', noMatches: 'Подходящих объектов нет.',
  failed: 'Не удалось изменить выделение.',
  limits: 'Только текущая страница. Группы проверяются по элементам; формы, карточки файлов, рамки и их содержимое исключены. Обычные стили и оформление CAD сравниваются отдельно. Параметры градиента и текстуры сравниваются относительно границ объекта. Сравнивается непрозрачность самого объекта, без родителя. Заблокированные объекты можно выделить; рисунок не изменяется.'
};
const lv: Record<Key, string> = {
  title: 'Atlasīt līdzīgos', criteria: 'Jāsakrīt visām atzīmētajām īpašībām', type: 'Objekta tips',
  fill: 'Aizpildījums', outline: 'Kontūra', opacity: 'Objekta necaurspīdīgums',
  hint: 'Ar atlases rīku atlasiet vienu parauga objektu, izvēlieties īpašības un priekšskatiet sakritības šajā lapā.',
  preview: 'Priekšskatīt sakritības', matches: '{count} sakritības no {total} zīmējuma objektiem (ieskaitot paraugu).',
  reviewHint: 'Paraugs tiek saglabāts šim priekšskatījumam. Varat atlasīt citus objektus un pievienot tiem sakritības.',
  replace: 'Atlasīt sakritības', add: 'Pievienot atlasei', selected: 'Atlasīti {count} objekti.',
  sourceRequired: 'Atlasiet vienu zīmējuma objektu, CAD līkni vai attēlu kā paraugu.',
  fieldsRequired: 'Izvēlieties vismaz vienu īpašību.', unsupported: 'Paraugs neatbalsta visas izvēlētās īpašības. Attēliem pieejams tips un necaurspīdīgums; tekstam nav kontūras.',
  pickRequired: 'Pabeidziet zīmēšanu un pārslēdzieties uz atlases rīku.',
  changed: 'Zīmējums vai nosacījumi ir mainīti. Atkārtojiet priekšskatījumu.', noMatches: 'Nav atbilstošu objektu.',
  failed: 'Atlasi neizdevās mainīt.',
  limits: 'Tikai pašreizējā lapa. Grupās pārbauda katru objektu; formas, failu kartītes, rāmji un to saturs ir izslēgti. Parastie stili un CAD noformējums tiek salīdzināti atsevišķi. Gradientu un faktūru parametrus salīdzina attiecībā pret objekta robežām. Salīdzina paša objekta necaurspīdīgumu, neņemot vērā vecākobjektu. Bloķētus objektus var atlasīt; zīmējums netiek rediģēts.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useSelectSameText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
