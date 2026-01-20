// src/routes/api/files/upload/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadFile } from '$lib/server/storage';

/**
 * POST /api/files/upload - Upload file to storage (S3 or local fallback)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
      throw error(401, 'Unauthorized');
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string || 'general';

    if (!file || !(file instanceof File)) {
      throw error(400, 'No file provided');
    }

    // Upload using storage helper
    const storedName = await uploadFile(file, file.name, file.type);
    const filePath = `${category}/${storedName}`;

    // Save metadata to database
    const { data: fileRecord, error: dbError } = await locals.supabase
      .from('files')
      .insert({
        filename: storedName,
        original_name: file.name,
        filepath: filePath,
        mimetype: file.type,
        size: file.size,
        uploaded_by: session.user.id
      })
      .select()
      .single();

    if (dbError) {
        console.error('Database insert error:', dbError);
        // Note: deleteFile(storedName) should be called here for cleanup
        throw error(500, 'Failed to save file metadata');
    }

    return json({
      id: fileRecord.id,
      originalName: file.name,
      storedName: storedName,
      mimeType: file.type,
      size: file.size,
      category,
      uploadedBy: session.user.id,
      uploadedAt: fileRecord.created_at
    }, { status: 201 });

  } catch (err: any) {
    console.error('File upload error:', err);
    if (err.status) throw err;
    throw error(500, err.message || 'Failed to upload file');
  }
};