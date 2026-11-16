import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
const en = {
  title: 'Find and Replace', find: 'Find text', replacement: 'Replace with', scope: 'Search in', page: 'Current page', selection: 'Selection at search',
  matchCase: 'Match case', wholeWord: 'Whole words', search: 'Find and preview',
  hint: 'Search editable text objects. Order forms, shape labels and outlined lettering are excluded. Check result objects to replace every match in those objects.',
  summary: '{count} matches in {objects} text objects', noMatches: 'No matching text objects.', checked: '{count} objects checked',
  checkAll: 'Check unlocked results', clear: 'Clear checks', locate: 'Show object', matches: 'matches', locked: 'Locked',
  before: 'Before', after: 'After', emptyText: '(empty)', replaceChecked: 'Replace checked objects', replaceAll: 'Replace all results',
  lockedHelp: 'Locked results are shown for reference. Unlock them and search again to replace all results, or replace only checked unlocked objects.',
  limits: 'Literal text search; no regular expressions. Selection scope is captured when searching. Up to 500 results and 200,000 searched characters; each text object is limited to 10,000 characters. Empty replacement removes matching text.',
  applied: 'Replaced {count} matches in one undo step.', unchanged: 'The replacement already matches; nothing changed.',
  readOnly: 'Read-only drawing: search and locate remain available.',
  queryRequired: 'Enter text to find.', invalidOptions: 'Check the search text and replacement limits.',
  selectionRequired: 'Select objects or a group before searching the selection.', searchLimit: 'Too much text or too many matches. Search a smaller selection.',
  replacementLimit: 'The replacement would exceed the text limit. Shorten it or search a smaller selection.',
  stale: 'The drawing or search options changed. Find and preview again before replacing.',
  protected: 'A target is locked or read-only. Nothing was changed.', targetsRequired: 'Check at least one matching object.',
  fontUnavailable: 'A target font is missing or lacks replacement characters. Load a suitable font before replacing.',
  saveLimit: 'The replacement would exceed the drawing save limit.', failed: 'Replacement failed. No text objects were changed.'
};
type Key = keyof typeof en;
const ru: Record<Key,string> = {
  title: 'Поиск и замена', find: 'Найти текст', replacement: 'Заменить на', scope: 'Искать в', page: 'Текущая страница', selection: 'Выделение при поиске',
  matchCase: 'Учитывать регистр', wholeWord: 'Слова целиком', search: 'Найти и проверить',
  hint: 'Поиск в редактируемых текстовых объектах. Формы заказа, подписи фигур и текст в кривых исключены. Отметьте объекты, чтобы заменить в них все совпадения.',
  summary: '{count} совпадений в объектах: {objects}', noMatches: 'Подходящие текстовые объекты не найдены.', checked: 'Отмечено объектов: {count}',
  checkAll: 'Отметить незаблокированные', clear: 'Снять отметки', locate: 'Показать объект', matches: 'совпадений', locked: 'Заблокирован',
  before: 'До', after: 'После', emptyText: '(пусто)', replaceChecked: 'Заменить в отмеченных', replaceAll: 'Заменить все результаты',
  lockedHelp: 'Заблокированные результаты показаны для справки. Разблокируйте их и повторите поиск для полной замены или замените только отмеченные объекты.',
  limits: 'Точный поиск текста без регулярных выражений. Область выделения фиксируется при поиске. До 500 результатов и 200 000 символов; до 10 000 символов в объекте. Пустая замена удаляет найденный текст.',
  applied: 'Заменено совпадений: {count}. Отменяется одним действием.', unchanged: 'Текст уже совпадает с заменой; изменений нет.',
  readOnly: 'Режим чтения: поиск и переход к объектам доступны.',
  queryRequired: 'Введите текст для поиска.', invalidOptions: 'Проверьте текст поиска и ограничения замены.',
  selectionRequired: 'Выделите объекты или группу перед поиском в выделении.', searchLimit: 'Слишком много текста или совпадений. Уменьшите выделение.',
  replacementLimit: 'Замена превысит ограничение текста. Сократите её или уменьшите выделение.',
  stale: 'Чертёж или параметры изменились. Повторите поиск перед заменой.',
  protected: 'Объект заблокирован или доступен только для чтения. Изменений нет.', targetsRequired: 'Отметьте хотя бы один найденный объект.',
  fontUnavailable: 'Шрифт объекта отсутствует или не содержит нужных символов. Загрузите подходящий шрифт.',
  saveLimit: 'Замена превысит размер сохраняемого чертежа.', failed: 'Замена не выполнена. Текстовые объекты не изменены.'
};
const lv: Record<Key,string> = {
  title: 'Meklēt un aizstāt', find: 'Meklējamais teksts', replacement: 'Aizstāt ar', scope: 'Meklēt', page: 'Pašreizējā lapā', selection: 'Meklēšanas sākuma atlasē',
  matchCase: 'Reģistrjutīgs', wholeWord: 'Tikai veselus vārdus', search: 'Meklēt un priekšskatīt',
  hint: 'Meklēšana rediģējamos teksta objektos. Pasūtījuma formas, figūru uzraksti un teksts līknēs netiek meklēti. Atzīmējiet objektus, kuros aizstāt visas sakritības.',
  summary: '{count} sakritības {objects} teksta objektos', noMatches: 'Atbilstoši teksta objekti nav atrasti.', checked: 'Atzīmēti {count} objekti',
  checkAll: 'Atzīmēt nebloķētos', clear: 'Notīrīt atzīmes', locate: 'Rādīt objektu', matches: 'sakritības', locked: 'Bloķēts',
  before: 'Pirms', after: 'Pēc', emptyText: '(tukšs)', replaceChecked: 'Aizstāt atzīmētajos', replaceAll: 'Aizstāt visos rezultātos',
  lockedHelp: 'Bloķētie rezultāti ir tikai apskatei. Atbloķējiet tos un meklējiet vēlreiz, lai aizstātu visu, vai aizstājiet tikai atzīmētajos objektos.',
  limits: 'Precīza teksta meklēšana bez regulārajām izteiksmēm. Atlase tiek fiksēta meklēšanas sākumā. Līdz 500 rezultātiem un 200 000 simboliem; līdz 10 000 simboliem objektā. Tukša aizstāšana izdzēš atrasto tekstu.',
  applied: 'Aizstātas {count} sakritības vienā atsaukšanas darbībā.', unchanged: 'Teksts jau sakrīt ar aizstāšanu; izmaiņu nav.',
  readOnly: 'Tikai lasāms zīmējums: var meklēt un atrast objektus.',
  queryRequired: 'Ievadiet meklējamo tekstu.', invalidOptions: 'Pārbaudiet meklēšanas tekstu un aizstāšanas ierobežojumus.',
  selectionRequired: 'Pirms meklēšanas atlasiet objektus vai grupu.', searchLimit: 'Pārāk daudz teksta vai sakritību. Meklējiet mazākā atlasē.',
  replacementLimit: 'Aizstāšana pārsniegtu teksta ierobežojumu. Saīsiniet tekstu vai samaziniet atlasi.',
  stale: 'Zīmējums vai meklēšanas iestatījumi mainījušies. Pirms aizstāšanas meklējiet vēlreiz.',
  protected: 'Mērķis ir bloķēts vai tikai lasāms. Nekas nav mainīts.', targetsRequired: 'Atzīmējiet vismaz vienu atrasto objektu.',
  fontUnavailable: 'Mērķa fonts nav pieejams vai nesatur aizstāšanas simbolus. Ielādējiet piemērotu fontu.',
  saveLimit: 'Aizstāšana pārsniegtu zīmējuma saglabāšanas limitu.', failed: 'Aizstāšana neizdevās. Teksta objekti nav mainīti.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useFindReplaceText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: Key) => copy[key];
}
