# Canvas guidelines, alignment, duplication and clipart

Updated: 2026-11-24.

These controls belong to the shared drawing workspace, so the same workflows are available in the **Order canvas** and **Idea canvas**. The labels below use the English interface; the controls also have Latvian and Russian translations.

## Move and snap guidelines

Open the **Guidelines** docker. Create horizontal or vertical guides by dragging from a ruler, or enter a position in the docker. Choose **Angled** to enter **Pivot X**, **Pivot Y**, and **Angle**. Coordinates follow the document units and origin; angles increase counterclockwise from positive X.

An angled guideline has three separate gestures:

| What to drag | Result |
| --- | --- |
| The guideline itself | Moves the whole guideline and its pivot freely in X/Y, retaining the angle and the place where it was grabbed. |
| The solid pivot handle | Repositions the rotation pivot along the existing line. |
| The hollow rotation handle | Rotates the line around its pivot. Hold **Shift** for 15° steps. |

Double-click a horizontal or vertical guide to expose its rotation controls. The docker also provides **Rotate to angle…** for numerical placement.

While dragging a guide, enabled object targets near the grabbed part of the line can attract it. Enable the required categories in **Snap options**: for example, endpoints, midpoints, centers, or nearest edges. Snapping an angled guide moves it the shortest perpendicular distance needed to pass through the target, preserving its angle. A target marker identifies the acquired point. Snap tolerance follows screen pixels, so zooming does not change the apparent acquisition radius.

- Hold **Q** to bypass snapping temporarily; release it to restore the existing settings.
- Hold **Ctrl** to temporarily toggle the current snap mode. With snapping enabled it suspends snapping; with snapping disabled it enables it while held.
- **Shift** constrains ordinary Pick movement to one axis. For guide rotation it uses 15° increments; dragging the angled guide line remains a free X/Y translation.
- **Escape** cancels a guide drag. A completed drag is one undoable change.
- Drag an existing guide outside the drawing viewport to delete it. New guide and handle gestures released outside the viewport are canceled.

Global guide editing locks and individual guide locks prevent movement. Hidden or locked guides can still be snapping targets when **Snap to guidelines** is enabled. Guides are saved with the page and excluded from exported artwork.

## Create center and middle guides

Select the source artwork, then open **Guidelines → Guides from artwork**.

| Action | Construction |
| --- | --- |
| **Selection center → Vertical / Horizontal / Both** | A guide through the center of the selected artwork's combined geometry bounds. A selected group is treated as one object. |
| **Between two parallel lines** | An infinite guideline at equal perpendicular distance from two selected straight parallel paths, including angled paths. |
| **Middle of horizontal gap** | A vertical guideline halfway between the facing X bounds of two selected objects. |
| **Middle of vertical gap** | A horizontal guideline halfway between the facing Y bounds of two selected objects. |
| **Middle of parallel guidelines** | Choose an existing guideline and a parallel **Second guideline**, then use **Add middle guideline**. Both originals remain in place. |

The gap commands use the gap between object bounds, rather than averaging the two object centers. Different-sized objects therefore produce the expected middle of the free space. When bounds overlap on that axis, there is no outside gap and that construction is unavailable.

These constructions create guides; they do not modify the source artwork. The parallel-line action accepts straight open paths. It does not infer a centerline between arbitrary curves, a medial axis inside a filled object, or an angle bisector between nonparallel lines. Coincident guidelines do not provide a distinct middle guide. Bounds-based constructions exclude outline thickness and do not promise the shortest distance between irregular silhouettes.

## Align artwork

Open **Arrange → Align**. **Last selected object** is the default reference: select the object to keep fixed last, then choose an edge or center alignment. You can also choose the overall selection bounds or a specific selected reference object.

With the drawing focused and Pick idle:

| Shortcut | Alignment |
| --- | --- |
| **L / C / R** | Left edges / horizontal centers / right edges |
| **T / E / B** | Top edges / vertical centers / bottom edges |
| **P** | Center the selection on the page |

Choose **Page edges and centre** to align one or more objects to the physical sheet. Configure a physical size in **Page setup** first. **Keep relative positions** moves the selection together; turn it off to align each selected object separately.

For guide alignment, select a guideline and use **Align artwork to this guideline** in its docker. Horizontal and vertical guides offer edge and center alignment. Angled guides offer **Center on guideline**: the selection's bounds center moves perpendicularly onto the line, without rotating the artwork. Here too, **Keep relative positions** determines whether the selection moves together or each object is centered independently.

Alignment operates on editable artwork geometry bounds. Locked objects, order forms, unsupported frame children, clipped artwork and bound objects can prevent an operation. Equal-gap distribution and equal-center distribution remain separate options: equal centers can overlap differently sized objects.

## Copy and repeat objects

Use the Duplicate toolbar button or **Ctrl+D** to copy the selected artwork. The copy remains selected and editable; groups, paint and supported native relationships are retained. The operation does not replace the clipboard contents.

Open **Arrange → Step and Repeat → Duplicate offsets · Ctrl+D** to set the page's default **X offset** and **Y offset**, then choose **Use these duplicate offsets**.

- The fields use the document's current units, or pixels when no CAD units are configured.
- Positive **X** moves right; positive **Y** moves up.
- Both offsets may be zero to place the copy exactly on top.
- The defaults are saved with the page. Changing display units converts the shown values without moving existing artwork.
- Saving explicit defaults clears the previous remembered duplication displacement.

To repeat an observed displacement, **Alt-drag** a copy and then use **Ctrl+D** while that copy remains selected. Alternatively, duplicate once, move the new copy, and use **Ctrl+D** again: subsequent copies continue at that displacement. This continuation tracks translation of the copied selection, not a general repeated rotate/scale/edit macro.

Press **+**, including the numeric keypad **+**, for an overlapping copy. **Step and Repeat** remains the choice for a previewed grid: select **Gap between edges** or **Distance between copies**, set rows, columns and directions, preview, then create the copies.

Copy commands reject locked selections, invalid coordinates and drawing-capacity overflow. Saving defaults is unavailable during an unfinished drawing or drag.

## Use the expanded clipart library

Open **Production clipart** in the existing docker. The library contains **35 templates**:

| Category | Count | Examples |
| --- | ---: | --- |
| Mounting | 6 | Slots, mounting plates and rails, cable hole, annular spacer, L bracket |
| Sign blanks | 9 | Rounded rectangle, oval, circle, capsule, arch, pointed sign, notched label, hexagon, shield |
| Arrows | 7 | Four directions, double-headed arrow, chevron, right-turn arrow |
| Symbols | 8 | Heart, leaf, five- and eight-point stars, lightning, plus, check mark, map pin |
| Production marks | 5 | Registration target, drill center, trim marks, ten-division ruler, concentric target |

Choose a category or **All templates**, then use **Find clipart** to search names and categories in the current interface language. Select a result to inspect the vector preview and description. Filtering out the current selection hides its insertion form so an old, unrelated template cannot be inserted accidentally.

Enter dimensions in **millimetres**, as explicitly labeled, then choose **Insert on canvas**. Insertion accounts for document scale and units and places the result at the current view center. **Keep proportions** links width and height; it starts enabled for arrows and symbols. Circular presets use a single size field.

The inserted items are editable CAD geometry. Curves retain Bézier handles; holes and other separate contours remain editable members of a group. No font or downloaded raster asset is required. Template descriptions state fixed details, such as the original mounting plate's Ø6 mm holes and 10 mm hole-center margins. Invalid sizes that cannot contain those details disable insertion. The ten-division ruler always divides the entered width into ten equal parts; it does not add numeric labels.

## Validation and remaining checks

The focused regression run passed **245 of 245 tests** across 15 suites. It covers guide geometry and gestures, middle-guide construction, alignment, duplication, clipart insertion, vector round trips, panel continuity, and command wiring. The tests use the pinned native editor, its history manager, and React/DOM harnesses where interaction is involved. `tsc --noEmit --pretty false --incremental false` also completed without errors.

The rendered browser check was blocked before launch by a Chromium sandbox socket restriction. Actual browser appearance, scrolling, overlapping hit areas and hardware-pointer feel therefore still require a live application check. A production build and live deployment were not verified in this batch.
