# CAD drafting in the shared OMS canvas

Idea boards and order canvases use the same CAD tools and document format. CAD shapes and page settings are included in the existing canvas snapshot, autosave and revision flows. No database migration or external CAD service is required.

## Operator flow

1. Open **Layout → Document units & scale**, or the **CAD** docker. Select mm, cm, m or inches; set drawing scale and decimal places, then **Apply settings**. An old drawing stays in pixels until explicitly configured.
2. Use **Exact geometry** to create a rectangle, ellipse, circle, line by length/angle, circular arc, or a polyline/polygon from X,Y coordinates. Rectangles and ellipses use their lower-left position before rotation; circles and arcs use their centre. Positive angles are counterclockwise.
3. Use **CAD polyline** in the toolbox for click-by-click contours. Enter or double-click finishes an open path; clicking the first vertex closes it. Shift constrains the next segment to 45-degree increments, Backspace removes a vertex, Escape cancels the entire new path. Snap uses exact stored endpoints, ellipse quadrants and centres; Ctrl temporarily reverses the Snap preference. Shift's angle constraint takes priority. Each path is one undo step.
4. Pick an object and use the property bar's nine reference points, X/Y, width/height, rotation and **Keep proportions**. X increases right and Y increases up. Width/height refer to the object's local geometry; horizontal/vertical dimension annotations measure its page-axis extents. Arcs and dimensions resize proportionally. Arrow keys nudge by the saved physical distance, Shift multiplies by ten, Ctrl/Command divides by ten. These shortcuts operate only in the idle drawing viewport, not inside form fields.
5. In **Selected path vertices**, edit precise X,Y pairs or open/close the contour. Native straight lines can be converted to editable contours; the conversion replaces the original in one undo step, avoiding duplicated cut paths. Lines with bindings to other objects are refused. Use **Selected arc** to edit centre, radius and angles.
6. In **Measure & calibrate**, add horizontal, vertical or aligned dimension annotations. They are independent endpoint snapshots, not associative constraints: changing the source geometry does not move their endpoints. Their labels use current document units/scale. Recreate annotations after changing the source. Aligned dimensions use the first/last CAD path vertices, otherwise the page-bounds diagonal.
7. For an existing drawing, select a known object and calibrate using its local width or height. Calibration changes the document's physical scale without moving objects. **Origin at selection lower left** changes the coordinate origin without moving geometry.
8. Open **DXF export**, choose selected objects or the entire page, and **Review export**. Check the entity count, open/closed contour counts, physical extents and omissions. Any omitted objects require explicit acknowledgment before download. An empty export is blocked. Editing the drawing, selection or settings invalidates the report until reviewed again.

## Units and accuracy

Settings are stored in the current page's `meta.omsCad` (`version: 1`). At scale 1:1, 96 document pixels represent 25.4 mm. At scale 1:N, one document pixel represents `25.4 / 96 × N` mm. Screen DPI, zoom and PNG export settings do not enter this conversion. Changing the display unit preserves physical geometry and nudge distance; changing scale deliberately recalibrates physical size. Display precision does not round the stored geometry or DXF.

CAD rectangles/paths and ellipses use custom geometry so small parts are not clamped to native drawing shapes' one-pixel minimum. Numeric edits that cannot represent the requested size roll back rather than report a different dimension as success. Arc and ellipse measurement bounds are analytic. Native selection envelopes for asymmetric paths/arcs are rectangular to keep rotated flips and group scaling stable; physical dimension annotations and DXF extents use the actual geometry.

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

Closed contours are on `OMS_CLOSED`; open paths/arcs are on `OMS_OPEN`. These are geometry classifications, not machine cutting instructions or toolpath ordering. Groups are expanded to their contents.

Text, notes, dimension annotations, freehand/spline curves, arrows, document/image viewers and order forms are not cut geometry and appear in the omission report. A native polygon containing text is also omitted. Clipped frame content is conservatively refused rather than exporting unseen geometry. Curves are never silently replaced by coarse polygons; circles, ellipses and arcs remain analytic.

Limits: 2–256 vertices per editable CAD contour, at least three for closed contours; finite local/page coordinates within the editor's one-million-coordinate range; drawing scale 0.001–10,000; export up to 4,000 entities, 100,000 total vertices and 16 MB. Degenerate contours and non-finite geometry are refused. This is not a topology/healing engine: self-intersections, overlapping independent paths, cutter compensation, nesting and machine-specific lead-ins are not resolved automatically.

## Verification and remaining work

The CAD unit suite exercises the native schema store round trip and native resize/mirror implementations, including rotated parents, unit conversion, calibration, reference points, exact small geometry, endpoint snapping, drawing history, permissions, mixed-case native point ordering and DXF omission/limit handling. Browser cases cover both hosts, interactive contours, physical unit changes, DXF downloads and stale-review guards.

```sh
node packages/vitest/bin.js tests/unit/cad-drawing.test.ts
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
node --import tsx scripts/qa/export-cad-fixture.ts
# Optional independent QA dependency, not needed by OMS at runtime:
python -m pip install ezdxf==1.4.4
python scripts/qa/verify-cad-fixture.py
```

The independent ezdxf reader accepted the reference file with zero audit errors or repairs and verified its panel size, units, circle, rotated ellipse and arc. Browser execution in the hosted workspace remains blocked before page load by Chromium's `socket() Operation not permitted`; run the included cases locally. No production cutter/router or the team's actual downstream CAD/CAM application was available for validation.

This release supports measured contour drafting and DXF export. It does not yet replace the complete CorelDRAW workflow: CDR/DXF import, font-to-outline conversion, arbitrary Bézier editing, weld/trim/intersect, offsets/fillets and associative dimensions remain to be implemented. Before retiring CorelDRAW, validate representative production files in the team's actual CAD/CAM and machine workflow.

References: [CorelDRAW drawing scale](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-Drawing-scale.html), [CorelDRAW object positioning](https://help.coreldraw.com/CorelDRAW/540111192/Documentation-Mac/CorelDRAW-en/CorelDRAW-Position-objects.html), [Autodesk DXF header variables](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm), [LWPOLYLINE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm), [ELLIPSE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-107CB04F-AD4D-4D2F-8EC9-AC90888063AB.htm).
