# Shared drawing workspace and PDF analysis

Idea boards and draft-order canvases use the same `DrawingWorkspace` around the existing tldraw editor. Opening, saving, restoring, editing order forms, and uploading attachments still use the existing document and form bridges. The saved-order file-pocket synchronization described below adds a database migration; drawing-only tools use the existing snapshot.

## Workspace

The layout follows CorelDRAW's separate menu, standard toolbar and property bar, left toolbox, central drawing area, right docker and vertical colour palette, and bottom status/zoom arrangement. It uses OMS theme colours, original icons and EN/RU/LV labels. Chrome is outside the editor viewport, so fit-to-content and file-drop coordinates use the actual drawing area.

Rectangle, Ellipse/circles and polygon shapes have separate toolbox positions. The small arrow opens the alternatives for a tool group. **F12** opens **Outline Pen**. The paint button opens fill controls, including gradient and material sections; **Ctrl/⌘+Shift+Q** opens **Convert outline to object**. The toolbox scrolls on short screens; flyouts are positioned outside that scrolling area.

The labelled vertical rail beside the colour palette opens **Properties**, **Text**, **Arrange**, **Measure**, **Objects** or **CAD**. The active docker has one title and close control; its rail stays available when closed. On narrow embedded canvases, the docker overlays the drawing instead of reducing the viewport to a sliver. Position/size controls remain horizontally scrollable when space is limited. These changes apply to both drawing hosts without changing embedded order-form styling or document data.

The property bar follows the active tool and selection:

- **Selected text** exposes font family, exact point size (1–3000 pt), alignment and automatic/fixed text width. It formats one or several native text objects in one undo step; mixed values remain explicit until changed. Each control changes only its own property. Read-only, locked and stale selections are rejected as a whole.
- **Edit text** opens the Text docker for one selected label. Unapplied content survives font, size, alignment and width changes from the property bar. **Convert to curves** opens the existing conversion controls. Exact X/Y, width/height, rotation, reference point and proportional scaling remain available in **Arrange** while text is selected.
- The **Text tool (F8)** shows **Next text** with font, native size presets and alignment. These defaults affect the next label, even if an older object remains selected; they do not format that selection. Font choices include the four bundled families and fonts uploaded into the drawing.

### Uploaded fonts

- **Fonts…** beside the font picker opens **Text → Document fonts**. Upload TTF, OTF, WOFF or WOFF2, preview the face, then choose it for selected editable text or the next label. Select several files to import a family in one undoable change. Every file must validate; a failed batch adds nothing and identifies the failing file. Duplicate faces are reused. The same picker is available in the property bar and Text/Properties dockers, in both idea and order canvases.
- **Export font set** downloads an `.omsfonts` file containing the drawing's uploaded fonts only. Upload that set in another drawing to reuse the same typefaces without finding the original files. Sets preserve exact font bytes, validate their version/content identity, and recover names from the actual fonts. They do not contain artwork, order data or text-tool defaults. Read-only drawings permit export, search and previews.
- Search the current collection by font name, family or style. The manager shows matching counts and total font-count/byte usage; clearing search restores the list. Export includes the entire collection, regardless of the search filter.
- Font files are validated by their actual contents, named from their internal metadata and embedded once in the drawing snapshot. They persist through the existing board/order save flow and load before text measurements on reopen. No machine-wide installation or new database table is required.
- Limits are **1 MiB per file, 1 MiB combined and 16 faces per drawing**. Upload also checks remaining space against the existing drawing-save payload limit. Duplicate files reuse the same face; unsupported collections, corrupt files and embedding-restricted faces are rejected with a specific message. Variable fonts use their default instance; axis controls are not provided.
- Native text stays editable and uses the uploaded face for measurement, wrapping and selection bounds. SVG/PNG export renders uploaded text as glyph outlines. For production PDF/EPS/DXF, use **Convert to curves** to create editable paths in the same face before export.
- Fonts used by text on any page or by the next-text setting cannot be removed. Missing fonts and missing characters are reported; export/conversion does not silently substitute another face. Re-uploading the original file repairs a missing or damaged face. Copying a whole saved drawing carries its font data; copying only shapes between separate drawings does not, so upload the original font or exported font set in the destination drawing.
- The font manager and errors support English, Latvian and Russian. Read-only drawings disable upload, removal and formatting; selection formatting checks stale/locked objects before applying one undoable change.

### Editable text spacing

- The contextual text bar and Text docker now include **Character spacing (%)** (−50 to 200 percent of font size) and **Line spacing (%)** (50 to 500 percent; default 135). Text remains editable, including uploaded fonts. Mixed selections can receive a single spacing value without replacing their content or font sizes.
- Spacing is saved in native text metadata, participates in undo/redo, and affects text wrapping, selection bounds, SVG/PNG export and Convert to curves. Nonzero character spacing disables optional common ligatures so the glyph outlines follow the visible lettering. Existing outline lettering controls remain independent.
- In the Text docker, Enter in a spacing field applies the text draft; Escape restores only that field's saved value and retains other pending content. Invalid values show an associated error and do not change the drawing.
- Production PDF/EPS/DXF still require Convert to curves for text. Font-specific shaping should be reviewed before manufacturing, particularly complex scripts; this is not a new rich-text or per-character kerning editor.

### Snapping

- Open **View → Snap options**, the Snap options docker tab, or the footer shortcut. Choose endpoints/nodes, segment midpoints, centres, quadrants, intersections, perpendiculars, tangents, nearest points and grid points independently. Snap distance is 2–30 screen pixels and stays consistent through zoom. The grid step displays in the active drawing units and uses the same document grid as native object movement.
- Target choices apply to CAD polylines, Bézier creation, circle/arc construction, dimensions, path/Bézier nodes and dimension endpoints. A marker and status label identify the acquired target. Ctrl temporarily inverts CAD/object snapping; Shift angle constraints take priority. Numeric point entry stays exact and is never resnapped.
- **Perpendicular** and **Tangent** construction snaps are opt-in. In CAD polyline or two-point dimension drawing, place the first point, then move near the desired connection. Perpendiculars use the last committed polyline vertex or first dimension point and land on finite straight edges; they never clamp to a non-perpendicular endpoint or extend the reference line. Tangents solve both connections to analytic circles/ellipses and retain only points on a visible arc's sweep. Starts inside or on the ellipse are refused. A later polyline segment uses its new last vertex. The candidate closest to the pointer wins among enabled discrete targets; disable competing targets when necessary. Numeric entry bypasses construction snapping. No associative constraint is stored: moving the source later does not rebuild the line.
- **Intersections** covers finite straight segments with each other or with analytic circles, ellipses, circular arcs and cubic Bézier segments, plus cubic Bézier segments with each other or with circles, ellipses or circular arcs, and circle/circle, circle/arc and arc/arc pairs. Rotated groups and native ellipse shapes are supported, including native ellipses expanded by their labels. Exact ellipse bounds keep targets available at rotated extrema even when native sampled bounds fall short. Bézier crossings use the original cubic: up to three crossings against a straight segment six against an ellipse/circle/arc, or nine against another cubic, with tangent contacts and endpoints retained without flattening. Only crossings on both visible arc sweeps and inside the finite segment are offered; reference geometry is never extended. A tangent contact supplies one target; coincident circles and coincident or partly overlapping curve pairs supply none. The point closest to the cursor wins among enabled discrete targets. The existing intersection setting also applies during CAD node/dimension endpoint editing and persists without a new setting or migration.
- Discrete geometric targets take priority over nearest edges, with the grid as fallback. Nodes are stored geometry, not flattened curve samples. Bézier segment midpoints use bounded arc-length integration; nearest curves use bounded numerical search on the original curve. Intersection work is limited to the first 256 nearby straight segments, analytic ellipses/arcs and cubic segments combined per pointer update; later primitives in a crowded region are omitted. Cubic/ellipse pairs additionally have a shared limit of 128 solves per pointer update, without using up the budget for inexpensive line intersections. Each cubic/ellipse solve is bounded to 512 subdivision visits and depth 48; numerically unresolved geometry supplies no targets. Cubic/cubic work has an additional limit of 64 pairs and 8192 subdivision visits per pointer update, with at most 4096 visits per pair. Control-hull subdivision and refinement verify both original curves; unresolved or ill-conditioned pairs are omitted. These caps preserve inexpensive line-pair targets. Pairs of conics involving a noncircular ellipse, two-curve common tangents, construction constraints during node dragging and clip-boundary targets are not implemented. Cubic tangent/perpendicular construction is described in the later batch below. Clipped and invisible artwork is excluded; locked geometry remains a usable reference.
- Page snap choices and document grid spacing persist and undo together. Read-only documents protect these settings. The separate **Show grid and snap moved objects** switch is native tldraw grid mode: it both displays the grid and snaps ordinary object movement, even when object guides/CAD snapping are off. The CAD Grid points checkbox is independent; Ctrl bypasses native movement-grid snapping.
- Other native shapes expose their relevant fill, outline pattern, size preset, line spline and arrowhead controls beside geometry. Size presets can also affect shape labels. CAD artwork instead links to **Fill & outline** for its vector paint controls.

Point-size conversion retains full precision in document scale. Display and mixed-value comparison remove floating-point noise to six decimals, so a uniform 100 pt selection stays visibly uniform across native size presets.

- Pick, pan, freehand, line, arrow, rectangle, ellipse, triangle, diamond, pentagon, star, text, highlight, eraser, and frame tools.
- Object X/Y, width/height and rotation; grouping, alignment, distribution, stacking, mirroring, quarter-turn rotation, duplication, and deletion.
- Properties for available native shape styles: fill, outline pattern, size, opacity, font/alignment, line spline and arrowheads. Objects can be selected and explicitly locked/unlocked in the objects panel.
- Search objects by their display names and assign an optional label to the selected object. Labels use `meta.omsObjectName` and never change order fields, document titles or artwork text. Clearing a label restores its normal name; changes undo as one operation.
- Repeat a selection as a grid with rows, columns and horizontal/vertical gaps in the document's drawing unit (pixels on uncalibrated legacy pages). The original stays in the first cell. Each cell uses native duplication to remap internal connectors and group ancestry. A grid generates at most 500 shapes, including descendants, and also respects the editor's page limit. Locked selections, locked descendants, read-only canvases and embedded order forms cannot be repeated. The whole grid is one undo step.
- Camera-aware physical rulers on calibrated pages, grid and object snapping, fit/selection zoom, undo and redo. F6/F7/F8 select rectangle/ellipse/text; F4 fits the drawing; Ctrl/Cmd+D duplicates. Form fields retain their own typing behaviour.
- Import uses the existing authorized upload path. SVG/PNG export covers supported drawn objects; embedded order forms and document viewers are excluded with an explanation.
- Export selected artwork or the whole drawing, choose background or transparency and padding, and set PNG scale to 1×, 2× or 4×. Preflight limits raster output to 8,192 pixels per side and 32 million pixels total before allocating an image; completion status reports the number of omitted unsupported objects. SVG remains vector output.
- Menus open one at a time and Escape restores focus to their trigger. Docker rail controls expose the active panel; Up/Down/Home/End move focus, and Enter/Space opens the focused panel. Closing a docker returns focus to its rail control and retains that docker's current draft. Tool flyouts support keyboard entry and Escape returns focus to their expand button.

PNG completion reports dimensions read from the saved file header. If the browser reduces a large export below the requested scale, the workspace reports that reduction; exporting a smaller selection can preserve the requested resolution.
- Idea-only content and assistant actions remain in a compact content bar. Order-only notes, warnings and explanations remain beside the common property controls.

The [CAD drafting guide](cad-drafting.md) covers exact geometry, physical units, scale, calibration, dimensions and DXF export. This is an OMS drawing workspace built on tldraw, with a CorelDRAW-inspired working layout. Text outlines, Bézier nodes, compound curves, weld/trim/intersect, offsets and DXF import/export are implemented in the shared CAD docker. Its task selector groups creation, editing, document measurements and file interchange. Native CDR/DWG editing, CMYK colour management and the complete CorelDRAW feature set remain outside this implementation. Native tldraw colours share one value for outline and fill; the UI states this instead of presenting independent colour controls that do not work.

## PDF analysis

`/api/toolkit/analyze-asset` validates the caller, board/asset pair, stored size and file signature before analysis. The ordinary PDF path no longer requires an upstream file-parser service.

| Mode | Input sent to the configured model | Bounds |
| --- | --- | --- |
| Automatic | Locally extracted text when every selected page has a readable text layer; otherwise locally rendered page images | Text: 40 pages and 60,000 characters; visual: 10 pages and 24 MiB rendered images |
| Text | Locally extracted text; rejects incomplete/scan-only pages | Same text bounds |
| Visual | Locally rendered, numbered page images using the saved R&D vision model | Same visual bounds |
| Explicit paid OCR | Original private PDF bytes with `mistral-ocr` | Existing administrator gate and per-request opt-in remain required |

Automatic/text analysis uses the selected allow-listed text model. Visual analysis uses the saved R&D vision model. A text-layer heuristic cannot establish that diagrams or scanned regions have been fully captured: choose Visual for signage layout, colours, or graphical dimensions. The assistant and result UI explicitly identify text-only analysis. Extracted text is separate evidence; a model's visual answer is not labelled verified OCR.

Choose All pages or an inclusive Page range in the assistant's PDF options. The optional API input is `pdfPages: { start, end }`, with whole original page numbers from 1 to 10,000. Limits apply to the selected span, so a few pages from a longer pack can be analyzed without splitting the original file. Out-of-document ranges are rejected before calling the model. Automatic mode keeps the exact range when falling back to visual analysis; if that span exceeds 10 pages, choose a smaller range. No mode silently truncates the source.

Successful local analysis returns `pages: { start, end, total }`. Original page numbers are included in the model input, chat reply, private evidence cache and pinned findings. Switching documents resets the range; a failed request retains it. Paid OCR receives the original whole PDF and therefore cannot be combined with page ranges. The existing order-intake renderer still processes all pages and retains its original API contract.

PDF parsing is isolated in a bounded worker and uses no temporary source files. Local extraction times out after 20 seconds; rendering after 30 seconds. The complete Toolkit analysis has a 140-second server deadline and a 150-second client budget. Existing 8 MiB image / 12 MiB PDF input limits remain unchanged. No source URL is made public.

The shared non-streaming OpenRouter client retries HTTP 408/502/503/504 once on the same model within one overall deadline. It respects Retry-After up to five seconds; longer waits are returned to the client. It does not retry credentials, payment or quota errors and does not upgrade to a paid model. HTTP 200 error envelopes are treated as failures. The UI also respects 503 cooldowns and never automatically resubmits a private document.

A persistent OpenRouter 503 still means no suitable provider was available; code cannot guarantee free-model capacity. The response now distinguishes that condition from parser/input failures, missing credentials and unavailable database model settings. Select an available model in R&D settings when necessary. Live account/provider availability must be checked on the deployed installation.

## Drawing and production batch — 16 November 2026

These tools share one implementation in idea boards and order canvases:

- **Edit → Step and Repeat** (**Ctrl/⌘+Shift+D**) opens the Arrange docker. Choose rows and columns, spacing as an edge gap or origin-to-origin distance, and left/right/up/down direction. Preview shows the layout, generated object count and final extent before Apply. Distances follow document units and scale. Changes to the selection, geometry or spacing invalidate the preview. Applying creates one undoable batch; protected, clipped or unsupported objects, excessive copies and oversized drawings are rejected.
- **Object → Ellipse / pie / arc** opens the CAD section. Set center, width and height (or constrain to a circle), rotation, start/end angles and sweep direction. Create an open arc, pie sector or chord segment. Preview uses the existing CAD plan controls; Apply creates editable Bézier curves for the existing node tools and export paths. Curves approximate ellipses within 0.005 mm; they are not exact conic records. Whole ellipses remain available from the ordinary ellipse tool.
- **Edit → Copy appearance** opens a collapsible Properties section. Copy one object, select compatible targets, choose color/fill, outline and/or opacity, then apply in one undo step. Gradients fit each target. Native drawing styles and CAD curve paint remain separate families; paths, ellipses and arcs also support appearance copying after the editing-and-appearance batch below. Fonts, text, geometry, image assets and material textures are not copied. Locked, read-only, incompatible or oversized selections are rejected as a whole.
- Top menu commands support arrow-key navigation and Home/End. **Ctrl/⌘+T** opens the Text docker while the canvas has focus. Text-entry fields retain their normal keyboard behavior.

### Saved-order production pockets

Apply `supabase/migrations/20261116000001_canvas_file_pockets.sql` before relying on this flow. Moving an existing file card between named production frames and saving updates its linked `order_files.file_type` in the same database transaction as `canvas_state`. The order page refreshes its attachment categories after a successful save. Removing a card is not a file deletion, and ordinary initial placement does not rewrite categories. Conflicting duplicate cards, independently changed categories, missing links and unauthorized status/role changes reject the save rather than partially applying it. Existing snapshot revision checks still prevent overwriting a newer canvas.

### Verification of this batch

All 36 focused executable harness tests passed using real geometry, CAD plans and drawing transactions with a mocked editor: ellipse validation/tolerance/units/stale apply, repeat preview/directions/capacity/rollback, and selective appearance copying with preservation of target data. An additional routing check covers opening the ellipse section and resuming it after document setup. Real TypeScript/TSX syntax parsing passed; Svelte checks cover script syntax only. Seven database regressions are included but could not execute without the missing PGlite dependency.

This workspace has no installed application dependencies or browser fixture. A full application typecheck/build, Svelte template compilation, live browser checks, paid OpenRouter calls and execution of the new database regression suite remain unverified here. The new database migration is provided as source and has not been applied to the production database. Earlier verification entries below describe earlier passes, not this batch.

## Editing and appearance batch — 16 November 2026

The following controls use the same drawing host for idea boards and order canvases. This batch adds no database migration.

### Find and Replace

Open **Edit → Find and Replace** or press **Ctrl/⌘+F** while the canvas has focus. The collapsible Text section searches native editable text on the current page or within the selection captured at search time. Match case and whole-word options support Unicode letters, numbers and combining marks. Queries and replacements are literal text, including dollar signs.

The result list previews before/after text and occurrence counts. Locate a result, choose the objects to replace, or replace all results in one undoable operation. Selecting a result does not change a captured search scope. Any document edit or changed search option invalidates the review. Session controls survive moving between dockers.

Embedded order forms, shape labels and outlined text are excluded. Locked matches may be inspected but cannot be changed; a replacement containing a protected object fails as a whole. Uploaded-font availability and glyph support are checked. Native text content changes preserve formatting, spacing and metadata; native auto-size behavior may resize/reposition text to retain its alignment anchor.

### Select Same

Open **Edit → Select Same** in the Objects docker. Choose one reference object, then match its type, fill, outline, opacity, or all checked criteria together. Preview the result count before replacing the selection or adding matches to it. Selection-only changes after preview are allowed for Add; a document or reference edit requires another preview. No artwork records or undo entries are created.

Native style tokens and CAD paint are compared within their own families. CAD gradient/material mappings normalize to object-local bounds so proportionally fitted fills can match across differently sized objects. Inactive fills/outlines are compared by their visible state. Objects inside ordinary groups are supported; production cards, embedded forms, frames and their contents are excluded. Image objects support type/opacity criteria. Selection remains available in read-only drawings.

### Polygons and stars

**Object → Polygons and stars** opens the existing CAD Draw section with expanded controls. Set the center, outer width/height, proportion lock, rotation and number of points in the active document units. Simple stars expose inner-radius percentage. Complex stars connect every selected nth point and preserve separate closed cycles where the point count and step share a divisor.

Dimensions describe the outer ellipse before rotation and corner finishing; the preview reports actual bounds, contours and nodes. Convex polygons can have measured chamfers or rounded corners. Rounded corners use the existing cubic approximation. The output uses the existing editable-curve, single-undo and CAD export paths. Missing document settings open setup and retain the requested tool.

### CAD appearance consistency

CAD paths, ellipses and arcs now render their full stored outline settings rather than a fixed one-pixel stroke. Closed primitives also render solid, gradient or material fills through the same renderer as Bézier curves. Their native geometry remains analytic, and their SVG output retains exact conic paths. Fill and clip-aware hit testing follows the displayed artwork. Resizing transforms local paint/clips with the geometry, including flips and minimum-size clamping.

**Fill & outline (F12)** edits solid fill and outline width on these primitives. Open CAD paths/arcs remain outlines; changing their outline preserves hidden stored fill assets for a later close operation. Direct gradient/material editors remain Bézier-based; existing fills and copied gradients are rendered on closed analytic shapes. Copy Appearance supports all four CAD shape types, preserving target geometry, assets and unrelated metadata. Open geometry accepts outline/opacity copying. PDF/EPS paint matches the displayed open/closed behavior; DXF remains a geometry export.

### Verification of this batch

All 59 focused regression tests passed: 13 Find and Replace, 14 Select Same, 9 polygon/star, and 23 analytic appearance/clipboard cases. A renderer regression also covers schema-valid legacy arcs with invalid sweep ranges, preserving their previous display instead of throwing while reopening a drawing. They cover literal and Unicode replacement, captured scopes, fonts, protected objects, stale reviews, undo/rollback, gradient normalization, star-cycle geometry, units, exact SVG paths, paint/clips and signed resizing.

TypeScript/TSX syntax was checked with the real Sucrase parser/transpiler, including the source recovered during a temporary workspace disconnection. Focused tests use the actual helper/geometry/transaction implementations with mocked editor and renderer boundaries. Full application typechecking/build, browser behavior, live database persistence and paid-model PDF OCR remain unverified here. Earlier verification sections describe their respective passes.

## Transformations, object hierarchy, rectangle corners and direct CAD fills

Both drawing hosts use the same new controls.

- **Object → Transformations** opens the Arrange task selector. Position moves the selected drawing or group by relative X/Y or places its chosen bounds anchor at an absolute coordinate. Scale uses percentages or overall dimensions, a nine-point reference and optional cumulative copies. Review reports bounds before Apply; a clamped/refused native resize rolls back. Native text supports uniform scaling. Nonuniform scaling of obliquely rotated or aspect-locked objects is refused; skew is not simulated. Forms, file cards, masked/bound objects and protected descendants are excluded.
- **Arrange** now separates Transformations, Align and distribute, Step and repeat, and Rotate/circular copies into focused tasks. Task changes preserve drafts while the docker remains mounted. Ctrl/⌘+Shift+A opens alignment; Ctrl/⌘+Shift+D opens repetition. Existing property-bar and Text-docker controls remain.
- **Objects** shows actual group hierarchy and sibling stacking order. Expand/collapse, search with ancestor context, reveal selection, Ctrl/⌘ toggle, Shift ranges, keyboard navigation, F2 rename, explicit lock controls and guarded stacking replace the flat list. Rename changes the object alias, not artwork/order content. These controls do not reparent objects or add fake visibility flags.
- **Object → Rectangles and corners** adds precise center, outer dimensions, rotation, proportion locking and independent sharp, rounded, scalloped or chamfered corners. Corners may be linked. Each radius/cut is capped at half the shorter side to prevent crossing geometry. Rounded/scalloped corners use adaptive cubic geometry within 0.005 mm; they remain editable/exportable curves.
- **Fill/outline** now directly edits gradients and material textures on closed CAD paths and exact ellipses as well as Bézier artwork. Material reuse and alignment work across these types. Exact ellipse SVG paths render previews; rectangular envelopes are used only for conservative tile budgeting. Geometry and asset references remain unchanged. Open native arcs/paths remain ineligible for these fills.
- **Palette** click fills closed CAD geometry; right-click changes its outline. Open CAD geometry uses outline colour. Outline changes retain gradients, textures and latent fill data; solid-fill changes clear obsolete material settings. Native objects retain their own fill-style behavior.

### PDF intake diagnostics

The provider boundary retains only allowlisted error types, with failed-response reads capped at 64 KiB. Input/context limits, unreadable images, account access and provider refusals now produce specific remedies instead of being broadly reported as model incompatibility. Known terminal failures do not retry the same input or fall back to another schema format. A transient image-download failure may retry once on HTTP 408/502/503/504; partial content-filter output is rejected.

The specific reported live 503 is not reproduced here. No paid-model call, production credential, database migration or server deployment was used. These changes improve failure handling; they do not establish that live PDF OCR now succeeds.

### Verification of this batch

78 focused checks passed: 19 transformation, 13 object hierarchy, 12 rectangle geometry/plan, 11 direct fill, 7 palette and 16 provider/intake routing cases. They execute actual source with mocked editor/service boundaries; the provider cases use real Node Response/ReadableStream/AbortSignal. Supplemental compiled-component checks cover rectangle drafts, Objects navigation/rename and read-only behavior. Native tldraw resize/duplicate/reorder implementations were independently checked against the pinned API.

All changed TypeScript/TSX files were parsed/transpiled with real Sucrase. Full application typechecking/build, browser rendering, live database persistence and paid OCR remain unverified in this environment. The workspace briefly disconnected; final source snapshots were preserved and checked against the assembled publish files.

## Outline Pen, node arrangement, cubic construction snaps and production check

Both shared and order canvases use these controls.

### Editing tasks and outline styles

CAD now separates Draw, Edit, Fill/outline, Document, Files, Trace and Production check. F12 and Object → Outline Pen open the outline controls; the existing paint button opens fill controls. Solid fill owns only the fill colour and any replaced gradient/material, preserving outlines, clipping, opacity, file links and geometry. A loaded-source guard prevents a draft colour from being applied to a newly selected object before its controls refresh.

Outline Pen edits selected CAD objects and group descendants. Checked fields apply across mixed selections; unchecked fields are retained. Controls include physical width, colour/no outline, opacity, line caps, joins, miter limit, dash presets/custom lengths and dash offset. The preview and Apply use stale-source and permission checks and one undo transaction. SVG/PDF/EPS retain supported stroke styles; EPS transparency remains an explicit omission. DXF exports geometric paths. Use the explicit **Convert outline to object** operation described below to create expanded silhouettes before exporting.

### Shape tool and selected nodes

Shift-click anchor handles to toggle nodes, or use the node list and range/all/clear controls. The overlay identifies selected anchors. Object → Align and move nodes opens numeric movement, alignment and distribution in document axes. Relative handles travel with their anchors. Review/apply is atomic and refuses stale or protected data.

Native dragging still edits one anchor or handle. The panel states this limitation; multi-node movement uses the numeric controls. Known native/numeric single-node edits retain the active anchor. Other geometry/topology edits and undo mismatches invalidate stored indices so removed or shifted nodes cannot silently receive a later batch operation.

### Tangents and perpendiculars to cubic curves

Existing tangent and perpendicular snap toggles now include original cubic Bézier segments. Bernstein root solving checks the finite parameter interval, derivative and connection lengths, and geometric residuals. A shared cap of 64 nearby cubic sources bounds construction work per query. Degenerate stationary cusps, zero-length connections and collinear tangent continua are excluded.

These construction candidates use existing polyline and dimension anchors. The Bézier drawing tool and node handles currently provide no construction anchor and retain ordinary snaps. Perpendiculars to conics remain unsupported. Existing toggles default off.

### Production check and material-filled DXF paths

File → Production check opens a read-only report for a captured selection or all page objects. It lists open paths, zero-length and conservatively short segments, matching paths, and export omissions. Locate selects the source object without editing it; document changes require a refreshed report.

Matching recorded geometry is compared at 0.000001 mm precision, ignoring traversal direction and closed seam position. Different segmentations or converted conics can remain unmatched. The check is limited to 1,000 objects, 12,000 segments and 500 displayed findings. Open paths may be intentional for engraving/bending; this is not self-intersection, kerf or machine approval.

Material-filled native CAD paths and ellipses now remain eligible for DXF and measurement. Regression coverage verifies that their native LWPOLYLINE/ELLIPSE geometry is retained. Imported PDF page rasters remain non-cutting and are omitted.

### Verification of this batch

67 focused checks passed: 14 outline/style/export, 18 node-selection/arrangement/retention, 14 cubic snapping, 13 preflight/DXF/measurement and 8 solid-fill cases. They execute actual helper, shape/tool and serializer source with mocked Editor/runtime boundaries. Supplementary compiled-component checks cover outline field state and solid-fill selection synchronization; an independent numerical probe found all 240 seeded tangent/normal contacts tested.

All changed TypeScript/TSX was parsed/transpiled with real Sucrase; publish bytes were verified and whitespace checked. Full application typechecking/build, browser rendering, live database behavior and paid-model OCR remain unverified. The preceding main CI run failed immediately; available job/check responses exposed no actionable failure logs, so it cannot certify the application.

## DXF spline compatibility and outline conversion — 16 November 2026

### Spline import

- SPLINE entities now share one converter with spline edges in HATCH boundaries. Polynomial degrees 1–3 retain editable exact Bézier geometry, including nonclamped and periodic knot domains. Full-multiplicity interior knots create separate contours; no connecting cut is invented across a discontinuity.
- Positive-weight rational splines and degrees 4–16 use bounded editable line-segment approximation at the existing **0.002 mm** import tolerance. Weight ratios and local knot calculations avoid avoidable overflow. Invalid, nonpositive or numerically unresolved data is reported.
- Control-point and fit-point coordinate records and declared counts are checked separately. Missing count tags and omitted all-unit weights are accepted. Fit-point-only data is explicitly omitted: those points do not uniquely encode the original spline parameterization. Re-export such curves with control points, Bézier geometry or polylines.
- Closed/periodic flags do not authorize adding a straight bridge between mismatched endpoints. Discontinuous HATCH edges require repair or export as separate curves. Per-spline complexity failures preserve valid neighboring entities; document-wide limits remain enforced.
- The preview lists actionable spline reasons in English, Latvian and Russian, with source entity handle and layer when available. Review and acknowledge omissions and approximation warnings before applying. An empty import remains blocked; changing the file, settings, selection or drawing invalidates a prepared result.

### Convert outline to object

- Available through **Object → Convert outline to object**, **Ctrl/⌘+Shift+Q**, and **CAD → Fill/outline** in both idea and order canvases. Ctrl/⌘+Q continues to open conversion to curves. Text inputs retain their own keyboard behavior.
- Selected CAD objects and group descendants can become closed editable silhouette contours using their current physical stroke width, colour, caps, joins and miter limit. Round joins/caps and curve centerlines are flattened for the result; the tolerance controls those approximations, not a machine-specific cutting guarantee.
- Prepare the preview before applying one undoable change. Replace mode removes unfilled source centerlines and preserves filled/material source objects with their outline removed. **Keep originals** retains the original strokes too, so overlapping geometry is explicit.
- Solid visible strokes are supported. Dashed outlines, clipped or page-raster artwork, bindings, locked/protected objects and oversized results are rejected with an explanation. Conversion does not silently make dashed lines solid.
- The new contours use the existing drawing snapshot, editing tools and vector/DXF export path. This batch adds no database migration.

### Verification of this batch

54 focused tests passed against the assembled changed source: 17 independent spline-math cases, 16 parser/import cases, 5 published external-fixture cases and 16 outline geometry/transaction cases. They run actual CAD code and real Clipper with mocked editor/runtime boundaries. Supplemental compiled-component/keyboard checks cover 25 import-review, outline-preview and shortcut boundaries. A separate seeded numerical probe checked 1,000 splines against an independent basis evaluator (52,035 point comparisons).

The outline tests cover authored versus generated joins, wide curves, cap/bevel/miter limits, holes, self-crossings, material retention, source replacement, rollback and group cleanup at store-atomic boundaries. Group-preserving replacement depends on the runtime Store.atomic API in pinned tldraw 2.4.6, accessed through a narrow type bridge because its published declarations omit internal methods; retest this boundary on a tldraw upgrade.

All changed TypeScript/TSX was parsed/transpiled, relative imports checked, and published bytes and whitespace verified. The user's failing DXF has not been supplied; external-source fixtures and generated edge cases exercise compatibility but do not establish that every exporter or the user's particular file is fixed. Full application typecheck/build, browser rendering and interaction, live persistence and machine output remain unverified in this environment.

## Context editing, relative order and curve skew — 17 November 2026

These additions use the same components and commands in idea boards and order canvases. Drawing data continues to use the existing snapshots; this batch adds no database migration.

### Editing at the pointer

Right-click artwork to open its editing menu. **Shift+F10** or the keyboard context-menu key opens the menu at the selected artwork, clamped into the visible viewport; an empty selection uses the viewport center. The menu offers applicable edit, duplicate/delete, group, transformation, mirror/rotation, order, curve-conversion, fill/outline and inspection commands. The Order submenu also opens relative stacking directly.

The menu uses the installed Radix/tldraw menu components for pointer selection, positioning, submenus and keyboard navigation, with OMS command guards and translations. Its direct Radix dependency pins the same version already included transitively. Function keys and Home/PageUp/PageDown shortcut hints display as complete keys. Escape closes the menu without clearing the selected objects; menu arrows cannot nudge the drawing underneath it.

Read-only and locked selections retain inspection commands. Native text, form-control, link and media context menus remain available. Mouse, keyboard and touch/pen opening paths are guarded so a context menu cannot finish an active drawing gesture. Requests target the current editor container, including when two drawings are mounted together.

### Relative object order

**Object → Order → Order relative to an object** opens the Objects docker's reference selector. Select a numbered sibling reference and use **Place in front** or **Place behind**. Multiple selected objects retain their internal order. The reference can be locked because its record is not modified. Cross-parent placement is not offered; this operation does not move objects between groups or layers.

**Reverse order**, in the Objects docker and the Object/Order menu, reverses only the selected stack positions. Unselected sibling indices remain unchanged. Both operations preserve geometry, names, group membership and selection, and form one undo step. Already-adjacent placement creates no extra history entry. A changed page, selection, sibling order or lock invalidates the prepared reference. The Objects docker's Russian strings and Latvian diacritics have also been repaired.

### Exact skew of editable curves

Open **Arrange → Transformations → Skew curves**. Choose horizontal or vertical skew, an angle from **−80° to 80°**, and one of nine reference points. The reference stays fixed. Positive horizontal angles lean the upper edge right; positive vertical angles lift the right edge. The preview compares dashed source curves with solid resulting curves and shows the fixed reference point.

The operation transforms CAD polyline vertices and Bézier control points exactly with an affine matrix, including compound holes and curves inside rotated nested groups. Edit mode preserves the existing IDs, group hierarchy and stack positions. **Keep original and create a skewed copy** duplicates the complete selected hierarchy and transforms the copy. A successful apply is one undo step; stale or refused operations retain no partial changes.

Solid fills, opacity and fill rules are preserved. Linear and radial gradient coordinates receive the same transform as the curves. Outline widths and dash lengths stay at their original physical size. Convert an outline to an object first when its complete silhouette needs skewing.

Native text, ordinary shapes, analytic circles and arcs must first be converted to curves. Clipped artwork, bindings, frame children, bitmap fills and material textures are explicitly rejected. Limits are 100 curve objects, 20,000 nodes, 500 records including group descendants, existing coordinate limits and the drawing's existing payload/page capacity. This is a numeric skew workflow; interactive Pick-tool skew handles are not introduced by this batch.

### Validation and local acceptance

The original 28 application type errors were fixed without disabling checks. Discriminated result types now narrow correctly under this project's TypeScript configuration. The text replacement tests use a real bundled font; the node-drag fixture uses the actual tldraw matrix type.

Focused tests cover numerical geometry, gradients, protected/stale edits and rollback. Additional tests use actual tldraw Store, HistoryManager, shape schemas, native shape creation and group-cleanup callbacks to check grouped copies, JSON persistence, Undo/Redo and rollback of legacy singleton-group cleanup. Context-menu tests mount the actual editor and installed Radix components in a DOM environment, including keyboard routing and embedded input behaviour.

Final validation of the assembled batch:

| Check | Result |
| --- | --- |
| CAD, drawing, canvas-control/workbench and draft-intake regressions | **750 passed**, run in sequential batches to bound memory use |
| Native editor/Radix DOM menu regressions | **8 passed**, including normal process cleanup |
| Application Svelte/TypeScript check | **0 errors**; 13 pre-existing warnings in five unrelated Svelte files |
| Focused ESLint on all 31 changed/new TS/TSX files | **Passed**, no warnings |
| Production build | **Passed** with the existing Svelte/bundler warnings |
| Whitespace check | **Passed** |

The first combined build/regression run exceeded the host's memory limit. The complete regression set was then rerun successfully in separate sequential processes; the figures above are from those completed runs.

The shared browser fixture adds **`?corel-editing=1`** (or **`?mode=order&corel-editing=1`**) and a **Load Corel editing example** button. Eight browser regressions cover both hosts: right-click duplication/undo, keyboard menu navigation, relative/reverse order and reload, and compound-curve skew with stale/read-only guards. Run them with:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts --grep 'context menu|context keyboard|relative object order|skews compound'
```

Live browser execution in this pass is blocked by the host's Chromium `socket()` permission restriction; the headless-shell download was unavailable as well. DOM and native-store tests do not certify browser layout, production database persistence or machine output. Earlier browser-verification notes below refer to their respective historical passes.

Behaviour references: [CorelDRAW transformations](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-Transform-objects.html) and [CorelDRAW object order](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-Change-the-order-of-objects.html).

## Guidelines and direct Pick transformations — 19 November 2026

This pass adds the same guideline and on-canvas transformation workflows to idea boards and order canvases. It extends the existing workspace, snapshots, translated dockers and command history; no database migration or new dependency is required.

### Page guidelines

Drag down from the top ruler to create a horizontal guideline, or right from the left ruler to create a vertical one. The line follows the pointer without modifying the saved drawing. Release inside the drawing to commit one undoable change. Drag an existing, unlocked line to move it, or outside the drawing viewport to delete it. Escape, lost pointer capture, a changed page/camera/viewport, read-only transition or invalidated document state cancels the preview.

Open **Layout → Guidelines**, **View → Guidelines**, or the Guidelines docker tab for numeric placement. Enter a position in the current document units: vertical guides use X and horizontal guides use Y. Physical CAD Y increases upward. Changing the units, drawing scale or origin changes the displayed coordinate while keeping the guideline beside the same artwork. Unsaved position edits become stale if their underlying page/calibration changes; reload the current position before applying them.

The docker lists the current page's guidelines, allows individual or global locks, and separates visibility from CAD snapping. Hidden and locked guides remain snap targets when the guideline snap option and CAD snapping are enabled. Exact object targets have priority; guideline lines and their perpendicular crossings take priority over nearest-point and grid fallback targets. The crossing must fit the actual circular screen-space snap tolerance. Snap work is bounded by a limit of 256 guidelines per page.

Guidelines live in versioned page metadata, not artwork shapes. They survive the existing drawing snapshot/JSON round trip and Undo/Redo without entering artwork fit bounds or SVG/DXF/raster exports. Invalid or future metadata is retained and reported instead of being overwritten. Position, save-capacity, stale-plan, lock and read-only guards are checked again when applying. Unfinished CAD drawing drafts and active pointer gestures prevent guideline edits that could otherwise be absorbed by another operation's cancellation history.

An active guideline also supports keyboard nudging in the document's configured nudge unit, Shift for ten times the step and Ctrl/Command for one tenth. Delete removes it; Enter or Space opens its docker; Escape clears the active guideline. These keys do not edit the selected artwork underneath. Visual lines sit above artwork with no pointer ownership; their hit bands sit below real form/media elements so embedded controls retain their input behavior.

### Align selected artwork to a guideline

Select editable artwork, then select a guideline in the docker. Use the three alignment buttons for the relevant axis: left/center/right for a vertical guideline, or top/center/bottom for a horizontal one. **Keep relative positions** is enabled initially and moves the selection as a rigid arrangement. Disable it to align each selected root object individually.

Alignment uses exact existing geometry bounds, including cubic extrema and nested rotated groups, and keeps each shape in its original parent. One Undo restores the operation. Locked objects, protected order forms, clipped groups, bindings and unsupported container cases retain their existing protections. A stale or failed edit leaves no partial placement changes.

### Pick rotation and skew handles

Select supported editable curves or a group of them, then enable **Rotate / skew** in the property bar or Object menu. Four corner controls use the native rotation interaction; four side controls skew the artwork along the page axes. Dragging a side keeps the opposite edge fixed, including for curves inside rotated groups.

The overlay compares original and resulting curves and displays the current angle before release. Previewing changes no document records. Release applies the exact affine transformation in one undo step; Escape cancels. Shift snaps to 15° increments, with snapped values limited to ±75° and continuous values limited to ±80°. Focus a side handle and use the corresponding arrow keys for 1° steps or Shift for 15°; Enter/Space opens the numeric Transformations docker.

Compound holes, supported solid/gradient paint, group hierarchy and IDs are preserved by the existing curve-skew engine. Native corner rotation retains the selection pivot, including for already-rotated groups. Selection, geometry, page, camera, viewport, permission or protection changes invalidate an in-flight preview. Custom guide/skew gestures share pointer ownership so a second finger or pen cannot begin another drawing mutation.

### Current scope

- Rotate/skew uses an explicit mode button. CorelDRAW's ordinary second-click toggle and draggable custom rotation pivot are still absent; normal text/group double-click behavior remains available.
- Direct skew uses the existing exact curve engine. Convert native text, ordinary shapes and analytic circles/arcs to curves first. Bitmap/material fills, clipped artwork, bindings and protected objects retain the numeric skew restrictions.
- Guideline snapping applies to CAD creation, node editing and dimension endpoints. Ordinary Pick dragging does not yet snap to metadata guidelines. Use the docker's exact alignment actions for that placement.
- Guidelines are horizontal/vertical and page-specific. Angled guides and shared master-page guides are not included.
- DOM tests exercise actual editor event/history behavior. Browser pixel layout, production database persistence and machine output require separate acceptance checks.

### Validation and local acceptance

The native-editor DOM tests cover ruler/line gestures, offset and zoom coordinates, physical nudge units, no writes during previews, Undo/Redo, keyboard ownership, protected form inputs, multi-pointer exclusion, cancellation and stale-state handling. Geometry/history tests cover guide metadata, bounded CAD snap targeting, exact alignment, curve skew, compound geometry and rotated groups. The panel tests cover numeric edits, unit/page transitions, stale drafts and keyboard focus.

Final validation of the assembled source:

| Check | Result |
| --- | --- |
| CAD, drawing, canvas-control/workbench/draft and draft-intake regressions | **897 passed, 0 failed** across 68 distinct files, in eight sequential batches |
| Actual editor/React/DOM cases included in that total | **54 passed**: 8 context-menu, 27 guide interaction, 5 guide panel and 14 Pick transformation cases |
| Application Svelte/TypeScript check | **0 errors**; 13 existing warnings in five unrelated Svelte files |
| ESLint on all 30 changed/new TS/TSX files | **Passed**, no warnings |
| Production build | **Passed**, with existing Svelte/bundler warnings |
| Static scan of changed workspace UI; whitespace check | **Passed** |

The final event regressions also cover an Enter release after its focused guide has been deleted, normal subsequent native Enter behavior, and cleanup when the window loses focus. Native corner-rotation protection retains external child locks/metadata; the next Undo/Redo cannot resurrect the canceled rotation. A previous stale-guide test was updated to simulate an external metadata write because the new local busy guard correctly refuses an overlapping local edit.

Eight additional Playwright scenarios cover both hosts: ruler placement with one Undo, numeric guideline alignment/lock/reload, direct Pick skew with preview/Shift/Undo/Redo/reload, and cancellation/read-only transitions. Run them with:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts drawing-guides-skew.spec.ts
```

These new browser scenarios are defined and discoverable but were not executed here: Chromium aborts at startup because the host denies its `socket()` call. No screenshot or live-browser acceptance is claimed for this pass.

Workflow references: [CorelDRAW guidelines](https://product.corel.com/help/CorelDRAW/540111186/Documentation-Windows/CorelDRAW-en/CorelDRAW-Set-up-guidelines.html) and [CorelDRAW Pick tools](https://www.coreldraw.com/en/learn/tutorials/pick-freehand-tools-coreldraw/).

## Repeated Pick clicks, guideline movement and custom rotation centers — 20 November 2026

This pass closes the three Pick workflow gaps listed in the 19 November scope: ordinary repeated clicks can switch the selection handles, ordinary object movement can snap to page guidelines, and the rotation center can be moved directly. The implementation is shared by idea boards and order canvases, with English, Russian and Latvian guidance.

### Switch handles with an ordinary repeated click

Select editable curves or a group of supported curves. Click the selected artwork again without dragging or holding a modifier to switch between the ordinary Pick handles and **Rotate / skew**. A further ordinary click switches back. The property-bar button remains available for immediate, explicit switching.

The click retains the entire current selection, including a selected group or multiple roots. It waits for the editor's own double-click interval before switching modes so genuine double/triple clicks can retain native group and text behavior. A drag, modifier, menu, form focus, changed selection/document/view or another operation cancels a pending switch. Switching handles changes view state and adds no artwork mutation or empty Undo step.

### Snap ordinary Pick movement to guidelines

With **Snap** and **Guidelines** enabled, dragging supported artwork with Pick attracts its left/center/right or top/center/bottom to page guidelines. Multiple objects move as one arrangement, preserving their relative positions and original group parents. Exact curve bounds include cubic extrema and rotated group geometry. The active guideline is highlighted, including when its ordinary display is hidden.

Native object snap targets keep priority on the axis they acquire; a guideline can acquire the other axis. Ctrl temporarily inverts snapping during Pick movement; Shift constrains movement to one axis. Grid behavior stays native. Hidden or locked guidelines remain valid snap targets, independently of their editing locks. The guide tolerance uses the configured screen-pixel distance at the current zoom.

This extends the native translation operation through public editor hooks. It retains drag cancellation, one-step Undo/Redo and Alt-drag duplication. No helper artwork is inserted into the drawing or exports. Work is bounded to 100 selected roots, 500 selected/descendant shapes and the existing 256 guidelines per page. Protected forms, locked selections, bound objects, clipped artwork and frame/container cases are excluded. Their normal native interaction is preserved without adding a guideline correction.

Changing captured geometry or adding/removing a descendant of the moving selection invalidates its guideline correction. The external edit still proceeds, and unrelated creation/deletion does not interrupt snapping. Native Alt rollback can remove its inactive copied subtree after restoring the originals; deleting a member of the active copy instead invalidates the captured geometry.

### Move the rotation center

In **Rotate / skew**, drag the cross-and-ring center to a new point, then drag a corner to rotate around it. Moving the center and previewing a rotation do not write drawing records. The corner preview shows the original and resulting curves and the angle. Release applies the exact existing radial transformation in one Undo operation, preserving supported compound holes, paint, shape IDs and group hierarchy.

For rotation around a custom center, Shift or Ctrl constrains the angle to 15° steps. Focus a corner and use Left/Right for 1° steps, or Shift/Ctrl for 15°. Enter or Space opens the numeric Transformations docker. With the default center, corner rotation continues through the native editor interaction.

Focus the center and use arrow keys to move it by the current physical nudge step; Shift multiplies the step by ten and Ctrl/Command uses one tenth. Home, Enter, Space or double-click resets the center to the selection's default center. Escape cancels a pointer preview. Loss of capture/focus, wheel/scroll, changed page/selection/document/camera/viewport, read-only state or protection changes also cancels an in-flight preview without applying partial geometry.

The custom center is temporary state for the current page and selected IDs. It stays at its page coordinate during transformations, ordinary movement and Undo while that selection remains active; changing the selection or page resets it. It is not saved with the drawing or restored after reload. This fixed-page lifetime is an explicit OMS behavior, not a claim of complete CorelDRAW pivot parity.

Rotate/skew still targets supported editable curves and groups. Convert native text, ordinary shapes and analytic circles/arcs to curves first. Bitmap/material fills, clipped artwork, bindings and protected objects retain the existing curve-engine restrictions. Guidelines remain horizontal/vertical and page-specific; angled and shared master-page guides are outside this pass.

### Validation

| Check | Result |
| --- | --- |
| CAD, drawing, canvas-control/workbench/draft and draft-intake regressions | **989 passed, 0 failed** across 72 distinct files |
| Actual editor/React/DOM cases included in that total | **146 passed**, including 92 new cases: 13 repeated-click, 31 Pick guideline, 44 rotation-center and 4 combined-controller cases |
| Application Svelte/TypeScript check | **0 errors**; 13 existing warnings in five unrelated Svelte files |
| ESLint on all 20 changed/new TS/TSX files | **Passed**, no warnings |
| Production build | **Passed**, with existing Svelte/bundler warnings |
| Static scan of changed workspace UI; staged whitespace check | **Passed** |
| Browser test discovery | **43 scenarios** across four files, including the six new scenarios below; discovery is not execution |

Regression files run in separate bounded batches, with each native DOM file in its own process. After the final create/delete guard, the complete Pick guideline suite and combined-controller suite were rerun, followed by application checking, lint and the production build. The native cases also verify unchanged-record snapping after pointer velocity settles, a fast final release, mixed native/guideline axes, rotated parents, empty-Undo prevention, preservation of an existing Redo, and local/remote subtree edits without swallowing those edits.

### Browser acceptance scenarios

Six new Playwright scenarios cover both hosts: repeated-click mode switching without artwork mutation; a moved center with a constrained quarter-turn, preview and Undo; and ordinary Pick guideline snapping with Undo/Redo and drawing reload. The fixtures expose read-only coordinate/inspection helpers; the interactions use actual pointer and keyboard input.

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts drawing-pick-workflows.spec.ts
```

These scenarios are discoverable but were not executed in a live browser in this pass. The connected Browser extension was unavailable in this session, and the cloud browser could not reach the local fixture. Native editor/React/DOM tests do not certify browser pixel layout, production database persistence or machine output. Earlier browser results and environment restrictions in this document refer to their respective dated passes.

Behavior references: [CorelDRAW Pick and Freehand Pick tools](https://www.coreldraw.com/en/learn/tutorials/pick-freehand-tools-coreldraw/), [CorelDRAW guideline snapping](https://help.coreldraw.com/CorelDRAW/540111192/Documentation-Mac/CorelDRAW-en/CorelDRAW-Set-up-guidelines.html), and [CorelDRAW constrained rotation](https://product.corel.com/help/CorelDRAW/540111186/Documentation-Windows/CorelDRAW-en/CorelDRAW-Constrain-objects.html).

## Pen input and editable Freehand — 20 November 2026

Idea boards and order canvases now share a pen input layer, a **Pen & freehand** docker, and a new **Freehand (F5)** tool. The tool is first in the Curves flyout. The previous native drawing tool remains available as **Sketch (D)**. The docker is available from the right rail, View menu, and Freehand property bar. All new controls and guidance have English, Russian and Latvian copy.

### Editable curves and pressure ink

Freehand has two output modes:

| Mode | Saved result | Typical use |
| --- | --- | --- |
| Curve | An open or closed `cad-bezier` centerline with an ordinary outline | Draw a path, then refine its nodes with F10 |
| Pressure ink | Closed, filled `cad-bezier` contours describing the round nib's footprint | Preserve a pressure-varying stroke as editable production geometry |

The property bar and docker share next-stroke controls for mode, physical width, smoothing, color, automatic closure near the starting point, and pressure. Width uses the current document unit and scale; without document settings it is shown in canvas pixels. Pressure ink width is the maximum nib diameter at full pressure. Mouse input uses constant full width. Curve mode retains a constant outline width. These settings do not edit the previously selected artwork or create an Undo entry. The color palette sets the next Freehand stroke's color.

Smoothing reduces small positional variations and retains significant pressure changes. Curve smoothing uses cubic handles; ink creates the union of the round nib sweeps, including holes and self-crossings. Automatic closure uses an eight-screen-pixel target, adjusted for zoom. The same bounded geometry builder produces the live preview and the final shape. No temporary drawing records are created while the pointer is down. Release saves one shape and leaves Freehand active for another stroke; each completed stroke takes one Undo. F10 opens the existing node editing workflow for the selected result.

The saved result uses the existing curve schema, so node editing, shaping, save/reload and vector export consume it without a second conversion step. Regressions independently parse DXF output at document scale and exercise pressure-silhouette PDF export. This does not convert historical native Sketch or Highlight objects into CAD curves; their existing conversion/export limitations remain.

Escape, pointer cancellation, lost capture, blur, form focus, tool exit and changed drawing/view settings discard an unfinished Freehand preview. Changes to the page, current-page artwork, selection, camera, viewport, opacity, stroke settings or read-only state also invalidate it before release. Completed artwork, unrelated external edits, and an existing Redo are preserved. Work is bounded to 4,096 input samples, 512 retained ink centers and 4,096 output nodes, with additional simplification/sweep budgets. Excessively complex strokes are refused with guidance to shorten the stroke or increase smoothing.

### Pen preferences and event handling

The input layer uses standard browser Pointer Events and public editor APIs. It accepts normalized pressure, same-position pressure changes, and coalesced pen samples when the browser exposes them. Ordinary pointer events remain the fallback when extra samples are unavailable. Preferences include:

- **Pen and mouse** or explicit **Pen only**. Auto mode allows normal mouse work after using a pen.
- Pressure on/off, with **Light touch**, **Linear**, and **Firm touch** response curves.
- A side button mapped by the driver to right mouse: ordinary context menu, pan while held, or erase while held. Middle mouse mapping pans. Standard eraser-end events are handled for devices that actually provide them.

During an active pen gesture, secondary pointer streams and touch input are excluded from the same workspace. Forms, text fields, media controls, custom guide/transform controls and native selection handles keep their normal interaction ownership. Native Pick and other CAD tools keep their native pointer handling; continuous Sketch/Highlight/Freehand pen strokes and mapped momentary actions use the bridge.

Momentary erasing filters entire candidate roots, including locked descendants and protected OMS forms, before native deletion expands groups. It also rechecks protection before release. Interruption discards the pending eraser hit list without rolling back an unrelated edit. The previous drawing tool is restored after a momentary eraser action. Interrupted native Sketch/Highlight ink is retained, with an explicit notice that Undo removes it; its native incremental writes have different cancellation behavior from preview-only Freehand. If the drawing becomes read-only during native ink, the existing partial shape is preserved without a completion write or permission bypass, and the tool, pointer and capture states exit cleanly.

Pen preferences are browser-local and are not stored in shared drawing records. If browser storage is unavailable, preferences still work for the session and the panel reports that limitation. Stroke options are editor-local next-stroke state. Neither preference category changes document history.

### Huion Inspiroy 2 setup and diagnostics

On Windows, enable **Windows Ink** in the Huion driver and use normal pen operation rather than the driver's Mouse Mode. Then open **Pen & freehand → Test the pen** and draw with light and firm pressure. The independent test pad displays received and mapped pressure, the observed contact range, tilt, rotation, button bits, and extra-sample availability. It writes no artwork and remains available in a read-only drawing. Two open editors keep separate diagnostic state and accessible meter IDs.

Assign a pen side button to **Right mouse button** in the driver, then choose the intended action in OMS. Tablet keys can be mapped in the Huion driver to F5 Freehand, F10 nodes, V Pick, H Pan, E Eraser and Ctrl+Z Undo. Browser code cannot directly configure the tablet's firmware, identify an Inspiroy model, or guarantee that a driver forwards pressure. The diagnostic pad makes the received data inspectable.

Huion lists 8,192 hardware pressure levels for Inspiroy 2; browser Pointer Events expose normalized pressure and do not promise that many distinct levels. Inspiroy 2 M/L support tilt; Inspiroy 2 S does not. This pass displays tilt for diagnosis but uses a round, pressure-driven nib. Tilt-driven calligraphy, bearing/rotation-sensitive brush shapes and brush libraries remain outside this implementation. PW110 is not assumed to have a rear eraser.

Coalesced-event availability depends on the browser and a secure context. Plain HTTP deployments can still use ordinary pen events; HTTPS is needed for browsers to expose secure-context-only sampling features. No predicted samples are saved as geometry.

### Validation and acceptance

| Check | Result |
| --- | --- |
| CAD, drawing, canvas-control/workbench/draft and draft-intake regressions | **1,076 passed, 0 failed** across 76 distinct files |
| Actual editor/React/DOM cases included in that total | **211 passed**, including 65 new cases: 34 pen input, 26 Freehand controller and 5 panel cases |
| New geometry/native-store/export cases included in that total | **22 passed**, including independently parsed DXF, PDF, pressure silhouette topology and history |
| Application Svelte/TypeScript check | **0 errors**; 13 existing warnings in five unrelated Svelte files |
| ESLint on all 16 changed/new TS/TSX files | **Passed**, no warnings |
| Production build | **Passed**, with existing Svelte/bundler warnings |
| Static scan of all changed workspace UI | **Passed** |
| Browser test discovery | **53 scenarios** across five files, including 10 new Pen/Freehand scenarios; discovery is not execution |

The complete regression set ran in 16 bounded sequential batches, with native DOM files isolated in their own processes. After the final interruption and input-focus fixes, all three affected native input/controller/panel suites were rerun against the final code. Counts above include each case once. The final regressions explicitly cover pointer/button/capture cleanup after tool switches and cancellation; native Hand panning; menu and read-only interruptions; whole-group eraser protection; a real Freehand → eraser → Freehand button chord; and beginning the first stroke immediately after an uncommitted width input blurs. The width used by that first preview and saved shape is the committed field value, with one Undo.

Browser acceptance scenarios cover both hosts, including synthetic DOM pen events. Those events do not substitute for a physical tablet test.

Run the focused browser scenarios in an environment that can reach the fixture:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts drawing-pen-freehand.spec.ts
```

The connected browser could not access this local fixture in the current session, so no live browser, visual layout, production persistence, physical Huion or cutter validation is claimed. The application build and a Git update do not replace the running production bundle.

References: [W3C Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/), [Huion pen settings and Windows Ink](https://www.huion.com/manual/inspiroy-2/735), [Inspiroy 2 product specifications](https://www.huion.com/products/inspiroy-2-s), and [CorelDRAW drawing lines and Freehand smoothing](https://help.coreldraw.com/CorelDRAW/540111192/Documentation-Windows/CorelDRAW-en/CorelDRAW-Lines.html).

## Calligraphic ink and endpoint continuation — 20 November 2026

This follow-up extends the initial Pen/Freehand pass above. The shared Idea and Order workspace now offers three Freehand outputs: **Curve**, **Pressure ink** and **Calligraphic ink**. All controls and status messages are available in English, Russian and Latvian. This pass adds no dependencies or document-schema changes.

### Calligraphic nib controls

Choose **Freehand (F5) → Calligraphic ink** in the property bar or the **Pen & freehand** docker. The existing width, smoothing, color, pressure response and automatic closure controls remain available. Both control surfaces share the same next-stroke settings.

| Control | Behavior |
| --- | --- |
| Nib angle | Fixed major-axis angle from −180° to 180°. Positive rotation follows the screen's clockwise convention. |
| Nib tilt | Angle above the drawing plane, from 15° to 90°. Lower values make the ellipse flatter; 90° makes it round. |
| Use pen tilt | Uses received tilt to change nib flatness. Disabled by default. |
| Use pen bearing | Uses the direction the pen leans to rotate the nib. This is independent of barrel twist and is disabled by default. |
| Fixed nib preview | Shows the selected fixed angle and tilt. It is an illustrative control preview, not a live device meter. |

Angle and tilt fields commit on Enter or blur. Escape restores the current value; invalid or empty drafts show a localized error. Fixed controls remain editable while live input is enabled because they also provide the fallback for mouse strokes and samples without orientation. Controls are disabled during a pending stroke and in a read-only drawing. Changing these settings alone does not modify the document or its history.

Pressure changes the nib's overall size. The maximum width is its full major-axis diameter, expressed through the existing document-unit conversion. OMS models the minor/major diameter ratio as `sin(tilt)`, with a 15° lower bound. This is an explicit OMS ellipse model; it does not claim to reproduce Corel's internal brush algorithm. Turning pressure off uses full size while retaining enabled live tilt and bearing. Near an upright orientation, the last meaningful bearing is retained to avoid unstable rotation.

The saved result is an ordinary filled `cad-bezier` silhouette named **Calligraphic ink**. Its nodes can be edited with F10, and the existing JSON, SVG, DXF and PDF paths consume the literal geometry. Ellipse sweeps are combined with winding-preserving unions, including self-crossings and holes. The live preview remains outside the document; release writes one object and one Undo step. This is not a nondestructive Corel Artistic Media brush object: the original centerline and nib parameters are not retained for later brush retuning.

Calligraphy is bounded to 4,096 received samples, 512 retained centers, 512 interpolated pose intervals, 40,000 union-input vertices and 4,096 saved nodes. Each fixed-pose sweep is reduced to its convex boundary before union; changing orientations still pass through intermediate poses, so a stationary rotating nib does not lose its swept area. The ellipse tessellation tolerance is 0.2% of maximum width, capped at 0.02 canvas units. Pose interpolation uses 1% of maximum width, capped at 0.2 canvas units. These approximation tolerances are separate from user-selected smoothing. Excessive complexity is refused without writing partial geometry.

### Per-sample pen orientation

Tilt is associated with the exact public pointer event sent to the editor. This matters because the pinned editor queues pointer-move events until its next tick. A mutable “latest tilt” value would silently replace earlier coalesced samples. The event-keyed association retains every queued sample, stays isolated between editors, and is garbage-collected with its event.

The pen bridge, controller and geometry builder retain stationary orientation changes when live controls are enabled. A reported `(0, 0)` tilt is treated as upright. Browsers may also report zero for devices without tilt support, so OMS does not infer hardware capabilities from that value. Use the existing diagnostic pad to inspect the received values and leave the live controls disabled when the device does not supply useful orientation. Inspiroy 2 M/L support tilt; Inspiroy 2 S uses the fixed nib controls. Driver/browser delivery and physical tablet behavior remain hardware acceptance checks.

### Continue an existing open curve

1. Select one editable, open CAD Bézier curve with a visible outline and no visible fill.
2. Activate **Freehand (F5)** in **Curve** mode. **Continue selected curve** is enabled by default.
3. Drag from a marked endpoint. An eight-screen-pixel acquisition target remains consistent across zoom levels.
4. Release to append or prepend the new segment to the same object. With **Auto-close** enabled, releasing near the opposite endpoint closes that contour.

Drawing away from the marked endpoints creates a new curve. Disabling continuation also creates a new curve. Pressure ink and Calligraphic ink always create separate silhouettes. A stationary endpoint click does not create geometry or an Undo entry. Existing **Join Curves** and node tools remain available for combining separate objects and more explicit node operations.

Continuation preserves the source ID, grouping, local transform, ordering, metadata and paint. Its existing cubic segments and other contours are retained exactly; only the formerly unused endpoint handle is assigned at the join. Source width, color and effective opacity govern the extension, even when the next-stroke controls specify something different. Smoothing applies to the new segment. A valid continuation preview renders the complete grafted curve inside the source's existing canvas container. This keeps layer order, group opacity, joins, line caps and dash phase consistent with the final path, including prepending and closure. The replacement is transient render state; it does not affect saved records, hit testing or export and is removed on completion or cancellation.

No source records change before release. One atomic update makes the continuation one Undo/Redo step. Cancellation, lost capture, blur, tool changes, read-only changes and stale source/view settings discard the pending extension. Eligibility and document limits are checked again at application. A document at its shape-count limit can still extend an eligible curve because no new object is created; node and payload limits still apply.

Locked or protected sources, protected ancestors, bindings, clipping, unsupported material/raster/gradient appearances and non-group ancestors are not offered as continuation targets. The gesture does not join or delete other selected or nearby artwork. This pass implements dragging from an existing endpoint; Corel's click-to-click line creation, Shift backtracking erasure and complete Artistic Media workflow are separate functionality.

### Verification for this follow-up

| Check | Result |
| --- | --- |
| Complete CAD/drawing/canvas/draft regression set | **1,129 passed, 0 failed**, across 78 distinct files |
| Actual editor/React/DOM cases included in that total | **229 passed** |
| New regression cases in this follow-up | **53 passed**: 35 geometry/store/export/continuation cases and 18 editor/input/panel cases |
| Application Svelte/TypeScript check | **0 errors**; 13 existing warnings in five unrelated Svelte files |
| ESLint on all 20 changed/new TS/TSX files | **Passed**, zero warnings |
| Production build | **Passed**, with existing Svelte/bundler warnings |
| Static scan of changed workspace UI and styles | **Passed** |
| Browser discovery | **61 scenarios across six files**, including eight new calligraphy/continuation scenarios; discovery only |

The complete regression set ran in 16 bounded sequential batches, with native DOM suites isolated in separate processes. Counts include each test once. Assertions cover the real public pen bridge and queued editor events, stationary orientation changes, independent tilt/bearing, fixed nib fallbacks, topology and winding, physical DXF dimensions, PDF output, save/reload, protected objects, compound/grouped continuation, exact existing cubics, one-step Undo/Redo, and rollback. Rendered source-component tests verify complete preview-to-commit path equality, a single translucent stroke, inherited layers/opacity, and unchanged exports and indicators during a pending extension. The panel harness now runs without its previous React `act()` warning.

Representative CPU geometry measurements used five runs per case in the development container:

| Case | Median | Maximum |
| --- | --- | --- |
| Fixed 20-unit stroke | 1.24 ms | 6.11 ms |
| Stationary 90° nib turn | 18.31 ms | 39.94 ms |
| Four-pose pressure/tilt trace | 11.24 ms | 13.08 ms |
| 1,000-sample multidirectional trace | 17.47 ms | 50.84 ms |

The last trace produces 462 saved nodes. These measurements cover geometry construction only. They do not establish browser frame rate or end-to-end tablet latency; complex changing nibs can exceed a 16.7 ms frame budget.

Run the added browser acceptance scenarios in an environment that can reach the shared fixture:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts drawing-calligraphy-continuation.spec.ts
```

The new scenarios cover both Idea and Order hosts, fixed nib widths, synthetic coalesced orientation, inherited curve appearance, continuation and closure, cancellation, read-only changes, Undo/Redo and saved drawing reload. Fixture access in these scenarios is read-only; drawing and configuration use the public UI and DOM pointer events. Discovery and source checking do not establish that these browser scenarios pass at runtime. No live browser, pixel-layout, physical Huion, production persistence or cutter verification is claimed for this follow-up. No production service is restarted by this source change.

Behavior references: [CorelDRAW calligraphic lines](https://product.corel.com/help/CorelDRAW/540227992/Main/EN/Documentation/CorelDRAW-Drawing-calligraphic-and-preset-lines.html), [CorelDRAW expressive brushstrokes](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-expressive-brushstrokes_3aapplying.html), [CorelDRAW Freehand continuation](https://help.coreldraw.com/CorelDRAW/540111192/Documentation-Windows/CorelDRAW-en/CorelDRAW-Lines.html), [W3C orientation conversion](https://www.w3.org/TR/pointerevents3/#converting-between-tiltx-tilty-and-altitudeangle-azimuthangle), and [Huion Inspiroy 2 specifications](https://www.huion.com/products/inspiroy-2-s).

## Cubic bitmap tracing — 20 November 2026

The shared **Bitmaps → Trace bitmap** workflow now fits cubic Bézier curves directly to pixel boundaries, with explicit working-pixel tolerance, corner preservation, 1024/2048 px resolution and aligned source/result inspection. It retains exact straight sides, shared color edges, holes, opacity and editable handles. The review offers synchronized zoom/scroll, overlay opacity and actual curved/straight segment counts. Full workflow, bounds, algorithm details and measured before/after fixtures are in [Canvas vector exchange](canvas-vector-exchange.md#cubic-raster-tracing--20-november-2026).

The follow-up preserves acute triangle/star cusps, adds logo/line-art/color profiles and separate border-only/all-white removal, and groups multi-object results in the same Undo operation. Native bitmap output retains its parent, sibling position and inherited opacity. Normal Idea/Order image attachment cards can also supply their original image: the new artwork appears beside the retained card at an explicit width. File output is centered, and repeated previews retain the inspected area. See [Tracing workflow and sharp corners](canvas-vector-exchange.md#tracing-workflow-and-sharp-corners--20-november-2026-follow-up) for exact behavior, background semantics and quality limits.

## Deployment and verification

Pull `main`, install dependencies if needed, build, and restart `reclame-oms.service` using the normal deployment process. A Git update alone does not replace the running JavaScript bundle. Earlier installations still need the existing `20261109000001_openrouter_model_settings.sql` migration; this change does not apply migrations automatically.

Regression coverage includes real multi-page PDF extraction and rendering, original-page selection and out-of-range failures, incomplete text layers, PDF mode/model selection, paid-OCR isolation, provider backoff/exhaustion/cancellation, object permissions/transforms, saved canvas/form bridges, and content-bar behaviour. Drawing-operation tests cover metadata-only names, repeat limits and rollback, and export bounds.

Run source/unit tests, Svelte/TypeScript checking, focused linting, whitespace checks and the production build before publishing changes. Run check and build sequentially because both write `.svelte-kit`. The drawing fixture includes width and height selectors for embedded-layout checks. The current chrome pass was exercised through the browser in both drawing hosts: toolbar edits/undo, numeric sizing, tool flyouts, paint access, rail/menu keyboard focus, closed-docker draft retention, read-only guards, EN/RU/LV and Light/Dark/HighContrast themes, including a 390 × 420 embedded workspace. The full historical Playwright suite was not executed in this pass; earlier cases retain legacy tab-role assumptions and need updating before they can certify the current rail. No live OpenRouter account or production server was used for verification.

The contextual-property pass adds a `?text=1` fixture in either host (`?mode=order&text=1` for orders). Browser checks cover mixed text sizing/alignment/width, formatting undo, unapplied content retention, invalid-size recovery, next-text isolation, exact text positioning, native fill/outline controls, lock/read-only protection, and 390/520 px layouts in all three languages and themes. Unit coverage includes atomic rollback, stale selections, protected objects and point-size precision. These checks exercise the shared editor fixture, not a live production database.

The spacing/snapping pass was checked in the shared browser fixtures: mixed editable text spacing and JSON reload, multiline text and Enter/Escape validation in the order host, line-intersection and circle-quadrant acquisition, grid-step undo/redo and reload, read-only fields, and the 390 px Latvian dark layout. Unit checks additionally cover all CAD creation tools, node/dimension snaps, transformed geometry, native-store undo and spaced-text outline export. Live Supabase persistence and exhaustive browser coverage of every snap target remain deployment checks.

The curve-intersection pass adds `?intersections=1` to the shared fixture. Mouse checks covered circle/circle, ellipse/segment and circular-arc/segment acquisition, exact displayed dimensions, undo/redo, JSON reload and the 390 px Russian help layout. Mathematical regressions cover finite segments, tangent/near-miss/coincident cases, rotated arc sweeps, eccentric ellipses, native label growth and sampled-bound undershoot. An independent DXF parser verifies the clicked endpoint at 1:1 and 1:10 scale. No production database or physical cutter was used.

The Bézier intersection pass adds `?bezier-intersections=1`. Mouse checks acquired all three roots of one cubic and a tangent contact on another; displayed geometry, undo/redo and JSON reload retained the snapped points. EN/RU/LV help was checked, including wrapped Russian help at 390 px. Unit coverage exercises repeated roots, near misses, finite endpoints, collinear overlap refusal, transformed and tiny curves, the shared primitive budget, real node/dimension handle updates and independently parsed DXF endpoints at 1:1 and 1:10. This uses the existing intersection option; the following pass extends it to cubic/conic pairs.

The cubic/conic pass adds `?cubic-conic=1`. Browser checks acquired all six cubic/circle intersections, dimensioned a cubic/ellipse pair at 48.16 mm, and connected to a cubic/arc tangent contact. Undo/redo and JSON reload preserved the geometry. EN/RU/LV guidance and 390 px Russian wrapping were checked. Mathematical tests cover degree-six roots, repeated contacts, near misses, transformed eccentric ellipses, wrapped arc endpoints, tiny ellipses crossed by long curves and the bounded pair workload. Independent DXF parsing verifies clicked contact coordinates at 1:1 and 1:10. Noncircular conic/conic pairs remain unsupported; these checks do not certify a production server or physical cutter.

Run the browser regressions in an environment with Chromium available:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
npx playwright test --config tests/ui/playwright.config.ts canvas-dock.spec.ts canvas-media.spec.ts canvas-batch.spec.ts canvas-lifecycle.spec.ts
```

Reference patterns: [CorelDRAW workspace overview](https://www.coreldraw.com/en/learn/tutorials/coreldraw-workspace-overview/), [OpenRouter PDF inputs](https://github.com/OpenRouterTeam/docs/blob/main/guides/overview/multimodal/pdfs.mdx), and [OpenRouter errors](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/errors-and-debugging.mdx).

The cubic-pair pass adds `?cubic-pairs=1`. Browser checks acquired all nine crossings of two original cubics, then dimensioned the central crossing to a separate cubic/cubic tangent contact at 98.16 mm. Undo/redo and JSON reload retained the dimension. EN/RU/LV help and the 390 px Russian panel were checked. Fourteen mathematical/editor regressions cover reversed parameter order, isolated tangency versus near misses, close crossings, partial overlap refusal, adjacent split endpoints, translated/rotated/scaled curves, bounded workloads, transformed node snapping and independently parsed DXF endpoints at 1:1 and 1:10. Local validation passed 110 source tests and 1707 unit tests, focused lint, type checking (zero errors; 13 existing warnings), and the production build. These checks do not certify a production server or physical cutter.
