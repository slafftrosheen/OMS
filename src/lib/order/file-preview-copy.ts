const en = {
  loading: 'Loading DXF preview…', failed: 'This DXF cannot be previewed. The original file is still available to download.',
  limit: 'DXF previews support files up to 8 MiB. Download the original to open it in CAD.',
  partial: 'Some entities are not shown in this preview:', units: 'Drawing units are not declared; this preview does not establish physical size.',
  preview: 'DXF drawing preview', pocket: 'Production file pocket', general: 'General attachments', laser: 'Laser', cnc: 'CNC', bender: 'Bender', visuals: 'Visuals',
  empty: 'No files in this pocket.', unavailable: 'Files could not be loaded. Check access or retry.', retry: 'Retry', add: 'Add files', download: 'Download'
};
const ru: typeof en = {
  loading: 'Загрузка DXF…', failed: 'Не удалось показать DXF. Исходный файл доступен для скачивания.',
  limit: 'Предпросмотр DXF поддерживает файлы до 8 МиБ. Скачайте исходник для открытия в CAD.',
  partial: 'В предпросмотре не показаны объекты:', units: 'Единицы чертежа не указаны; предпросмотр не определяет физические размеры.',
  preview: 'Предпросмотр чертежа DXF', pocket: 'Карман производственных файлов', general: 'Общие вложения', laser: 'Лазер', cnc: 'ЧПУ', bender: 'Бендер', visuals: 'Визуализации',
  empty: 'В этом кармане пока нет файлов.', unavailable: 'Не удалось загрузить файлы. Проверьте доступ или повторите попытку.', retry: 'Повторить', add: 'Добавить файлы', download: 'Скачать'
};
const lv: typeof en = {
  loading: 'Ielādē DXF priekšskatījumu…', failed: 'Šo DXF nevar priekšskatīt. Oriģinālais fails joprojām ir lejupielādējams.',
  limit: 'DXF priekšskatījums atbalsta failus līdz 8 MiB. Lejupielādējiet oriģinālu atvēršanai CAD.',
  partial: 'Priekšskatījumā nav attēloti daži objekti:', units: 'Rasējuma mērvienības nav norādītas; priekšskatījums nenosaka fiziskos izmērus.',
  preview: 'DXF rasējuma priekšskatījums', pocket: 'Ražošanas failu kabata', general: 'Vispārīgi pielikumi', laser: 'Lāzers', cnc: 'CNC', bender: 'Liekšana', visuals: 'Vizualizācijas',
  empty: 'Šajā kabatā nav failu.', unavailable: 'Neizdevās ielādēt failus. Pārbaudiet piekļuvi vai mēģiniet vēlreiz.', retry: 'Mēģināt vēlreiz', add: 'Pievienot failus', download: 'Lejupielādēt'
};
export function filePreviewCopy(locale: unknown) { return locale === 'ru' ? ru : locale === 'lv' ? lv : en; }
