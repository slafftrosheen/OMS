import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function attachmentKind(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * POST /api/chat/attachments
 * Multipart form fields: roomId, messageId (optional), file
 * Returns the stored attachment record.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const roomId = form.get('roomId')?.toString();
  const messageId = form.get('messageId')?.toString() || null;
  const file = form.get('file');

  if (!roomId) return json({ error: 'roomId required' }, { status: 400 });
  if (!(file instanceof File)) return json({ error: 'file required' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return json({ error: 'File exceeds 50 MB limit' }, { status: 413 });
  }

  const kind = attachmentKind(file.type);
  const ext = file.name.split('.').pop() ?? 'bin';
  const storagePath = `chat/${roomId}/${session.user.id}/${Date.now()}.${ext}`;

  // Upload to Supabase Storage bucket "chat-attachments"
  const { error: uploadError } = await locals.supabase.storage
    .from('chat-attachments')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
  }

  // Persist record
  const { data: record, error: dbError } = await locals.supabase
    .from('chat_attachments')
    .insert({
      message_id: messageId || null,
      room_id: roomId,
      uploader_id: session.user.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      attachment_kind: kind,
    })
    .select()
    .single();

  if (dbError) {
    console.error('DB insert error:', dbError);
    return json({ error: 'Failed to save attachment record' }, { status: 500 });
  }

  // Build a signed URL (1 hour) for immediate display
  const { data: signedData } = await locals.supabase.storage
    .from('chat-attachments')
    .createSignedUrl(storagePath, 3600);

  return json({
    success: true,
    attachment: {
      id: record.id,
      fileName: record.file_name,
      fileType: record.file_type,
      fileSize: record.file_size,
      kind: record.attachment_kind,
      url: signedData?.signedUrl ?? null,
      storagePath: record.storage_path,
      createdAt: record.created_at,
    }
  });
};

/**
 * GET /api/chat/attachments?roomId=…&messageId=…
 * List attachments for a room or a specific message.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const roomId = url.searchParams.get('roomId');
  const messageId = url.searchParams.get('messageId');

  if (!roomId && !messageId) {
    return json({ error: 'roomId or messageId required' }, { status: 400 });
  }

  let query = locals.supabase
    .from('chat_attachments')
    .select('*')
    .order('created_at', { ascending: true });

  if (messageId) query = query.eq('message_id', messageId);
  else if (roomId) query = query.eq('room_id', roomId);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, { status: 500 });

  // Generate signed URLs
  const attachments = await Promise.all(
    (data ?? []).map(async (row: any) => {
      const { data: sd } = await locals.supabase.storage
        .from('chat-attachments')
        .createSignedUrl(row.storage_path, 3600);
      return {
        id: row.id,
        messageId: row.message_id,
        fileName: row.file_name,
        fileType: row.file_type,
        fileSize: row.file_size,
        kind: row.attachment_kind,
        url: sd?.signedUrl ?? null,
        duration: row.duration_secs,
        width: row.width,
        height: row.height,
        thumbnailPath: row.thumbnail_path,
        createdAt: row.created_at,
      };
    })
  );

  return json({ success: true, attachments });
};
