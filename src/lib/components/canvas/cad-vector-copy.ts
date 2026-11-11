import { useSyncExternalStore } from "react";
import { get } from "svelte/store";
import { locale } from "svelte-i18n";
const en = {
  polygon: "Polygon / star",
  star: "Star polygon",
  sides: "Sides / points (3–64)",
  diameter: "Outer diameter (mm)",
  rotation: "Rotation (°)",
  innerRatio: "Inner radius ratio (0.1–0.9)",
  trace: "Trace bitmap",
  bitmaps: "Bitmaps",
  traceHelp:
    "Trace a PNG/JPEG/WebP or the selected uncropped image. Runs locally, up to 1024 px on the longest side. White removal also removes white details. Results are approximations; inspect small details before production.",
  selectedImage: "Use selected bitmap",
  source: "Source image",
  mode: "Trace mode",
  mono: "Black and white logo",
  color: "Color artwork",
  threshold: "Threshold",
  colors: "Colors",
  smoothing: "Smoothing",
  noise: "Discard small paths (px)",
  removeWhite: "Remove white",
  width: "Full image / page width (mm)",
  replace: "Replace source bitmap",
  preview: "Prepare preview",
  apply: "Apply curves",
  cancel: "Cancel",
  working: "Processing…",
  result: "Editable result",
  original: "Original",
  stale: "Drawing or options changed. Prepare a new preview.",
  done: "Applied in one undo step.",
  files: "PDF / EPS / DXF",
  import: "Import PDF / EPS as curves",
  file: "Source file",
  page: "Page number",
  outline: "Outline text on the OMS server",
  importHelp:
    "Choose one PDF page or an EPS. PDF paths can be read locally; EPS and text outlining use Ghostscript on your OMS server. Embedded images, clipped paths and unsupported effects are reported and omitted. Compare the original and result before applying.",
  omissions: "I reviewed the omitted content / warnings",
  export: "Export vector PDF / EPS",
  format: "Format",
  scope: "Scope",
  selected: "Selection",
  all: "All drawing objects",
  download: "Download",
  exportHelp:
    "Full-size vector output with fills and outlines; artboard fits the drawing. Convert text to curves first. Images, form cards and unsupported objects are listed. EPS cannot retain transparency. Circles/arcs are approximated within 0.005 mm.",
  paths: "Paths",
  nodes: "Nodes",
  bounds: "Geometry (mm)",
  warnings: "Review",
  empty: "No supported curves. Adjust the settings or choose another file.",
  limit:
    "File or geometry exceeds limits. Use ≤12 MiB files, fewer colors, more smoothing or a smaller image. The result must fit 4096 nodes / 512 contours.",
  failed: "Could not prepare this geometry. Check the file and settings.",
  cancelled: "Cancelled.",
  pageError: "That page is not available.",
  unavailable:
    "Ghostscript is unavailable on the OMS server. Install it and restart OMS.",
  fontError:
    "A font is missing; conversion was stopped to avoid substituting the lettering.",
  imageError:
    "Select one unlocked, uncropped bitmap. The original image must be accessible.",
  "trace-approximation":
    "Bitmap tracing approximates the source. Check holes, edges and fine details.",
  "pdf-images":
    "Embedded raster images are omitted. Import and trace the original bitmap separately.",
  "pdf-clipping":
    "Paths crossing a clipping boundary or using a complex clip are omitted.",
  "pdf-effects":
    "Unsupported gradients, patterns, transparency groups or transformed strokes are omitted.",
  "pdf-text":
    "Live text is omitted. Enable server text outlining to import glyph curves.",
  "pdf-annotations":
    "Annotations or optional content may differ from the source view.",
  corners: "Fillet / chamfer",
  cornerHelp:
    "Select one convex closed straight contour. Applies to every corner. Oversized radii/distances are rejected. Original is replaced in one undo step.",
  fillet: "Fillet",
  chamfer: "Chamfer",
  amount: "Radius / setback (mm)",
  "corner-approximation": "Circular fillets use cubic Bézier approximations.",
  cornerError:
    "Use one convex closed polygon with straight segments and a smaller radius/setback.",
  paint: "Fill & outline",
  fill: "Fill",
  stroke: "Outline",
  none: "None",
  lineWidth: "Outline width (mm)",
  updatePaint: "Apply fill & outline",
  paintHelp:
    "Select one curve. Palette: left click sets fill; right click sets outline. F12 opens these controls.",
  busy: "Converter is busy. Try again shortly.",
  timeout: "Conversion exceeded the time limit.",
  pageLimit:
    "The exported page exceeds 5080 mm. Split the drawing into smaller exports.",
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  polygon: "Многоугольник / звезда",
  star: "Звезда",
  sides: "Сторон / лучей (3–64)",
  diameter: "Внешний диаметр (мм)",
  rotation: "Поворот (°)",
  innerRatio: "Отношение внутреннего радиуса (0,1–0,9)",
  trace: "Трассировка растра",
  bitmaps: "Растровые изображения",
  traceHelp:
    "PNG/JPEG/WebP или выбранное изображение без обрезки. Обработка локальная, до 1024 px по длинной стороне. Удаление белого также убирает белые детали. Перед производством проверьте мелкие элементы.",
  selectedImage: "Использовать выбранный растр",
  source: "Исходное изображение",
  mode: "Режим трассировки",
  mono: "Чёрно-белый логотип",
  color: "Цветное изображение",
  threshold: "Порог",
  colors: "Цветов",
  smoothing: "Сглаживание",
  noise: "Удалять мелкие контуры (px)",
  removeWhite: "Удалить белый",
  width: "Полная ширина изображения / страницы (мм)",
  replace: "Заменить исходный растр",
  preview: "Подготовить предпросмотр",
  apply: "Применить кривые",
  cancel: "Отмена",
  working: "Обработка…",
  result: "Редактируемый результат",
  original: "Оригинал",
  stale: "Чертёж или параметры изменены. Обновите предпросмотр.",
  done: "Применено одним шагом отмены.",
  files: "PDF / EPS / DXF",
  import: "Импорт PDF / EPS в кривые",
  file: "Исходный файл",
  page: "Номер страницы",
  outline: "Преобразовать текст в кривые на сервере OMS",
  importHelp:
    "Одна страница PDF или EPS. Контуры PDF читаются локально; EPS и текст в кривые — через Ghostscript на сервере OMS. Встроенный растр, обрезанные пути и неподдерживаемые эффекты пропускаются с предупреждением. Сравните оригинал и результат.",
  omissions: "Пропуски и предупреждения проверены",
  export: "Экспорт векторного PDF / EPS",
  format: "Формат",
  scope: "Область",
  selected: "Выделение",
  all: "Все объекты чертежа",
  download: "Скачать",
  exportHelp:
    "Вектор в натуральном размере с заливкой и обводкой; страница по габаритам. Текст сначала преобразуйте в кривые. Растр, формы и неподдерживаемые объекты перечислены. EPS не сохраняет прозрачность. Дуги аппроксимируются с допуском 0,005 мм.",
  paths: "Контуров",
  nodes: "Узлов",
  bounds: "Геометрия (мм)",
  warnings: "Проверьте",
  empty: "Нет поддерживаемых кривых. Измените параметры или файл.",
  limit:
    "Превышен лимит. Файл ≤12 МиБ, меньше цветов, больше сглаживания или меньшее изображение. Результат: до 4096 узлов / 512 контуров.",
  failed: "Не удалось подготовить геометрию. Проверьте файл и параметры.",
  cancelled: "Отменено.",
  pageError: "Такой страницы нет.",
  unavailable:
    "Ghostscript недоступен на сервере OMS. Установите его и перезапустите OMS.",
  fontError:
    "Отсутствует шрифт. Обработка остановлена, чтобы не подменять начертание.",
  imageError:
    "Выберите один незаблокированный растр без обрезки. Оригинал должен быть доступен.",
  "trace-approximation":
    "Трассировка приближённая. Проверьте отверстия, границы и мелкие детали.",
  "pdf-images":
    "Встроенный растр пропущен. Импортируйте и трассируйте оригинал отдельно.",
  "pdf-clipping":
    "Пропущены пути, пересекающие границу обрезки или использующие сложную маску.",
  "pdf-effects":
    "Пропущены градиенты, узоры, группы прозрачности или обводки со сложной трансформацией.",
  "pdf-text":
    "Редактируемый текст пропущен. Включите серверное преобразование текста в кривые.",
  "pdf-annotations":
    "Аннотации и опциональные слои могут отличаться от исходного вида.",
  corners: "Скругление / фаска",
  cornerHelp:
    "Выберите один выпуклый замкнутый контур из прямых. Изменяются все углы. Слишком большой радиус/отступ отклоняется. Замена отменяется одним шагом.",
  fillet: "Скругление",
  chamfer: "Фаска",
  amount: "Радиус / отступ (мм)",
  "corner-approximation":
    "Круговые скругления аппроксимированы кубическими кривыми Безье.",
  cornerError:
    "Нужен один выпуклый замкнутый многоугольник из прямых и меньший радиус/отступ.",
  paint: "Заливка и обводка",
  fill: "Заливка",
  stroke: "Обводка",
  none: "Нет",
  lineWidth: "Толщина обводки (мм)",
  updatePaint: "Применить заливку и обводку",
  paintHelp:
    "Выберите одну кривую. Палитра: левая кнопка — заливка, правая — обводка. F12 открывает настройки.",
  busy: "Конвертер занят. Повторите позже.",
  timeout: "Превышено время конвертации.",
  pageLimit: "Страница экспорта превышает 5080 мм. Разделите чертёж на части.",
};
const lv: Record<Key, string> = {
  polygon: "Daudzstūris / zvaigzne",
  star: "Zvaigzne",
  sides: "Malas / stari (3–64)",
  diameter: "Ārējais diametrs (mm)",
  rotation: "Pagrieziens (°)",
  innerRatio: "Iekšējā rādiusa attiecība (0,1–0,9)",
  trace: "Rastra vektorizēšana",
  bitmaps: "Rastra attēli",
  traceHelp:
    "PNG/JPEG/WebP vai atlasīts neapgriezts attēls. Lokāla apstrāde līdz 1024 px garākajā malā. Baltā noņemšana izdzēš arī baltas detaļas. Pirms ražošanas pārbaudiet sīkos elementus.",
  selectedImage: "Izmantot atlasīto attēlu",
  source: "Avota attēls",
  mode: "Vektorizēšanas režīms",
  mono: "Melnbalts logotips",
  color: "Krāsains attēls",
  threshold: "Slieksnis",
  colors: "Krāsas",
  smoothing: "Izlīdzināšana",
  noise: "Izmest sīkus kontūrus (px)",
  removeWhite: "Noņemt balto",
  width: "Pilns attēla / lapas platums (mm)",
  replace: "Aizstāt avota attēlu",
  preview: "Sagatavot priekšskatījumu",
  apply: "Lietot līknes",
  cancel: "Atcelt",
  working: "Apstrādā…",
  result: "Rediģējamais rezultāts",
  original: "Oriģināls",
  stale: "Rasējums vai parametri mainīti. Atjaunojiet priekšskatījumu.",
  done: "Lietots vienā atsaukšanas solī.",
  files: "PDF / EPS / DXF",
  import: "Importēt PDF / EPS kā līknes",
  file: "Avota fails",
  page: "Lapas numurs",
  outline: "Pārvērst tekstu līknēs OMS serverī",
  importHelp:
    "Viena PDF lapa vai EPS. PDF līknes nolasa lokāli; EPS un teksta kontūras izmanto Ghostscript OMS serverī. Iegultie attēli, apgriezti ceļi un neatbalstīti efekti tiek izlaisti ar brīdinājumu. Salīdziniet oriģinālu un rezultātu.",
  omissions: "Izlaistais saturs un brīdinājumi pārbaudīti",
  export: "Eksportēt vektoru PDF / EPS",
  format: "Formāts",
  scope: "Apgabals",
  selected: "Atlasītais",
  all: "Visi rasējuma objekti",
  download: "Lejupielādēt",
  exportHelp:
    "Pilna izmēra vektori ar aizpildījumu un kontūru; lapa atbilst rasējumam. Vispirms pārvērtiet tekstu līknēs. Attēli, veidlapas un neatbalstīti objekti tiek uzskaitīti. EPS nesaglabā caurspīdīgumu. Loki aproksimēti ar 0,005 mm pielaidi.",
  paths: "Kontūras",
  nodes: "Mezgli",
  bounds: "Ģeometrija (mm)",
  warnings: "Pārbaudiet",
  empty: "Nav atbalstītu līkņu. Mainiet parametrus vai failu.",
  limit:
    "Pārsniegti ierobežojumi. Fails ≤12 MiB; mazāk krāsu, vairāk izlīdzināšanas vai mazāks attēls. Rezultāts līdz 4096 mezgliem / 512 kontūrām.",
  failed: "Neizdevās sagatavot ģeometriju. Pārbaudiet failu un parametrus.",
  cancelled: "Atcelts.",
  pageError: "Šāda lapa nav pieejama.",
  unavailable:
    "Ghostscript OMS serverī nav pieejams. Instalējiet to un pārstartējiet OMS.",
  fontError: "Trūkst fonta. Apstrāde apturēta, lai neaizstātu burtu formu.",
  imageError:
    "Atlasiet vienu nebloķētu, neapgrieztu rastra attēlu. Oriģinālam jābūt pieejamam.",
  "trace-approximation":
    "Vektorizēšana ir aptuvena. Pārbaudiet caurumus, malas un sīkās detaļas.",
  "pdf-images":
    "Iegultie rastra attēli izlaisti. Importējiet un vektorizējiet oriģinālu atsevišķi.",
  "pdf-clipping":
    "Izlaisti ceļi, kas šķērso apgriešanas robežu vai izmanto sarežģītu masku.",
  "pdf-effects":
    "Izlaisti neatbalstīti gradienti, raksti, caurspīdīguma grupas vai transformētas kontūras.",
  "pdf-text": "Teksts izlaists. Ieslēdziet teksta kontūru izveidi serverī.",
  "pdf-annotations":
    "Anotācijas un izvēles saturs var atšķirties no oriģināla.",
  corners: "Noapaļošana / noslīpināšana",
  cornerHelp:
    "Atlasiet vienu izliektu slēgtu taisnu kontūru. Maina visus stūrus. Pārāk liels rādiuss/atkāpe tiek noraidīts. Aizstāšanu atsauc vienā solī.",
  fillet: "Noapaļošana",
  chamfer: "Noslīpināšana",
  amount: "Rādiuss / atkāpe (mm)",
  "corner-approximation": "Apaļie stūri aproksimēti ar kubiskām Bezjē līknēm.",
  cornerError:
    "Vajadzīgs viens izliekts slēgts daudzstūris ar taisnām malām un mazāku rādiusu/atkāpi.",
  paint: "Aizpildījums un kontūra",
  fill: "Aizpildījums",
  stroke: "Kontūra",
  none: "Nav",
  lineWidth: "Kontūras biezums (mm)",
  updatePaint: "Lietot aizpildījumu un kontūru",
  paintHelp:
    "Atlasiet vienu līkni. Palete: kreisais klikšķis — aizpildījums, labais — kontūra. F12 atver iestatījumus.",
  busy: "Pārveidotājs aizņemts. Mēģiniet vēlāk.",
  timeout: "Pārsniegts pārveidošanas laiks.",
  pageLimit:
    "Eksporta lapa pārsniedz 5080 mm. Sadaliet rasējumu mazākās daļās.",
};
export function useVectorText() {
  const language = useSyncExternalStore(
    locale.subscribe,
    () => get(locale),
    () => "en",
  );
  const dictionary = language?.startsWith("ru")
    ? ru
    : language?.startsWith("lv")
      ? lv
      : en;
  return (key: string) => dictionary[key as Key] ?? dictionary.failed;
}
export function vectorError(error: unknown): string {
  const code = (error as any)?.code ?? (error as Error)?.message;
  return (
    (
      {
        "converter-unavailable": "unavailable",
        font: "fontError",
        page: "pageError",
        corners: "cornerError",
        "corner-size": "cornerError",
        "page-limit": "pageLimit",
        image: "imageError",
        "eps-opacity": "exportHelp",
      } as Record<string, string>
    )[code] ??
    (["empty", "limit", "cancelled", "busy", "timeout", "stale"].includes(code)
      ? code
      : "failed")
  );
}
