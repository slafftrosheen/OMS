// src/routes/api/files/upload/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageService } from '$lib/server/storage/StorageService';
import { logger } from '$lib/server/logging/logger';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

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

/**
 * Strip directory components, dangerous characters, and overlong names from a
 * client-supplied filename.  Always prefixed by a UUID at the call site so the
 * sanitized component is purely cosmetic — even if it sanitises to an empty
 * string, the file will still have a unique storage name.
 */
function safeFilenameSegment(name: string | null | undefined): string {
    if (!name) return 'upload';
    const stripped = basename(name);
    return stripped.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload';
}

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
            
            // Implement local fallback storage
            const fs = await import('fs');
            const path = await import('path');
            const os = await import('os');
            
            // Create uploads directory if it doesn't exist
            const uploadDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            // Generate unique filename. UUID-prefix guarantees uniqueness even
            // if two users upload the same name; safeFilenameSegment strips any
            // path traversal or shell metacharacters.
            const fileName = `${Date.now()}-${randomUUID()}-${safeFilenameSegment(file.name)}`;
            const filePath = path.join(uploadDir, fileName);
            // Defence-in-depth: ensure the resolved path is still under uploadDir.
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
                throw svelteError(400, 'Invalid filename');
            }
            
            // Write file to local storage
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(filePath, buffer);
            
            // Save to database with local path
            const { data: dbFile, error: dbError } = await locals.supabase
                .from('order_files')
                .insert({
                    order_id: orderId,
                    file_name: file.name,
                    file_type: fileType,
                    storage_key: fileName, // Store just the filename for local storage
                    file_size: file.size,
                    mime_type: file.type,
                    uploaded_by: user.id,
                    url: `/uploads/${fileName}` // Serve from local uploads path
                })
                .select()
                .single();

            if (dbError) {
                // Cleanup local file if database insert fails
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                logger.error('Database insert failed after local upload', dbError, {
                    filePath
                });
                throw svelteError(500, 'Failed to save file record');
            }

            logger.info('File uploaded to local storage successfully', {
                fileId: dbFile.id,
                orderId,
                size: file.size
            });

            return json({
                success: true,
                file: dbFile
            });
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