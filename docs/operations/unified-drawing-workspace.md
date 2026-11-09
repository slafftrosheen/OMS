# Shared drawing workspace and PDF analysis

Idea boards and draft-order canvases use the same `DrawingWorkspace` around the existing tldraw editor. Opening, saving, restoring, editing order forms, and uploading attachments still use the existing document and form bridges. No database migration is introduced by this change.

## Workspace

The layout follows CorelDRAW's menu/property bar, left toolbox, central drawing area, right properties/object docker and palette, and bottom status/zoom arrangement. It uses OMS theme colours and EN/RU/LV labels. Chrome is outside the editor viewport, so fit-to-content and file-drop coordinates use the actual drawing area.

- Pick, pan, freehand, line, arrow, rectangle, ellipse, triangle, diamond, pentagon, star, text, highlight, eraser, and frame tools.
- Object X/Y, width/height and rotation; grouping, alignment, distribution, stacking, mirroring, quarter-turn rotation, duplication, and deletion.
- Properties for available native shape styles: fill, outline pattern, size, opacity, font/alignment, line spline and arrowheads. Objects can be selected and explicitly locked/unlocked in the objects panel.
- Camera-aware pixel rulers, grid and object snapping, fit/selection zoom, undo and redo. F6/F7/F8 select rectangle/ellipse/text; F4 fits the drawing; Ctrl/Cmd+D duplicates. Form fields retain their own typing behaviour.
- Import uses the existing authorized upload path. SVG/PNG export covers supported drawn objects; embedded order forms and document viewers are excluded with an explanation.
- Idea-only content and assistant actions remain in a compact content bar. Order-only notes, warnings and explanations remain beside the common property controls.

This is an OMS drawing workspace built on tldraw, not a CorelDRAW file engine. Coordinates are canvas pixels, not calibrated millimetres. It does not add CDR import/editing, CMYK colour management, vector boolean operations or a full Bézier/node editor. Native tldraw colours share one value for outline and fill; the UI states this instead of presenting independent colour controls that do not work.

## PDF analysis

`/api/toolkit/analyze-asset` validates the caller, board/asset pair, stored size and file signature before analysis. The ordinary PDF path no longer requires an upstream file-parser service.

| Mode | Input sent to the configured model | Bounds |
| --- | --- | --- |
| Automatic | Locally extracted text when every page has a readable text layer; otherwise locally rendered page images | Text: 40 pages and 60,000 characters; visual: 10 pages and 24 MiB rendered images |
| Text | Locally extracted text; rejects incomplete/scan-only pages | Same text bounds |
| Visual | Locally rendered, numbered page images using the saved R&D vision model | Same visual bounds |
| Explicit paid OCR | Original private PDF bytes with `mistral-ocr` | Existing administrator gate and per-request opt-in remain required |

Automatic/text analysis uses the selected allow-listed text model. Visual analysis uses the saved R&D vision model. A text-layer heuristic cannot establish that diagrams or scanned regions have been fully captured: choose Visual for signage layout, colours, or graphical dimensions. The assistant and result UI explicitly identify text-only analysis. Extracted text is separate evidence; a model's visual answer is not labelled verified OCR.

PDF parsing is isolated in a bounded worker and uses no temporary source files. Local extraction times out after 20 seconds; rendering after 30 seconds. The complete Toolkit analysis has a 140-second server deadline and a 150-second client budget. Existing 8 MiB image / 12 MiB PDF input limits remain unchanged. No source URL is made public.

The shared non-streaming OpenRouter client retries HTTP 408/502/503/504 once on the same model within one overall deadline. It respects Retry-After up to five seconds; longer waits are returned to the client. It does not retry credentials, payment or quota errors and does not upgrade to a paid model. HTTP 200 error envelopes are treated as failures. The UI also respects 503 cooldowns and never automatically resubmits a private document.

A persistent OpenRouter 503 still means no suitable provider was available; code cannot guarantee free-model capacity. The response now distinguishes that condition from parser/input failures, missing credentials and unavailable database model settings. Select an available model in R&D settings when necessary. Live account/provider availability must be checked on the deployed installation.

## Deployment and verification

Pull `main`, install dependencies if needed, build, and restart `reclame-oms.service` using the normal deployment process. A Git update alone does not replace the running JavaScript bundle. Earlier installations still need the existing `20261109000001_openrouter_model_settings.sql` migration; this change does not apply migrations automatically.

Regression coverage includes real multi-page PDF extraction and rendering, incomplete text layers, PDF mode/model selection, paid-OCR isolation, provider backoff/exhaustion/cancellation, object permissions/transforms, saved canvas/form bridges, and content-bar behaviour.

Validated for this change: 110 source tests and 1,205 unit tests pass; Svelte/TypeScript checking reports zero errors (14 pre-existing warnings). Focused linting and whitespace checks pass. Browser cases are provided, but their execution was blocked before page load by Chromium's `socket() Operation not permitted`; the alternate browser could not reach the test server. No live OpenRouter account or production server was used for verification.

Run the browser regressions in an environment with Chromium available:

```sh
npx playwright test --config tests/ui/playwright.drawing-workspace.config.ts
npx playwright test --config tests/ui/playwright.config.ts canvas-dock.spec.ts canvas-media.spec.ts canvas-batch.spec.ts canvas-lifecycle.spec.ts
```

Reference patterns: [CorelDRAW workspace overview](https://www.coreldraw.com/en/learn/tutorials/coreldraw-workspace-overview/), [OpenRouter PDF inputs](https://github.com/OpenRouterTeam/docs/blob/main/guides/overview/multimodal/pdfs.mdx), and [OpenRouter errors](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/errors-and-debugging.mdx).
