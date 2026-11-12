import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Material texture',
  file: 'Image file',
  fileHelp: 'PNG, JPEG or WebP · up to 25 MiB / 32 MP.',
  selectionHelp: 'Select one unlocked, closed curve. Convert shapes to curves first. Page images and clipped or linked curves are not supported.',
  help: 'The image covers the curve and crops the excess; it does not tile. Cut paths and DXF geometry stay unchanged.',
  scale: 'Scale (%)',
  angle: 'Rotation (°)',
  opacity: 'Opacity (%)',
  review: 'Review material',
  preview: 'Material preview',
  apply: 'Apply material',
  remove: 'Clear texture',
  existing: 'Current material image',
  loading: 'Loading image…',
  cancel: 'Cancel',
  ready: 'Image ready. Review the material before applying.',
  done: 'Material applied in one undo step.',
  removed: 'Texture cleared in one undo step.',
  geometry: 'Enter a scale of 100–2000%, rotation from −360° to 360°, and opacity of 0–100%.',
  'material-selection': 'Select one unlocked, closed curve without clipping or linked objects. Convert shapes to curves first.',
  'material-image': 'This image could not be read. Choose a PNG, JPEG or WebP file.',
  'material-limit': 'The image exceeds the limit. Use a file up to 25 MiB and 32 megapixels.',
  'asset-context': 'Save or open a drawing project or order before using a large image.',
  'asset-upload': 'The image could not be saved. Check your connection and file access, then try again.',
  cancelled: 'Image loading cancelled.',
  stale: 'The drawing or options changed. Review the material again before applying.',
  'material-failed': 'The material could not be updated. Your geometry is unchanged. Review the selection and try again.',
};
export type MaterialTextureLabel = keyof typeof en;
const ru: Record<MaterialTextureLabel, string> = {
  title: 'Текстура материала',
  file: 'Файл изображения',
  fileHelp: 'PNG, JPEG или WebP · до 25 МиБ / 32 Мп.',
  selectionHelp: 'Выберите одну незаблокированную замкнутую кривую. Сначала преобразуйте фигуры в кривые. Изображения страниц, кривые с обрезкой или связями не поддерживаются.',
  help: 'Изображение покрывает кривую, лишнее обрезается; повторения нет. Контуры резки и геометрия DXF не меняются.',
  scale: 'Масштаб (%)',
  angle: 'Поворот (°)',
  opacity: 'Непрозрачность (%)',
  review: 'Проверить материал',
  preview: 'Предпросмотр материала',
  apply: 'Применить материал',
  remove: 'Убрать текстуру',
  existing: 'Текущее изображение материала',
  loading: 'Загрузка изображения…',
  cancel: 'Отмена',
  ready: 'Изображение готово. Проверьте материал перед применением.',
  done: 'Материал применён одним шагом отмены.',
  removed: 'Текстура удалена одним шагом отмены.',
  geometry: 'Укажите масштаб 100–2000%, поворот от −360° до 360° и непрозрачность 0–100%.',
  'material-selection': 'Выберите одну незаблокированную замкнутую кривую без обрезки и связей. Сначала преобразуйте фигуры в кривые.',
  'material-image': 'Не удалось прочитать изображение. Выберите файл PNG, JPEG или WebP.',
  'material-limit': 'Изображение превышает лимит. Используйте файл до 25 МиБ и 32 мегапикселей.',
  'asset-context': 'Сохраните или откройте проект либо заказ перед использованием большого изображения.',
  'asset-upload': 'Не удалось сохранить изображение. Проверьте соединение и доступ к файлам, затем повторите попытку.',
  cancelled: 'Загрузка изображения отменена.',
  stale: 'Чертёж или параметры изменились. Проверьте материал заново перед применением.',
  'material-failed': 'Не удалось обновить материал. Геометрия не изменилась. Проверьте выделение и повторите попытку.',
};
const lv: Record<MaterialTextureLabel, string> = {
  title: 'Materiāla tekstūra',
  file: 'Attēla fails',
  fileHelp: 'PNG, JPEG vai WebP · līdz 25 MiB / 32 MP.',
  selectionHelp: 'Atlasiet vienu neaizslēgtu, slēgtu līkni. Vispirms pārveidojiet figūras par līknēm. Lapu attēli un līknes ar apgriešanu vai saitēm netiek atbalstītas.',
  help: 'Attēls pārklāj līkni, un pārpalikums tiek apgriezts; attēls neatkārtojas. Griešanas kontūras un DXF ģeometrija nemainās.',
  scale: 'Mērogs (%)',
  angle: 'Pagrieziens (°)',
  opacity: 'Necaurspīdīgums (%)',
  review: 'Pārskatīt materiālu',
  preview: 'Materiāla priekšskatījums',
  apply: 'Lietot materiālu',
  remove: 'Noņemt tekstūru',
  existing: 'Pašreizējais materiāla attēls',
  loading: 'Ielādē attēlu…',
  cancel: 'Atcelt',
  ready: 'Attēls ir gatavs. Pirms lietošanas pārskatiet materiālu.',
  done: 'Materiāls lietots vienā atsaukšanas solī.',
  removed: 'Tekstūra noņemta vienā atsaukšanas solī.',
  geometry: 'Norādiet mērogu 100–2000%, pagriezienu no −360° līdz 360° un necaurspīdīgumu 0–100%.',
  'material-selection': 'Atlasiet vienu neaizslēgtu, slēgtu līkni bez apgriešanas vai saitēm. Vispirms pārveidojiet figūras par līknēm.',
  'material-image': 'Attēlu neizdevās nolasīt. Izvēlieties PNG, JPEG vai WebP failu.',
  'material-limit': 'Attēls pārsniedz ierobežojumu. Izmantojiet failu līdz 25 MiB un 32 megapikseļiem.',
  'asset-context': 'Pirms liela attēla izmantošanas saglabājiet vai atveriet rasējuma projektu vai pasūtījumu.',
  'asset-upload': 'Attēlu neizdevās saglabāt. Pārbaudiet savienojumu un piekļuvi failiem, pēc tam mēģiniet vēlreiz.',
  cancelled: 'Attēla ielāde atcelta.',
  stale: 'Rasējums vai iestatījumi mainīti. Pirms lietošanas vēlreiz pārskatiet materiālu.',
  'material-failed': 'Materiālu neizdevās atjaunināt. Ģeometrija nav mainīta. Pārbaudiet atlasi un mēģiniet vēlreiz.',
};

export function useMaterialTextureText() {
  const language = useSyncExternalStore(locale.subscribe, () => get(locale), () => 'en');
  const dictionary = language?.startsWith('ru') ? ru : language?.startsWith('lv') ? lv : en;
  return (key: MaterialTextureLabel) => dictionary[key];
}

export function materialTextureError(error: unknown): MaterialTextureLabel {
  const code = (error as { code?: string })?.code ?? (error as Error)?.message;
  if (code === 'readonly' || code === 'locked') return 'material-selection';
  return ['geometry', 'material-selection', 'material-image', 'material-limit', 'asset-context', 'asset-upload', 'cancelled', 'stale', 'material-failed'].includes(code)
    ? code as MaterialTextureLabel : 'material-failed';
}
