// src/routes/api/files/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/files - List files with optional filters
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const orderId = url.searchParams.get('orderId');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    let query = locals.supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (orderId) {
       // Join with order_files to filter by order.
       // Supabase JS allows filtering by related table existence/criteria:
       // .select('*, order_files!inner(draft_order_id)')
       // .eq('order_files.draft_order_id', orderId)
       // But wait, orderId can be PO Number too based on original code?
       // "WHERE d.po_number = $${idx} OR d.id::text = $${idx}"
       // If PO Number, we need to join draft_orders too.

       // Complex join filtering in Supabase JS:
       // We can fetch files that have order_files linked to the order.
       // .select('*, order_files!inner(draft_orders!inner(id, po_number))')
       // .or(`id.eq.${orderId},po_number.eq.${orderId}`, { foreignTable: 'order_files.draft_orders' })
       // This syntax is tricky.

       // Simplified approach: first resolve order ID if it's a PO Number.
       let targetOrderId = orderId;
       const { data: order } = await locals.supabase
            .from('draft_orders')
            .select('id')
            .or(`id.eq.${orderId},po_number.eq.${orderId}`)
            .maybeSingle(); // Use maybeSingle to avoid error if not found (just returns null)

       if (order) {
           targetOrderId = order.id;
           // Now filter files by this order ID via order_files
           // We need to filter files where id is in (select file_id from order_files where draft_order_id = targetOrderId)
           // .in() accepts a list. We can't do subquery easily without RPC or two steps.
           // Two steps:
           const { data: fileIds } = await locals.supabase
               .from('order_files')
               .select('file_id')
               .eq('draft_order_id', targetOrderId);

           if (fileIds && fileIds.length > 0) {
               query = query.in('id', fileIds.map(f => f.file_id));
           } else {
               return json([]); // No files for this order
           }
       } else {
            // Order not found, so no files
            return json([]);
       }
    }

    const { data: files, error } = await query;

    if (error) throw error;

    const formattedFiles = files.map(row => ({
      id: row.id,
      originalName: row.original_name || row.filename,
      storedName: row.filename,
      mimeType: row.mimetype,
      size: row.size,
      path: row.filepath,
      uploadedBy: row.uploaded_by,
      uploadedAt: row.created_at
    }));

    return json(formattedFiles);
  } catch (err) {
    console.error('Failed to list files:', err);
    return json([]);
  }
};

/**
 * POST /api/files - Upload file
 * (Redundant to /api/files/upload but kept for compatibility)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    // Redirect logic to use the already refactored logic or reuse it.
    // The previous refactor was in src/routes/api/files/upload/+server.ts.
    // This endpoint seems to handle generic file upload and saving to DB.
    // I will implement it similarly.

    const session = await locals.getSession();
    if (!session) {
         throw error(401, 'Unauthorized');
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const orderId = formData.get('orderId') as string | null;

        if (!file || !(file instanceof File)) {
            throw error(400, 'No file provided');
        }

        // Upload to Storage
        const ext = file.name.split('.').pop();
        const uniqueName = crypto.randomUUID();
        const fileName = `${uniqueName}.${ext}`;
        const filePath = `general/${fileName}`; // Using 'general' category as default

        const { error: uploadError } = await locals.supabase
            .storage
            .from('files')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Save to DB
        const { data: fileRecord, error: dbError } = await locals.supabase
            .from('files')
            .insert({
                filename: fileName,
                original_name: file.name,
                filepath: filePath,
                mimetype: file.type,
                size: file.size,
                uploaded_by: session.user.id
            })
            .select()
            .single();

        if (dbError) {
             // Cleanup storage
             await locals.supabase.storage.from('files').remove([filePath]);
             throw dbError;
        }

        // Link to Order if provided
        if (orderId) {
             // Check if order exists (by ID or PO)
             const { data: order } = await locals.supabase
                .from('draft_orders')
                .select('id')
                .or(`id.eq.${orderId},po_number.eq.${orderId}`)
                .maybeSingle();

             if (order) {
                 await locals.supabase
                    .from('order_files')
                    .insert({
                        draft_order_id: order.id,
                        file_id: fileRecord.id,
                        file_type: 'attachment', // Default type
                        display_name: file.name
                    });
             }
        }

        return json({
            id: fileRecord.id,
            originalName: fileRecord.original_name,
            storedName: fileRecord.filename,
            mimeType: fileRecord.mimetype,
            size: fileRecord.size,
            path: fileRecord.filepath, // Should be public URL or path? Logic uses path.
            uploadedBy: fileRecord.uploaded_by,
            uploadedAt: fileRecord.created_at
        }, { status: 201 });

    } catch (err: any) {
        console.error('File upload error:', err);
        if (err.status) throw err;
        throw error(500, err.message || 'Failed to upload file');
    }
};
