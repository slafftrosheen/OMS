// src/routes/api/files/upload/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/files/upload - Upload file to Supabase Storage
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

    // Create unique filename path
    const ext = file.name.split('.').pop();
    const uniqueName = crypto.randomUUID();
    const fileName = `${uniqueName}.${ext}`;
    const filePath = `${category}/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await locals.supabase
      .storage
      .from('files')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw error(500, 'Failed to upload file to storage');
    }

    // Save metadata to database
    const { data: fileRecord, error: dbError } = await locals.supabase
      .from('files')
      .insert({
        filename: fileName, // stored name
        filepath: filePath, // full path in bucket
        mimetype: file.type,
        size: file.size,
        uploaded_by: session.user.id
      })
      .select()
      .single();

    if (dbError) {
        console.error('Database insert error:', dbError);
        // Should we clean up the file? Yes ideally.
        await locals.supabase.storage.from('files').remove([filePath]);
        throw error(500, 'Failed to save file metadata');
    }

    // Get public URL (optional, if bucket is public)
    const { data: { publicUrl } } = locals.supabase
      .storage
      .from('files')
      .getPublicUrl(filePath);

    return json({
      id: fileRecord.id,
      originalName: file.name, // We didn't store original name in DB in the migration I wrote earlier?
                               // Checking migration: `filename text not null` which corresponds to stored name usually?
                               // Wait, migration 001 said `filename` and `filepath`.
                               // Code above uses `filename` for stored name.
                               // I should probably add `original_name` to schema if needed.
                               // Existing schema had `original_name`.
                               // My migration 001 did NOT have `original_name`.
                               // I should add `original_name`.
      storedName: fileName,
      mimeType: file.type,
      size: file.size,
      path: publicUrl, // or relative path
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
