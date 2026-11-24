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
| **Between two guidelines → Add middle guideline** | Choose an existing guideline and a parallel **Second guideline**. Both originals remain in place. |

The gap commands use the gap between object bounds, rather than averaging the two object centers. Different-sized objects therefore produce the expected middle of the free space. When bounds overlap on that axis, there is no outside gap and that construction is unavailable.

These constructions create guides; they do not modify the source artwork. The parallel-line action accepts straight open paths. Coincident guidelines do not provide a distinct middle guide. Bounds-based constructions exclude outline thickness and do not promise the shortest distance between irregular silhouettes. Intersecting straight sources now have the separate angle-bisector construction below. For an editable middle curve between open paths, use **Effects → Centreline…**.

## Construct exact angle-bisector guides

Select two straight open paths and open **Guidelines → Guides from artwork → Angle bisectors**. Alternatively, select an existing guideline and choose a **Second guideline** under **Between two guidelines**. Parallel guide pairs offer the middle-guide action; intersecting pairs offer the bisector controls.

The docker shows **Angles between sources**, the **Intersection** in document units, and the direction of the chosen result. Choose **Acute-angle bisector**, **Obtuse-angle bisector**, or **Both bisectors**, then use **Add bisector** or **Add both bisectors**. For a 90° crossing, both angles are equal, so the choices are **Bisector A** and **Bisector B**; their directions identify the two solutions. Reversing a source path or swapping the sources preserves the acute/obtuse choices.

Both sources are treated as infinite straight lines. Their intersection may lie beyond the original path endpoints. Each resulting guide passes through that intersection and halves one of the two angles; directions are measured counterclockwise from positive X. The construction accepts genuinely straight paths, including collinear Bézier controls, and rejects bowed curves, coincident or almost parallel lines, and intersections outside the drawing coordinate limits.

The source artwork and guides stay unchanged. **Add both bisectors** creates the pair in one undo step, and either result remains an editable guideline. Hidden or individually locked guides can be construction references; the global guideline-editing lock still prevents creation. Both results require two available guide slots. If only one slot remains, choose a single bisector or delete an unused guide. A source change before creation requires reviewing the updated construction and trying again.

## Create an editable centreline between curves

Select two open paths, then choose **Effects → Centreline…**. The shaping panel opens with **Operation → Midline** and identifies the **First path** and **Second path**. The result is editable CAD artwork, so it can be node-edited and exported.

**Endpoint pairing** determines which ends correspond:

- **Closest endpoints (automatic)** chooses the direction with the smaller total endpoint-pair distance.
- **Keep source directions** pairs the two starts and the two ends as stored.
- **Reverse second path** pairs the first path's start with the second path's end. The source object itself is not reversed.

**Path matching** determines how points between those ends correspond:

- **Match nodes when counts agree** averages corresponding anchors and Bézier controls when both paths have the same node count. Otherwise it uses relative distance along each path.
- **Distance along each path** always pairs points at the same fraction of each path's length. Use this when node spacing or subdivision differs, including paths with equal node counts but uneven spacing.

Distance matching samples the paths and averages the paired points. For curved inputs, OMS attempts to fit the resulting middle path to editable Bézier curves using the chosen tolerance, retaining paired endpoints and source corner stations. This allows paths with different node counts to produce a smooth editable result. Fit work, coordinates and node counts have finite limits. If fitting cannot complete within those limits, a valid sampled result can retain straight segments; the review explicitly reports whether it fitted Béziers or retained sampled segments. Invalid or oversized constructions are rejected.

Set **Tolerance (mm)**, choose whether to **Keep source objects**, then use **Prepare preview** and **Apply result**. Keeping sources is enabled initially. Changes to the source paths or construction options require a fresh preview before applying.

The centreline averages corresponding points. It is not a true medial axis and does not guarantee equal shortest distances to arbitrary source curves at every point. Check the chosen endpoint pairing and matching method against the intended geometry.

## Align artwork

Open **Arrange → Align**. **Last selected object** is the default reference: select the object to keep fixed last, then choose an edge or center alignment. You can also choose the overall selection bounds or a specific selected reference object.

With the drawing focused and Pick idle:

| Shortcut | Alignment |
| --- | --- |
| **L / C / R** | Left edges / horizontal centers / right edges |
| **T / E / B** | Top edges / vertical centers / bottom edges |
| **P** | Center the selection on the page |

Choose **Page edges and centre** to align one or more objects to the physical sheet. Configure a physical size in **Page setup** first. **Keep relative positions** moves the selection together; turn it off to align each selected object separately.

For guide alignment, select a guideline and use **Align artwork to this guideline** in its docker. Horizontal and vertical guides offer edge and center alignment. Angled guides offer **Start edge**, **Center on guideline**, and **End edge**. Edge actions place the actual minimum or maximum geometry extent perpendicular to the guideline on the line; they solve Bézier extrema and use analytic ellipse/arc support instead of rotating a bounding box. Start/end follow the guideline angle, so turning it 180° swaps the sides. Center retains the existing page-bounds-center behavior. Every action translates without rotating artwork. **Keep relative positions** moves the selection as one motif; turn it off to align each selected root separately. Nested groups remain intact. Edges exclude outline thickness and sketch styling; text, images and native shape labels use their layout boxes. Native freehand/highlight strokes, native hearts/clouds, dimensions, ambiguous legacy arcs, and invalid or oversized geometry disable the edge actions while eligible artwork can still use center alignment. Editable CAD heart/leaf clipart consists of Bézier curves and supports exact edges. Projection work is bounded across all selected leaves, and a failed placement rolls back as one operation.

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

## Rotate artwork and make circular copies

Open **Object → Transformations → Position, scale and rotate…**, then choose **Rotation / copies** in **Transformations**. This uses the same **Rotate / circular copies** controls as **Effects → Radial repeat…**; both entry points share the current settings.

Choose **Rotate selection** to move the existing artwork, or **Circular copies** to retain the original and create additional copies. Positive angles turn counterclockwise. The selected objects and groups move together as one motif.

Choose the **Rotation centre**:

| Choice | Pivot used |
| --- | --- |
| **Pick rotation centre** | The current Pick pivot, including a pivot dragged outside the selection. Changing the selection resets that pivot to the selection centre. |
| **Selection reference point** | One of nine reference points on the selection's page-axis geometry bounds. Outlines are excluded. |
| **Drawing origin** | The document's coordinate origin. |
| **Custom X/Y** | Explicit **Centre X** and **Centre Y** in the current document units, or pixels without configured units. These rotation-centre fields use positive Y upward, including in pixel mode. |

For **Circular copies**, enter **1–200 Additional copies** and choose **Evenly around a full circle** or **Fixed angle step**. Full-circle spacing includes the original exactly once: five additional copies produce six positions, 60° apart. Fixed-step copies must span less than a full turn. **Rotate copies with the pattern** rotates each copy around the pivot; turn it off to preserve each copy's orientation while its position travels around the circle. Upright copies need a pivot away from the motif centre to occupy distinct positions.

Use **Review placement** to inspect the bounds preview and generated-object count, then **Apply placement**. One Undo restores the whole operation. **Discard preview** clears the review without changing artwork. The preview shows selection bounds, so inspect actual path overlaps after applying. A changed drawing, selection, pivot or setting makes the review stale and requires another review. Locked artwork, read-only drawings, unfinished drawing gestures and invalid or oversized placements block the operation.

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

The **prior guide/snapping/clipart batch** passed **245 of 245 tests** across 15 focused suites. That run covered guide geometry and gestures, middle-guide construction, alignment, duplication, clipart insertion, vector round trips, panel continuity, and command wiring. The tests use the pinned native editor, its history manager, and React/DOM harnesses where interaction is involved. That batch's `tsc --noEmit --pretty false --incremental false` also completed without errors.

The current angle-bisector, rotation, angled-edge-alignment and centreline continuation passed **270 of 270 tests across 15 focused test files**. Coverage includes exact curve/conic support, true native-cubic X/Y limits, bisector geometry and atomic creation, live pivot/reference changes, draft-history protection, correspondence controls, fitted Bézier/SPLINE output, source preservation, native undo/redo, localization, and stale/read-only states. `tsc --noEmit --pretty false --incremental false` completed without errors.

The earlier rendered browser check was blocked before launch by a Chromium sandbox socket restriction. Actual browser appearance, scrolling, overlapping hit areas and hardware-pointer feel therefore still require a live application check. A production build and live deployment have not been verified for this continuation.
