/**
 * Station Attachments API
 * Handles photo/document uploads for station logs
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import sharp from 'sharp'; // For image processing
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const THUMBNAIL_WIDTH = 400;

// GET /api/station-attachments - List attachments
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const orderId = url.searchParams.get('orderId');
  const station = url.searchParams.get('station');
  const type = url.searchParams.get('type');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('station_attachments')
    .select(`
      *,
      uploaded_by_user:auth.users!station_attachments_uploaded_by_fkey(email, id),
      order:draft_orders(id, title, po_number)
    `, { count: 'exact' })
    .order('uploaded_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (orderId) query = query.eq('order_id', orderId);
  if (station) query = query.eq('station', station);
  if (type) query = query.eq('attachment_type', type);

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[Attachments API] List error:', dbError);
    throw error(500, 'Failed to fetch attachments');
  }

  // Generate signed URLs for attachments. The Supabase select-string typer
  // can't infer the renamed `uploaded_by_user:auth.users!...` join, so we
  // erase the row type here.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & {
    file_path: string;
    thumbnail_path?: string | null;
  }>;
  const attachmentsWithUrls = await Promise.all(
    rows.map(async (attachment) => {
      const { data: signedUrl } = await supabase.storage
        .from('station-attachments')
        .createSignedUrl(attachment.file_path, 3600); // 1 hour expiry

      let thumbnailUrl = null;
      if (attachment.thumbnail_path) {
        const { data: thumbUrl } = await supabase.storage
          .from('station-attachments')
          .createSignedUrl(attachment.thumbnail_path, 3600);
        thumbnailUrl = thumbUrl?.signedUrl || null;
      }

      return {
        ...attachment,
        url: signedUrl?.signedUrl || null,
        thumbnailUrl
      };
    })
  );

  return json({
    data: attachmentsWithUrls,
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    }
  });
};

// POST /api/station-attachments - Upload attachment
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const orderId = formData.get('orderId') as string;
  const station = formData.get('station') as string;
  const attachmentType = formData.get('type') as string || 'photo';
  const caption = formData.get('caption') as string || '';
  const notes = formData.get('notes') as string || '';
  const stationLogId = formData.get('stationLogId') as string || null;
  const tags = formData.get('tags') as string || '';

  // Validate required fields
  if (!file || !orderId || !station) {
    throw error(400, 'Missing required fields: file, orderId, station');
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw error(400, 'Invalid file type. Allowed: JPEG, PNG, WebP, PDF');
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw error(400, `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  try {
    const fileExtension = file.name.split('.').pop();
    const fileId = uuidv4();
    const fileName = `${fileId}.${fileExtension}`;
    const filePath = `${user.id}/${orderId}/${fileName}`;
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    let width: number | null = null;
    let height: number | null = null;
    let thumbnailPath: string | null = null;

    // Process images
    if (file.type.startsWith('image/')) {
      const image = sharp(fileBuffer);
      const metadata = await image.metadata();
      width = metadata.width || null;
      height = metadata.height || null;

      // Create thumbnail
      const thumbnailBuffer = await image
        .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      thumbnailPath = `${user.id}/${orderId}/thumb_${fileId}.jpg`;

      // Upload thumbnail
      const { error: thumbError } = await supabase.storage
        .from('station-attachments')
        .upload(thumbnailPath, thumbnailBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (thumbError) {
        console.error('[Attachments API] Thumbnail upload error:', thumbError);
      }
    }

    // Upload original file
    const { error: uploadError } = await supabase.storage
      .from('station-attachments')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('[Attachments API] Upload error:', uploadError);
      throw error(500, 'Failed to upload file');
    }

    // Create database record
    const { data: attachment, error: dbError } = await supabase
      .from('station_attachments')
      .insert({
        order_id: orderId,
        station_log_id: stationLogId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        mime_type: file.type,
        width,
        height,
        thumbnail_path: thumbnailPath,
        station,
        attachment_type: attachmentType,
        caption,
        notes,
        uploaded_by: user.id,
        tags: tags ? tags.split(',').map(t => t.trim()) : []
      })
      .select(`
        *,
        uploaded_by_user:auth.users!station_attachments_uploaded_by_fkey(email, id)
      `)
      .single();

    if (dbError) {
      console.error('[Attachments API] Database error:', dbError);
      // Cleanup uploaded files
      await supabase.storage.from('station-attachments').remove([filePath]);
      if (thumbnailPath) {
        await supabase.storage.from('station-attachments').remove([thumbnailPath]);
      }
      throw error(500, 'Failed to save attachment record');
    }

    // Generate signed URL
    const { data: signedUrl } = await supabase.storage
      .from('station-attachments')
      .createSignedUrl(filePath, 3600);

    return json({
      data: {
        ...(attachment as unknown as Record<string, unknown>),
        url: signedUrl?.signedUrl || null
      }
    }, { status: 201 });

  } catch (err) {
    console.error('[Attachments API] Error:', err);
    throw error(500, 'Failed to process attachment');
  }
};

// DELETE /api/station-attachments/[id] - Delete attachment
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  // Get attachment details
  const { data: attachment, error: fetchError } = await supabase
    .from('station_attachments')
    .select('*')
    .eq('id', ((params as Record<string, string|undefined>).id ?? ''))
    .single();

  if (fetchError || !attachment) {
    throw error(404, 'Attachment not found');
  }

  // Check ownership
  if (attachment.uploaded_by !== user.id) {
    throw error(403, 'You can only delete your own attachments');
  }

  // Delete from storage
  const filesToDelete = [attachment.file_path];
  if (attachment.thumbnail_path) {
    filesToDelete.push(attachment.thumbnail_path);
  }

  const { error: storageError } = await supabase.storage
    .from('station-attachments')
    .remove(filesToDelete);

  if (storageError) {
    console.error('[Attachments API] Storage deletion error:', storageError);
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from('station_attachments')
    .delete()
    .eq('id', ((params as Record<string, string|undefined>).id ?? ''));

  if (dbError) {
    console.error('[Attachments API] Database deletion error:', dbError);
    throw error(500, 'Failed to delete attachment');
  }

  return json({ success: true });
};