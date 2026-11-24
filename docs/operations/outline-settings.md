# Drafting outlines and hairlines

The **Outline pen** panel edits selected CAD artwork or the outline for new drafting objects on the current page. Its target control makes those actions explicit. New pages start with a hairline; opening an existing drawing does not change any stored object.

## Controls

- **Colour / No outline** changes the stroke independently of fill.
- **Width type** chooses Hairline or Custom width. A custom width supports mm, cm, m, in, and pt independently of the document's display unit. One point is 1/72 inch.
- **Standard widths** includes Hairline and 0.10, 0.18, 0.25, 0.35, 0.50, 0.70, 1, 1.4, 2, 3, and 5 mm.
- **Opacity** sets stroke opacity independently of object/fill opacity.
- **Line ends** chooses flat, round, or square caps.
- **Stroke corners** chooses miter, round, or bevel joins. Miter limit applies to miter joins.
- **Dash pattern** includes solid, dashed, dotted, dash-dot, and custom alternating dash/gap lengths. Dash lengths and signed dash offset use the document unit. Presets use the custom width, or a 1 mm basis for hairlines.

Only checked properties are applied. Mixed selections retain all unchecked values. Review shows up to three style samples; it does not modify the document. Applying a selected-object outline or saving page defaults uses one undoable transaction and rejects stale reviews, read-only state, protected selections, and active drawing gestures. A refused multi-object update is rolled back.

## What Hairline means

Hairline is an explicit `omsVectorPaint.hairline` flag. It is not encoded as an invisible SVG width of zero.

| Surface | Behaviour |
| --- | --- |
| Live canvas | One screen pixel at every camera zoom. Dash spacing still scales with the geometry. |
| PDF and EPS | A device hairline (`0 w` / `0 setlinewidth`). Its physical width is determined by the output device. |
| SVG and raster export | A positive thin-stroke fallback, initially 0.01 mm at the document scale used when the hairline was set. Raster visibility depends on export resolution. |
| PDF import | PDF zero-width strokes become explicit hairlines with a positive fallback. |
| OMS SVG reimport | The plain-data `data-oms-hairline="true"` marker restores the semantic flag. Other SVG consumers see an ordinary positive stroke. |

The fallback width remains in the same canvas-coordinate system as other stored stroke widths. Changing document calibration later changes its interpreted physical size just as it changes existing numeric widths. PDF/EPS device-hairline semantics remain independent of this fallback.

Legacy `strokeWidth: 0` without a hairline flag remains invisible. Entering a numeric width explicitly clears hairline. Setting Hairline restores a positive fallback even when the previous numeric width was zero.

**Convert outline to object** requires a numeric width: a device hairline has no fixed physical cutting boundary. The panel explains this and asks for a custom width before conversion.

## New-object defaults

Page metadata stores only explicit outline overrides in physical millimetres under `omsOutlineDefaults`. Width, dash spacing, and offset therefore keep the same physical size for objects created after a display-unit or document-scale change. Existing geometry keeps its own paint.

Changing only width or corners does not freeze the current native palette colour. A custom default stroke colour is saved only when explicitly chosen in Outline pen. Choosing a native palette colour for the next drafting object removes that custom colour override while retaining width and other outline settings.

Defaults apply to CAD line/polyline and Bézier tools, circle and three-point construction tools, calibrated rectangle/ellipse/pentagon/star/triangle/diamond drag tools, exact geometry creation, and exact rectangle/polygon/star/ellipse-segment panels. The drag primitives retain editable CAD points or analytic ellipses, support Shift equal axes and Alt drawing from the centre, and exclude their unfinished preview from autosave/export snapshots.

Freehand curves, pressure ink, and calligraphy retain their own nib settings. Native annotation tools and uncalibrated native geometry retain their existing native styles. Imported artwork and operations derived from an existing object keep their source paint.

## Stroke joins versus geometric corners

Stroke joins change the outline's appearance at an existing vertex. They do not alter the underlying contour.

- **Rectangle** builds independent sharp, round, scallop, or chamfer geometry at its four corners.
- **Corners** edits contour/node geometry with fillet, scallop, or chamfer operations.
- **Outline pen → Stroke corners** chooses miter, round, or bevel rendering at those vertices.

The distinction matters for manufacturing: geometric corner tools change the cutting contour; stroke joins change a painted outline unless that outline is explicitly converted to an object.
