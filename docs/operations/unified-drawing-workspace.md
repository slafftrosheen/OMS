# Shared drawing workspace and PDF analysis

Idea boards and draft-order canvases use the same `DrawingWorkspace` around the existing tldraw editor. Opening, saving, restoring, editing order forms, and uploading attachments still use the existing document and form bridges. No database migration is introduced by this change.

## Workspace

The layout follows CorelDRAW's separate menu, standard toolbar and property bar, left toolbox, central drawing area, right docker and vertical colour palette, and bottom status/zoom arrangement. It uses OMS theme colours, original icons and EN/RU/LV labels. Chrome is outside the editor viewport, so fit-to-content and file-drop coordinates use the actual drawing area.

Rectangle, Ellipse/circles and polygon shapes have separate toolbox positions. The small arrow opens the alternatives for a tool group. **Fill & outline (F12)** opens the existing vector paint controls, including gradient and material sections. The toolbox scrolls on short screens; flyouts are positioned outside that scrolling area.

The labelled vertical rail beside the colour palette opens **Properties**, **Text**, **Arrange**, **Measure**, **Objects** or **CAD**. The active docker has one title and close control; its rail stays available when closed. On narrow embedded canvases, the docker overlays the drawing instead of reducing the viewport to a sliver. Position/size controls remain horizontally scrollable when space is limited. These changes apply to both drawing hosts without changing embedded order-form styling or document data.

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

Run the browser regressions in an environment with Chromium available:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
npx playwright test --config tests/ui/playwright.config.ts canvas-dock.spec.ts canvas-media.spec.ts canvas-batch.spec.ts canvas-lifecycle.spec.ts
```

Reference patterns: [CorelDRAW workspace overview](https://www.coreldraw.com/en/learn/tutorials/coreldraw-workspace-overview/), [OpenRouter PDF inputs](https://github.com/OpenRouterTeam/docs/blob/main/guides/overview/multimodal/pdfs.mdx), and [OpenRouter errors](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/errors-and-debugging.mdx).
