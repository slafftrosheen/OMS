import { describe, expect, it } from 'vitest';
import { buildCreateChangeRequestArgs, buildReviewChangeRequestArgs } from '../src/lib/server/change-requests/contract';
import { buildStagePatch, updateStageRows } from '../src/lib/order/stage-contract';
import { buildOrderFileLink, formatFileRecord, safeDownloadFilename, storageKeyFromFileRow } from '../src/lib/server/files/contract';

describe('change request RPC contract', () => {
  it('uses the deployed create_change_request named arguments', () => {
    expect(buildCreateChangeRequestArgs('order-id', {
      description: 'Change the title',
      changes: { title: 'New title' }
    })).toEqual({
      p_order_id: 'order-id',
      p_description: 'Change the title',
      p_proposed_diff: { title: 'New title' }
    });
  });

  it('uses the deployed review_change_request named arguments', () => {
    expect(buildReviewChangeRequestArgs('change-id', 'rejected', 'Not approved')).toEqual({
      p_change_request_id: 'change-id',
      p_decision: 'rejected',
      p_notes: 'Not approved'
    });
  });

  it('builds the stage update using station and state contract names', () => {
    expect(buildStagePatch('CNC', 'IN_PROGRESS')).toEqual({ url: '?station=CNC', body: { state: 'IN_PROGRESS' } });
  });

  it('updates only the selected stage row', () => {
    expect(updateStageRows([
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'QUEUED' }
    ], 'CNC', 'IN_PROGRESS')).toEqual([
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'IN_PROGRESS' }
    ]);
  });

  it('maps an uploaded file into the real junction-table shape', () => {
    expect(buildOrderFileLink('order-1', 'file-1', 'sketch', 'drawing.pdf')).toEqual({
      draft_order_id: 'order-1', file_id: 'file-1', file_type: 'sketch', display_name: 'drawing.pdf'
    });
  });

  it('formats joined file metadata and sanitizes download names', () => {
    expect(formatFileRecord({ id: 'file-1', filename: 'key.pdf', original_name: 'drawing.pdf', mimetype: 'application/pdf', size: 100, filepath: 'orders/1/key.pdf', uploaded_by: 'u1', created_at: 'now' })).toMatchObject({ id: 'file-1', file_name: 'drawing.pdf', mime_type: 'application/pdf', file_size: 100 });
    expect(storageKeyFromFileRow({ filepath: 'legacy/file.pdf', metadata: { storage_key: 'bucket/key.pdf' } })).toBe('bucket/key.pdf');
    expect(safeDownloadFilename('x\"\r\n.pdf')).toBe('x__.pdf');
  });
});