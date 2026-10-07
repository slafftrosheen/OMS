export function buildOrderFileLink(orderId: string, fileId: string, fileType: string, displayName: string) {
  return { draft_order_id: orderId, file_id: fileId, file_type: fileType, display_name: displayName };
}

export function formatFileRecord(row: Record<string, any>) {
  return {
    id: row.id,
    file_name: row.original_name || row.filename,
    originalName: row.original_name || row.filename,
    storedName: row.filename,
    mime_type: row.mimetype,
    mimeType: row.mimetype,
    file_size: row.size,
    size: row.size,
    path: row.filepath,
    uploaded_by: row.uploaded_by,
    uploadedBy: row.uploaded_by,
    created_at: row.created_at,
    uploadedAt: row.created_at,
    file_type: row.file_type ?? 'attachment',
    display_name: row.display_name ?? row.original_name ?? row.filename
  };
}

export function safeDownloadFilename(value: string): string {
  return value.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'download';
}

export function storageKeyFromFileRow(row: Record<string, any>): string {
  return typeof row.metadata?.storage_key === 'string' && row.metadata.storage_key
    ? row.metadata.storage_key
    : row.filepath;
}

export function canDeleteGlobalFile(linkCount: number, visibleLinkCount: number): boolean {
  return linkCount === visibleLinkCount;
}
