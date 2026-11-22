# Canvas production reference files

| Workflow | Reference file | Expected evidence |
| --- | --- | --- |
| Laser and CNC | [Full-size panel](production-reference.dxf) | Seven entities, four closed contours and three open contours. Extents are 1220 × 600 mm with native circles, a rotated ellipse, an arc and editable cubic splines. |
| Imported signage splines | [ASCII](../cad-splines/mixed-ascii.dxf) and [binary](../cad-splines/mixed-binary.dxf) | Equivalent geometry. Valid Bézier handles remain visible and selectable, and a rejected spline is reported independently. |
| Curved production outlines | [Periodic spline](../cad-external/periodic-spline.dxf) and [external spline regressions](../cad-external/splines) | Check seam closure, repeated knots and bounded approximation independently of the visual preview. |
| Editable artwork | [EPS artwork](../cad-external/artwork.eps) | Route to editable import in both canvases. Check vector conversion, colour and outline results in the conversion regression. |

The CAD-file browser suite sends the reviewed panel DXF into the CNC pocket and
compares the uploaded bytes with the browser download. The order-canvas suite
checks host integration. These automated fixtures complement operator acceptance
with the actual machine application or RIP. Keep customer artwork in private
order attachments. Add a reduced reproduction to this set when the geometry
behind a reported failure can be shared.
