# Draft order canvas

The canvas is an active creation and editing view of the canonical draft order.
It uses the same `OrderDraftFields`, `OrderNativeProfileForm`, and
`Profile7stVisual` components as the regular form. Changes flow through the
editor bridge; saving still uses the existing draft validation and lifecycle.

## Drawing workspace

- Grouped left toolbox: selection, nodes, pan, curves, shapes, text, dimensions,
  and annotations. Triangle buttons open related tools; F5–F8 and F10 retain
  the existing drawing shortcuts.
- One task docker for properties, text, arrangement, measurements, objects,
  and CAD. The property bar retains numeric position, size and rotation.
- Centre-radius circles and two-point dimensions support object/grid snapping,
  Shift angle constraints and Escape cancellation. Dimensions remain editable
  through their endpoint and offset handles. Set physical units/scale in the
  measurement panel before production DXF export.
- The text panel edits multiline content, four native font families, exact point
  size, alignment, automatic width and case. Custom fonts and conversion to
  editable outlines continue through the existing reviewed CAD text workflow.
- Arrangement includes alignment, distribution, numeric edge-to-edge spacing,
  ordering, mirroring, rotation, grouping and repeat grids.

## Form sheets

Production profiles keep CNC, Bender, Front, Painting and Assembling in one row.
Their natural layout width is 1800 drawing pixels; details and delivery use 880.
The form scale control and corner handles resize the entire sheet proportionally.
Content height follows the real form, including expanded fields. The standalone
form retains its responsive layout. Locked and read-only sheets cannot be edited.

New templates use wider sheets. Existing saved form positions are retained;
select a form and use Properties → Form scale to adjust its size.

## Production files

File → SVG/PNG and the reviewed DXF/PDF/EPS exports provide a file name,
production destination and **Save into** button. Destinations are Laser, CNC,
Bender and Visuals, using the canonical `order_files.file_type` values.

On a saved order, the file is uploaded immediately through `/api/files/upload`
and appears in the chosen box. On a new order, it joins the existing draft queue;
**Save Draft** uploads queued files and persists their canvas references. Export
reviews must still be current, and any omissions must be acknowledged. Saving
an export does not convert text or silently remove the format's restrictions.

New file cards arrange in rows; boxes grow vertically and move following boxes
in the same vertical stack. File lists show all entries without a fixed-height
scroll window. Manually placed artwork and grouped documents retain their
coordinates. Locked boxes do not accept exports. EPS and SVG attachments use
private storage; SVG and other active document types are download-only.

## Verification

`tests/unit/canvas-workbench.test.ts` exercises drawing geometry, cancellation,
text size/permissions, rotated-parent spacing, form scaling, box layout and
queue/API routing. `tests/ui/DrawingWorkspaceHarness.svelte` provides the shared
order/idea browser fixture, including a local production-file queue.

Production-host acceptance remains: save a real order, reload it, and download
one DXF/PDF from each target box with the appropriate production user roles.
Local browser fixtures do not establish deployed Supabase write access.
