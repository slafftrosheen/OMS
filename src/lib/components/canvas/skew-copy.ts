import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

export const enSkew = {
  title: 'Skew curves', axis: 'Direction', horizontal: 'Horizontal', vertical: 'Vertical', angle: 'Skew angle (°)',
  keepOriginal: 'Keep original and create a skewed copy', preview: 'Review skew', apply: 'Apply skew',
  source: 'Original', result: 'Result', objects: 'New objects (including group children)', done: 'Skew applied.',
  help: 'Skew editable curves along the page axes. The reference point stays fixed. Positive horizontal angles lean the top to the right; positive vertical angles lift the right edge.',
  styleHelp: 'Curve geometry and gradient fills transform together. Outline width and dash lengths stay unchanged. For a skewed outline silhouette, convert the outline to an object first.',
  previewHelp: 'Dashed: original curves. Solid: resulting curves. The cross marks the fixed reference point. One Undo restores the whole selection.',
  selection: 'Select polylines, Bézier curves or groups of curves.',
  curves: 'This selection includes an object that needs conversion. Convert text, native shapes, circles and arcs to curves first.',
  protected: 'Locked objects, order forms and read-only drawings cannot be skewed.',
  unsupported: 'Bound objects, frame children and clipped artwork cannot be skewed here. Select independent curves.',
  appearance: 'Clipping, bitmap fills and material textures are not supported by this skew operation. Solid and gradient fills are supported.',
  invalid: 'Enter an angle from −80° to 80° and choose a reference point.',
  unchanged: 'This angle does not change the selected geometry. Choose another angle or direction.',
  bounds: 'The transformed curves or fill coordinates exceed the drawing limits.',
  limit: 'The result exceeds the object or document size limit. Skew fewer curves or turn off Keep original.',
  stale: 'The drawing, selection or options changed. Review the skew again.',
  failed: 'The skew could not be applied exactly. No partial changes were kept.',
};
type Copy = Record<keyof typeof enSkew, string>;
const ru: Copy = {
  title: 'Наклон кривых', axis: 'Направление', horizontal: 'По горизонтали', vertical: 'По вертикали', angle: 'Угол наклона (°)',
  keepOriginal: 'Сохранить оригинал и создать наклонённую копию', preview: 'Проверить наклон', apply: 'Применить наклон',
  source: 'Оригинал', result: 'Результат', objects: 'Новые объекты (включая содержимое групп)', done: 'Наклон применён.',
  help: 'Наклон редактируемых кривых вдоль осей страницы. Опорная точка остаётся на месте. Положительный горизонтальный угол сдвигает верх вправо; положительный вертикальный угол поднимает правый край.',
  styleHelp: 'Геометрия кривых и градиентные заливки преобразуются вместе. Толщина обводки и длина штрихов сохраняются. Чтобы наклонить силуэт обводки, сначала преобразуйте её в объект.',
  previewHelp: 'Пунктир — исходные кривые. Сплошная линия — результат. Крест отмечает неподвижную опорную точку. Одна отмена восстанавливает всё выделение.',
  selection: 'Выделите ломаные, кривые Безье или группы кривых.',
  curves: 'В выделении есть объект, требующий преобразования. Сначала преобразуйте текст, обычные фигуры, окружности и дуги в кривые.',
  protected: 'Заблокированные объекты, формы заказа и чертежи только для чтения нельзя наклонять.',
  unsupported: 'Связанные объекты, элементы рамок и обрезанную графику здесь наклонять нельзя. Выберите независимые кривые.',
  appearance: 'Этот инструмент не поддерживает обрезку, растровые заливки и текстуры материалов. Сплошные и градиентные заливки поддерживаются.',
  invalid: 'Введите угол от −80° до 80° и выберите опорную точку.',
  unchanged: 'Этот угол не меняет выделенную геометрию. Выберите другой угол или направление.',
  bounds: 'Преобразованные кривые или координаты заливки выходят за пределы чертежа.',
  limit: 'Результат превышает лимит объектов или размер документа. Выберите меньше кривых или отключите сохранение оригинала.',
  stale: 'Чертёж, выделение или параметры изменились. Проверьте наклон заново.',
  failed: 'Не удалось применить точный наклон. Частичные изменения не сохранены.',
};
const lv: Copy = {
  title: 'Līkņu sašķiebšana', axis: 'Virziens', horizontal: 'Horizontāli', vertical: 'Vertikāli', angle: 'Sašķiebuma leņķis (°)',
  keepOriginal: 'Saglabāt oriģinālu un izveidot sašķiebtu kopiju', preview: 'Pārbaudīt sašķiebumu', apply: 'Lietot sašķiebumu',
  source: 'Oriģināls', result: 'Rezultāts', objects: 'Jauni objekti (ieskaitot grupu saturu)', done: 'Sašķiebums lietots.',
  help: 'Sašķiebiet rediģējamas līknes lapas asu virzienā. Atskaites punkts paliek nekustīgs. Pozitīvs horizontāls leņķis pārvieto augšmalu pa labi; pozitīvs vertikāls leņķis paceļ labo malu.',
  styleHelp: 'Līkņu ģeometrija un gradienta aizpildījumi tiek pārveidoti kopā. Kontūras platums un svītru garumi nemainās. Lai sašķiebtu kontūras siluetu, vispirms pārvērtiet kontūru par objektu.',
  previewHelp: 'Pārtrauktā līnija — oriģinālās līknes. Nepārtrauktā līnija — rezultāts. Krusts apzīmē nekustīgo atskaites punktu. Viena atsaukšana atjauno visu atlasi.',
  selection: 'Atlasiet polilīnijas, Bezjē līknes vai līkņu grupas.',
  curves: 'Atlasē ir objekts, kas vispirms jāpārveido. Pārvērtiet tekstu, parastās figūras, apļus un lokus līknēs.',
  protected: 'Bloķētus objektus, pasūtījuma veidlapas un tikai lasāmus zīmējumus nevar sašķiebt.',
  unsupported: 'Piesaistītus objektus, rāmju elementus un apgrieztu grafiku šeit nevar sašķiebt. Atlasiet neatkarīgas līknes.',
  appearance: 'Šī darbība neatbalsta apgriešanu, rastra aizpildījumus un materiālu tekstūras. Vienkrāsaini un gradienta aizpildījumi ir atbalstīti.',
  invalid: 'Ievadiet leņķi no −80° līdz 80° un izvēlieties atskaites punktu.',
  unchanged: 'Šis leņķis nemaina atlasīto ģeometriju. Izvēlieties citu leņķi vai virzienu.',
  bounds: 'Pārveidotās līknes vai aizpildījuma koordinātas pārsniedz rasējuma robežas.',
  limit: 'Rezultāts pārsniedz objektu skaita vai dokumenta izmēra ierobežojumu. Atlasiet mazāk līkņu vai izslēdziet oriģināla saglabāšanu.',
  stale: 'Zīmējums, atlase vai iestatījumi mainījās. Pārbaudiet sašķiebumu vēlreiz.',
  failed: 'Neizdevās precīzi lietot sašķiebumu. Daļējas izmaiņas netika saglabātas.',
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useSkewText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = typeof language === 'string' && language.startsWith('ru') ? ru : typeof language === 'string' && language.startsWith('lv') ? lv : enSkew;
  return (key: keyof typeof enSkew) => copy[key];
}
