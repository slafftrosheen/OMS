# Canvas: bitmap tracing and vector exchange

Both the idea canvas and the order drawing use these controls. Set document units and scale in **Layout → Document** first. Existing saved drawings need no database migration.

## Operator workflow

1. **Bitmaps → Trace bitmap** opens the tracing docker. Choose a local PNG/JPEG/WebP or select an existing uncropped bitmap and click **Use selected bitmap**. Choose monochrome or color, tune threshold/colors, smoothing and small-path removal, then prepare a preview. Compare source/result, acknowledge the approximation, and apply. The result is ordinary editable Bézier curves, including compound holes, with one undo operation. Source replacement is optional. Selected-image placement, size, rotation and flips are retained.
2. **File → PDF / EPS / DXF** opens vector exchange. PDF import selects one page, retains its physical size, and converts supported paths into editable curves. Enable **Outline text on the OMS server** for glyph outlines. EPS uses the same conversion service automatically. Choose another page to import additional pages. This is separate from attaching the original PDF to an order.
3. **Object → Fill & outline (F12)** changes fill, outline color and physical outline width. For CAD curves, left-clicking a palette swatch sets fill and right-clicking sets outline. Paint is saved with the curve and survives node edits, shaping and combine/break-apart. Filled holes remain holes for hit testing as well as rendering.
4. **Create geometry & text → Polygon / star** creates regular polygons or stars with 3–64 points, diameter, rotation and inner-radius ratio. **Edit curves & shapes → Fillet / chamfer** changes every corner of one convex closed straight contour; excessive dimensions are rejected rather than silently reduced. Fillets use cubic circle approximations.
5. PDF/EPS export offers selection or all drawing objects and a review of omissions. It writes vectors at full physical size, independently of zoom and document scale, with a tightly fitted page. Convert live text to outlines first. DXF export retains its existing analytic circles/arcs/ellipses and SPLINE/polyline options. Positive-weight clamped rational splines of degree 1–5 can now be imported; their polyline approximation has a convex-hull deviation bound of 0.002 mm in physical document units.

Additional familiar keys: F5 freehand, F6 rectangle, F7 ellipse, F8 text, F10 nodes, F12 fill/outline, F3 zoom out, F4 fit drawing and Shift+F2 fit selection. Existing Ctrl+Q/L/K/D workflows remain available (browser-reserved shortcuts also have menu commands).

## Supported exchange and explicit limits

This is **not** universal CorelDRAW / prepress format compatibility. The review must be checked before production.

| Format / feature | Implemented | Limits shown to the operator |
|---|---|---|
| Raster tracing | Local worker, mono or 2–32 colors, fitted lines/quadratics converted exactly into cubic controls, holes, noise/smoothing controls | Approximate source fit; max 1024 px long edge, 4096 resulting nodes / 512 contours. Transparent pixels composite over white; removing white removes white detail too. No centerline tracing, OCR or automatic bitmap cropping. |
| PDF import | One chosen page, paths and affine transforms, RGB fill/stroke, winding rules, dashes, caps/joins, separate fill/stroke alpha, CropBox/rotation/UserUnit through PDF.js | Live text requires optional server outlining. Images, complex or intersected clipping, patterns/gradients, transparency groups, nonuniformly transformed strokes are omitted with warnings. Annotations/optional content require review. A bitmap-only PDF is not automatically vectorized. |
| EPS import | Ghostscript conversion, text outlining, ASCII EPS and DOS EPS with bounded PostScript section | Same vector-import limits after conversion. Font substitution aborts conversion where Ghostscript reports it. Ghostscript must be installed. |
| PDF export | Cubic curves, full size, fill/stroke, holes, dashes, alpha, fitted artboard | CAD geometry and supported unfilled native shapes. Live text, raster/media, form cards and clipped/unsupported objects are reported. Circular geometry is approximated within 0.005 mm. Max page side 5080 mm. |
| EPS export | Cubic curves, full size, fill/stroke, holes and dashes, valid EPS bounding boxes | EPS cannot retain alpha: transparent objects are reported and omitted. Same object/page limits as PDF export. |
| DXF | Existing bounded ASCII 2D interchange plus clamped positive-weight rational splines | Periodic/non-clamped splines, binary DXF, 3D, arbitrary HATCH/TEXT/DIMENSION, paperspace and full layer/style round trips are not implemented. Omitted entities remain in the DXF review. |
| CDR / DWG | Attachments can remain attached to orders | No native editable import/export. |

Unsupported material is never advertised as converted. Import/export with warnings requires an explicit review checkbox. Changes to the document, selection or relevant options invalidate prepared results. Read-only and locked objects cannot be changed. The original bitmap is kept by default.

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

`tests/unit/cad-vector-exchange.test.ts` verifies synthetic bitmap holes, quadratic-to-cubic controls, alpha handling, native-store persistence, fill/hole hit testing, read-only/stale/bound-source protections, physical dimensions at 1:10, PDF.js parsing of exports, actual Ghostscript EPS conversion and PDF text outlining, omission warnings, polygons, corners, and rational spline deviation. The CI workflow installs Ghostscript for these tests.

```sh
node packages/vitest/bin.js tests/unit/cad-vector-exchange.test.ts
npm test
npm run test:unit
npm run check
npm run build
```

Before replacing CorelDRAW in production, run the [canvas acceptance procedure](canvas-acceptance.md) with your own representative logo and PDFs/EPS/DXFs. Compare fonts, holes, fills, stroke widths and full-size dimensions in the actual receiving application. Current automated fixtures do not prove fidelity for arbitrary client artwork.
