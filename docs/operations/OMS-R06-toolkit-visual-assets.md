# Toolkit — Visual imports, drawing and material-study acceptance

This is part of **OMS-R06**, and uses the SAME unapplied R06 SQL migration as shared canvases. No production service, database, bucket or provider was modified by the GitHub commit.

## Images / PDFs

- Private Supabase Storage bucket: `toolkit-assets`, maximum single file 25 MiB, no public URLs.
- Metadata table `toolkit_assets` maps asset UUID to its originating shared canvas, MIME, filename, size and storage path.
- Toolkit management roles **RD, Boss, HeadOfProduction** can access all team projects and media. Other staff receive 403; signed-out users receive 401.
- `POST /api/toolkit/assets/[board]` uploads a multipart `file`; checks project visibility, MIME and signature. Supported: PNG, JPEG, WebP, GIF, PDF. **SVG, HTML, ZIP and arbitrary binaries are rejected**. A successful upload creates an image or PDF DocumentShape with a saved authenticated URL.
- `GET /api/toolkit/assets/[board]/[asset]` streams binary through a signed-in endpoint; verifies that the asset belongs to the specified project. Files are not placed in the `canvas_documents.payload` JSON and aren't base64-inlined.
- Import via the top toolbar **Images / PDFs** picker, or drag/drop directly onto the canvas. The UI reports progress and recoverable errors; each uploaded image/PDF is placed at a distinct position.
- Images can be moved, resized, switched between fit and crop and displayed at controlled opacity. PDF uses the installed pdfjs-dist worker to render an actual page as canvas pixels, with page navigation and a link to open the underlying document.

## Visualizing and texturing

- Toolkit adds quick controls for **Select, Pen, Highlight, Shapes, Text, Eraser and Connect**, alongside Undo, Redo, Fit and Delete selection.
- Built-in tldraw shape/stroke/style controls remain available for freehand visuals and annotations.
- **Material studies** insert movable/resizable `material-swatch` nodes: brushed metal, matte, frosted acrylic, wood grain, concrete, patina, mesh. `From selected image` uses the URL of a selected imported image as a reference texture. Preset textures are CSS illustrations only, **not material sampling, calibrated color or photo-realistic physically based rendering**.
- PDF and image DocumentShapes are kept distinct from order-linked assets so order file management is not silently changed. Legacy ChatShape nodes on Toolkit are disabled as interactive chats because their messages used to persist in shared shape properties; use the private Brainstorm sidebar instead.

## Staging acceptance and known limits

First back up and verify the actual PostgreSQL and Storage schemas, then apply the R01/R02 prerequisite migrations and the R06 migration in a disposable staging system. The R06 migration introduces private Storage/metadata policies; do not deploy only the app code. Run `npm ci`, `npm run test`, `npm run check`, `npm run build`.

Verify at least the following manually in a browser:
1. Import PNG, JPEG, WebP, GIF and a 10-page PDF. Confirm image display, crop/fit and opacity; paginate PDF and test zoom/resize; refresh the board and confirm every image and PDF is still accessible.
2. Import by drag/drop onto a specific page location and via picker. Check file status/errors and a 25 MiB limit.
3. Open the same project as Boss and RD. Confirm both see exactly the same images, pages, arrows and material references, while their assistant history remains private.
4. Verify Operator/StationHead and anonymous users cannot upload or retrieve via direct HTTP or Storage endpoints.
5. Probe intentionally bad MIME/signature pairs, SVG, script HTML, forged project identifiers and cross-project URL changes; expect rejection.
6. Sketch with Pen, Highlight, Shapes, Text, Connect, Eraser; undo/redo, persist and reopen; verify keyboard/tablet behavior and tool selection indicators.
7. Create a material swatch from an imported image, check opacity/preset changes, resize and refresh.
8. Confirm order-edit canvas upload functionality and existing engineering shape tools still work.
9. Ensure PDF preview failure offers an Open File option rather than corrupting the canvas.

**Known limitations:** PDF rendering depends on browser PDF.js/Web Worker support and has not been exercised in the deployment. The new material textures are illustrative overlays, not actual PBR/UV-mapped materials. There is no vector tracing, image editing, brush texture painting, automatic document OCR, or export-to-3D pipeline yet. A recovered copy may still reference media in its source project, so deleting that source project can invalidate those copied references. Shared-team editing uses revision checks rather than true real-time merging. Deleting a board attempts best-effort cleanup of its Storage objects; failures are logged for housekeeping. Do not claim these functions are live verified solely because the code is committed.
