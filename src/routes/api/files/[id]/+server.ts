// src/routes/api/files/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageService } from '$lib/server/storage';

/**
 * GET /api/files/[id] - Get file metadata or download file
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  const download = url.searchParams.get('download') === 'true';

  try {
    const { data: file, error: fetchError } = await locals.supabase
      .from('files')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !file) {
      throw error(404, 'File not found');
    }

    if (download) {
      // Get the file buffer from storage service
      const fileBuffer = await storageService.retrieveFile(file.id, file.filename);

      return new Response(fileBuffer, {
        headers: {
          'Content-Type': file.mimetype || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.original_name || file.filename}"`
        }
      });
    }

    // Return metadata
    return json({
      id: file.id,
      originalName: file.original_name || file.filename,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      path: file.filepath,
      uploadedBy: file.uploaded_by,
      uploadedAt: file.created_at
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
export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const { data: file, error: fetchError } = await locals.supabase
      .from('files')
      .select('filename')
      .eq('id', params.id)
      .single();

    if (fetchError || !file) {
       throw error(404, 'File not found');
    }

    // Delete from Storage
    await storageService.deleteFile(file.filename);

    // Delete from Database
    const { error: dbError } = await locals.supabase
        .from('files')
        .delete()
        .eq('id', params.id);

    if (dbError) {
        throw dbError;
    }

    return json({ success: true });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to delete file:', err);
    throw error(500, 'Failed to delete file');
  }
};