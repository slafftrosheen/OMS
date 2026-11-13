# Shared drawing workspace and PDF analysis

Idea boards and draft-order canvases use the same `DrawingWorkspace` around the existing tldraw editor. Opening, saving, restoring, editing order forms, and uploading attachments still use the existing document and form bridges. No database migration is introduced by this change.

## Workspace

The layout follows CorelDRAW's separate menu, standard toolbar and property bar, left toolbox, central drawing area, right docker and vertical colour palette, and bottom status/zoom arrangement. It uses OMS theme colours, original icons and EN/RU/LV labels. Chrome is outside the editor viewport, so fit-to-content and file-drop coordinates use the actual drawing area.

Rectangle, Ellipse/circles and polygon shapes have separate toolbox positions. The small arrow opens the alternatives for a tool group. **Fill & outline (F12)** opens the existing vector paint controls, including gradient and material sections. The toolbox scrolls on short screens; flyouts are positioned outside that scrolling area.

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

- Open **View → Snap options**, the Snap options docker tab, or the footer shortcut. Choose endpoints/nodes, segment midpoints, centres, quadrants, straight-line intersections, nearest points and grid points independently. Snap distance is 2–30 screen pixels and stays consistent through zoom. The grid step displays in the active drawing units and uses the same document grid as native object movement.
- Target choices apply to CAD polylines, Bézier creation, circle/arc construction, dimensions, path/Bézier nodes and dimension endpoints. A marker and status label identify the acquired target. Ctrl temporarily inverts CAD/object snapping; Shift angle constraints take priority. Numeric point entry stays exact and is never resnapped.
- Discrete geometric targets take priority over nearest edges, with the grid as fallback. Nodes are stored geometry, not flattened curve samples. Bézier segment midpoints use bounded arc-length integration; nearest curves use bounded numerical search on the original curve. Intersections cover finite straight segments only, limited to 256 nearby segments per pointer update. Curve/curve intersections, tangencies, perpendicular construction and clip-boundary targets are not implemented in this pass. Clipped and invisible artwork is excluded; locked geometry remains a usable reference.
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

## Deployment and verification

Pull `main`, install dependencies if needed, build, and restart `reclame-oms.service` using the normal deployment process. A Git update alone does not replace the running JavaScript bundle. Earlier installations still need the existing `20261109000001_openrouter_model_settings.sql` migration; this change does not apply migrations automatically.

Regression coverage includes real multi-page PDF extraction and rendering, original-page selection and out-of-range failures, incomplete text layers, PDF mode/model selection, paid-OCR isolation, provider backoff/exhaustion/cancellation, object permissions/transforms, saved canvas/form bridges, and content-bar behaviour. Drawing-operation tests cover metadata-only names, repeat limits and rollback, and export bounds.

Run source/unit tests, Svelte/TypeScript checking, focused linting, whitespace checks and the production build before publishing changes. Run check and build sequentially because both write `.svelte-kit`. The drawing fixture includes width and height selectors for embedded-layout checks. The current chrome pass was exercised through the browser in both drawing hosts: toolbar edits/undo, numeric sizing, tool flyouts, paint access, rail/menu keyboard focus, closed-docker draft retention, read-only guards, EN/RU/LV and Light/Dark/HighContrast themes, including a 390 × 420 embedded workspace. The full historical Playwright suite was not executed in this pass; earlier cases retain legacy tab-role assumptions and need updating before they can certify the current rail. No live OpenRouter account or production server was used for verification.

The contextual-property pass adds a `?text=1` fixture in either host (`?mode=order&text=1` for orders). Browser checks cover mixed text sizing/alignment/width, formatting undo, unapplied content retention, invalid-size recovery, next-text isolation, exact text positioning, native fill/outline controls, lock/read-only protection, and 390/520 px layouts in all three languages and themes. Unit coverage includes atomic rollback, stale selections, protected objects and point-size precision. These checks exercise the shared editor fixture, not a live production database.

The spacing/snapping pass was checked in the shared browser fixtures: mixed editable text spacing and JSON reload, multiline text and Enter/Escape validation in the order host, line-intersection and circle-quadrant acquisition, grid-step undo/redo and reload, read-only fields, and the 390 px Latvian dark layout. Unit checks additionally cover all CAD creation tools, node/dimension snaps, transformed geometry, native-store undo and spaced-text outline export. Live Supabase persistence and exhaustive browser coverage of every snap target remain deployment checks.

Run the browser regressions in an environment with Chromium available:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
npx playwright test --config tests/ui/playwright.config.ts canvas-dock.spec.ts canvas-media.spec.ts canvas-batch.spec.ts canvas-lifecycle.spec.ts
```

Reference patterns: [CorelDRAW workspace overview](https://www.coreldraw.com/en/learn/tutorials/coreldraw-workspace-overview/), [OpenRouter PDF inputs](https://github.com/OpenRouterTeam/docs/blob/main/guides/overview/multimodal/pdfs.mdx), and [OpenRouter errors](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/errors-and-debugging.mdx).
