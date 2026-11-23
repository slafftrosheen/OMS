# OMS Draw — Round 8 "Desktop Chrome" (final layout)

Round 8 turns the shared canvas into a complete desktop vector-suite workspace for
sign production. Nothing that existed before was removed: every docker, task, check
and shortcut is still there, now reachable from a properly ordered menu bar, a
toolbox with flyouts, Quick access and a keyboard sheet.

## One source of truth

`src/lib/components/canvas/drawing-command-map.ts` describes every command, menu,
submenu, toolbox flyout and key binding as data. The menu bar, toolbox, Quick access
(Ctrl+/), the keyboard sheet (F1) and the keyboard handler all read it, and
`DrawingWorkspace.tsx › commandState()` resolves each command to *enabled / checked /
run* in one place. A menu, a toolbar button and a shortcut can therefore never
disagree about whether something is available.

Unit tests (`tests/unit/drawing-command-map.test.ts`) guard the contract: every
command is reachable from a menu, has an icon and an EN/LV/RU label, every tool is in
the toolbox exactly once, and no two different actions share keys.

## Screen layout

```
┌ Menu bar  File Edit View Layout Object Effects Bitmaps Text Tools Window Help   [Full screen] ┐
├ Standard  Import Export │ Undo Redo │ Cut Copy Paste Duplicate │ Fit Fit-sel │ Snap Rulers │ Files Preflight   [Quick access  Ctrl+/] ┤
├ Property bar (context: transform fields / text / nodes / freehand / polyline point entry) ┤
│T│ ┌ruler─────────────────────────────┐ │Docker  │D│P│
│o│ │                                   │ │(280px) │o│a│
│o│ │            drawing page           │ │        │c│l│
│l│ │                                   │ │        │k│e│
│b│ └───────────────────────────────────┘ │        │ │t│
├ Status  cursor x,y │ hint │ page tabs │ object · size │ ■ fill  □ outline │ units │ Grid Snap │ zoom ┤
```

- **Toolbox** (left): five sections — Select and edit, Draw and construct, Text and
  dimensions, Interactive effects, Production and finishes. Groups with more than one
  tool show a ▸ corner; the last tool used becomes the group's face.
- **Palette** (right edge): a *no colour* well at the top, then the colours. Click =
  fill, right-click = outline (the well removes fill / outline).
- **Dockers**: Properties, Objects, Text, Arrange, Dimensions, Guidelines, Snapping,
  Pen and tablet, CAD and production, Production clipart — tabbed on the right rail
  and listed with check marks under *Window › Dockers*.
- **Status bar**: live cursor position in document units, the current hint, what is
  selected with its size, and fill / outline wells (click to open Fill or Outline pen).
- **Rulers** can be hidden (*View › Rulers*, Alt+Shift+R); the choice is remembered.

## Flows

| I want to… | Fastest path |
|---|---|
| Jump to Pick and back | **tap Space** (hold Space still pans) |
| Rotate / skew an object | click it, then click it again (double-click edits its text) |
| Copy exactly on top | **+** (number pad or Shift+=) — duplicate in place |
| Do that again | **Ctrl+R** repeat last command (moves, mirrors, order, align, combine, duplicates…) |
| Step through objects | **Tab** / **Shift+Tab** on the canvas |
| Centre on the page | **P** |
| A frame the size of the page | double-click the Rectangle tool |
| Find any command | **Ctrl+/** Quick access — type in EN, LV or RU, accents optional; Enter runs it |
| Learn the keys | **F1** keyboard sheet (same dialog, second tab) |
| Draw a part | F6 rectangle / F7 ellipse / Y polygon / F5 freehand → numbers in the property bar |
| Edit nodes | F10, then Object › Nodes › Align nodes / Reduce nodes |
| Weld / trim / intersect | Object › Shaping ▸ Weld, trim and intersect… |
| Offset a cut line | Ctrl+F9 Contour (offset) |
| Repeat a part | Ctrl+Shift+D Step and repeat, or Effects › Radial repeat |
| Line parts up | select ≥ 2 objects, then L R T B C E (aligns to the last selected) or Ctrl+Shift+A |
| Fill / outline | palette click / right-click, Shift+F11 Fill, F12 Outline pen, or click the status wells |
| Copy look from another object | I — Attributes eyedropper (Edit › Copy properties from…) |
| Send to production | File › Preflight check → File › Export (Ctrl+E) or Save to order |
| Nest parts on a sheet | Layout › Nest on sheet… |

## Menus and keys (generated from the command map)

#### File · Fails · Файл

| Command | Keys | LV | RU |
|---|---|---|---|
| Import… | `Ctrl+I` | Importēt… | Импорт… |
| Import DXF… |  | Importēt DXF… | Импорт DXF… |
| Import PDF, SVG or CDR… |  | Importēt PDF, SVG vai CDR… | Импорт PDF, SVG или CDR… |
| Export… | `Ctrl+E` | Eksportēt… | Экспорт… |
| *Export settings (scope, PNG scale, background, padding) + SVG/PNG buttons* | | | |
| Publish to PDF… |  | Publicēt PDF… | Опубликовать в PDF… |
| *Save to order (order drawings only)* | | | |
| Order files |  | Pasūtījuma faili | Файлы заказа |
| Preflight check |  | Pirmsdrukas pārbaude | Предпечатная проверка |

#### Edit · Rediģēt · Правка

| Command | Keys | LV | RU |
|---|---|---|---|
| Undo | `Ctrl+Z` | Atsaukt | Отменить |
| Redo | `Ctrl+Shift+Z` | Atcelt atsaukšanu | Повторить |
| Repeat last command | `Ctrl+R` | Atkārtot pēdējo komandu | Повторить последнюю команду |
| Cut | `Ctrl+X` | Izgriezt | Вырезать |
| Copy | `Ctrl+C` | Kopēt | Копировать |
| Paste | `Ctrl+V` | Ielīmēt | Вставить |
| Duplicate | `Ctrl+D` | Dublēt | Дублировать |
| Duplicate in place | `+` | Dublēt vietā | Дублировать на месте |
| Step and repeat… | `Ctrl+Shift+D` | Solis un atkārtot… | Шаг и повтор… |
| Delete | `Delete` | Dzēst | Удалить |
| Select all | `Ctrl+A` | Atlasīt visu | Выделить всё |
| Select next object | `Tab` | Atlasīt nākamo objektu | Выделить следующий объект |
| Select previous object | `Shift+Tab` | Atlasīt iepriekšējo objektu | Выделить предыдущий объект |
| Select similar… |  | Atlasīt līdzīgos… | Выделить похожие… |
| Find and replace… | `Ctrl+F` | Atrast un aizstāt… | Найти и заменить… |
| Copy properties from… |  | Kopēt īpašības no… | Копировать свойства от… |

#### View · Skats · Вид

| Command | Keys | LV | RU |
|---|---|---|---|
| Zoom in | `Ctrl+=` | Tuvināt | Увеличить |
| Zoom out | `F3` | Tālināt | Уменьшить |
| Zoom to all objects | `F4` | Tuvināt visiem objektiem | Масштаб по всем объектам |
| Zoom to selection | `Shift+F2` | Tuvināt atlasei | Масштаб по выделению |
| Zoom to page | `Shift+F4` | Tuvināt lapai | Масштаб по странице |
| Actual size (100%) | `Shift+0` | Faktiskais izmērs (100%) | Реальный размер (100%) |
| Full screen | `F9` | Pilnekrāns | Во весь экран |
| Rulers | `Alt+Shift+R` | Lineāli | Линейки |
| Grid | `Ctrl+'` | Režģis | Сетка |
| Guidelines |  | Palīglīnijas | Направляющие |
| Blueprint surface |  | Rasējuma virsma | Чертёжная подложка |
| Snap to objects | `Alt+Y` | Piesaiste objektiem | Привязка к объектам |
| Snap options… |  | Piesaistes iestatījumi… | Параметры привязки… |
| Pen and tablet… |  | Pildspalva un planšete… | Перо и планшет… |

#### Layout · Izkārtojums · Макет

| Command | Keys | LV | RU |
|---|---|---|---|
| Page setup |  | Lapas iestatījumi | Параметры страницы |
| Document units and scale |  | Dokumenta mērvienības un mērogs | Единицы и масштаб документа |
| Guidelines setup… |  | Palīglīniju iestatīšana… | Настройка направляющих… |
| Dimensions and construction |  | Izmēri un konstruēšana | Размеры и построения |
| Nest on sheet… |  | Izkārtot loksnē… | Раскладка на листе… |
| Production clipart |  | Ražošanas sagataves | Производственные шаблоны |

#### Object · Objekts · Объект

| Command | Keys | LV | RU |
|---|---|---|---|
| Group | `Ctrl+G` | Grupēt | Сгруппировать |
| Ungroup | `Ctrl+U` | Atgrupēt | Разгруппировать |
| Combine | `Ctrl+L` | Apvienot | Объединить |
| Break apart | `Ctrl+K` | Sadalīt | Разъединить |
| Lock selection |  | Bloķēt atlasi | Заблокировать выделенное |
| Production layers |  | Ražošanas slāņi | Производственные слои |
| **Order ▸** | | Secība | Порядок |
| ↳ To front | `Ctrl+Home` | Uz priekšu | На передний план |
| ↳ To back | `Ctrl+End` | Uz aizmuguri | На задний план |
| ↳ Forward one | `Ctrl+PageUp` | Vienu uz priekšu | На один вперёд |
| ↳ Back one | `Ctrl+PageDown` | Vienu atpakaļ | На один назад |
| ↳ Reverse order |  | Apgriezt secību | Обратный порядок |
| ↳ In front of or behind… |  | Priekšā vai aiz… | Перед или за… |
| **Transformations ▸** | | Transformācijas | Преобразования |
| ↳ Position, scale and rotate… | `Alt+F7` | Pozīcija, mērogs un pagrieziens… | Положение, масштаб и поворот… |
| ↳ Rotate 90° left |  | Pagriezt 90° pa kreisi | Повернуть на 90° влево |
| ↳ Rotate 90° right |  | Pagriezt 90° pa labi | Повернуть на 90° вправо |
| ↳ Mirror horizontally |  | Spoguļot horizontāli | Отразить по горизонтали |
| ↳ Mirror vertically |  | Spoguļot vertikāli | Отразить по вертикали |
| ↳ Rotate and skew handles |  | Pagrieziena un slīpuma turi | Маркеры поворота и наклона |
| **Align and distribute ▸** | | Līdzināt un izkliedēt | Выровнять и распределить |
| ↳ Align left | `L` | Līdzināt pa kreisi | Выровнять по левому краю |
| ↳ Align centres horizontally | `C` | Līdzināt centrus horizontāli | Выровнять центры по горизонтали |
| ↳ Align right | `R` | Līdzināt pa labi | Выровнять по правому краю |
| ↳ Align top | `T` | Līdzināt augšā | Выровнять по верху |
| ↳ Align centres vertically | `E` | Līdzināt centrus vertikāli | Выровнять центры по вертикали |
| ↳ Align bottom | `B` | Līdzināt apakšā | Выровнять по низу |
| ↳ Distribute horizontally |  | Izkliedēt horizontāli | Распределить по горизонтали |
| ↳ Distribute vertically |  | Izkliedēt vertikāli | Распределить по вертикали |
| ↳ Centre to page | `P` | Centrēt lapā | По центру страницы |
| ↳ Align and distribute… | `Ctrl+Shift+A` | Līdzināt un izkliedēt… | Выровнять и распределить… |
| **Shaping ▸** | | Formēšana | Формирование |
| ↳ Weld, trim and intersect… |  | Sapludināt, apgriezt, krustot… | Сварить, обрезать, пересечь… |
| ↳ Join curves… |  | Savienot līknes… | Соединить кривые… |
| ↳ Knife… |  | Nazis… | Нож… |
| Convert to curves | `Ctrl+Q` | Pārvērst līknēs | Преобразовать в кривые |
| Convert outline to object | `Ctrl+Shift+Q` | Kontūru pārvērst objektā | Абрис в объект |
| **Nodes ▸** | | Mezgli | Узлы |
| ↳ Edit nodes | `F10` | Rediģēt mezglus | Редактировать узлы |
| ↳ Align nodes… |  | Līdzināt mezglus… | Выровнять узлы… |
| ↳ Reduce nodes… |  | Samazināt mezglus… | Сократить узлы… |
| **Shape properties ▸** | | Formas īpašības | Свойства фигуры |
| ↳ Rectangle corners… |  | Taisnstūra stūri… | Углы прямоугольника… |
| ↳ Polygon and star… |  | Daudzstūris un zvaigzne… | Многоугольник и звезда… |
| ↳ Pie and arc… |  | Sektors un loks… | Сектор и дуга… |
| Fill… | `Shift+F11` | Aizpildījums… | Заливка… |
| Outline pen… | `F12` | Kontūras pildspalva… | Перо абриса… |

#### Effects · Efekti · Эффекты

| Command | Keys | LV | RU |
|---|---|---|---|
| Contour (offset)… | `Ctrl+F9` | Kontūra (nobīde)… | Контур (смещение)… |
| Centreline… |  | Viduslīnija… | Осевая линия… |
| Step and repeat… | `Ctrl+Shift+D` | Solis un atkārtot… | Шаг и повтор… |
| Radial repeat… |  | Radiāls atkārtojums… | Радиальный повтор… |
| Lettering… |  | Burtu izkārtojums… | Надпись… |

#### Bitmaps · Rastrs · Растр

| Command | Keys | LV | RU |
|---|---|---|---|
| Trace bitmap… |  | Vektorizēt rastru… | Трассировать растр… |

#### Text · Teksts · Текст

| Command | Keys | LV | RU |
|---|---|---|---|
| Text | `Ctrl+T` | Teksts | Текст |
| Fonts… |  | Fonti… | Шрифты… |
| Find and replace… | `Ctrl+F` | Atrast un aizstāt… | Найти и заменить… |
| Convert to curves | `Ctrl+Q` | Pārvērst līknēs | Преобразовать в кривые |
| Lettering… |  | Burtu izkārtojums… | Надпись… |

#### Tools · Rīki · Инструменты

| Command | Keys | LV | RU |
|---|---|---|---|
| Options… | `Ctrl+J` | Iestatījumi… | Параметры… |
| **Options ▸** | | Iestatījumi | Параметры |
| ↳ Page setup |  | Lapas iestatījumi | Параметры страницы |
| ↳ Document units and scale |  | Dokumenta mērvienības un mērogs | Единицы и масштаб документа |
| ↳ Snap options… |  | Piesaistes iestatījumi… | Параметры привязки… |
| ↳ Pen and tablet… |  | Pildspalva un planšete… | Перо и планшет… |
| Switch to Pick and back | `Space` | Pārslēgt uz atlasi un atpakaļ | Переключиться на выбор и обратно |
| Page setup |  | Lapas iestatījumi | Параметры страницы |
| Preflight check |  | Pirmsdrukas pārbaude | Предпечатная проверка |
| Nest on sheet… |  | Izkārtot loksnē… | Раскладка на листе… |
| *All tools directory* | | | |

#### Window · Logs · Окно

| Command | Keys | LV | RU |
|---|---|---|---|
| **Dockers ▸** | | Paneļi | Докеры |
| ↳ Properties | `Alt+Enter` | Īpašības | Свойства |
| ↳ Objects | `Ctrl+F2` | Objekti | Объекты |
| ↳ Text |  | Teksts | Текст |
| ↳ Arrange |  | Izkārtot | Упорядочить |
| ↳ Dimensions |  | Izmēri | Размеры |
| ↳ Guidelines |  | Palīglīnijas | Направляющие |
| ↳ Snapping |  | Piesaiste | Привязка |
| ↳ Pen and tablet |  | Pildspalva un planšete | Перо и планшет |
| ↳ CAD and production |  | CAD un ražošana | CAD и производство |
| ↳ Production clipart |  | Ražošanas sagataves | Производственные шаблоны |
| Close docker |  | Aizvērt paneli | Закрыть докер |
| Rulers | `Alt+Shift+R` | Lineāli | Линейки |
| Full screen | `F9` | Pilnekrāns | Во весь экран |

#### Help · Palīdzība · Справка

| Command | Keys | LV | RU |
|---|---|---|---|
| Quick access… | `Ctrl+/` | Ātrā piekļuve… | Быстрый доступ… |
| Keyboard shortcuts | `F1` | Īsinājumtaustiņi | Сочетания клавиш |

### Toolbox

| Section | Flyout | Tools (first = default) | Keys |
|---|---|---|---|
| Select and edit | Pick tools | Pick · Free transform | `V` |
| Select and edit | Shape and crop | Shape (nodes) · Knife · Eraser | `F10` `E` |
| Select and edit | Zoom and pan | Pan · Zoom | `H` `Z` |
| Draw and construct | Curves | Freehand · 2-point line · Bézier · Polyline | `F5` `L` |
| Draw and construct | Artistic media | Sketch (artistic media) · Highlighter | `D` |
| Draw and construct | Rectangle | Rectangle | `F6` |
| Draw and construct | Circles and ellipses | Ellipse · Circle by centre · 3-point circle · 3-point arc | `F7` |
| Draw and construct | Polygons and stars | Polygon · Star · Triangle · Diamond | `Y` |
| Text and dimensions | Text | Text | `F8` |
| Text and dimensions | Dimensions | Dimension · Straight-edge construction |  |
| Text and dimensions | Connectors | Arrow connector · Frame | `A` |
| Interactive effects | Interactive effects | Contour · Step and repeat · Radial repeat · Shaping | `Ctrl+F9` |
| Production and finishes | Eyedropper | Attributes eyedropper | `I` |
| Production and finishes | Fill and outline | Fill · Outline pen | `Shift+F11` `F12` |
| Production and finishes | Production clipart | Production clipart |  |


## Round 8.1 — "make sure it all works": flows and motion

**Desktop flows added.** Space tap toggles Pick ↔ last tool (a held Space keeps panning);
a second click on the selected object returns to Pick / rotate-skew instead of opening
its text label (double-click still edits); **+** duplicate in place; **Ctrl+R** repeat
last command; **Tab / Shift+Tab** select next / previous; **P** centre to page;
**Ctrl+J** options; double-click on toolbox tools — Pick selects all, Zoom fits all,
Pan fits the page, Rectangle draws the page frame, Text / Freehand / Dimension /
Fill / Outline / Eyedropper / Polygon / Ellipse open their options.

**Fixed while testing.** Hovering a submenu opened it and the click then closed it;
shortcuts were ignored after clicking a shape (the canvas parks focus in a hidden
label field); Space-tap state was lost because the keyboard listener re-subscribes on
renders; page-setup fields had no accessible names (screen readers read "Size preset
Custom", and the existing e2e could not find them); a console warning from the
translation bridge on every render (now `translator-version.ts`).

**Motion language** (`drawing-motion.ts` + the R8.1 block in `drawing-workspace.css`):
120–240 ms, transform/opacity only, ease-out for arrivals and a small spring for things
you press. Toolbox active edge grows in, flyouts open from their tool with a short item
cascade, menu rows slide an accent bar and the open menu gets an underline, dockers slide
in from the rail and swap content with a slide, the property bar cross-fades when its
context changes, palette wells lift toward the canvas, status values tick in, fill and
outline wells ease their colour, rulers fade, and a key toast ("Combine · Ctrl+L")
confirms every keyboard action so shortcuts are learned by using them. With
`prefers-reduced-motion: reduce` all of it is off (the toast just appears and fades).

**Sweep.** A script opened every menu and submenu and ran all 129 commands and tools on
a live drawing in both modes, with no errors (copy only fails where headless Chrome
blocks the clipboard).

## What was kept, and where it lives now

Everything from Rounds 1–7 is reachable: CAD panel tasks (draw, edit, paint,
document, files, trace, preflight), DXF import with review and cut order, vector /
PDF / CDR import, PDF publishing, production layers, guidelines and Pick-skew,
rotation pivot, freehand + pen pressure, calligraphy, find and replace, select
similar, object order tree, repeat grid, radial arrange, nesting with material bill,
cut estimate, production clipart, blueprint surface, full screen, page navigator,
order annotations and Save to order. Existing test hooks (`data-testid`,
`data-drawing-menu`) were preserved; menu items carry the same ids as before.

## Not in this round (honest gaps against a desktop suite)

Envelope, extrude, blend between shapes, drop shadow and transparency tools;
PowerClip; tables; bitmap effects; 3-point rectangle and Smart fill; a dedicated
connector tool. They are listed here so they can be scheduled — the command map
makes each one a single entry plus its handler.

## Verification (this round)

- `npm run check`: 0 errors, 0 warnings.
- `tests/unit/drawing-command-map.test.ts`: 18/18 (menus, icons, translations, key conflicts, Quick access ranking, status wells).
- Canvas unit suites (123 files): same results as main + R7; the only failures are the
  Ghostscript-dependent ones and two that fail only when bundled 30 files per process.
- Drawing e2e after R8.1 (`tests/ui/playwright.drawing-workspace.config.ts`, 91 tests):
  66 passed / 25 failed (R8 alone: 58 / 27 of 85). Untouched main + R7 on the same machine: 49 passed / 28 failed out of 77.
  Every R8 failure also fails on main; the new `drawing-desktop-chrome.spec.ts` (8 tests)
  passes, and the order-mode repeat-grid test now passes after the fixture fix
  (`emptyArea()` moves clear of the production pockets). R8.1 adds 6 more flow/motion tests
  (all pass) and fixes both "stock presets and Fit to Sheet" tests by giving the page-setup
  and repeat-grid fields real accessible names. The 25 remaining failures all fail on
  `main` too — older tests that drifted from later canvas changes.
