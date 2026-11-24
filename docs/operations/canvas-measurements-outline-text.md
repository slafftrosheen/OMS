# Measurements, outlines and text in OMS Draw

Idea and Order canvases use the same drawing workspace. This expansion adds direct angle construction, editable dimension presentation, page outline defaults, compact controls, and reliable live-text formatting. Existing drawings keep their stored geometry and appearance; no data migration is required.

## Measurements and angles

Open **Layout → Dimensions and construction** or the **Dimensions** docker. The supported dimension kinds are horizontal, vertical, aligned, angular, radius and diameter. Selection-based dimensions can remain linked to their source geometry. Missing or disconnected sources stay visibly broken until repaired or detached.

To draw an angle independently of existing objects, choose **Draw angle dimension** from the dimension tool's flyout, the Dimensions docker, or Quick access. Click the vertex, a point on the first ray, then a point on the second ray. Shift constrains direction or angle to 15° increments. Backspace removes the last construction point; Escape cancels the construction and its preview. The default sector is the minor angle; the dimension settings can switch to its reflex sector.

With one dimension selected, its settings provide:

- Signed offset in the document's unit, or pixels on an uncalibrated legacy page.
- Annotation size, affecting text and markers together.
- Physical text height in the document unit, synchronized with annotation size.
- **Fit annotation to view**, which stages a readable label size and scales its offset, or its arc radius for an angle.
- Document precision or an override from zero to six decimal places.
- Unit suffix visibility for linear, radius and diameter measurements; angles retain the degree symbol.
- Automatic, arrow, tick or no endpoint markers.
- A reflex-sector switch for angles.

Use **Apply** to save the settings in one undo step. **Reload** discards the form draft. A source edit, selection change or unit change makes an outstanding draft stale; it cannot overwrite the changed annotation. Read-only, locked, broken-reference and active-drawing states prevent writes. Refused or partially applied updates roll back.

Manual angle annotations expose handles for the vertex, both rays, and arc offset. Linked annotations retain their offset-only handle so dragging a label does not rewrite its sources. The arc radius cannot collapse below the marker/label minimum. Label extents participate in export bounds, including larger annotation text.

The docker also reports selection width and height; supported curve length; open/closed contour counts; radius, diameter and arc sweep; straight-edge direction; and eligible corner angles. Direction is counterclockwise from page +X, including transformed parent groups. Straight paths converted to Bézier geometry remain eligible. Approximate curve lengths keep the existing approximation indicator.

Linked two-edge angles require a shared endpoint. Use the three-point tool for independent angles. This is not an ordinate, baseline or automatic chain-dimension system. Cutting DXF continues treating dimensions as annotations, not as machine-cut geometry.

### Defaults for new dimensions

**New dimensions on this page** is available with no selection as well as alongside selected dimension settings. Choose **Match current view** for a label sized to 14 screen pixels when created, or **Physical size** to set an exact text height and signed offset in drawing units. The initial physical values are 3.5 mm and 8 mm. Save precision, unit suffix and marker preferences in the same section.

These preferences are saved with the page and used by selection-based dimensions, the two-point dimension tool and the three-point angle tool. Physical values are stored in millimeters. Existing annotations retain their saved dimensions. A changed page, calibration or saved default invalidates an outstanding draft; Reload reads the current values. Read-only and active construction states prevent a save.

In view mode, a new angular dimension places its arc at a readable distance relative to the ray and current view. Physical mode uses the requested signed offset from the first ray's measured length. A radius that would put the arc inside the label/marker minimum is refused. Creation checks the whole annotation against drawing bounds, including its label, and rolls back refused or changed records.

Live dimension lines have a minimum width of one screen pixel. Their SVG export width follows the stored annotation scale, so changing camera zoom does not change the output. Physical 3.5 mm dimension text corresponds to a 0.25 mm dimension line.

## Outline settings and hairline defaults

Open **Object → Outline pen…** or press **F12**. Choose whether to apply the settings to **Selected objects** or **New drafting objects on this page**. The latter saves a page preference without changing existing artwork. Only fields explicitly changed become overrides; setting a width does not freeze an unrelated palette color.

The outline controls cover:

| Setting | Choices |
| --- | --- |
| Width | Hairline or numeric width; mm, cm, m, inches or points; standard width presets |
| Color | Color picker or no outline |
| Opacity | 0–100% |
| Line ends | Butt, round, square |
| Stroke corners | Miter, round, bevel |
| Miter limit | Numeric limit for sharp joins |
| Pattern | Solid, dashed, dotted, dash-dot, or custom dash/gap sequence |
| Dash offset | Signed offset in the document unit |

**Hairline is the initial default for newly drawn CAD geometry.** It has an explicit flag and a positive fallback width; it is not represented by an invisible zero-width SVG stroke. The live canvas displays a hairline as one screen pixel at every zoom. PDF and EPS retain a device-hairline instruction. SVG and PNG use a positive 0.01 mm fallback at the drawing scale used when the hairline was set, so their raster visibility depends on output resolution. Existing zero-width outlines remain invisible.

New rectangles, ellipses, pentagons, stars, triangles and diamonds drawn on calibrated pages now use editable CAD geometry and inherit the page's outline preference. Line, polyline, Bézier, circle and three-point arc/circle creation, exact primitive planners, and the page-frame command use the same defaults. Shift constrains equal axes when dragging a shape; Alt draws about its center. Escape or pointer cancellation removes the draft in one operation. Legacy uncalibrated pages retain the native shape route. Freehand keeps its separate nib and pressure settings.

Saved numeric outline dimensions are physical millimeters internally. Changing the display unit or drawing scale does not reinterpret a future object's saved width, dash lengths or dash offset. Existing objects retain their own stored appearance. Palette colors can replace a saved next-object stroke color without erasing the remaining outline defaults.

A device hairline has no physical area to turn into a machining contour. **Convert outline to object** asks for a numeric width first. The SVG fallback is a display/export accommodation, not a manufacturing width.

See [Drafting outlines and hairlines](outline-settings.md) for width presets, import semantics and the distinction between stored object widths and future-object defaults.

### Stroke joins versus geometric corners

Stroke corners change how adjoining outline segments meet. To change the actual contour, use **Object → Shape properties → Rectangle corners…** for sharp, rounded, scalloped or chamfered rectangle corners, or **Object → Shaping → Fillet and chamfer…** for the existing curve-corner operations. These produce editable geometry and are separate from round/miter/bevel outline joins.

## Working text settings

The property bar and **Text** docker now use the same typography controls: installed/uploaded font, exact point size, character spacing, line spacing, alignment, and automatic or fixed text-box width. Numeric fields commit on Enter or valid blur. Escape restores the saved value. Invalid values remain visible with a field error; a queued blur cannot format a different selection.

Typography applies immediately to selected text. Content in the docker remains a draft until **Apply** or **Ctrl+Enter**; changing font or spacing preserves that draft. Escape restores the saved content. Mixed selections retain their mixed indicators, and failed editor updates are reported and rolled back.

The Text docker now supports several selected text objects through those same controls. It keeps future-text preferences for an empty selection; a mixed selection containing non-text objects shows a selection hint. Exact point sizes represent physical typography at the document calibration: 72 pt corresponds to a 25.4 mm em at scale 1:1, 1:10 or another supported scale. Existing text is not resized when the calibration changes; the displayed point size reflects its newly calibrated physical size. Content-only edits do not force an existing size back through the point-size input limits.

Geometry corrections include:

- Switching scaled automatic-width text to a fixed paragraph box freezes its displayed width instead of applying the scale a second time.
- Changing exact point size preserves the rotated alignment anchor. A fixed paragraph box keeps its physical width while the letters change size. Native corner resizing still scales the whole text object.
- Creating a paragraph by dragging freezes the dragged width correctly at the requested text size and document scale, including large or small text scales. The native minimum of 16 local text pixels still applies to very narrow drags.

If a larger point size cannot fit the native text engine's minimum local box width, the edit is rejected before changing any object. The control explains that the box must be widened or switched to **Fit width to text**; it does not silently enlarge the paragraph box.

Typography and content edits also check the full text bounds in page coordinates, including rotated parent groups. An invalid change rolls back the whole selection. Native text creation and inline typing use the same envelope checks; an impossible physical size or out-of-bounds placement produces a message without leaving invalid new artwork. Previously oversized text can be repaired while keeping or reducing its original extents. The native creation history remains continuous through typing, so one Undo removes a completed new text object.

With nothing selected, the Text docker offers **Create text** and next-text defaults for font, exact point size, character spacing, line spacing and alignment. Both click-created text and dragged paragraph boxes receive them. Paste, import, duplication, remote changes and existing shapes retain their own typography. These preferences belong to the editor instance; outline defaults, by contrast, are saved with the page. Choosing a native size preset clears the previous exact-size override.

This change does not add synthetic bold, italic or underline controls. Font variants should come from the supported font workflow so live text, outlines and export stay consistent.

## Compact workspace

Desktop controls use smaller tool slots, tighter gaps, reduced panel padding, narrower font/point-size fields, and shorter command/property/status areas. Labels remain at the existing 11/12 px sizes. The standard bar can scroll horizontally at narrow widths. Touch input keeps larger control dimensions.

The global application form selector previously overrode some canvas inputs with larger padding and typography. A docker-scoped rule now restores drawing-control sizing without changing artwork text or production forms outside the drawing workspace. Canvas zoom, document units and geometry coordinates are unaffected by the chrome changes.

## Verification and limits

Verification for the initial measurement, outline and text expansion:

- **320/320 focused tests passed across 25 files**, covering real-editor angle construction and cancellation, snapping, save-snapshot boundaries, dimension settings and source links, outline defaults and exports, native CAD drag gestures, text controls, geometry anchoring, stale selection, refused writes and undo/redo.
- **16/16 targeted real-editor/React tests passed again** after the final text-control and test-fixture cleanup.
- TypeScript passed for application sources, now explicitly including `src/**/*.tsx`, and the changed React test fixtures. The SvelteKit-generated include list previously omitted standalone React entry files; the project configuration now includes them.
- The production Vite/SvelteKit build passed, including the client and server bundles. Source-map upload credentials were disabled for this local verification.
- Independent review resolved the narrow fixed-text-box case, out-of-range controls for valid low-zoom annotations, and the coordinate editor's monospace cascade. No unresolved concrete blocker remained in that bounded review.

The physical dimension/text follow-up passed **248/248 tests across 16 files**, expanded TypeScript including all changed React test fixtures, and the production build. Coverage includes saved dimension defaults, all six selection-based dimension kinds, direct construction, stale drafts, physical text height, fitting annotations to the view, export stroke bounds, physical font-size conversion, mixed text selections, paragraph creation, text-limit rejection, rollback and undo/redo. Native SVG export checks physical text and dimension sizes independently of camera zoom. Independent review caught the extreme-calibration text overflow and confirmed the corrected behavior; no concrete blocker remained in its bounded follow-up.

Rendered-browser layout, overflow and actual browser font wrapping have not been verified in this environment: the earlier Chromium launch failed before tests could run because its process-singleton socket was denied. The integration tests use JSDOM and deterministic text metrics; they establish behavior and geometry, not rendered appearance. No production deployment is implied by the source update.
