import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitVersionedOrderPayload } from '../../src/lib/server/order/edit-version';

const read = (path: string) => readFileSync(path, 'utf8');

describe('OMS-R35: form/Canvas revision chain', () => {
  const editor = read('src/routes/orders/[id]/edit/+page.svelte');
  const canvas = read('src/routes/api/draft-orders/[id]/canvas-state/+server.ts');
  const form = read('src/routes/api/draft-orders/[id]/+server.ts');
  const sql = read('supabase/migrations/20261014000001_order_edit_concurrency_and_audit.sql');

  it('requires a valid explicit revision for every native or Canvas write', () => {
    expect(splitVersionedOrderPayload({
      expectedUpdatedAt: '2026-10-16T12:45:00.000Z', snapshot: { document: {} }
    })).toEqual({
      expectedUpdatedAt: '2026-10-16T12:45:00.000Z',
      form: { snapshot: { document: {} } }
    });
    expect(splitVersionedOrderPayload({snapshot: {}})).toBeNull();
    expect(splitVersionedOrderPayload({expectedUpdatedAt: 'not-a-date', snapshot: {}}))
      .toBeNull();
    expect(form).toContain('p_expected_updated_at: versioned.expectedUpdatedAt');
    expect(sql).toContain('v_current.updated_at IS DISTINCT FROM p_expected_updated_at');
    expect(canvas).toContain('splitVersionedOrderPayload(body)');
    expect(canvas).toContain("throw error(428");
  });

  it('conditionally updates Canvas only on a matching order revision', () => {
    expect(canvas).toContain(".eq('updated_at', versioned.expectedUpdatedAt)");
    expect(canvas).toContain(".eq('status', order.status)");
    expect(canvas).toContain('.select(\'id,updated_at\').maybeSingle()');
    expect(canvas).toContain("throw error(409");
    expect(canvas).toContain('Math.max(');
    expect(canvas).toContain('Date.parse(versioned.expectedUpdatedAt) + 1');
    expect(canvas).toContain('updatedAt: saved.updated_at');
    expect(canvas).toContain("Object.keys(versioned.form).some(key => key !== 'snapshot')");
  });

  it('saves only dirty form/Canvas data, keeping returned revisions in sequence', () => {
    const save = editor.slice(editor.indexOf('async function saveDraft()'),
      editor.indexOf('// ── Confirm order'));
    const formStart = save.indexOf('if (formDirty)');
    const formRequest = save.indexOf("method: 'PUT'");
    const nativeRevision = save.indexOf('orderUpdatedAt = persisted.updatedAt;');
    const canvasStart = save.indexOf('if (canvasDirty)');
    const canvasRequest = save.indexOf('expectedUpdatedAt: orderUpdatedAt', canvasStart);
    const canvasRevision = save.indexOf('orderUpdatedAt = savedCanvas.updatedAt;');
    expect(formStart).toBeGreaterThanOrEqual(0);
    expect(formRequest).toBeGreaterThan(formStart);
    expect(nativeRevision).toBeGreaterThan(formRequest);
    expect(canvasStart).toBeGreaterThan(nativeRevision);
    expect(canvasRequest).toBeGreaterThan(canvasStart);
    expect(canvasRevision).toBeGreaterThan(canvasRequest);
    expect(save).not.toContain('if (canvasSnapshot)');
  });

  it('revalidates linked drawing evidence before applying file-based proposals', () => {
    const intake = read('src/lib/order/OrderIntakeAssistant.svelte');
    expect(intake).toContain('if(analysis.fileId){');
    expect(intake).toContain('fetchAllOrderFiles<OrderFile>(orderId, scopedFetch)');
    expect(intake).toContain('const scopedFetch: typeof fetch');
    expect(intake).toContain('signal: requestSignal(20_000)');
    expect(intake).toContain('linkedNow.some(file=>file.id===analysis?.fileId)');
    expect(intake).toContain("throw new Error($t('orderIntake.sourceChanged'))");
    const recheck = intake.indexOf('const linkedNow=await fetchAllOrderFiles<OrderFile>(orderId, scopedFetch)');
    const localApply = intake.indexOf('onApply(proposalsToPatch(accepted))');
    expect(recheck).toBeGreaterThan(intake.indexOf('if(analysis.fileId){'));
    expect(localApply).toBeGreaterThan(recheck);
    // Notes-only analysis has no linked file to re-check.
  });

  it('does not discard concurrent local edits or forget committed native fields', () => {
    expect(editor).toContain('let canvasChangeSerial = 0;');
    expect(editor).toContain('function markCanvasDirty()');
    expect(editor).toContain('const serialAtSave = canvasChangeSerial;');
    expect(editor).toContain('if (serialAtSave === canvasChangeSerial) canvasDirty = false;');
    expect(editor).toContain('const sentFingerprint = formFingerprint();');
    expect(editor).toContain('savedFormFingerprint = sentFingerprint;');
    expect(editor).toContain('if (formDirty || canvasDirty)');
    expect(editor).toContain('getSnapshot(editorRef.store)');
    expect(editor).toContain('Save again before confirming');
    expect(editor).toContain('const saved=await saveDraft();');
    expect(editor).toContain("if (!saved) throw new Error($t('orderWorkspace.confirmSaveFirst'))");
    expect(editor).toContain('if (!scope.isCurrent()) return false;');
    expect(editor).toContain('if (scope.isCurrent()) saving = false;');
  });
});
