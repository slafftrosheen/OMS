# CAD drafting in the shared OMS canvas

Idea boards and order canvases use the same CAD tools and document format. CAD shapes and page settings are included in the existing canvas snapshot, autosave and revision flows. No database migration or external CAD service is required.

## Finding the tools

The shared CAD docker has a **CAD task** selector: **Create geometry & text**, **Edit curves & shapes**, **Document & measurements**, and **Import / export DXF**. Only the selected task is visible; switching tasks retains drafts and prepared previews. File → DXF opens interchange, Layout → Document opens settings, F10 opens nodes, and Ctrl/Command+Q opens selected-text conversion or geometry conversion. Object → Arrange contains stacking, rotation, mirror, alignment and distribution commands.

## Compound curves and cutting direction

**Object → Combine** (Ctrl/Command+L in the idle canvas) replaces selected supported shapes with one compound curve. **Break apart** (Ctrl/Command+K) separates a compound into individual contour objects. The same buttons appear in Edit curves & shapes. Some browsers reserve Ctrl/Command+L or K; the Object menu and CAD buttons remain available. These commands are separate from Group/Ungroup and Weld: Combine retains every original path and cubic control; Weld computes a merged region. Even-odd nested paths become holes. Break apart also separates hole contours, which then act as independent solid regions if welded or offset separately.

Combine preserves a common fill rule, uses the last source's outline colour, and refuses a mixed selection of winding-based font outlines and even-odd CAD paths. Convert editable text to outlines first. Combining analytic circles/arcs uses the existing explicit 0.005 mm curve conversion. Existing Bézier controls are retained exactly. Both commands are one undo operation, retain physical coordinates through rotated parent groups, refuse bound/locked/read-only/protected sources, and obey the existing contour and allocation limits.

In the node editor, **Reverse contour direction** swaps incoming/outgoing handles and reverses traversal without moving the cut geometry. Closed contours keep their original seam. **Set node as start** rotates the node order of a closed contour to the chosen node, preserving all segments. Reversing a single font contour can change non-zero winding holes in subsequent shaping; review that result. These controls set geometry traversal only, not CAM lead-ins or machine cut order.

## Operator flow

1. Open **Layout → Document units & scale**, or the **CAD** docker. Select mm, cm, m or inches; set drawing scale and decimal places, then **Apply settings**. An old drawing stays in pixels until explicitly configured.
2. Use **Exact geometry** to create a rectangle, ellipse, circle, line by length/angle, circular arc, or a polyline/polygon from X,Y coordinates. Rectangles and ellipses use their lower-left position before rotation; circles and arcs use their centre. Positive angles are counterclockwise.
3. Use **CAD polyline** in the toolbox for click-by-click contours. Enter or double-click finishes an open path; clicking the first vertex closes it. Shift constrains the next segment to 45-degree increments, Backspace removes a vertex, Escape cancels the entire new path. Snap uses exact stored endpoints, ellipse quadrants and centres; Ctrl temporarily reverses the Snap preference. Shift's angle constraint takes priority. Each path is one undo step.
4. Pick an object and use the property bar's nine reference points, X/Y, width/height, rotation and **Keep proportions**. X increases right and Y increases up. Width/height refer to the object's local geometry; horizontal/vertical dimension annotations measure its page-axis extents. Arcs and dimensions resize proportionally. Arrow keys nudge by the saved physical distance, Shift multiplies by ten, Ctrl/Command divides by ten. These shortcuts operate only in the idle drawing viewport, not inside form fields.
5. In **Selected path vertices**, edit precise X,Y pairs or open/close the contour. Native straight lines can be converted to editable contours; the conversion replaces the original in one undo step, avoiding duplicated cut paths. Lines with bindings to other objects are refused. Use **Selected arc** to edit centre, radius and angles.
6. In **Measure & calibrate**, add horizontal, vertical or aligned dimension annotations. They are independent endpoint snapshots, not associative constraints: changing the source geometry does not move their endpoints. Their labels use current document units/scale. Recreate annotations after changing the source. Aligned dimensions use the first/last CAD path vertices, otherwise the page-bounds diagonal.
7. For an existing drawing, select a known object and calibrate using its local width or height. Calibration changes the document's physical scale without moving objects. **Origin at selection lower left** changes the coordinate origin without moving geometry.
8. Use **CAD Bézier**: click to add a corner, drag from the new node to create symmetric handles, Shift constrains handle direction to 45 degrees. Enter/double-click finishes, the first node closes, Backspace removes a node, Escape cancels the gesture. **F10** opens the shared node editor. Choose a contour/node, edit physical X/Y and incoming/outgoing handle vectors, switch corner/smooth/symmetric modes, split a segment exactly, remove nodes, or open/close a contour. Smooth/symmetric numeric edits align to the outgoing handle. Direct handles are shown for compounds of up to 128 nodes; larger compounds use the indexed editor. **Convert selected geometry to curves** replaces supported lines/polygons/ellipses/arcs in one undo step; circular geometry uses a 0.005 mm approximation only when explicitly converted.
9. **Text to outlines** creates real font contours, including counters, using bundled fonts or a local TTF/OTF/WOFF/WOFF2 file. New text has physical outline height and lower-left coordinates. **Ctrl/Command+Q** opens conversion review for selected text, retaining its current bundled font and layout. Review spacing and wrapping before replacing text; browser text layout can differ from font shaping. Retaining source text is the default. The resulting curves persist independently of the font; editable source text and font files are not needed for later DXF output.
10. In **Weld, trim, intersect & offset**, select closed objects. Weld unions their regions, Intersect keeps their common region, Trim subtracts all other selected objects from the explicitly chosen target. Offset expands for positive distance and insets for negative distance, with round/miter/square joins. Results use polygonal contours with a user-set physical tolerance (0.001–1 mm, default 0.01). Holes survive these operations. Preview geometry, dimensions and source removal counts before applying; retaining sources can create overlapping cut paths. An empty result leaves sources untouched.
11. **Import CAD · DXF** reads an ASCII DXF locally, reviews units, physical size and unsupported entities, then applies one undoable import. A unitless or unknown-unit file requires an explicit source unit. Keep source coordinates or align the drawing’s lower-left to the document origin. Review and acknowledge any omissions. Editing the document or import inputs invalidates the preview. CDR/DWG must first be exported as DXF in a compatible application.
12. Open **DXF export**, choose selected objects or the entire page, select exact SPLINE or flattened Bézier polylines, and **Review export**. Flattened output has an explicit 0.001–1 mm tolerance for downstream software that cannot read SPLINE; circles/ellipses/arcs retain their own analytic DXF types. Check the entity count, open/closed contour counts, physical extents and omissions. Any omitted objects require explicit acknowledgment before download. An empty export is blocked. Editing the drawing, selection or settings invalidates the report until reviewed again.

## Units and accuracy

Settings are stored in the current page's `meta.omsCad` (`version: 1`). At scale 1:1, 96 document pixels represent 25.4 mm. At scale 1:N, one document pixel represents `25.4 / 96 × N` mm. Screen DPI, zoom and PNG export settings do not enter this conversion. Changing the display unit preserves physical geometry and nudge distance; changing scale deliberately recalibrates physical size. Display precision does not round the stored geometry or DXF.

CAD rectangles/paths and ellipses use custom geometry so small parts are not clamped to native drawing shapes' one-pixel minimum. Numeric edits that cannot represent the requested size roll back rather than report a different dimension as success. Arc, ellipse and Bézier measurement bounds are analytic. Native selection envelopes for asymmetric paths/arcs/curves are rectangular to keep rotated flips and group scaling stable; physical dimension annotations and DXF extents use the actual geometry.

`cad-transforms.ts` corrects tldraw 2.4's unaligned mirror rotation for CAD shapes inside rotated parents, including selection-handle mirrors. It retains native resize/history and is removed on editor cleanup. Recheck its nested-parent regression when upgrading tldraw.

## DXF contract

DXF is ASCII R2000 (`AC1015`), with `$INSUNITS = 4` (millimetres), Cartesian Y-up coordinates, and full-size model-space geometry. Export has no view padding or zoom scaling. A 1,200 × 600 mm rectangle at drawing scale 1:10 exports as 1,200 × 600 mm; choosing inches for display does not change that result.

| OMS geometry | DXF entity |
| --- | --- |
| Two-point open CAD path or native straight line | `LINE` |
| Multi-point open/closed CAD contour or supported native polygon | `LWPOLYLINE`, with the closed flag when appropriate |
| Circle | `CIRCLE` |
| Ellipse, including rotation | `ELLIPSE` with exact major axis and axis ratio |
| Circular arc | `ARC` with counterclockwise start/end angles |
| Bézier contour / outlined glyph | Exact degree-3 `SPLINE` with a clamped knot vector; optional tolerance-bounded `LWPOLYLINE` |

Closed contours are on `OMS_CLOSED`; open paths/arcs are on `OMS_OPEN`. These are geometry classifications, not machine cutting instructions or toolpath ordering. Groups are expanded to their contents.

Editable text, notes, dimension annotations, native freehand/spline curves, arrows, document/image viewers and order forms are not cut geometry and appear in the omission report. A native polygon containing text is also omitted. Clipped frame content is conservatively refused rather than exporting unseen geometry. Convert editable text to outlines for cut output. OMS Bézier shapes export exactly by default; approximation is an explicit export option. Circles, ellipses and arcs remain analytic.

Limits: 2–256 vertices per simple CAD path, at least three for closed paths; Bézier compounds and operation/import previews allow up to 512 contours / 4,096 nodes, with at least two nodes per contour; up to 500 text characters / 20 lines, 8 MiB font or DXF files; finite local/page coordinates within the editor's one-million-coordinate range; drawing scale 0.001–10,000; export up to 4,000 entities, 100,000 total vertices and 16 MB. Degenerate contours and non-finite geometry are refused. Weld/trim/intersect/offset normalize closed regions with even-odd holes per ordinary compound, non-zero winding for font outlines (so overlapping glyphs stay solid), and non-zero union across objects. Clipper uses a 0.0001 mm integer grid with bounded curve subdivision; this is included in the tolerance budget. CAD import is limited to 4,000 expanded entity visits / 2,000 resulting objects and the preview node budget. Nesting, automatic toolpath compensation and machine-specific lead-ins are not generated.

## DXF import coverage

| DXF input | Result |
| --- | --- |
| LINE, zero-width LWPOLYLINE and 2D POLYLINE | Editable open/closed contours |
| Polyline bulges | Cubic Bézier approximation within 0.002 mm, disclosed in review |
| CIRCLE, ARC, full ELLIPSE | Native analytic CAD objects; exact bounds and later export |
| Partial ELLIPSE | Cubic approximation within 0.002 mm, disclosed in review |
| Clamped non-rational SPLINE, degree 1–3 | Exact Bézier conversion by knot insertion |
| INSERT | Nested blocks with base-point, rotation, equal-magnitude X/Y scale and reflection; recursion is bounded |
| Text, HATCH, dimensions, 3D/tilted entities, non-unit rational weights, periodic/higher-degree/unclamped splines, variable-width polylines, nonuniform/array INSERT, paper-space/invisible entities | Explicit omission report; no silent fallback to a bounding box or centerline |

`$INSUNITS` recognizes mm, cm, m, inches, feet, kilometres, mils, yards and micrometres. The override can specify mm/cm/m/in. Binary DXF, CDR and DWG are not parsed. Hidden/frozen layers are omitted. Import does not preserve the complete original CAD document, layouts, constraints, text or layer structure; it creates editable production geometry in the existing OMS snapshot. Separate DXF contours remain separate objects: for a part with nested holes, select its contours and use **Combine** to make a compound before offsetting; welding separate objects intentionally unions them as solids.

## Verification and remaining work

The CAD unit suite exercises the native schema store round trip and native resize/mirror implementations, including rotated parents, unit conversion, calibration, reference points, exact small geometry, endpoint snapping, drawing history, permissions, mixed-case native point ordering and DXF omission/limit handling. Compound tests independently parse DXF before and after splitting, compare cubic controls under rotated parents, and check traversal reversal, closed seams, undo and rejected mutations. Browser cases are provided for both hosts: task draft retention, compound operations, interactive contours, physical unit changes, text outlines, node splitting, import/offset previews, DXF downloads and stale-review guards. They have not run successfully in this hosted environment.

```sh
node packages/vitest/bin.js tests/unit/cad-drawing.test.ts tests/unit/cad-advanced.test.ts tests/unit/cad-compound.test.ts
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
node --import tsx scripts/qa/export-cad-fixture.ts
# Optional independent QA dependency, not needed by OMS at runtime:
python -m pip install ezdxf==1.4.4
python scripts/qa/verify-cad-fixture.py
```

The independent ezdxf reader accepted the reference file with zero audit errors or repairs and verified its panel size, units, circle, rotated ellipse, arc, and open/closed cubic SPLINE evaluation. Unit tests also parse exported curves with the independent dxf-parser library, read real bundled WOFF2 glyphs (Latvian and Cyrillic), preserve counters, verify boolean areas and positive/negative offsets, and exercise import omissions, unit overrides, stale plans and native transformed handles. Browser execution in the hosted workspace remains blocked before page load by Chromium's `socket() Operation not permitted`; run the included cases locally. No production cutter/router or the team's actual downstream CAD/CAM application was available for validation.

This release adds text outlines, Bézier editing, weld/trim/intersect, offsets and DXF import to measured drafting. It does not yet replace the complete CorelDRAW workflow: native CDR/DWG intake, arbitrary rational/periodic NURBS, full layer/layout interchange, fillet/chamfer tools, text-on-path, associative dimensions and cutter-specific CAM remain outside this implementation. Before retiring CorelDRAW, validate representative production files in the team's actual CAD/CAM and machine workflow.

References: [CorelDRAW drawing scale](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-Drawing-scale.html), [CorelDRAW object positioning](https://help.coreldraw.com/CorelDRAW/540111192/Documentation-Mac/CorelDRAW-en/CorelDRAW-Position-objects.html), [Autodesk DXF header variables](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm), [LWPOLYLINE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm), [ELLIPSE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-107CB04F-AD4D-4D2F-8EC9-AC90888063AB.htm).

Runtime dependencies: pinned `fontkit@2.0.4` (lazy-loaded for local outlines) and `clipper-lib@6.4.2`; `dxf-parser@1.1.2` is a development-only independent reader. After pulling, run `npm ci`, the validation gates and the normal OMS rebuild/restart procedure. No DB migration or server AI configuration change is required.

Geometry references: [fontkit](https://github.com/foliojs/fontkit), [Clipper](https://sourceforge.net/p/jsclipper/wiki/documentation/), [Autodesk SPLINE](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm).

Compound workflow references: [CorelDRAW Combine objects](https://product.corel.com/help/CorelDRAW/540111137/Main/EN/Documentation/CorelDRAW-Combine-objects.html), [CorelDRAW shortcut reference](https://product.corel.com/help/CorelDRAW/540111137/Main/EN/Quick-Reference-Card/CorelDRAW-Graphics-Suite-2020-shortcuts.pdf).
