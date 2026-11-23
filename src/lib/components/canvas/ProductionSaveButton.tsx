import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { PRODUCTION_FILE_POCKETS, type ProductionFilePocket } from '$lib/order/file-pockets';
import type { CanvasDxfRelease } from '$lib/order/canvas-dxf-release';
import { cadRevision } from './cad-plans';
import { getOrderBridge } from './state-bridge';
import { matchesProductionExportTarget, productionExportTarget, saveProductionExport, type ProductionExportTarget } from './production-export';
import { useWorkbenchText } from './workbench-copy';

type Props = {
  extension: string;
  source: string | object;
  disabled?: boolean;
  createFile: (signal: AbortSignal) => Blob | Promise<Blob>;
  release?: CanvasDxfRelease;
  errorMessage?: (error: unknown) => string;
  onStatus?: (message: string) => void;
};
type Placement = { file: File; pocket: ProductionFilePocket; target: ProductionExportTarget; release?: CanvasDxfRelease };

export function ProductionSaveButton({ extension, source, disabled = false, createFile, release, errorMessage, onStatus }: Props) {
  const editor = useEditor(), t = useWorkbenchText();
  const [pocket, setPocket] = useState<ProductionFilePocket>(extension === 'dxf' ? 'cnc' : 'visuals');
  const [name, setName] = useState('OMS-drawing'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [placement, setPlacement] = useState<Placement>();
  const lifetime = useRef<AbortController>();
  const latest = useRef({ disabled, extension, source, createFile, release });
  latest.current = { disabled, extension, source, createFile, release };
  const retry = useRef<{ source: Props['source']; key: string; file: File }>();
  const running = useRef(false);

  useEffect(() => { if (message) onStatus?.(message); }, [message, onStatus]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const allowed = useValue('save export permission', () => {
    const target = productionExportTarget(editor, pocket);
    return placement ? matchesProductionExportTarget(target, placement.target) : !!target;
  }, [editor, pocket, placement]);

  async function save() {
    const controller = lifetime.current, target = productionExportTarget(editor, pocket), reviewed = latest.current;
    if (!controller || controller.signal.aborted || !target || running.current ||
        (placement ? !matchesProductionExportTarget(target, placement.target) : reviewed.disabled || !name.trim())) return;
    const filename = name.trim().replace(/[\\/\r\n\0<>]/g, '_')
      .replace(new RegExp(`\\.${reviewed.extension}$`, 'i'), '') + '.' + reviewed.extension;
    const revision = cadRevision(editor);
    const key = JSON.stringify([target, pocket, filename, reviewed.release?.reviewId, revision]);
    running.current = true;
    setBusy(true);
    setMessage(t('saving'));
    try {
      let submission = placement;
      if (!submission) {
        let file = retry.current?.key === key && retry.current.source === reviewed.source ? retry.current.file : undefined;
        if (!file) {
          retry.current = undefined;
          const blob = await reviewed.createFile(controller.signal);
          file = new File([blob], filename, { type: blob.type });
        }
        if (controller.signal.aborted) return;
        if (latest.current.disabled || reviewed.extension !== latest.current.extension || reviewed.source !== latest.current.source ||
            reviewed.release !== latest.current.release || revision !== cadRevision(editor)) throw new Error('changed');
        retry.current = { source: reviewed.source, key, file };
        submission = { file, pocket, target, release: reviewed.release };
      }
      const result = await saveProductionExport(editor, submission.file, submission.pocket, controller.signal, submission.release, submission.target);
      retry.current = undefined;
      if (!controller.signal.aborted) {
        setPlacement(result.placed ? undefined : submission);
        setMessage(t(result.placed ? (result.queued ? 'queued' : 'saved') : (result.queued ? 'queuedAttachmentOnly' : 'savedAttachmentOnly')));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = error instanceof Error ? error.message : '';
        setMessage(code === 'readOnly' || code === 'changed' ? t(code) : errorMessage?.(error) ?? t('saveFailed'));
      }
    } finally {
      running.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (!getOrderBridge(editor)?.orderId) return null;
  return <fieldset className="drawing-production-save" disabled={busy} data-testid="production-export">
    <label><span>{t('filename')}</span><input value={name} maxLength={150} onChange={event => {
      setName(event.target.value); setPlacement(undefined); setMessage('');
    }} /></label>
    <label><span>{t('destination')}</span><select value={pocket} onChange={event => {
      setPocket(event.target.value as ProductionFilePocket); setPlacement(undefined); setMessage('');
    }}>
      {PRODUCTION_FILE_POCKETS.map(value => <option key={value} value={value}>{t(value)}</option>)}
    </select></label>
    <button type="button" disabled={!allowed || busy || (!placement && (disabled || !name.trim()))} onClick={() => void save()}>
      {busy ? t('saving') : placement ? `${t('placeSavedFile')} · ${placement.file.name}` : `${t('saveInto')} ${t(pocket)} · ${extension.toUpperCase()}`}
    </button>
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
