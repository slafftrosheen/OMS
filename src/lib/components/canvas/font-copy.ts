import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  fonts: 'Fonts…', documentFonts: 'Document fonts', builtInFonts: 'Built-in fonts',
  upload: 'Upload fonts or a font set', uploading: 'Adding fonts…', added: 'Font added', removed: 'Font removed',
  batchAdded: 'Fonts added: {added} · Reused: {reused}.', noFontsAdded: 'No fonts were added.',
  exportSet: 'Export font set', exporting: 'Preparing font set…', exported: 'Font set download started.',
  reuseHelp: 'Upload the saved .omsfonts set in another drawing to reuse these fonts.',
  search: 'Search fonts by name, family or style', searchCount: 'Showing {visible} of {total} fonts.', clearSearch: 'Clear search', noResults: 'No fonts match this search.',
  capacity: '{usedCount}/{count} fonts · {usedKiB}/{totalKiB} KiB used.',
  embedded: 'Uploaded fonts are embedded in this drawing and stay available when it is reopened.',
  limits: 'TTF, OTF, WOFF, WOFF2 or .omsfonts · select up to {count} files. {file} MiB per font · {total} MiB per drawing · up to {count} fonts.', empty: 'No uploaded fonts in this drawing.',
  preview: 'Preview text', previewText: 'Signs & lettering 0123456789', remove: 'Remove font',
  inUse: 'Used by text or the next-text setting. Choose another font before removing it.',
  missing: 'Font unavailable', glyphMissing: 'Missing characters', missingHelp: 'Upload the same font file again or choose another font.',
  applyFailed: 'Could not apply this font. Check the selection, font availability and supported characters.',
  'font-invalid': 'This file is not a supported, valid font.',
  'font-set-invalid': 'This file is not a valid OMS font set.',
  'font-empty': 'This file or font set contains no fonts.',
  'font-files-limit': 'Select no more than {count} font files or font sets at once.',
  'font-too-large': 'This font exceeds the {file} MiB limit.',
  'font-limit': 'This drawing has reached its font limit: {total} MiB total or {count} fonts.',
  'font-save-limit': 'This drawing is too large to save with another embedded font. Remove unused content or unused fonts first.',
  'font-busy': 'Another font operation is in progress. Try again when it finishes.',
  'font-readonly': 'This drawing is read-only.',
  'font-in-use': 'This font is used in the drawing and cannot be removed.',
  'font-missing': 'The selected font is unavailable. Upload it again or choose another font.',
  'font-glyphs': 'This font does not contain all the characters used by the selected text.',
  'font-embedding': 'This font does not allow embedding in a drawing.',
  failed: 'The font operation could not be completed. Try again.',
};
export type DrawingFontLabel = keyof typeof en;
const ru: Record<DrawingFontLabel, string> = {
  fonts: 'Шрифты…', documentFonts: 'Шрифты документа', builtInFonts: 'Встроенные шрифты',
  upload: 'Загрузить шрифты или набор шрифтов', uploading: 'Добавление шрифтов…', added: 'Шрифт добавлен', removed: 'Шрифт удалён',
  batchAdded: 'Добавлено шрифтов: {added} · Использовано повторно: {reused}.', noFontsAdded: 'Шрифты не добавлены.',
  exportSet: 'Экспортировать набор шрифтов', exporting: 'Подготовка набора шрифтов…', exported: 'Загрузка набора шрифтов начата.',
  reuseHelp: 'Загрузите сохранённый набор .omsfonts в другой чертёж, чтобы использовать эти шрифты повторно.',
  search: 'Поиск по названию, семейству или начертанию', searchCount: 'Показано шрифтов: {visible} из {total}.', clearSearch: 'Сбросить поиск', noResults: 'Шрифты по этому запросу не найдены.',
  capacity: 'Шрифты: {usedCount}/{count} · Использовано: {usedKiB}/{totalKiB} КиБ.',
  embedded: 'Загруженные шрифты сохраняются внутри чертежа и доступны при его повторном открытии.',
  limits: 'TTF, OTF, WOFF, WOFF2 или .omsfonts · до {count} файлов за раз. До {file} МиБ на шрифт · {total} МиБ на чертёж · не более {count} шрифтов.', empty: 'В чертеже нет загруженных шрифтов.',
  preview: 'Текст для просмотра', previewText: 'Вывески и надписи 0123456789', remove: 'Удалить шрифт',
  inUse: 'Используется в тексте или для следующего текста. Перед удалением выберите другой шрифт.',
  missing: 'Шрифт недоступен', glyphMissing: 'Нет нужных символов', missingHelp: 'Загрузите тот же файл шрифта повторно или выберите другой шрифт.',
  applyFailed: 'Не удалось применить шрифт. Проверьте выделение, доступность шрифта и поддержку символов.',
  'font-invalid': 'Файл повреждён или имеет неподдерживаемый формат шрифта.',
  'font-set-invalid': 'Файл не является корректным набором шрифтов OMS.',
  'font-empty': 'Файл или набор не содержит шрифтов.',
  'font-files-limit': 'Выберите не более {count} файлов шрифтов или наборов за раз.',
  'font-too-large': 'Шрифт превышает ограничение {file} МиБ.',
  'font-limit': 'Достигнут лимит шрифтов чертежа: {total} МиБ или {count} шрифтов.',
  'font-save-limit': 'Чертёж слишком велик для сохранения ещё одного встроенного шрифта. Сначала удалите ненужное содержимое или неиспользуемые шрифты.',
  'font-busy': 'Выполняется другая операция со шрифтами. Повторите после её завершения.',
  'font-readonly': 'Чертёж доступен только для чтения.',
  'font-in-use': 'Шрифт используется в чертеже, его нельзя удалить.',
  'font-missing': 'Выбранный шрифт недоступен. Загрузите его повторно или выберите другой.',
  'font-glyphs': 'В шрифте нет всех символов выделенного текста.',
  'font-embedding': 'Этот шрифт запрещает встраивание в чертёж.',
  failed: 'Не удалось выполнить операцию со шрифтом. Повторите попытку.',
};
const lv: Record<DrawingFontLabel, string> = {
  fonts: 'Fonti…', documentFonts: 'Dokumenta fonti', builtInFonts: 'Iebūvētie fonti',
  upload: 'Augšupielādēt fontus vai fontu kopu', uploading: 'Pievieno fontus…', added: 'Fonts pievienots', removed: 'Fonts noņemts',
  batchAdded: 'Pievienoti fonti: {added} · Izmantoti atkārtoti: {reused}.', noFontsAdded: 'Fonti netika pievienoti.',
  exportSet: 'Eksportēt fontu kopu', exporting: 'Sagatavo fontu kopu…', exported: 'Fontu kopas lejupielāde sākta.',
  reuseHelp: 'Augšupielādējiet saglabāto .omsfonts kopu citā zīmējumā, lai atkārtoti izmantotu šos fontus.',
  search: 'Meklēt pēc fonta nosaukuma, saimes vai stila', searchCount: 'Parādīti {visible} no {total} fontiem.', clearSearch: 'Notīrīt meklēšanu', noResults: 'Nav atrasts neviens atbilstošs fonts.',
  capacity: '{usedCount}/{count} fonti · Izmantoti {usedKiB}/{totalKiB} KiB.',
  embedded: 'Augšupielādētie fonti tiek iegulti zīmējumā un ir pieejami, to atverot atkārtoti.',
  limits: 'TTF, OTF, WOFF, WOFF2 vai .omsfonts · līdz {count} failiem vienā reizē. {file} MiB vienam fontam · {total} MiB zīmējumam · līdz {count} fontiem.', empty: 'Zīmējumā nav augšupielādētu fontu.',
  preview: 'Priekšskatījuma teksts', previewText: 'Izkārtnes un uzraksti 0123456789', remove: 'Noņemt fontu',
  inUse: 'Tiek izmantots tekstā vai nākamā teksta iestatījumā. Pirms noņemšanas izvēlieties citu fontu.',
  missing: 'Fonts nav pieejams', glyphMissing: 'Trūkst rakstzīmju', missingHelp: 'Augšupielādējiet to pašu fonta failu vēlreiz vai izvēlieties citu fontu.',
  applyFailed: 'Neizdevās lietot fontu. Pārbaudiet atlasi, fonta pieejamību un atbalstītās rakstzīmes.',
  'font-invalid': 'Fails nav derīgs vai tā fonta formāts netiek atbalstīts.',
  'font-set-invalid': 'Fails nav derīga OMS fontu kopa.',
  'font-empty': 'Failā vai kopā nav fontu.',
  'font-files-limit': 'Vienā reizē atlasiet ne vairāk par {count} fontu failiem vai kopām.',
  'font-too-large': 'Fonts pārsniedz {file} MiB ierobežojumu.',
  'font-limit': 'Sasniegts zīmējuma fontu ierobežojums: kopā {total} MiB vai {count} fonti.',
  'font-save-limit': 'Zīmējums ir pārāk liels, lai to saglabātu ar vēl vienu iegultu fontu. Vispirms noņemiet nevajadzīgu saturu vai neizmantotus fontus.',
  'font-busy': 'Notiek cita darbība ar fontiem. Mēģiniet vēlreiz, kad tā pabeigta.',
  'font-readonly': 'Šis zīmējums ir tikai lasāms.',
  'font-in-use': 'Fonts tiek izmantots zīmējumā, un to nevar noņemt.',
  'font-missing': 'Atlasītais fonts nav pieejams. Augšupielādējiet to vēlreiz vai izvēlieties citu.',
  'font-glyphs': 'Fontā nav visu atlasītajā tekstā izmantoto rakstzīmju.',
  'font-embedding': 'Šo fontu nav atļauts iegult zīmējumā.',
  failed: 'Darbību ar fontu neizdevās pabeigt. Mēģiniet vēlreiz.',
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useDrawingFontText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: DrawingFontLabel, values: Record<string, string | number> = {}) => copy[key].replace(/\{(\w+)\}/g, (match, name) => values[name] === undefined ? match : String(values[name]));
}
export function drawingFontErrorLabel(error: unknown): DrawingFontLabel {
  const key = error instanceof Error ? error.message : '';
  return key.startsWith('font-') && Object.hasOwn(en, key) ? key as DrawingFontLabel : 'failed';
}
