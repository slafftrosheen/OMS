# Physical defaults for order canvases

New order templates use the document's physical calibration. The production/profile form starts **6000 mm wide**. The client/order details block, address block, production pockets, attachment cards, and layout spacing retain their original proportions to that form.

## Default dimensions

These dimensions are physical millimetres, regardless of the displayed unit or document scale.

| Element | Initial width | Initial height |
| --- | ---: | ---: |
| Production/profile form | 6000 mm | 3000 mm |
| Client/order details block | 2933.33 mm | 1533.33 mm |
| Address block | 2933.33 mm | 1533.33 mm |
| Each production pocket | 2666.67 mm | 1666.67 mm |
| Generated attachment card | Up to 1200 mm | 933.33 mm |

Form heights follow their actual HTML content after mounting. Production pockets grow to accommodate their file lists and cards. Card widths can reduce to fit a narrower pocket; widening a pocket adds columns without increasing the font or control size.

The initial gap between stacked production pockets and successive profile forms is 133.33 mm. The attachment grid uses 80 mm margins and gaps. All template positions use the same scale factor, including the address column, profile stack, and production pocket stack.

## Units, grid, and view

A new blank drawing starts in **mm**, with scale **1:1**, a **1 mm** nudge, and a **10 mm** grid spacing. Grid visibility and grid snapping remain separate choices. At overview zoom, the displayed grid shows larger integer multiples of that same grid so lines remain visible; this does not change the saved snapping interval.

The document continues to use the existing conversion:

```text
millimetres per canvas unit = (25.4 / 96) × document scale
template multiplier = 6000 / (1800 × millimetres per canvas unit)
```

Changing the display unit to inches, centimetres, or metres does not alter the physical size of newly generated elements. The template fits into the canvas view after creation; **F4 / Fit** fits the complete layout again after editing. Existing ruler, measurement, guide, and export conversions use the same document calibration.

The form's HTML layout remains at its original 1800 px design width, with 880 px for the two smaller forms. The canvas scales those layouts as a whole, including their text and controls. File cards and pocket headings use their saved layout scale for the same reason. The regular application toolbar and dockers stay at screen size.

## Form scale and existing drawings

On a calibrated page, **Form scale → 100%** uses the new default physical width for that form type. For a production/profile form, 50% is 3000 mm wide and 100% is 6000 mm wide. The form keeps its current aspect ratio, content, and position. Enter applies the typed percentage; Escape cancels it. Focusing and leaving the field without editing never rounds or resizes an existing record.

Saved layouts are not automatically enlarged when reopened. Their form sizes, positions, drawing geometry, and calibration remain intact. A profile added to an existing order follows that order's existing form width. Older unmarked layouts retain their former gap convention. Legacy uncalibrated pages retain their old pixel-based percentage convention until document units are configured explicitly.

New physical templates record their layout scale as `omsOrderLayoutScale`. Unmarked legacy pockets and cards retain their original scale. Automatic file placement changes generated attachment cards; manually positioned viewers, grouped files, locked objects, and actual production geometry retain their placement and size. Moving a queued file between pockets from the Form tab preserves the destination's layout scale when the canvas is reopened.

Template creation and form resizing respect the existing coordinate and shape limits. An extreme calibration that cannot fit a 6000 mm template inside those limits is refused rather than silently shrinking it or changing the document calibration.

## Dimensions and text at the full-layout scale

Dimensions created from a selection now use the same annotation defaults as the two-point and three-point angle tools. The initial **Match current view** mode creates a 14-screen-pixel label, with proportionate markers and offset, and saves that size in drawing coordinates. This makes a new dimension readable when viewing a 6000 mm form. Later zoom changes do not resize the saved annotation.

Open **Dimensions → New dimensions on this page** to save either that view-based behavior or a **Physical size**. Physical mode starts with a 3.5 mm text height and an 8 mm offset. Enter lengths in the document's displayed unit; the preference stores physical millimeters so a later unit or calibration change does not reinterpret the requested dimensions. Precision, unit suffix visibility and endpoint markers are saved with these page defaults too. Existing dimensions keep their own settings.

A selected dimension also exposes its physical text height alongside annotation percentage. **Fit annotation to view** stages a new label and marker size and scales the offset with it; an angle scales its arc radius. **Apply dimension settings** commits the staged result. Reload or Escape cancels the draft. If the dimension, its sources, page or calibration changes, reload before applying.

Dimension lines retain a one-screen-pixel minimum on the live canvas. SVG export uses their stored proportions independently of camera zoom. In physical mode, a 3.5 mm label has a 0.25 mm line. These are measurement annotations; the separate hairline default still governs newly drawn CAD outlines.

Text point-size controls now account for the document calibration. Setting **72 pt** produces a **25.4 mm em** at any supported drawing scale; changing units alone does not change that size. This is the font's typographic em, not its visible capital-letter height. Recalibrating existing text keeps its stored geometry and updates the displayed physical point size. New text follows the requested physical point-size default.

Text creation, typing and formatting check the complete transformed bounds. A requested size or placement that exceeds the canvas limits is refused with a message; a multi-object formatting change rolls back as a whole. Existing oversized text may retain or reduce its previous extents, allowing repairs without expanding the invalid region. New-text preferences that cannot fit anywhere in the canvas are refused before creating a label.

The Text docker applies shared typography controls to an all-text multi-selection. A mixed selection with non-text objects is identified instead of silently showing future-text controls. Dragged paragraph boxes use the actual drag width even when the chosen point size or document scale makes the native text scale large or small. The text engine's minimum paragraph width of 16 local text pixels still applies; a narrower drag cannot produce a smaller box at that font size.

## Verification scope

Regression coverage includes physical dimensions at multiple units and calibrations, preserved saved layouts, added profiles, form scale input and undo, scaled file placement and frame growth, snapshot pocket changes, grid density, and calibration initialization. The shared snapping and measurement suites check that their coordinate semantics remain intact. Rendered browser behavior and a live deployment require separate verification; server-rendered markup and editor interaction tests do not establish browser layout accuracy.

The initial 6000 mm layout implementation passed **144 tests across 13 files**, the TypeScript check including application TSX and the changed React test fixtures, and the production build. The independent review's form, card, and automatic-height boundary findings were fixed and rechecked. Native editor tests cover document defaults, destination ordering, partial-write rollback, and preservation of undo/redo during background layout. Controlled ResizeObserver coverage includes all three form types at document scales 1, 1000, and 10000.

The subsequent dimension/text scale expansion passed **248 tests across 16 files**, the expanded TypeScript check and the production build. Actual native SVG export verifies 72 pt as a 25.4 mm em at document scales 0.1, 1, 10 and 1000, and verifies physical dimension text and camera-independent strokes. An independent reviewer reproduced and rechecked the extreme-scale text overflow correction, including refused native creation preserving earlier artwork and history. These tests use deterministic text metrics; actual browser font wrapping, UI layout and a live deployment remain unverified.
