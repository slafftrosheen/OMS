import {ProductionSaveButton} from './ProductionSaveButton';
import { storeCanvasImage } from "./cad-asset-store";
import { prepareVectorExportWithAssets } from "./cad-vector-export-client";
import { VectorArtwork } from "./VectorArtwork";
import React, { useEffect, useRef, useState } from "react";
import { useEditor, useValue, type Editor } from "@tldraw/tldraw";
import { curveBounds, curvePathData, mapContours } from "./cad-curves";
import {
  applyCadPlan,
  assertCadEditable,
  cadRevision,
  makeCadPlan,
  type CadPlan,
} from "./cad-plans";
import { cadMmPerPixel, unitMm, type CadSettings } from "./cad-settings";
import {
  prepareVectorImport,
  vectorPaint,
  paintMetadata,
  validVectorPaint,
  type VectorDocument,
} from "./cad-vector";
import { DEFAULT_TRACE_OPTIONS } from "./cad-trace";
import { runRasterTrace } from "./cad-trace-client";
import { prepareVectorExport } from "./cad-vector-export";
import { prepareCorners, regularPolygon } from "./cad-corners";
import { prepareNodeCorner, applyNodeCorner, type CadNodeCornerPlan } from './cad-node-corners';
import { getSelectedCadNode, setCadNodeEditing } from './cad-node-selection';
import { drawingTransaction } from "./drawing-commands";
import { useVectorText, vectorError } from "./cad-vector-copy";
import { MaterialTexturePanel } from './MaterialTexturePanel';

type Props = {
  settings: CadSettings | null;
  revision: string;
  disabled: boolean;
  focusSequence?: number;
};
type Review = { plan: CadPlan; key: string; original?: string; originalContours?: CadPlan['contours']; previewBounds?: ReturnType<typeof curveBounds> };
const limit = 12 * 1024 * 1024;
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="drawing-cad-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function useWork() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController>();
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  return {
    busy,
    message,
    setMessage,
    cancel: () => controller.current?.abort(),
    run: async (action: (signal: AbortSignal) => Promise<void>) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setBusy(true);
      setMessage("");
      try {
        await action(next.signal);
      } catch (error) {
        if (controller.current === next)
          setMessage(next.signal.aborted ? "cancelled" : vectorError(error));
      } finally {
        if (controller.current === next) setBusy(false);
      }
    },
  };
}
function WorkStatus({ work }: { work: ReturnType<typeof useWork> }) {
  const t = useVectorText();
  return (
    <>
      {work.busy && (
        <p role="status">
          {t("working")}{" "}
          <button type="button" onClick={work.cancel}>
            {t("cancel")}
          </button>
        </p>
      )}
      {work.message && (
        <p className="drawing-help" role="status">
          {t(work.message)}
        </p>
      )}
    </>
  );
}
function Preview({
  review,
  inputKey,
  revision,
  disabled,
  onApplied,
  onApply,
}: {
  review: Review;
  inputKey: string;
  revision: string;
  disabled: boolean;
  onApplied: () => void;
  onApply?: () => boolean;
}) {
  const editor = useEditor(),
    t = useVectorText();
  const [ack, setAck] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setAck(false);
    setFailed(false);
  }, [review]);
  const { plan } = review,
    bounds = review.previewBounds ?? curveBounds(plan.contours),
    minimumSpan = review.previewBounds ? 1e-6 : 1,
    padding = Math.max(bounds.w, bounds.h, minimumSpan) * 0.05;
  const stale = review.key !== inputKey || plan.revision !== revision;
  return (
    <div className="drawing-cad-report" data-testid="vector-review">
      <div className="drawing-vector-comparison">
        {review.original && (
          <figure>
            <figcaption>{t("original")}</figcaption>
            <img src={review.original} alt={t("original")} />
          </figure>
        )}
        <figure>
          <figcaption>{t("result")}</figcaption>
          <svg
            role="img"
            aria-label={t("result")}
            viewBox={`${bounds.x - padding} ${bounds.y - padding} ${Math.max(bounds.w, minimumSpan) + 2 * padding} ${Math.max(bounds.h, minimumSpan) + 2 * padding}`}
          >
            {review.originalContours && <path d={curvePathData(review.originalContours)} fill="none" stroke="#6b7280" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity={0.7} />}
            {plan.shapes?.map((s, i) => {
              if (s.type !== "cad-bezier") return null;
              const p = vectorPaint(s.meta ?? {});
              return (
                <VectorArtwork
                  key={i}
                  id={`preview-${i}`}
                  contours={s.props.contours as any}
                  fillRule={s.props.fillRule as any}
                  paint={p}
                />
              );
            }) ?? (
              <path
                d={curvePathData(plan.contours)}
                fill="none"
                stroke={review.originalContours ? '#1d4ed8' : 'currentColor'}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </figure>
      </div>
      {review.originalContours && <p className="drawing-help">{t('cornerCompare')}</p>}
      <dl className="drawing-cad-values">
        <dt>{t("paths")}</dt>
        <dd>{plan.contours.length}</dd>
        <dt>{t("nodes")}</dt>
        <dd>{plan.contours.reduce((n, c) => n + c.nodes.length, 0)}</dd>
        <dt>{t("bounds")}</dt>
        <dd>
          {Number(plan.widthMm.toFixed(3))} × {Number(plan.heightMm.toFixed(3))}
        </dd>
      </dl>
      {!!plan.warnings.length && (
        <>
          <ul className="drawing-cad-warnings">
            {plan.warnings.map((w, i) => (
              <li key={i}>{t(w)}</li>
            ))}
          </ul>
          <label className="drawing-vector-check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            {t("omissions")}
          </label>
        </>
      )}
      {stale && <p role="status">{t("stale")}</p>}
      <button
        type="button"
        data-testid="vector-apply"
        disabled={disabled || stale || (!!plan.warnings.length && !ack)}
        onClick={() => {
          if (disabled || stale || plan.warnings.length && !ack) return;
          if (onApply ? onApply() : applyCadPlan(editor, plan)) onApplied();
          else setFailed(true);
        }}
      >
        {t("apply")}
      </button>
      {failed && <p role="alert">{t("failed")}</p>}
    </div>
  );
}
async function decodeRaster(blob: Blob, signal: AbortSignal) {
  if (
    blob.size > limit ||
    !["image/png", "image/jpeg", "image/webp"].includes(blob.type)
  )
    throw new Error("limit");
  const bitmap = await createImageBitmap(blob);
  try {
    if (signal.aborted) throw new Error("cancelled");
    if (bitmap.width * bitmap.height > 50e6) throw new Error("limit");
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      image: ctx.getImageData(0, 0, canvas.width, canvas.height),
      preview: canvas.toDataURL("image/png"),
    };
  } finally {
    bitmap.close();
  }
}
function selectedTracePlan(
  editor: Editor,
  settings: CadSettings,
  doc: VectorDocument,
  replace: boolean,
) {
  const source = editor.getOnlySelectedShape();
  const rasterPaint =
    source?.type === "cad-bezier" ? vectorPaint(source.meta) : undefined;
  if (
    !source ||
    (source.type !== "image" && !rasterPaint?.raster) ||
    (source.props as any).crop ||
    editor.getShapeMask(source.id)
  )
    throw new Error("image");
  assertCadEditable(editor, [source.id]);
  const transform = editor.getShapePageTransform(source);
  const raster = rasterPaint?.raster;
  const boundary = (source.props as any).contours;
  const corners = raster
    ? [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([x, y]) => ({
        x: raster.matrix[0] * x + raster.matrix[2] * y + raster.matrix[4],
        y: raster.matrix[1] * x + raster.matrix[3] * y + raster.matrix[5],
      }))
    : [];
  const originalBoundary =
    raster &&
    boundary?.length === 1 &&
    boundary[0].nodes.length === 4 &&
    boundary[0].nodes.every(
      (n: any) =>
        !n.inX &&
        !n.inY &&
        !n.outX &&
        !n.outY &&
        corners.some((p) => Math.hypot(p.x - n.x, p.y - n.y) < 1e-8),
    );
  const paths = doc.paths.map((p) => ({
    ...p,
    contours: mapContours(p.contours, (q) => {
      if (rasterPaint?.raster) {
        const m = rasterPaint.raster.matrix,
          x = q.x / doc.width,
          y = q.y / doc.height;
        return transform.applyToPoint({
          x: m[0] * x + m[2] * y + m[4],
          y: m[1] * x + m[3] * y + m[5],
        });
      }
      return transform.applyToPoint({
        x:
          (((source.props as any).flipX ? doc.width - q.x : q.x) / doc.width) *
          (source.props as any).w,
        y:
          (((source.props as any).flipY ? doc.height - q.y : q.y) /
            doc.height) *
          (source.props as any).h,
      });
    }),
    paint: rasterPaint
      ? {
          ...p.paint,
          fillOpacity: p.paint.fillOpacity * rasterPaint.fillOpacity,
          clips: [
            ...(rasterPaint.clips ?? []),
            ...(originalBoundary
              ? []
              : [
                  {
                    contours: boundary,
                    fillRule: (source!.props as any).fillRule,
                  },
                ]),
          ].map((c) => ({
            ...c,
            contours: mapContours(c.contours, (q) => transform.applyToPoint(q)),
          })),
        }
      : p.paint,
  }));
  if (paths.some((p) => !validVectorPaint(p.paint))) throw new Error("limit");
  return makeCadPlan(
    editor,
    settings,
    paths.flatMap((p) => p.contours),
    {
      name: "Trace",
      sourceIds: [source.id],
      removeIds: replace ? [source.id] : [],
      warnings: doc.warnings,
      shapes: paths.map((p, i) => ({
        type: "cad-bezier",
        x: 0,
        y: 0,
        props: { contours: p.contours, fillRule: p.fillRule },
        meta: { omsObjectName: `Trace · ${i + 1}`, omsVectorPaint: p.paint },
      })),
    },
  );
}
export function RasterTrace({ settings, revision, disabled }: Props) {
  const editor = useEditor(),
    t = useVectorText(),
    work = useWork();
  const [file, setFile] = useState<File>(),
    [useSelected, setUseSelected] = useState(false),
    [options, setOptions] = useState(DEFAULT_TRACE_OPTIONS);
  const [width, setWidth] = useState("100"),
    [replace, setReplace] = useState(false),
    [review, setReview] = useState<Review>();
  const key = JSON.stringify([
    file?.name,
    file?.lastModified,
    useSelected,
    options,
    width,
    replace,
    settings,
  ]);
  const selected = useValue(
    "trace image",
    () => {
      const s = editor.getOnlySelectedShape();
      return (
        s?.type === "image" ||
        (s?.type === "cad-bezier" && !!vectorPaint(s.meta).raster)
      );
    },
    [editor],
  );
  async function prepare(signal: AbortSignal) {
    if (!settings) throw new Error("settings");
    const revisionBefore = cadRevision(editor);
    let blob: Blob | undefined = file;
    if (useSelected) {
      const shape = editor.getOnlySelectedShape();
      const raster =
        shape?.type === "cad-bezier"
          ? vectorPaint(shape.meta).raster
          : undefined;
      if (
        !shape ||
        (shape.type !== "image" && !raster) ||
        (shape.props as any).crop
      )
        throw new Error("image");
      assertCadEditable(editor, [shape.id]);
      const url =
        raster?.png ??
        (await editor.resolveAssetUrl((shape.props as any).assetId, {
          shouldResolveToOriginal: true,
        }));
      if (!url) throw new Error("image");
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("image");
      blob = await response.blob();
    }
    if (!blob) throw new Error("image");
    const decoded = await decodeRaster(blob, signal),
      doc = await runRasterTrace(decoded.image, options, signal);
    if (signal.aborted) throw new Error("cancelled");
    if (revisionBefore !== cadRevision(editor)) throw new Error("stale");
    const plan = useSelected
      ? selectedTracePlan(editor, settings, doc, replace)
      : prepareVectorImport(
          editor,
          settings,
          doc,
          Number(width),
          editor.getViewportPageBounds().center,
          file!.name,
        );
    setReview({ plan, key, original: decoded.preview });
  }
  return (
    <section className="drawing-cad-section" data-testid="raster-trace">
      <h3>{t("trace")}</h3>
      <p className="drawing-help">{t("traceHelp")}</p>
      <fieldset
        className="drawing-cad-fields"
        disabled={disabled || work.busy || !settings}
      >
        <Field label={t("source")}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setUseSelected(false);
              setReview(undefined);
            }}
          />
        </Field>
        <button
          type="button"
          disabled={!selected}
          aria-pressed={useSelected}
          onClick={() => {
            setUseSelected(true);
            setReview(undefined);
          }}
        >
          {t("selectedImage")}
        </button>
        <Field label={t("mode")}>
          <select
            value={options.mode}
            onChange={(e) =>
              setOptions({ ...options, mode: e.target.value as any })
            }
          >
            <option value="mono">{t("mono")}</option>
            <option value="color">{t("color")}</option>
          </select>
        </Field>
        {(options.mode === "mono"
          ? [["threshold", 0, 255, 1]]
          : [["colors", 2, 32, 1]]
        )
          .concat([
            ["smoothing", 0.1, 5, 0.1],
            ["noise", 0, 100, 1],
          ])
          .map(([name, min, max, step]) => (
            <Field key={name} label={t(String(name))}>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={options[name as keyof typeof options] as number}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    [name]:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
        <label className="drawing-vector-check">
          <input
            type="checkbox"
            checked={options.removeWhite}
            onChange={(e) =>
              setOptions({ ...options, removeWhite: e.target.checked })
            }
          />
          {t("removeWhite")}
        </label>
        {useSelected ? (
          <label className="drawing-vector-check">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            {t("replace")}
          </label>
        ) : (
          <Field label={t("width")}>
            <input
              type="number"
              min="0.001"
              max="1000000"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </Field>
        )}
        <button
          type="button"
          disabled={!file && !useSelected}
          onClick={() => void work.run(prepare)}
        >
          {t("preview")}
        </button>
      </fieldset>
      <WorkStatus work={work} />
      {review && (
        <Preview
          review={review}
          inputKey={key}
          revision={revision}
          disabled={disabled || work.busy || !settings}
          onApplied={() => {
            setReview(undefined);
            work.setMessage("done");
          }}
        />
      )}
    </section>
  );
}
export function VectorImport({ settings, revision, disabled }: Props) {
  const editor = useEditor(),
    t = useVectorText(),
    work = useWork();
  const [file, setFile] = useState<File>(),
    [page, setPage] = useState("1"),
    [outline, setOutline] = useState(false),
    [mode,setMode]=useState<"auto"|"editable"|"appearance">("auto"),
    [dpi,setDpi]=useState(300),
    [review, setReview] = useState<Review>();
  const key = JSON.stringify([
    file?.name,
    file?.lastModified,
    page,
    outline, mode, dpi,
    settings,
  ]);
  return (
    <details className="drawing-cad-section" open data-testid="vector-import">
      <summary>{t("import")}</summary>
      <p className="drawing-help">{t("importHelp")}</p>
      <fieldset
        className="drawing-cad-fields"
        disabled={disabled || !settings || work.busy}
      >
        <Field label={t("file")}>
          <input
            type="file"
            accept=".pdf,.eps,application/pdf,application/postscript"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setPage("1");
              setReview(undefined);
            }}
          />
        </Field>
        <Field label={t("page")}>
          <input
            type="number"
            min="1"
            max="5000"
            step="1"
            value={page}
            disabled={/\.eps$/i.test(file?.name ?? "")}
            onChange={(e) => setPage(e.target.value)}
          />
        </Field>
        <Field label={t('pdfMode')}><select value={mode} onChange={event=>setMode(event.target.value as typeof mode)}><option value="auto">{t('pdfAuto')}</option><option value="editable">{t('pdfEditable')}</option><option value="appearance">{t('pdfAppearance')}</option></select></Field>
        {mode!=='editable'&&<Field label={t('renderDpi')}><select value={dpi} onChange={event=>setDpi(Number(event.target.value))}>{[72,150,300,600].map(value=><option key={value} value={value}>{value} DPI</option>)}</select></Field>}
        <label className="drawing-vector-check">
          <input
            type="checkbox"
            checked={outline}
            onChange={(e) => setOutline(e.target.checked)}
          />
          {t("outline")}
        </label>
        <button
          type="button"
          disabled={!file}
          onClick={() =>
            void work.run(async (signal) => {
              setReview(undefined);
              if (!file || !settings || file.size > limit)
                throw new Error("limit");
              const before = cadRevision(editor),
                data = new Uint8Array(await file.arrayBuffer());
              const isPdf =
                new TextDecoder().decode(data.slice(0, 5)) === "%PDF-";
              let bytes = data,
                selectedPage = Number(page);
              if (!isPdf || outline) {
                const response = await fetch(
                  `/api/canvas/convert-vector?page=${selectedPage}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/octet-stream" },
                    body: file,
                    signal,
                  },
                );
                if (!response.ok) {
                  const error = await response
                    .json()
                    .catch(() => ({ code: "conversion" }));
                  throw new Error(error.code);
                }
                bytes = new Uint8Array(await response.arrayBuffer());
                selectedPage = 1;
              }
              const { readVectorPdf } = await import("./cad-pdf-client");
              const result = await readVectorPdf(bytes, selectedPage, signal, {mode,dpi,name:file.name,store:resource=>storeCanvasImage(editor,resource,signal)});
              if (signal.aborted) throw new Error("cancelled");
              if (before !== cadRevision(editor)) throw new Error("stale");
              if (!result.document.paths.length) {
                work.setMessage(
                  result.document.warnings.includes("pdf-text")
                    ? "pdf-text"
                    : "empty",
                );
                return;
              }
              const plan = prepareVectorImport(
                editor,
                settings,
                result.document,
                result.widthMm,
                editor.getViewportPageBounds().center,
                `${file.name} · ${page}`,
              );
              setReview({ plan, key, original: result.preview });
            })
          }
        >
          {t("preview")}
        </button>
      </fieldset>
      <WorkStatus work={work} />
      {review && (
        <Preview
          review={review}
          inputKey={key}
          revision={revision}
          disabled={disabled || work.busy || !settings}
          onApplied={() => {
            setReview(undefined);
            work.setMessage("done");
          }}
        />
      )}
    </details>
  );
}
export function VectorExport({ settings, revision }: Props) {
  const editor = useEditor(),
    t = useVectorText(), work=useWork();
  const [format, setFormat] = useState<"pdf" | "eps">("pdf"),
    [scope, setScope] = useState<"selected" | "all">("selected"),
    [message, setMessage] = useState(""),
    [ack, setAck] = useState(false);
  const [review, setReview] = useState<{
    result: ReturnType<typeof prepareVectorExport>;
    key: string;
  }>();
  const key = JSON.stringify([settings, format, scope]),
    stale =
      !!review && (review.key !== key || review.result.revision !== revision);
  return (
    <details className="drawing-cad-section" open data-testid="vector-export">
      <summary>{t("export")}</summary>
      <p className="drawing-help">{t("exportHelp")}</p>
      <div className="drawing-cad-fields">
        <Field label={t("format")}>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as any)}
          >
            <option value="pdf">PDF</option>
            <option value="eps">EPS</option>
          </select>
        </Field>
        <Field label={t("scope")}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
          >
            <option value="selected">{t("selected")}</option>
            <option value="all">{t("all")}</option>
          </select>
        </Field>
        <button
          type="button"
          disabled={!settings || work.busy}
          onClick={()=>void work.run(async signal=>{
            setMessage('');setAck(false);setReview(undefined);
            if(!settings)return;
            const result=await prepareVectorExportWithAssets(editor,settings,scope,format,signal);
            setReview({result,key});
          })}

        >
          {t("preview")}
        </button>
      </div>
      {review && (
        <div className="drawing-cad-report">
          <p>
            {t("paths")}: {review.result.paths.length}
          </p>
          {!!review.result.omitted.length && (
            <>
              <ul>
                {review.result.omitted.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
              <label className="drawing-vector-check">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                {t("omissions")}
              </label>
            </>
          )}
          {stale && <p role="status">{t("stale")}</p>}
          <button
            type="button"
            disabled={
              stale ||
              !review.result.text ||
              (!!review.result.omitted.length && !ack)
            }
            onClick={() => {
              if (
                review.key !== key ||
                review.result.revision !== cadRevision(editor)
              )
                return;
              const url = URL.createObjectURL(
                  new Blob([review.result.text], {
                    type:
                      format === "pdf"
                        ? "application/pdf"
                        : "application/postscript",
                  }),
                ),
                link = document.createElement("a");
              link.href = url;
              link.download = `OMS-drawing.${format}`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {t("download")}
          </button>
          <ProductionSaveButton extension={format} disabled={stale||!review.result.text||!!review.result.omitted.length&&!ack} createFile={()=>{if(review.result.revision!==cadRevision(editor))throw new Error("changed");return new Blob([review.result.text],{type:format==="pdf"?"application/pdf":"application/postscript"});}}/>
        </div>
      )}
      <WorkStatus work={work}/>
      {message && <p role="alert">{t(message)}</p>}
    </details>
  );
}
export function CornerControls({ settings, revision, disabled, focusSequence }: Props) {
  const editor = useEditor(),
    t = useVectorText();
  const section = useRef<HTMLDetailsElement>(null);
  const selectedNode = useValue('corner node target', () => getSelectedCadNode(editor), [editor]);
  const [scope, setScope] = useState<'all' | 'node'>('all');
  const [kind, setKind] = useState<"fillet" | "chamfer">("fillet"),
    [amount, setAmount] = useState(() => String(2 / unitMm(settings?.unit ?? 'mm'))),
    [review, setReview] = useState<Review>(),
    [message, setMessage] = useState("");
  const previousUnit = useRef(settings?.unit ?? 'mm');
  useEffect(() => {
    const unit = settings?.unit ?? 'mm', factor = unitMm(previousUnit.current) / unitMm(unit);
    previousUnit.current = unit;
    if (factor !== 1) setAmount(value => value.trim() && Number.isFinite(Number(value)) ? String(Number((Number(value) * factor).toPrecision(14))) : value);
  }, [settings?.unit]);
  useEffect(() => {
    if (focusSequence === undefined || !section.current) return;
    setScope('node'); setCadNodeEditing(editor, true);
    section.current.open = true;
    section.current.querySelector<HTMLElement>('summary')?.focus();
    section.current.scrollIntoView({ block: 'nearest' });
  }, [editor, focusSequence]);
  const key = JSON.stringify([settings, kind, amount, scope, scope === 'node' ? selectedNode : null]);
  const valid = amount.trim() !== '' && Number.isFinite(Number(amount)) && Number(amount) > 0;
  return (
    <details ref={section} className="drawing-cad-section" data-testid="vector-corners">
      <summary>{t("corners")}</summary>
      <p className="drawing-help">{t(scope === 'node' ? 'nodeCornerHelp' : 'cornerHelp')}</p>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings}>
        <Field label={t('cornerScope')}>
          <select aria-label={t('cornerScope')} value={scope} onChange={event => { const scope = event.target.value as 'all' | 'node'; setScope(scope); setMessage(''); if (scope === 'node') setCadNodeEditing(editor, true); }}>
            <option value="all">{t('allCorners')}</option><option value="node">{t('selectedCorner')}</option>
          </select>
        </Field>
        {scope === 'node' && <p className="drawing-help" role="status">{selectedNode ? `${t('cornerTarget')}: ${selectedNode.contourIndex + 1}:${selectedNode.nodeIndex + 1}` : t('cornerNodeRequired')}</p>}
        <Field label={t("cornerMode")}>
          <select aria-label={t('cornerMode')} value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="fillet">{t("fillet")}</option>
            <option value="chamfer">{t("chamfer")}</option>
          </select>
        </Field>
        <Field label={`${t(kind === 'fillet' ? 'cornerRadius' : 'cornerSetback')} (${settings?.unit ?? 'mm'})`}>
          <input
            type="number"
            step="any"
            value={amount}
            aria-invalid={!valid}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <button
          type="button"
          disabled={!valid || scope === 'node' && !selectedNode}
          onClick={() => {
            try {
              setMessage("");
              if (!settings || disabled || !valid) return;
              const amountMm = Number(amount) * unitMm(settings.unit);
              if (scope === 'node') {
                const plan = prepareNodeCorner(editor, settings, amountMm, kind);
                setReview({ plan, key, originalContours: plan.originalContours, previewBounds: plan.previewBounds });
              } else setReview({ plan: prepareCorners(editor, settings, amountMm, kind), key });
            } catch (e) {
              setReview(undefined);
              setMessage(vectorError(e));
            }
          }}
        >
          {t("preview")}
        </button>
      </fieldset>
      {message && <p role="alert">{t(message)}</p>}
      {review && (
        <Preview
          review={review}
          inputKey={key}
          revision={revision}
          disabled={disabled || !settings}
          onApply={scope === 'node' ? () => applyNodeCorner(editor, review.plan as CadNodeCornerPlan) : undefined}
          onApplied={() => {
            setReview(undefined);
            setMessage("done");
          }}
        />
      )}
    </details>
  );
}
export function VectorPaintControls({
  settings,
  revision,
  disabled,
  focusSequence,
}: Props) {
  const section = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (focusSequence !== undefined && section.current) {
      section.current.open = true;
      section.current.scrollIntoView({ block: "nearest" });
      section.current.querySelector("summary")?.focus();
    }
  }, [focusSequence]);
  const editor = useEditor(),
    t = useVectorText();
  const shape = useValue("vector paint", () => editor.getOnlySelectedShape(), [
    editor,
  ]);
  const [paint, setPaint] = useState(() => vectorPaint({}, "black")),
    [width, setWidth] = useState("0.25"),
    [message, setMessage] = useState("");
  const signature = JSON.stringify([
    shape?.id,
    shape?.meta,
    shape?.props,
    settings,
  ]);
  useEffect(() => {
    if (shape?.type === "cad-bezier" && settings) {
      const p = vectorPaint(shape.meta, (shape.props as any).color);
      setPaint(p);
      setWidth(
        String(Number((p.strokeWidth * cadMmPerPixel(settings!)).toFixed(5))),
      );
    }
  }, [signature]);
  return (
    <details
      className="drawing-cad-section"
      open
      data-testid="vector-paint"
      ref={section}
    >
      <summary>{t("paint")}</summary>
      <p className="drawing-help">{t("paintHelp")}</p>
      <fieldset
        className="drawing-cad-fields"
        disabled={disabled || !settings || shape?.type !== "cad-bezier"}
      >
        {(["fill", "stroke"] as const).map((key) => (
          <div key={key} className="drawing-cad-field">
            <span>{t(key)}</span>
            <div className="drawing-vector-paint-row">
              <input
                type="color"
                aria-label={t(key)}
                value={paint[key] === "none" ? "#000000" : paint[key]}
                onChange={(e) =>
                  setPaint({
                    ...paint,
                    ...(key === "fill"
                      ? { gradient: undefined, raster: undefined }
                      : {}),
                    [key]: e.target.value,
                  })
                }
              />
              <label>
                <input
                  type="checkbox"
                  aria-label={`${t(key)} · ${t("none")}`}
                  checked={paint[key] === "none" && (key !== "fill" || !paint.raster && !paint.gradient)}
                  onChange={(e) =>
                    setPaint({
                      ...paint,
                      ...(key === "fill"
                        ? { gradient: undefined, raster: undefined }
                        : {}),
                      [key]: e.target.checked ? "none" : "#000000",
                    })
                  }
                />
                {t("none")}
              </label>
            </div>
          </div>
        ))}
        <Field label={t("lineWidth")}>
          <input
            type="number"
            min="0"
            step="any"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </Field>
        <button
          type="button"
          onClick={() => {
            try {
              if (!shape || !settings) return;
              assertCadEditable(editor, [shape.id]);
              const next = {
                ...paint,
                strokeWidth: Number(width) / cadMmPerPixel(settings),
              };
              if (!width.trim() || !validVectorPaint(next))
                throw new Error("geometry");
              if (
                !drawingTransaction(editor, () =>
                  editor.updateShape({
                    id: shape.id,
                    type: shape.type,
                    meta: {
                      ...shape.meta,
                      omsVectorPaint: paintMetadata(next),
                    },
                  }),
                )
              )
                throw new Error("geometry");
              setMessage("done");
            } catch (e) {
              setMessage(vectorError(e));
            }
          }}
        >
          {t("updatePaint")}
        </button>
      </fieldset>
      {message && <p role="status">{t(message)}</p>}
      <MaterialTexturePanel revision={revision} disabled={disabled || !settings} />
    </details>
  );
}

export function PolygonControls({ settings, revision, disabled }: Props) {
  const editor = useEditor(),
    t = useVectorText();
  const [sides, setSides] = useState("6"),
    [diameter, setDiameter] = useState("100"),
    [rotation, setRotation] = useState("0"),
    [ratio, setRatio] = useState("0.5"),
    [star, setStar] = useState(false),
    [review, setReview] = useState<Review>(),
    [message, setMessage] = useState("");
  const key = JSON.stringify([
    settings,
    sides,
    diameter,
    rotation,
    ratio,
    star,
  ]);
  return (
    <details className="drawing-cad-section" data-testid="vector-polygon">
      <summary>{t("polygon")}</summary>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings}>
        <label className="drawing-vector-check">
          <input
            type="checkbox"
            checked={star}
            onChange={(e) => setStar(e.target.checked)}
          />
          {t("star")}
        </label>
        {[
          [t("sides"), sides, setSides],
          [t("diameter"), diameter, setDiameter],
          [t("rotation"), rotation, setRotation],
          ...(star ? [[t("innerRatio"), ratio, setRatio]] : []),
        ].map(([label, value, setter]) => (
          <Field key={label as string} label={label as string}>
            <input
              type="number"
              step="any"
              value={value as string}
              onChange={(e) =>
                (setter as (value: string) => void)(e.target.value)
              }
            />
          </Field>
        ))}
        <button
          type="button"
          onClick={() => {
            try {
              setMessage("");
              if (!settings) return;
              const factor = cadMmPerPixel(settings),
                center = editor.getViewportPageBounds().center;
              const contours = mapContours(
                [
                  regularPolygon(
                    Number(sides),
                    Number(diameter) / factor,
                    Number(rotation),
                    star ? Number(ratio) : 1,
                  ),
                ],
                (p) => ({ x: center.x + p.x, y: center.y + p.y }),
              );
              setReview({
                plan: makeCadPlan(editor, settings, contours, {
                  name: star ? "Star" : "Polygon",
                }),
                key,
              });
            } catch (e) {
              setReview(undefined);
              setMessage(vectorError(e));
            }
          }}
        >
          {t("preview")}
        </button>
      </fieldset>
      {message && <p role="alert">{t(message)}</p>}
      {review && (
        <Preview
          review={review}
          inputKey={key}
          revision={revision}
          disabled={disabled || !settings}
          onApplied={() => {
            setReview(undefined);
            setMessage("done");
          }}
        />
      )}
    </details>
  );
}
