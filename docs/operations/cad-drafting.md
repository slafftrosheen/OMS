# CAD drafting in the shared OMS canvas

Idea boards and order canvases use the same CAD tools and document format. CAD shapes and page settings are included in the existing canvas snapshot, autosave and revision flows. No database migration or external CAD service is required.

## Finding the tools

The left toolbox groups curves and shapes into flyouts. **Arc · three points** is in Curves; **Circle · three points** is in Shapes. Both are also available from the **Measure** docker. For an arc, click its start, a point along the desired arc, and its end. The middle point chooses the short or long arc. For a circle, click three points on its circumference. Numbered construction guides follow object snapping; Backspace removes the last point and Escape cancels the whole gesture. Coincident, collinear and out-of-range points cannot complete a shape. Guides are transient and never saved/exported. The resulting native arcs/circles remain analytic in DXF output.

Selected arcs have endpoint-angle handles and a middle radius handle. Dragging an endpoint retains the centre and radius; Shift snaps its angle to 15° steps. Dragging the middle handle changes radius. Bounding-box resize/rotation targets are hidden for a single arc so they cannot intercept those handles. Numeric width/height/rotation in the property bar and Arrange commands remain available.

While **CAD polyline** is active, the property bar provides **Absolute X/Y**, **Offset ΔX/ΔY**, and **Length / angle** entry. Add the first point using absolute coordinates or the mouse; offsets and polar segments start at the last committed vertex. Typed points use the saved origin, unit and scale, with Y increasing up and positive angles counterclockwise. On uncalibrated pages the fields explicitly show px and still use Y-up. Numeric input bypasses snapping so the requested coordinates remain exact. Enter in either field adds a point; **Back**, **Finish**, and **Close contour** share the mouse tool's single undo transaction. Pointer movement shows the pending segment's length and angle. An explicit final point equal to the start is removed when closing, leaving one seam node. The draft controls are transient and never enter saved document data.

The **Text** docker offers **New outline lettering…**, including when no text is selected. An uncalibrated document opens units first and continues into lettering after **Apply settings**. New outlines support left/centre/right multiline alignment, letter spacing from −50 to 200 percent of the font em, and baseline spacing from 0.5 to 5 em. Alignment uses shaped advances, including spaces. Tracking retains ligatures and does not insert spacing before zero-advance marks; connected scripts and negative spacing still need visual review. **Outline height** is the complete ink block, so changing line spacing redistributes the block within that height. Font, text, alignment or spacing changes invalidate an existing preview. The result is editable curves with the source text/font/layout retained as metadata, not live editable typography. For selected native text, **Convert to curves** first applies the Text docker's pending content, font, size and alignment, then opens the selected-text outline review.

**Measure** reports selection extents, total supported curve length, open/closed contour counts, and radius/diameter/sweep for a single circle or arc. Group descendants are counted once, including hole contours. Circles, arcs and straight segments use analytic lengths; Bézier/ellipse lengths show **≈** and target a total numerical error of 0.001 mm (0.001 px on uncalibrated pages). This does not include the fitting error of imported/traced curves. A work limit bounds calculation time; objects exceeding it are excluded and counted alongside unsupported objects. Partially clipped artwork, rasters, live text, forms and annotations are excluded. Fully contained frame children can be measured. Length is a geometry measurement, not CAM travel, kerf compensation or automatic bend allowance.

The shared CAD docker has a **CAD task** selector: **Create geometry & text**, **Edit curves & shapes**, **Document & measurements**, and **Import / export DXF**. Only the selected task is visible; switching tasks retains drafts and prepared previews. File → DXF opens interchange, Layout → Document opens settings, F10 opens nodes, and Ctrl/Command+Q opens selected-text conversion or geometry conversion. Object → Arrange contains stacking, rotation, mirror, alignment and distribution commands.

## Circular outline lettering

Open **Text → New outline lettering…** and choose **Baseline → Circular arc**. Radius uses the current drawing units; **Centre X/Y** positions the circle centre, and **Straight outline height** sizes the unbent ink before placing letters. Each shaped glyph rotates onto the baseline without warping its contours or Bézier controls. The resulting bounding-box height is generally different from the straight height. Radius is never changed automatically to fit the text.

**Reference angle** uses 0° to the right and 90° upward. **Anchor at reference angle** places the start, centre or end of the complete shaped text advance there, including spaces and tracking. Circular text defaults to the centre anchor. For a badge, use clockwise at 90° for the top and counterclockwise at −90° for readable lettering along the bottom. Both runs can share the same centre and radius. Normal line alignment and circular anchoring keep separate drafts.

The preview reports the actual result bounds, baseline radius and occupied angle. Only one line is supported, and a run exceeding one complete turn is rejected; increase the radius or reduce the height, spacing or text. Ligatures remain shaped as one glyph, and zero-advance combining marks rotate with their preceding base glyph. This does not preserve every cursive connection, prevent letter overlap or perform optical kerning. Review the counters, joins and spacing before production, particularly on tight radii or with negative tracking. Vertical or backward-advance font layouts are refused.

Apply creates editable curves in one undo operation using the existing save and export flows. The source text, font, layout and physical arc parameters remain metadata; this is not live text attached to an editable guide path. Selected native text conversion remains unchanged. Arbitrary guide paths and automatic reflow after editing the radius are outside this addition. Changes to inputs, selection, document units or geometry invalidate the preview; read-only, coordinate, capacity and persistence limits still apply.

## Precise rotation and circular copies

**Arrange → Rotate / circular copies** rotates a selection around its centre, the document origin, or a custom X/Y point. Coordinates follow the saved drawing unit, origin and scale; uncalibrated documents explicitly use px with Y up. Positive angles turn counterclockwise. The operation preserves native geometry, text, images, curve controls and group ancestry rather than flattening them.

Choose **Circular copies** for additional copies of the complete selection. **Evenly around a full circle** uses `360 / (copies + 1)` so the original is included once, with no extra copy at 360°. **Fixed angle step** supports clockwise or counterclockwise patterns spanning less than one turn. **Rotate copies with the pattern** rotates each motif; turning it off translates the complete selection by the movement of its centre, preserving every member's orientation and relative spacing. Upright copies with a coincident pivot are rejected because they would all occupy the original position.

**Review placement** shows the original and result selection bounds, the pivot, angle step and generated object count (including group children). It is a placement preview, not a cut-path or collision review. Any input, selection, document or settings change invalidates the review. Apply is one undo step; partial duplication, rejected updates or payload overflow roll back. Up to 200 additional motifs and 500 generated shapes are allowed, within the existing page, coordinate and document-size limits. Forms, production containers, locked descendants, bound objects and children with frame clipping are rejected. No machine toolpaths, nesting or overlap removal are generated.

## Aligning and distributing artwork

The shared **Arrange** docker starts with **Align objects**. Choose the selection bounds or a named selected object as the reference, then align left/centre/right or top/middle/bottom. A named reference stays fixed. Alignment uses actual page-axis CAD geometry bounds, including analytic curve and ellipse extrema; outline thickness is excluded. Groups count as one item, with bounds taken from their descendants. Selecting a group and one of its descendants does not move that descendant twice.

**Distribute objects** offers three modes:

- **Equal gaps** spaces edges evenly between the outside objects, retaining those objects. At least three items are required. If there is insufficient room, the command refuses rather than creating negative gaps.
- **Equal centres** spaces centres evenly and retains the two extreme centres. Different object widths/heights can still overlap; this is not nesting or collision checking.
- **Exact gap** accepts a nonnegative distance in document units, or px before calibration. Keep the left/top item, right/bottom item, or a named selected item fixed. The other items are spaced outward on either side of that anchor in their existing order. Zero creates touching bounds. The input retains its canvas distance when document units/scale change, consistently with the existing repeat-grid controls.

Horizontal and vertical operations only translate objects. Geometry, rotation, groups, text and appearance remain intact, and the edit is one undo step. Coincident positions sort by stable object ID. An already correct arrangement does not create an empty history entry. No automatic scaling, kerf allowance, glyph kerning or overlap removal is performed.

Locks, read-only mode, protected forms and their descendants block mutation. Frames, production containers, frame children, bound objects and clipped artwork are excluded. Supported groups cannot contain these excluded objects. Coordinate, object-count and persistence limits are checked; refused or partially applied native movements roll back together. Changing selection removes an unavailable reference/anchor from the controls.

## Compound curves and cutting direction

**Object → Combine** (Ctrl/Command+L in the idle canvas) replaces selected supported shapes with one compound curve. **Break apart** (Ctrl/Command+K) separates a compound into individual contour objects. The same buttons appear in Edit curves & shapes. Some browsers reserve Ctrl/Command+L or K; the Object menu and CAD buttons remain available. These commands are separate from Group/Ungroup and Weld: Combine retains every original path and cubic control; Weld computes a merged region. Even-odd nested paths become holes. Break apart also separates hole contours, which then act as independent solid regions if welded or offset separately.

Combine preserves a common fill rule, uses the last source's outline colour, and refuses a mixed selection of winding-based font outlines and even-odd CAD paths. Convert editable text to outlines first. Combining analytic circles/arcs uses the existing explicit 0.005 mm curve conversion. Existing Bézier controls are retained exactly. Both commands are one undo operation, retain physical coordinates through rotated parent groups, refuse bound/locked/read-only/protected sources, and obey the existing contour and allocation limits.

In the node editor, **Reverse contour direction** swaps incoming/outgoing handles and reverses traversal without moving the cut geometry. Closed contours keep their original seam. **Set node as start** rotates the node order of a closed contour to the chosen node, preserving all segments. Reversing a single font contour can change non-zero winding holes in subsequent shaping; review that result. These controls set geometry traversal only, not CAM lead-ins or machine cut order.

## Joining, breaking and changing segments

**Object → Join open curves** opens the connection review in Edit curves & shapes. Select two supported open curves, or one compound containing exactly two open contours. Closed contours and mixed font/even-odd fill rules are refused. The endpoint selector offers the nearest pair or an explicit start/end combination in source selection order. Preview reports the actual endpoint gap in millimetres, independently of document display units and scale.

- **Add straight bridge** retains every original cubic segment. It adds a straight connection between the chosen endpoints; exactly coincident endpoints are merged without an extra zero-length segment.
- **Merge endpoints** requires a user-set maximum gap of 0.001–1 mm. Each endpoint moves to the midpoint by half the gap. Adjacent absolute control points stay fixed; the two neighbouring curves can change within that endpoint movement. Gaps above tolerance are refused.

Applying replaces the source objects in one undo operation. Selection/document/input changes invalidate the preview; locked, read-only, bound and protected form objects cannot be replaced. Source arcs use the existing 0.005 mm cubic conversion and disclose it. The output is always an open curve; joining does not auto-close coincident outer endpoints or generate CAM lead-ins.

The F10 node editor separates **Segment editing** from **Contour editing**. **Break curve at node** opens a closed contour at the chosen node while retaining its closing cubic, or splits an open contour at an interior node into two paths within the same object. Use Break apart for independent objects, or Join to reconnect the two paths. This adds one node and obeys the existing node/contour limits.

Closing a broken contour merges its exactly coincident seam endpoints and retains the incoming/outgoing cubic controls, without adding a zero-length closing segment. Merely nearby endpoints are not snapped. Closing other open contours adds a closing segment; it does not apply the Join merge tolerance.

**To straight segment** removes only the outgoing/incoming controls of the selected segment; adjacent segments retain their controls. **To Bézier segment** adds one-third/two-thirds controls to a straight segment, preserving its line geometry and making its handles draggable. It does not straighten an existing Bézier curve. For an open contour, the last node has no outgoing segment. Node operations are undoable and respect locks/read-only state.

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

## Node and segment inspection

**F10 → Bézier nodes** follows a node or control handle clicked on the canvas. A ring and `contour:node` label identify the current node and a highlight marks its outgoing segment. The contour/node selectors work in both directions, including compounds above the 128-node direct-handle limit. Collapsed control handles no longer cover the anchor; use **To Bézier segment** or numeric handle offsets to add controls to a straight segment. Inspection state is editor-local and is neither saved nor exported.

**Shape / nodes (F10)** switches Bézier shapes from their bounding-box resize/rotation targets to node handles, avoiding overlapping hit targets at corners. **Select / move (V)** or Escape returns to normal object selection. Focusing the numeric node editor also enables node inspection. Normal object selection hides the control guides.

For a straight outgoing segment, **Segment length / Direction → Move segment end** fixes the selected node and moves the next node in document units, including inside rotated groups. Positive angles turn counterclockwise: 0° right, 90° up. The next node's relative controls move with it, so its adjoining segment changes too. The closing segment moves the first node. Enter in these fields applies the segment edit; each change is one undo step.

**Split position (%)** accepts values strictly between 0 and 100. Straight segments split by length fraction and remain straight. Bézier segments use exact De Casteljau subdivision at parameter `t = percentage / 100`, not arc-length percentage. Geometry is preserved and the inserted node is selected. Existing symmetric endpoints become smooth because subdivision shortens only one of their handles. Enter in the split field applies the split. Invalid inputs, node limits, locks, read-only state and protected order-form ancestry block mutation.

## Selected-node fillets and chamfers

In **Shape / nodes (F10)** choose a corner, then **Fillet / chamfer this node…**. The corner panel switches to **Selected node** and displays its `contour:node` target. Enter the radius, or the equal setback along each adjoining edge, in the current document unit. Unit changes preserve the physical amount. Preview shows a close-up: dashed grey is the original, blue is the result. Reported bounds describe the complete object. Changing the amount, mode, selected node, document or selection invalidates the review.

The selected corner must join two straight segments. Open-path interior nodes, convex and concave vertices, closed seams and compound contours are supported; distant Bézier segments remain unchanged. Applying edits the same object in place, retaining its group, rotation, opacity, paint, name, fill rule and contour order, in one undo step. Existing fillets survive subsequent edits at other eligible corners. The incoming tangent node becomes the active node after application.

Circular fillets use tangent cubic Bézier segments with a maximum nominal radial deviation of **0.005 mm**, disclosed in review. Segment count increases for large radii and sharp turns. Oversized radii/setbacks are rejected without clamping. The entire corner edit triangle must be clear of other segments in the same compound; bounded flattening includes a clearance margin for curved neighbours. This conservative check can reject a close feature even when the final arc alone might fit. Separate objects are not collision-checked.

Endpoints, straight-through/reversing nodes, curved adjacent segments, bound objects, clips, gradients and raster fills remain unsupported for this operation. Locks, read-only state, protected order-form ancestry, node limits and the save budget block mutation. **All corners** retains the existing convex closed polygon operation; it does not apply the selected-node workflow to every vertex of a concave or curved contour.

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

Start operator acceptance with [the test sequence](canvas-acceptance.md) and the committed [production reference DXF](../../tests/fixtures/cad/production-reference.dxf). The round-trip regression imports that file at mm 1:1, mm 1:10 and inch display 1:10, saves through the order snapshot preparation and native serialized tldraw store, then independently compares every exported entity's geometry. It checks seven entities, four closed/three open contours and 1220 × 600 mm overall extents. This complements the independent ezdxf audit; it does not validate a physical machine.

The CAD unit suite exercises the native schema store round trip and native resize/mirror implementations, including rotated parents, unit conversion, calibration, reference points, exact small geometry, endpoint snapping, drawing history, permissions, mixed-case native point ordering and DXF omission/limit handling. Join tests check all endpoint orientations, transformed control points, physical gap limits, exact break/rejoin round trips, open-seam DXF output and protected mutations. Compound tests independently parse DXF before and after splitting, compare cubic controls under rotated parents, and check traversal reversal, closed seams, undo and rejected mutations. Browser cases are provided for both hosts: task draft retention, compound operations, break/join previews, interactive contours, physical unit changes, text outlines, node splitting, import/offset previews, DXF downloads and stale-review guards. They have not run successfully in this hosted environment.

```sh
node packages/vitest/bin.js tests/unit/cad-drawing.test.ts tests/unit/cad-advanced.test.ts tests/unit/cad-compound.test.ts tests/unit/cad-join.test.ts
node packages/vitest/bin.js tests/unit/cad-precision-entry.test.ts
node packages/vitest/bin.js tests/unit/cad-node-editing.test.ts
node packages/vitest/bin.js tests/unit/cad-node-corners.test.ts
node packages/vitest/bin.js tests/unit/drawing-radial.test.ts
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
node --import tsx scripts/qa/export-cad-fixture.ts
# Optional independent QA dependency, not needed by OMS at runtime:
python -m pip install ezdxf==1.4.4
python scripts/qa/verify-cad-fixture.py
```

The independent ezdxf reader accepted the reference file with zero audit errors or repairs and verified its panel size, units, circle, rotated ellipse, arc, and open/closed cubic SPLINE evaluation. Unit tests also parse exported curves with the independent dxf-parser library, read real bundled WOFF2 glyphs (Latvian and Cyrillic), preserve counters, verify boolean areas and positive/negative offsets, and exercise import omissions, unit overrides, stale plans and native transformed handles. Browser execution in the hosted workspace remains blocked before page load by Chromium's `socket() Operation not permitted`; run the included cases locally. No production cutter/router or the team's actual downstream CAD/CAM application was available for validation.

This release adds text outlines, Bézier editing, weld/trim/intersect, offsets and DXF import to measured drafting. It does not yet replace the complete CorelDRAW workflow: native CDR/DWG intake, arbitrary rational/periodic NURBS, full layer/layout interchange, fillets between curved segments, text on arbitrary guide paths, associative dimensions and cutter-specific CAM remain outside this implementation. Before retiring CorelDRAW, validate representative production files in the team's actual CAD/CAM and machine workflow.

References: [CorelDRAW drawing scale](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-Drawing-scale.html), [CorelDRAW object positioning](https://help.coreldraw.com/CorelDRAW/540111192/Documentation-Mac/CorelDRAW-en/CorelDRAW-Position-objects.html), [Autodesk DXF header variables](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm), [LWPOLYLINE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm), [ELLIPSE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-107CB04F-AD4D-4D2F-8EC9-AC90888063AB.htm).

Runtime dependencies: pinned `fontkit@2.0.4` (lazy-loaded for local outlines) and `clipper-lib@6.4.2`; `dxf-parser@1.1.2` is a development-only independent reader. After pulling, run `npm ci`, the validation gates and the normal OMS rebuild/restart procedure. No DB migration or server AI configuration change is required.

Geometry references: [fontkit](https://github.com/foliojs/fontkit), [Clipper](https://sourceforge.net/p/jsclipper/wiki/documentation/), [Autodesk SPLINE](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm).

Compound workflow references: [CorelDRAW Combine objects](https://product.corel.com/help/CorelDRAW/540111137/Main/EN/Documentation/CorelDRAW-Combine-objects.html), [CorelDRAW shortcut reference](https://product.corel.com/help/CorelDRAW/540111137/Main/EN/Quick-Reference-Card/CorelDRAW-Graphics-Suite-2020-shortcuts.pdf).

## Order attachment previews and production pockets

DXF attachments have a drawing preview in the new-order form and canvas document cards. Previewing does not import editable geometry or replace the original file. Previews accept bounded ASCII DXF up to 8 MiB and show supported geometry with a notice for omitted entities. Unitless files remain previewable without claiming a physical size; editable CAD import still requires choosing source units. Flat legacy polylines with 3D flags and independently scaled block geometry are supported. Out-of-plane geometry and the other unsupported cases described above remain reported.

Choose Laser, CNC, Bender or Visuals beside a queued attachment before saving, or add files from the corresponding canvas pocket. Pocket lists use the canonical attachment list; saved canvas placement and new-file pocket assignments survive draft saving. Historical general attachments appear in Visuals unless their saved canvas document assigns another pocket. Existing named production frames remain compatible without a database migration. Downloads use the authenticated file endpoint and existing order-access policies, including for users who can read an order but cannot edit it. Failed list reads display a retry action without retaining download links from an earlier response.
