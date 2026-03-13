// src/routes/api/files/upload/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageService } from '$lib/server/storage/StorageService';
import { logger } from '$lib/server/logging/logger';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'text/plain',
    'application/x-dxf',
    'application/dxf'
];

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const orderId = formData.get('order_id') as string;
        const fileType = formData.get('file_type') as string || 'attachment';

        // Validation
        if (!file) {
            throw svelteError(400, 'No file provided');
        }

        if (!orderId) {
            throw svelteError(400, 'Order ID is required');
        }

        if (file.size > MAX_FILE_SIZE) {
            throw svelteError(413, `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            throw svelteError(415, `File type ${file.type} not allowed`);
        }

        // Check if S3 is enabled
        if (!storageService.isEnabled()) {
            logger.warn('S3 not configured, falling back to local storage');
            // TODO: Implement local fallback
            throw svelteError(503, 'File storage not available');
        }

        // Upload to S3
        const metadata = await storageService.upload(file, orderId, user.id, {
            contentType: file.type,
            metadata: {
                'file-type': fileType,
                'original-name': file.name
            }
        });

        // Save to database
        const { data: dbFile, error: dbError } = await locals.supabase
            .from('order_files')
            .insert({
                order_id: orderId,
                file_name: file.name,
                file_type: fileType,
                storage_key: metadata.key,
                file_size: metadata.size,
                mime_type: metadata.contentType,
                uploaded_by: user.id,
                url: metadata.url
            })
            .select()
            .single();

        if (dbError) {
            // Cleanup S3 file if database insert fails
            await storageService.delete(metadata.key);
            logger.error('Database insert failed after S3 upload', dbError, { 
                key: metadata.key 
            });
            throw svelteError(500, 'Failed to save file record');
        }

        logger.info('File uploaded successfully', { 
            fileId: dbFile.id,
            orderId,
            size: metadata.size 
        });

        return json({
            success: true,
            file: dbFile
        });

    } catch (err) {
        if (err instanceof Response) {
            throw err;
        }
        
        logger.error('File upload error', err as Error, { 
            userId: user.id 
        });
        throw svelteError(500, 'File upload failed');
    }
};