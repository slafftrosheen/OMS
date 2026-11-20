import {drawingSolidFillSource, applyDrawingSolidFill} from './drawing-solid-fill';
import {useSolidFillText} from './solid-fill-copy';
import { prepareEllipseSegment, type EllipseSegmentKind } from './cad-ellipse-segments';
import {ProductionSaveButton} from './ProductionSaveButton';
import { storeCanvasImage } from "./cad-asset-store";
import { prepareVectorExportWithAssets } from "./cad-vector-export-client";
import { VectorArtwork } from "./VectorArtwork";
import React, { useEffect, useRef, useState } from "react";
import { useEditor, useValue } from "@tldraw/tldraw";
import { curveBounds, curvePathData } from "./cad-curves";
import {
  applyCadPlan,
  cadRevision,
  type CadPlan,
} from "./cad-plans";
import { canvasPointToCad, unitMm, type CadSettings } from "./cad-settings";
import {
  prepareVectorImport,
  vectorPaint,
} from "./cad-vector";
import { prepareVectorExport } from "./cad-vector-export";
import { prepareCorners } from "./cad-corners";
import { prepareNodeCorner, applyNodeCorner, type CadNodeCornerPlan } from './cad-node-corners';
import { getSelectedCadNode, setCadNodeEditing } from './cad-node-selection';
import { useVectorText, vectorError } from "./cad-vector-copy";
import { MaterialTexturePanel } from './MaterialTexturePanel';
import { GradientFillPanel } from './GradientFillPanel';

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
export { RasterTrace } from "./RasterTrace";

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
export function VectorPaintControls({ settings, revision, disabled, focusSequence }: Props) {
  const editor = useEditor(), t = useSolidFillText();
  const section = useRef<HTMLDetailsElement>(null);
  const source = useValue('solid CAD fill', () => drawingSolidFillSource(editor), [editor]);
  const signature = source?.signature ?? '';
  const [fill, setFill] = useState('#000000'), [none, setNone] = useState(false), [dirty, setDirty] = useState(false);
  const [loadedSignature, setLoadedSignature] = useState('');
  const [result, setResult] = useState<{signature:string;success:boolean} | null>(null);
  useEffect(() => {
    setFill(source?.paint.fill === 'none' ? '#000000' : source?.paint.fill ?? '#000000');
    setNone(!!source && source.paint.fill === 'none' && !source.paint.gradient && !source.paint.raster);
    setDirty(false);
    setLoadedSignature(signature);
  }, [signature]);
  useEffect(() => {
    if (focusSequence === undefined || !section.current) return;
    section.current.open = true;
    section.current.scrollIntoView({block:'nearest'});
    section.current.querySelector('summary')?.focus();
  }, [focusSequence]);
  return <details className="drawing-cad-section" open data-testid="vector-paint" ref={section}>
    <summary>{t('title')}</summary>
    <p className="drawing-help">{t('help')}</p>
    <fieldset className="drawing-cad-fields" disabled={disabled || !source || loadedSignature !== signature}>
      <div className="drawing-cad-field"><span>{t('colour')}</span><div className="drawing-vector-paint-row">
        <input type="color" aria-label={t('colour')} value={fill} onChange={event=>{setFill(event.target.value);setNone(false);setDirty(true);setResult(null);}}/>
        <label><input type="checkbox" checked={none} onChange={event=>{setNone(event.target.checked);setDirty(true);setResult(null);}}/>{t('none')}</label>
      </div></div>
      <button type="button" disabled={!dirty} onClick={()=>{
        if (!source || loadedSignature !== signature || disabled) return;
        const success=applyDrawingSolidFill(editor,source.shape.id,signature,none?'none':fill);
        setResult({signature:drawingSolidFillSource(editor)?.signature??'',success});
        if(success)setDirty(false);
      }}>{t('apply')}</button>
    </fieldset>
    {result && result.signature === signature && <p role={result.success?'status':'alert'} className="drawing-help">{t(result.success?'applied':'failed')}</p>}
    <GradientFillPanel settings={settings} revision={revision} disabled={disabled || !settings}/>
    <MaterialTexturePanel settings={settings} revision={revision} disabled={disabled || !settings}/>
  </details>;
}

/** Corel-style elliptic arcs and closed sectors share the curve editing/export pipeline. */
export function EllipseSegmentControls({ settings, revision, disabled, focusSequence }: Props) {
  const editor = useEditor(), t = useVectorText();
  const section = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (focusSequence === undefined || !section.current) return;
    section.current.open = true;
    section.current.scrollIntoView({ block: 'nearest' });
    section.current.querySelector<HTMLSelectElement>('select')?.focus();
  }, [focusSequence]);
  const [kind, setKind] = useState<EllipseSegmentKind>('pie');
  const [values, setValues] = useState(() => ({
    width: String(100 / unitMm(settings?.unit ?? 'mm')),
    height: String(75 / unitMm(settings?.unit ?? 'mm')), centerX: '0', centerY: '0',
  }));
  const previousUnit = useRef(settings?.unit ?? 'mm');
  useEffect(() => {
    const unit = settings?.unit ?? 'mm', factor = unitMm(previousUnit.current) / unitMm(unit);
    previousUnit.current = unit;
    if (factor !== 1) setValues(current => Object.fromEntries(Object.entries(current).map(([key, value]) =>
      [key, value.trim() && Number.isFinite(Number(value)) ? String(Number((Number(value) * factor).toPrecision(14))) : value])) as typeof current);
  }, [settings?.unit]);
  const [start, setStart] = useState('0'), [end, setEnd] = useState('90'), [rotation, setRotation] = useState('0');
  const [clockwise, setClockwise] = useState(false), [circle, setCircle] = useState(false);
  const [review, setReview] = useState<Review>(), [message, setMessage] = useState('');
  const key = JSON.stringify([settings, values, kind, start, end, rotation, clockwise, circle]);
  const parse = (value: string) => value.trim() ? Number(value) : NaN;
  const lengthsValid = ['width', ...(circle ? [] : ['height'])].every(key =>
    Number.isFinite(parse(values[key as 'width' | 'height'])) && parse(values[key as 'width' | 'height']) > 0);
  const valid = lengthsValid && [values.centerX, values.centerY].every(value => Number.isFinite(parse(value))) &&
    [start, end, rotation].every(value => Number.isFinite(parse(value)) && Math.abs(parse(value)) <= 360);
  return <details ref={section} className="drawing-cad-section" data-testid="vector-ellipse-segment">
    <summary>{t('ellipseSegments')}</summary>
    <p className="drawing-help">{t('ellipseSegmentHelp')}</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (!settings || disabled || !valid) return;
      setMessage(''); setReview(undefined);
      try {
        setReview({ key, plan: prepareEllipseSegment(editor, settings, {
          kind, width: parse(values.width), height: parse(circle ? values.width : values.height),
          centerX: parse(values.centerX), centerY: parse(values.centerY),
          startAngle: parse(start), endAngle: parse(end), rotation: parse(rotation), clockwise,
        }) });
      } catch (error) { setMessage(vectorError(error)); }
    }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings}>
        <Field label={t('ellipseKind')}><select value={kind} onChange={event => setKind(event.target.value as EllipseSegmentKind)}>
          {(['arc', 'pie', 'chord'] as const).map(value => <option key={value} value={value}>{t('ellipse' + value)}</option>)}
        </select></Field>
        {(['width', 'height', 'centerX', 'centerY'] as const).map(field =>
          <Field key={field} label={t('ellipse' + field) + ' (' + (settings?.unit ?? 'mm') + ')'}>
            <input type="number" required step="any" min={field === 'width' || field === 'height' ? '0.000001' : undefined}
              value={field === 'height' && circle ? values.width : values[field]}
              disabled={field === 'height' && circle}
              onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
          </Field>)}
        <label className="drawing-cad-check"><input type="checkbox" checked={circle} onChange={event => setCircle(event.target.checked)} /><span>{t('ellipseCircle')}</span></label>
        <button type="button" onClick={() => {
          if (!settings) return;
          const center = canvasPointToCad(editor.getViewportPageBounds().center, settings);
          setValues(current => ({ ...current, centerX: String(Number(center.x.toPrecision(14))), centerY: String(Number(center.y.toPrecision(14))) }));
        }}>{t('ellipseCenterView')}</button>
        <Field label={t('ellipseStart')}><input type="number" required min="-360" max="360" step="any" value={start} onChange={event => setStart(event.target.value)} /></Field>
        <Field label={t('ellipseEnd')}><input type="number" required min="-360" max="360" step="any" value={end} onChange={event => setEnd(event.target.value)} /></Field>
        <Field label={t('rotation')}><input type="number" required min="-360" max="360" step="any" value={rotation} onChange={event => setRotation(event.target.value)} /></Field>
        <label className="drawing-cad-check"><input type="checkbox" checked={clockwise} onChange={event => setClockwise(event.target.checked)} /><span>{t('ellipseClockwise')}</span></label>
        <button type="submit" disabled={!valid}>{t('preview')}</button>
      </fieldset>
    </form>
    {message && <p className="drawing-help" role={message === 'done' ? 'status' : 'alert'}>{t(message)}</p>}
    {review && <Preview review={review} inputKey={key} revision={revision} disabled={disabled || !settings}
      onApplied={() => { setReview(undefined); setMessage('done'); }} />}
  </details>;
}
