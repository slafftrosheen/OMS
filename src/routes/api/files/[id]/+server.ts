// src/routes/api/files/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import { getFile, deleteFile, fileExists } from '$lib/files/storage';

/**
 * GET /api/files/[id] - Get file metadata or download file
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const download = url.searchParams.get('download') === 'true';

  try {
    // Try new schema first, fallback to old schema
    let result = await query(
      `SELECT id, original_name, filename as stored_name, mime_type, size_bytes as size, 
              storage_path as path, uploaded_by, uploaded_at
       FROM files WHERE id = $1`,
      [params.id]
    );

    // If no results, try with old column names
    if (result.rows.length === 0) {
      result = await query(
        `SELECT id, original_name, stored_name, mime_type, size, path, 
                category, order_id, uploaded_by, uploaded_at
         FROM files WHERE id = $1`,
        [params.id]
      );
    }

    if (result.rows.length === 0) {
      throw error(404, 'File not found');
    }

    const file = result.rows[0];
    const filePath = file.path || file.storage_path;
    const originalName = file.original_name;
    const mimeType = file.mime_type;

    // If download requested, return file content
    if (download) {
      const exists = await fileExists(filePath);
      if (!exists) {
        throw error(404, 'File not found on disk');
      }

      const buffer = await getFile(filePath);
      
      return new Response(buffer, {
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
          'Content-Length': String(buffer.length),
          'Content-Disposition': `attachment; filename="${originalName}"`
        }
      });
    }

    // Return metadata
    return json({
      id: file.id,
      originalName: file.original_name,
      storedName: file.stored_name || file.filename,
      mimeType: file.mime_type,
      size: file.size || file.size_bytes,
      path: filePath,
      category: file.category,
      orderId: file.order_id,
      uploadedBy: file.uploaded_by,
      uploadedAt: file.uploaded_at
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to get file:', err);
    throw error(500, 'Failed to get file');
  }
};

/**
 * DELETE /api/files/[id] - Delete file
 */
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    // Get file info first - handle both schemas
    let result = await query(
      `SELECT storage_path as path FROM files WHERE id = $1`,
      [params.id]
    );
    
    if (result.rows.length === 0) {
      result = await query(
        `SELECT path FROM files WHERE id = $1`,
        [params.id]
      );
    }

    if (result.rows.length === 0) {
      throw error(404, 'File not found');
    }

    const filePath = result.rows[0].path;

    // Delete from database
    await query(`DELETE FROM files WHERE id = $1`, [params.id]);

    // Delete from filesystem (don't fail if already gone)
    try {
      await deleteFile(filePath);
    } catch (e) {
      console.warn('File already deleted from disk:', filePath);
    }

    return json({ success: true });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to delete file:', err);
    throw error(500, 'Failed to delete file');
  }
};
