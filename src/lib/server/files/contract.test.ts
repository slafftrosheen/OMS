import { describe, expect, it } from 'vitest';
import { buildOrderFileLink, formatFileRecord, safeDownloadFilename, storageKeyFromFileRow, canDeleteGlobalFile } from './contract';

describe('order file storage and DTO contract', () => {
  it('links file metadata through the deployed junction columns', () => {
    expect(buildOrderFileLink('order-1', 'file-1', 'sketch', 'drawing.pdf')).toEqual({
      draft_order_id: 'order-1', file_id: 'file-1', file_type: 'sketch', display_name: 'drawing.pdf'
    });
  });
  it('formats file metadata from files table columns', () => {
    const row = formatFileRecord({ id: 'file-1', filename: 'key.pdf', original_name: 'drawing.pdf', mimetype: 'application/pdf', size: 100, filepath: 'orders/1/key.pdf', uploaded_by: 'u1', created_at: 'now' });
    expect(row.id).toBe('file-1');
    expect(row.file_name).toBe('drawing.pdf');
    expect(row.mime_type).toBe('application/pdf');
    expect(row.file_size).toBe(100);
  });
  it('uses storage metadata key where present and sanitizes disposition filenames', () => {
    expect(storageKeyFromFileRow({ filepath: 'legacy/file.pdf', metadata: { storage_key: 'bucket/key.pdf' } })).toBe('bucket/key.pdf');
    expect(safeDownloadFilename('x\"\r\n.pdf')).toBe('x___.pdf');
  });
  it('prevents deleting a shared file if any link is inaccessible', () => {
    expect(canDeleteGlobalFile(2, 1)).toBe(false);
    expect(canDeleteGlobalFile(2, 2)).toBe(true);
  });
});
