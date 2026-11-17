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
