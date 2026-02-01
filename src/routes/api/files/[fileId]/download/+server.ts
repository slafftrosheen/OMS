// src/routes/api/files/[fileId]/download/+server.ts
import { error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageService } from '$lib/server/storage/StorageService';
import { logger } from '$lib/server/logging/logger';

export const GET: RequestHandler = async ({ params, locals, url }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const fileId = params.fileId;
    const inline = url.searchParams.get('inline') === 'true';

    try {
        // Get file record from database
        const { data: file, error: dbError } = await locals.supabase
            .from('order_files')
            .select('*, orders!inner(id)')
            .eq('id', fileId)
            .single();

        if (dbError || !file) {
            throw svelteError(404, 'File not found');
        }

        // Check permissions (user must have access to the order)
        const { data: order, error: orderError } = await locals.supabase
            .from('orders')
            .select('id')
            .eq('id', file.order_id)
            .single();

        if (orderError || !order) {
            throw svelteError(403, 'Access denied');
        }

        // Generate signed URL (valid for 1 hour)
        const signedUrl = await storageService.getSignedUrl(file.storage_key, 3600);

        // Option 1: Redirect to signed URL
        if (url.searchParams.get('redirect') === 'true') {
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': signedUrl
                }
            });
        }

        // Option 2: Stream file through server
        const { buffer, metadata } = await storageService.download(file.storage_key);

        const disposition = inline ? 'inline' : 'attachment';
        
        return new Response(buffer, {
            headers: {
                'Content-Type': metadata.contentType,
                'Content-Length': String(metadata.size),
                'Content-Disposition': `${disposition}; filename="${file.file_name}"`,
                'Cache-Control': 'private, max-age=3600'
            }
        });

    } catch (err) {
        if (err instanceof Response) {
            throw err;
        }
        
        logger.error('File download error', err as Error, { 
            fileId, 
            userId: user.id 
        });
        throw svelteError(500, 'File download failed');
    }
};