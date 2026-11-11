# Canvas: bitmap tracing and vector exchange

Both the idea canvas and the order drawing use these controls. Set document units and scale in **Layout → Document** first. Existing saved drawings need no database migration.

## Operator workflow

1. **Bitmaps → Trace bitmap** opens the tracing docker. Choose a local PNG/JPEG/WebP or select an existing uncropped bitmap (including a bitmap imported from PDF/EPS) and click **Use selected bitmap**. Choose monochrome or color, tune threshold/colors, smoothing and small-path removal, then prepare a preview. Compare source/result, acknowledge the approximation, and apply. The result is ordinary editable Bézier curves, including compound holes, with one undo operation. Source replacement is optional. Selected-image placement, size, rotation and flips are retained.
2. **File → PDF / EPS / DXF** opens vector exchange. PDF import selects one page, retains its physical size, and converts supported paths into editable curves. Enable **Outline text on the OMS server** for glyph outlines. EPS uses the same conversion service automatically. Choose another page to import additional pages. This is separate from attaching the original PDF to an order.
3. **Object → Fill & outline (F12)** changes fill, outline color and physical outline width. For CAD curves, left-clicking a palette swatch sets fill and right-clicking sets outline. Paint is saved with the curve and survives node edits, shaping and combine/break-apart. Filled holes remain holes for hit testing as well as rendering.
4. **Create geometry & text → Polygon / star** creates regular polygons or stars with 3–64 points, diameter, rotation and inner-radius ratio. **Edit curves & shapes → Fillet / chamfer** changes every corner of one convex closed straight contour; excessive dimensions are rejected rather than silently reduced. Fillets use cubic circle approximations.
5. PDF/EPS export offers selection or all drawing objects and a review of omissions. It writes vectors at full physical size, independently of zoom and document scale, with a tightly fitted page. Convert live text to outlines first. DXF export retains its existing analytic circles/arcs/ellipses and SPLINE/polyline options. Positive-weight rational splines of degree 1–5, including periodic/non-clamped curves over their active knot interval, can be imported; their polyline approximation has a convex-hull deviation bound of 0.002 mm in physical document units.

Additional familiar keys: F5 freehand, F6 rectangle, F7 ellipse, F8 text, F10 nodes, F12 fill/outline, F3 zoom out, F4 fit drawing and Shift+F2 fit selection. Existing Ctrl+Q/L/K/D workflows remain available (browser-reserved shortcuts also have menu commands).

## Supported exchange and explicit limits

This is **not** universal CorelDRAW / prepress format compatibility. The review must be checked before production.

| Format / feature | Implemented | Limits shown to the operator |
|---|---|---|
| Raster tracing | Local worker, mono or 2–32 colors, fitted lines/quadratics converted exactly into cubic controls, holes, noise/smoothing controls | Approximate source fit; max 1024 px long edge, 4096 resulting nodes / 512 contours. Transparent pixels composite over white; removing white removes white detail too. No centerline tracing, OCR or automatic bitmap cropping. |
| PDF import | One chosen page; editable paths and affine transforms; RGB fill/stroke; winding rules; dashes, caps/joins and alpha; nested clipping paths; opaque axial and expanding radial gradients; embedded RGB/RGBA/monochrome images; CropBox/rotation/UserUnit through PDF.js | Live text requires server outlining. Mesh/transparent/nonextended gradients, tiling patterns, transparency groups, image stencils and nonuniform strokes remain reported. Images remain bitmaps until traced. Up to 16 images, 1024 px long edge, 750 KB combined encoded payload; oversize images are reported. Radial gradients require the final radius to exceed the initial radius. Color functions are sampled by PDF.js into RGB stops; no ICC/spot-color workflow. |
| EPS import | Ghostscript conversion, text outlining, ASCII EPS and DOS EPS with bounded PostScript section | Same vector-import limits after conversion. Font substitution aborts conversion where Ghostscript reports it. Ghostscript must be installed. |
| PDF export | Cubic curves, full size, fill/stroke, holes, dashes, alpha, nested imported clips, gradients, imported embedded rasters with alpha masks, fitted artboard | CAD geometry and supported unfilled native shapes. Live text, ordinary media/image attachments, form cards and native frame masks are reported. Imported PDF artwork retains its own clips. Circular geometry is approximated within 0.005 mm. Max page side 5080 mm. |
| EPS export | Level 3 EPS: curves, fills/outlines, holes, dashes, clips, gradients and opaque embedded rasters | EPS cannot retain alpha: transparent objects/images are reported and omitted. Same object/page limits as PDF export. |
| DXF | ASCII 2D interchange; bulged polylines; clamped and periodic/non-clamped positive-weight splines; nested blocks, nonuniform/mirrored transforms and row/column arrays; solid hatch loops (polyline, arc, ellipse, spline); SOLID/TRACE/planar 3DFACE; saved dimension block geometry; layer-0 and BYLAYER/BYBLOCK color inheritance; planar elevations and −Z OCS | Binary DXF, arbitrary 3D, TEXT/MTEXT/ATTRIB, fit-point-only splines, wide polylines, meshes, paperspace and full layer/linetype/style round trips remain unsupported. Pattern/gradient HATCH imports its editable boundaries with an explicit appearance warning. DIMENSION uses its existing block; missing blocks and text remain reported. Constant Z is projected to XY with a warning. Clipped artwork/raster is omitted from DXF export rather than exporting invisible cut lines. |
| CDR / DWG | Attachments can remain attached to orders | No native editable import/export. |

Unsupported material is never advertised as converted. Import/export with warnings requires an explicit review checkbox. Changes to the document, selection or relevant options invalidate prepared results. Read-only and locked objects cannot be changed. The original bitmap is kept by default. Imported clipping and gradient/image coordinates are stored with the editable paths and follow object moves, rotation, mirrors and resizing. Clipping is nondestructive; node editing changes the artwork under its mask. Region shaping/combining of clipped, gradient or raster-painted objects is blocked pending an explicit flatten/unclip workflow. Selecting an imported bitmap and using **Trace bitmap** retains its affine placement and clipping. Changing its fill to a solid color replaces the gradient/image fill.

Embedded raster data is saved in the canvas snapshot, not in a temporary browser URL. It contains a bounded PNG for display and compressed RGB/alpha channels for vector-file export. Imports are checked against the existing 2 MB order/idea canvas save limit before applying. This is intended for modest logos/artwork, not large production photographs. Use a separate canvas or attach the original source when the budget is exceeded.

## Deployment

Docker production images now install `ghostscript`. For the existing Debian/Ubuntu systemd host, install its maintained distribution package before using EPS or PDF text outlining:

```sh
sudo apt-get update
sudo apt-get install ghostscript
gs --version
npm ci
npm run build
sudo systemctl restart reclame-oms.service
```

Keep Ghostscript patched. Conversion is authenticated and limited to the existing Toolkit manager roles. Input bytes are capped at 12 MiB while streaming; conversion has a 20-second timeout, a 20 MiB output cap, a maximum of two concurrent processes per OMS process and a per-user throttle. Ghostscript runs with SAFER, fixed flags, no shell, a minimal environment, and a private temporary directory removed on completion/failure. It does not receive application credentials or remote URLs. Missing Ghostscript returns an actionable 503; PDF path-only import and tracing still run locally. Retain the existing `BODY_SIZE_LIMIT=32M` deployment setting for other upload workflows.

## Verification

`tests/unit/cad-vector-exchange.test.ts` verifies synthetic bitmap holes, quadratic-to-cubic controls, alpha handling, native-store persistence, fill/hole hit testing, read-only/stale/bound-source protections, physical dimensions at 1:10, PDF.js parsing of exports, actual Ghostscript EPS conversion and PDF text outlining, omission warnings, polygons, corners, and rational spline deviation. The CI workflow installs Ghostscript for these tests. `cad-external-import.test.ts` uses committed DXFs generated by **ezdxf 1.4.5**, not the OMS exporter, including independent periodic-spline samples. `cad-artwork-exchange.test.ts` renders PDF and EPS using actual Ghostscript and checks colors, clipping holes, gradient transforms, image orientation and alpha. It also tests an independently authored EPS through server conversion → editable import → export, native-store persistence, unsafe paint rejection and the snapshot budget. The fixture generator is development-only; Python/ezdxf are not runtime dependencies.

DXF implementation references: Autodesk [boundary path data](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-DC5215D6-E73F-4DFF-8BE9-01CA9610FAEE.htm), [INSERT](https://help.autodesk.com/cloudhelp/2017/ENU/AutoCAD-DXF/files/GUID-28FA4CFB-9D5E-4880-9F11-36C97578252F.htm), and [HATCH](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-C6C71CED-CE0F-4184-82A5-07AD6241F15B.htm).

```sh
node packages/vitest/bin.js tests/unit/cad-vector-exchange.test.ts
npm test
npm run test:unit
npm run check
npm run build
```

Before replacing CorelDRAW in production, run the [canvas acceptance procedure](canvas-acceptance.md) with your own representative logo and PDFs/EPS/DXFs. Compare fonts, holes, fills, stroke widths and full-size dimensions in the actual receiving application. Current automated fixtures do not prove fidelity for arbitrary client artwork.
