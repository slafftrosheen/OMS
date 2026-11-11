# Canvas: bitmap tracing and vector exchange

Both the idea canvas and the order drawing use these controls. Set document units and scale in **Layout → Document** first. Existing saved drawings need no database migration.

## Operator workflow

1. **Bitmaps → Trace bitmap** opens the tracing docker. Choose a local PNG/JPEG/WebP or select an existing uncropped bitmap (including a bitmap imported from PDF/EPS) and click **Use selected bitmap**. Choose monochrome or color, tune threshold/colors, smoothing and small-path removal, then prepare a preview. Compare source/result, acknowledge the approximation, and apply. The result is ordinary editable Bézier curves, including compound holes, with one undo operation. Source replacement is optional. Selected-image placement, size, rotation and flips are retained.
2. **File → PDF / EPS / DXF** opens vector exchange. PDF import selects one page and retains its physical size. **Automatic · preserve appearance** keeps editable paths when supported; pages with unsupported effects or live text become a clearly labelled bitmap at the selected 72/150/300/600 DPI. Choose **Editable curves** to retain supported vectors and inspect omissions, or **Rendered page** to force a bitmap. Enable **Outline text on the OMS server** for glyph outlines. EPS uses the same conversion service automatically. Choose another page to import additional pages. This is separate from attaching the original PDF to an order.
3. DXF accepts ASCII and binary files. Choose a font (including a local TTF/OTF/WOFF/WOFF2) for editable text outlines; review the substitution warning. For 3D DXF choose Top (XY), Front (XZ), or Side (YZ). Strict 2D remains the default. Projection drops depth and does not remove hidden edges.
4. **Object → Fill & outline (F12)** changes fill, outline color and physical outline width. For CAD curves, left-clicking a palette swatch sets fill and right-clicking sets outline. Paint is saved with the curve and survives node edits, shaping and combine/break-apart. Filled holes remain holes for hit testing as well as rendering.
5. **Create geometry & text → Polygon / star** creates regular polygons or stars with 3–64 points, diameter, rotation and inner-radius ratio. **Edit curves & shapes → Fillet / chamfer** changes every corner of one convex closed straight contour; excessive dimensions are rejected rather than silently reduced. Fillets use cubic circle approximations.
6. PDF/EPS export offers selection or all drawing objects and a review of omissions. It writes vectors at full physical size, independently of zoom and document scale, with a tightly fitted page. Convert live text to outlines first. DXF export retains its existing analytic circles/arcs/ellipses and SPLINE/polyline options. Positive-weight rational splines of degree 1–5, including periodic/non-clamped curves over their active knot interval, can be imported; their polyline approximation has a convex-hull deviation bound of 0.002 mm in physical document units.

Additional familiar keys: F5 freehand, F6 rectangle, F7 ellipse, F8 text, F10 nodes, F12 fill/outline, F3 zoom out, F4 fit drawing and Shift+F2 fit selection. Existing Ctrl+Q/L/K/D workflows remain available (browser-reserved shortcuts also have menu commands).

## Supported exchange and explicit limits

This is **not** universal CorelDRAW / prepress format compatibility. The review must be checked before production.

| Format / feature | Implemented | Limits shown to the operator |
|---|---|---|
| Raster tracing | Local worker, mono or 2–32 colors, fitted lines/quadratics converted exactly into cubic controls, holes, noise/smoothing controls | Approximate source fit; max 1024 px long edge, 4096 resulting nodes / 512 contours. Transparent pixels composite over white; removing white removes white detail too. No centerline tracing, OCR or automatic bitmap cropping. |
| PDF import | One selected page; editable paths/transforms, fill/stroke, winding rules, dashes, caps/joins, alpha, nested clips, opaque axial and expanding/shrinking radial gradients; original-resolution RGB/RGBA/monochrome images. Automatic or forced page rendering preserves patterns, mesh gradients, groups, masks and blending through PDF.js. Standard fonts and packed CMaps are bundled locally. | Advanced effects are preserved as a **bitmap page**, not individually editable objects. Editable mode reports unsupported effects and live text; server outlining can produce text curves. Image limits: 32 megapixels, 16384 px per side, 25 MiB PNG; 64 images / 64 megapixels total per import/export. Page rendering rejects excessive DPI instead of silently downsampling. RGB output; no ICC/spot-color prepress guarantee. |
| EPS import | Ghostscript conversion, text outlining, ASCII EPS and DOS EPS with bounded PostScript section | Same vector-import limits after conversion. Font substitution aborts conversion where Ghostscript reports it. Ghostscript must be installed. |
| PDF export | Cubic curves, full size, fill/stroke, holes, dashes, alpha, nested imported clips, gradients, imported embedded rasters with alpha masks, fitted artboard | CAD geometry and supported unfilled native shapes. Live text, ordinary media/image attachments, form cards and native frame masks are reported. Imported PDF artwork retains its own clips. Circular geometry is approximated within 0.005 mm. Max page side 5080 mm. |
| EPS export | Level 3 EPS: curves, fills/outlines, holes, dashes, clips, gradients and opaque embedded rasters | EPS cannot retain alpha: transparent objects/images are reported and omitted. Same object/page limits as PDF export. |
| DXF | ASCII and binary R12/R13+ import; bulged polylines; rational and periodic splines; blocks/arrays and color inheritance; hatch boundaries and solid fills; saved dimension graphics; TEXT/MTEXT/ATTRIB and constant ATTDEF as editable glyph curves; explicit XY/XZ/YZ projection of 3D lines, polylines, polyface/polygon meshes, 3DFACE edges, splines, tilted planar entities and nested XYZ blocks. Export remains ASCII 2D. | No 3D solid modeler: ACIS 3DSOLID/REGION, modern MESH entities, thickness extrusions, fit-point-only splines, wide polylines, paperspace and full style/layer round trips remain reported. 3D import is a wire projection without depth or hidden-edge removal. Text uses the selected substitute font; MTEXT inline styles/fractions are flattened with a warning, columns/vertical layouts remain unsupported. No live text editing or SHX font engine. Pattern/gradient hatches retain boundaries with a warning. Clipped artwork and rasters remain excluded from DXF cutting geometry. |
| CDR / DWG | Attachments can remain attached to orders | No native editable import/export. |

Unsupported material is never advertised as converted. Import/export with warnings requires an explicit review checkbox. Changes to the document, selection or relevant options invalidate prepared results. Read-only and locked objects cannot be changed. The original bitmap is kept by default. Imported clipping and gradient/image coordinates are stored with the editable paths and follow object moves, rotation, mirrors and resizing. Clipping is nondestructive; node editing changes the artwork under its mask. Region shaping/combining of clipped, gradient or raster-painted objects is blocked pending an explicit flatten/unclip workflow. Selecting an imported bitmap and using **Trace bitmap** retains its affine placement and clipping. Changing its fill to a solid color replaces the gradient/image fill.

New PDF/EPS images are stored as **private file attachments**, using existing order or Toolkit storage. The canvas snapshot holds the file ID, authenticated relative URL, original dimensions and placement; it no longer carries duplicated image pixels. Preparing a preview uploads its images. Cancelling a preview leaves uploaded resources in the existing attachment library. On a new unsaved order, images are queued with its other attachments; Save replaces local blob references only after successful upload, and removing a queued image removes its canvas shape. PDF/EPS export fetches original pixels and creates a portable embedded file; a missing original blocks export. Existing drawings with inline PNG/RGB data remain readable. The 2 MB snapshot limit still protects geometry/metadata, while the previous 1024 px / 750 KB embedded-image cap is removed. The separate bitmap **tracing** worker still processes a maximum 1024 px source.


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

Keep Ghostscript patched. Conversion is authenticated and limited to the existing Toolkit manager roles. Input bytes are capped at 12 MiB while streaming; conversion has a 20-second timeout, a 20 MiB output cap, a maximum of two concurrent processes per OMS process and a per-user throttle. Ghostscript runs with SAFER, fixed flags, no shell, a minimal environment, and a private temporary directory removed on completion/failure. It does not receive application credentials or remote URLs. Missing Ghostscript returns an actionable 503; PDF path-only import and tracing still run locally. Retain `BODY_SIZE_LIMIT=32M` and the existing private Storage bucket policies for image imports. No new database migration is required.

## Verification

`tests/unit/cad-vector-exchange.test.ts` verifies synthetic bitmap holes, quadratic-to-cubic controls, alpha handling, native-store persistence, fill/hole hit testing, read-only/stale/bound-source protections, physical dimensions at 1:10, PDF.js parsing of exports, actual Ghostscript EPS conversion and PDF text outlining, omission warnings, polygons, corners, and rational spline deviation. The CI workflow installs Ghostscript for these tests. `cad-external-import.test.ts` uses committed DXFs generated by **ezdxf 1.4.5**, not the OMS exporter, including independent periodic-spline samples. `cad-artwork-exchange.test.ts` renders PDF and EPS using actual Ghostscript and checks colors, clipping holes, gradient transforms, image orientation and alpha. It also tests an independently authored EPS through server conversion → editable import → export, native-store persistence, unsafe paint rejection and the snapshot budget. `cad-dxf-expanded.test.ts` checks independent R12/R2010 binary fixtures, glyph placement/attributes and nested 3D projections against ezdxf coordinates. `cad-raster-assets.test.ts` verifies a 2048×1024 noisy image larger than 750 KB, lossless full-resolution export, private reference validation and new-order save mapping. `cad-pdf-appearance.test.ts` compares real PDF.js rendering of patterns, transparency groups and blending against Ghostscript pixels and verifies standard-font rendering without system fonts. Browser interaction and live private Storage are still deployment acceptance checks. The fixture generator is development-only; Python/ezdxf are not runtime dependencies.

DXF implementation references: Autodesk [boundary path data](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-DC5215D6-E73F-4DFF-8BE9-01CA9610FAEE.htm), [INSERT](https://help.autodesk.com/cloudhelp/2017/ENU/AutoCAD-DXF/files/GUID-28FA4CFB-9D5E-4880-9F11-36C97578252F.htm), and [HATCH](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-C6C71CED-CE0F-4184-82A5-07AD6241F15B.htm).

```sh
node packages/vitest/bin.js tests/unit/cad-vector-exchange.test.ts
npm test
npm run test:unit
npm run check
npm run build
```

Before replacing CorelDRAW in production, run the [canvas acceptance procedure](canvas-acceptance.md) with your own representative logo and PDFs/EPS/DXFs. Compare fonts, holes, fills, stroke widths and full-size dimensions in the actual receiving application. Current automated fixtures do not prove fidelity for arbitrary client artwork.

Additional Autodesk references: [binary DXF](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-FC1C3C69-DBC2-49E4-893A-000D6538C0FE.htm), [TEXT](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-62E5383D-8A14-47B4-BFC4-35824CAE8363.htm), [MTEXT](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm).
