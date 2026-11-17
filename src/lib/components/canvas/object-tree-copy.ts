import { useSyncExternalStore } from 'react';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
const en = {
  title: 'Objects', search: 'Find objects', count: '{total} objects · {selected} selected', hidden: '{count} selected outside this view',
  expandAll: 'Expand all', collapseAll: 'Collapse all', reveal: 'Reveal selection', expand: 'Expand', collapse: 'Collapse',
  help: 'Front objects appear first within each group. Arrows navigate; Space selects; Ctrl/Cmd toggles; Shift selects a visible range. F2 renames. Double-click to locate.',
  stack: 'Object order', stackHint: 'Order changes stay within the current parent. Reverse order swaps the selected positions without moving other objects in the stack.',
  front: 'To front', forward: 'Raise', backward: 'Lower', back: 'To back', reverse: 'Reverse order',
  relativeOrder: 'Order relative to an object', referenceObject: 'Reference object', chooseReference: 'Choose an object…',
  inFrontOf: 'Place in front', behind: 'Place behind',
  relativeHint: 'Move the selection next to the reference while keeping its internal order. Reference numbers follow the front-to-back order. Changing the selection or stack clears the reference.',
  noReference: 'Select unlocked objects with the same parent and leave at least one sibling unselected to use as a reference.',
  locked: 'Locked', lock: 'Lock', unlock: 'Unlock', lockedParent: 'Unlock the parent first',
  rename: 'Rename', name: 'Object name', applyName: 'Apply name', locate: 'Locate',
  renameHint: 'An object label only. Order fields, file names and text content are preserved. Leave blank to restore the original label.',
  empty: 'No objects on this page.', noMatches: 'No matching objects.', failed: 'The action could not be applied. Check the current selection, object order and parent locks.'
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: 'Объекты', search: 'Найти объекты', count: 'Объектов: {total} · Выбрано: {selected}', hidden: 'Выбрано вне этого списка: {count}',
  expandAll: 'Развернуть всё', collapseAll: 'Свернуть всё', reveal: 'Показать выбранные', expand: 'Развернуть', collapse: 'Свернуть',
  help: 'В каждой группе передние объекты показаны первыми. Стрелки — переход; пробел — выбор; Ctrl/Cmd — добавить или убрать; Shift — диапазон видимых строк. F2 — переименовать. Двойной щелчок — показать на холсте.',
  stack: 'Порядок объектов', stackHint: 'Порядок меняется только внутри одного родителя. Обратный порядок меняет местами выбранные позиции, сохраняя остальные объекты на своих местах.',
  front: 'На передний план', forward: 'Выше', backward: 'Ниже', back: 'На задний план', reverse: 'Обратный порядок',
  relativeOrder: 'Порядок относительно объекта', referenceObject: 'Опорный объект', chooseReference: 'Выберите объект…',
  inFrontOf: 'Поместить перед', behind: 'Поместить за',
  relativeHint: 'Выбранные объекты перемещаются рядом с опорным, сохраняя свой внутренний порядок. Номера идут от переднего плана к заднему. Изменение выделения или порядка сбрасывает опорный объект.',
  noReference: 'Выберите незаблокированные объекты с общим родителем. Оставьте хотя бы один соседний объект невыбранным, чтобы использовать его как опорный.',
  locked: 'Заблокирован', lock: 'Заблокировать', unlock: 'Разблокировать', lockedParent: 'Сначала разблокируйте родителя',
  rename: 'Переименовать', name: 'Имя объекта', applyName: 'Применить имя', locate: 'На холсте',
  renameHint: 'Только подпись объекта. Поля заказа, имена файлов и текст сохраняются. Пустое поле возвращает исходную подпись.',
  empty: 'На этой странице нет объектов.', noMatches: 'Совпадений нет.', failed: 'Не удалось применить действие. Проверьте текущее выделение, порядок объектов и блокировку родителей.'
};
const lv: Record<Key, string> = {
  title: 'Objekti', search: 'Meklēt objektus', count: '{total} objekti · Atlasīti: {selected}', hidden: '{count} atlasīti ārpus šī skata',
  expandAll: 'Izvērst visu', collapseAll: 'Sakļaut visu', reveal: 'Parādīt atlasi', expand: 'Izvērst', collapse: 'Sakļaut',
  help: 'Katrā grupā priekšējie objekti ir pirmie. Bultas — pārvietoties; atstarpe — atlasīt; Ctrl/Cmd — pievienot vai noņemt; Shift — redzamo rindu diapazons. F2 — pārdēvēt. Dubultklikšķis — parādīt uz audekla.',
  stack: 'Objektu secība', stackHint: 'Secību maina tikai viena vecākobjekta ietvaros. Apgrieztā secība samaina atlasītās pozīcijas, pārējos objektus atstājot savās vietās.',
  front: 'Uz priekšplānu', forward: 'Augstāk', backward: 'Zemāk', back: 'Uz aizmuguri', reverse: 'Apgriezt secību',
  relativeOrder: 'Secība attiecībā pret objektu', referenceObject: 'Atskaites objekts', chooseReference: 'Izvēlieties objektu…',
  inFrontOf: 'Novietot priekšā', behind: 'Novietot aiz',
  relativeHint: 'Atlase tiek novietota blakus atskaites objektam, saglabājot tās iekšējo secību. Numuri seko secībai no priekšplāna uz aizmuguri. Mainot atlasi vai secību, atskaites objekts jāizvēlas vēlreiz.',
  noReference: 'Atlasiet nebloķētus objektus ar kopīgu vecākobjektu. Atstājiet vismaz vienu blakusobjektu neatlasītu, lai to izmantotu kā atskaiti.',
  locked: 'Bloķēts', lock: 'Bloķēt', unlock: 'Atbloķēt', lockedParent: 'Vispirms atbloķējiet vecākobjektu',
  rename: 'Pārdēvēt', name: 'Objekta nosaukums', applyName: 'Lietot nosaukumu', locate: 'Parādīt',
  renameHint: 'Tikai objekta etiķete. Pasūtījuma lauki, failu nosaukumi un teksts netiek mainīti. Tukšs lauks atjauno sākotnējo etiķeti.',
  empty: 'Šajā lapā nav objektu.', noMatches: 'Nav atbilstošu objektu.', failed: 'Darbību neizdevās izpildīt. Pārbaudiet pašreizējo atlasi, objektu secību un vecākobjekta bloķējumu.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useObjectTreeText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
