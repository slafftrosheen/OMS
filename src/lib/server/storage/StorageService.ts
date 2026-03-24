// src/lib/server/storage/StorageService.ts
import { createHash } from 'crypto';
import { logger } from '../logging/logger';
import { supabase } from '../supabase';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const STORAGE_BUCKET = 'order-files';

export interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
    acl?: 'private' | 'public-read';
    expiresIn?: number;
}

export interface FileMetadata {
    key: string;
    size: number;
    contentType: string;
    etag: string;
    lastModified: Date;
    url: string;
}

class StorageService {
    private enabled: boolean;
    private localDir: string;

    constructor() {
        this.localDir = path.resolve('storage');
        this.enabled = this.checkSupabaseConnection();

        if (!this.enabled) {
            logger.info('Supabase Storage not available - using local fallback', { dir: this.localDir });
            if (!existsSync(this.localDir)) {
                mkdirSync(this.localDir, { recursive: true });
            }
        } else {
            logger.info('Supabase Storage initialized', { bucket: STORAGE_BUCKET });
        }
    }

    private checkSupabaseConnection(): boolean {
        // Check if Supabase URL is set and not a placeholder
        const url = process?.env?.PUBLIC_SUPABASE_URL || '';
        return !!url && url !== 'http://localhost:8000' && url.startsWith('http');
    }

    /**
     * Generate a unique storage key for a file
     */
    private generateKey(orderId: string, filename: string, userId: string): string {
        const timestamp = Date.now();
        const hash = createHash('md5')
            .update(`${orderId}-${filename}-${timestamp}`)
            .digest('hex')
            .substring(0, 8);
        
        const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        return `orders/${orderId}/${userId}/${hash}-${sanitized}`;
    }

    private getLocalPath(key: string): string {
        // Prevent directory traversal
        const safeKey = key.replace(/\.\./g, '');
        return path.join(this.localDir, safeKey);
    }

    /**
     * Upload file to Supabase Storage or Local fallback
     */
    async upload(
        file: File | Buffer,
        orderId: string,
        userId: string,
        options: UploadOptions = {}
    ): Promise<FileMetadata> {
        const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
        const filename = file instanceof File ? file.name : 'file';
        const key = this.generateKey(orderId, filename, userId);
        const contentType = options.contentType || (file instanceof File ? file.type : 'application/octet-stream');

        if (this.enabled) {
            try {
                const { data, error } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .upload(key, buffer, {
                        contentType,
                        upsert: false,
                        duplex: 'half',
                        metadata: {
                            'user-id': userId,
                            'order-id': orderId,
                            'uploaded-at': new Date().toISOString(),
                            ...options.metadata
                        }
                    });

                if (error) {
                    logger.error('Supabase Storage upload failed', error as Error, { key, orderId });
                    throw new Error(`File upload failed: ${error.message}`);
                }

                logger.info('File uploaded to Supabase Storage', { key, size: buffer.length });

                return {
                    key,
                    size: buffer.length,
                    contentType,
                    etag: data?.path || '',
                    lastModified: new Date(),
                    url: this.getPublicUrl(key)
                };
            } catch (error) {
                logger.error('Supabase Storage upload error', error as Error, { key, orderId });
                throw new Error('File upload failed');
            }
        } else {
            // Local Fallback
            try {
                const filePath = this.getLocalPath(key);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, buffer);

                logger.info('File uploaded locally', { key, size: buffer.length });

                return {
                    key,
                    size: buffer.length,
                    contentType,
                    etag: 'local-etag',
                    lastModified: new Date(),
                    url: `/api/files/${encodeURIComponent(key)}` // Serve via API
                };
            } catch (error) {
                logger.error('Local upload failed', error as Error, { key });
                throw new Error('File upload failed');
            }
        }
    }

    /**
     * Get signed URL for private file access
     */
    async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        if (this.enabled) {
            try {
                const { data, error } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .createSignedUrl(key, expiresIn);

                if (error) {
                    logger.error('Failed to generate signed URL', error as Error, { key });
                    throw new Error('Could not generate download link');
                }

                return data.signedUrl;
            } catch (error) {
                logger.error('Signed URL generation failed', error as Error, { key });
                throw new Error('Could not generate download link');
            }
        } else {
            // Local fallback: return API URL (authentication handled by API route)
            return `/api/files/download?key=${encodeURIComponent(key)}`;
        }
    }

    /**
     * Get public URL for file
     */
    private getPublicUrl(key: string): string {
        if (this.enabled) {
            const { data } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(key);

            return data.publicUrl;
        }
        return `/api/files/download?key=${encodeURIComponent(key)}`;
    }

    /**
     * Download file
     */
    async download(key: string): Promise<{ buffer: Buffer; metadata: FileMetadata }> {
        if (this.enabled) {
            try {
                const { data, error } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .download(key);

                if (error) {
                    logger.error('Supabase Storage download failed', error as Error, { key });
                    throw new Error('File download failed');
                }

                const arrayBuffer = await data.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                return {
                    buffer,
                    metadata: {
                        key,
                        size: buffer.length,
                        contentType: data.type || 'application/octet-stream',
                        etag: '',
                        lastModified: new Date(),
                        url: this.getPublicUrl(key)
                    }
                };
            } catch (error) {
                logger.error('Supabase Storage download error', error as Error, { key });
                throw new Error('File download failed');
            }
        } else {
            // Local Fallback
            try {
                const filePath = this.getLocalPath(key);
                const buffer = await fs.readFile(filePath);
                const stats = await fs.stat(filePath);

                return {
                    buffer,
                    metadata: {
                        key,
                        size: stats.size,
                        contentType: 'application/octet-stream',
                        etag: 'local-etag',
                        lastModified: stats.mtime,
                        url: this.getPublicUrl(key)
                    }
                };
            } catch (error) {
                logger.error('Local download failed', error as Error, { key });
                throw new Error('File download failed');
            }
        }
    }

    /**
     * Delete file
     */
    async delete(key: string): Promise<void> {
        if (this.enabled) {
            try {
                const { error } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .remove([key]);

                if (error) {
                    logger.error('Supabase Storage delete failed', error as Error, { key });
                    throw new Error('File deletion failed');
                }

                logger.info('File deleted from Supabase Storage', { key });
            } catch (error) {
                logger.error('Storage delete error', error as Error, { key });
                throw new Error('File deletion failed');
            }
        } else {
            // Local Fallback
            try {
                const filePath = this.getLocalPath(key);
                await fs.unlink(filePath);
                logger.info('File deleted locally', { key });
            } catch (error) {
                // Ignore if file missing
                if ((error as any).code !== 'ENOENT') {
                    logger.error('Local delete failed', error as Error, { key });
                    throw new Error('File deletion failed');
                }
            }
        }
    }

    /**
     * Check if file exists
     */
    async exists(key: string): Promise<boolean> {
        if (this.enabled) {
            try {
                // List files matching the key path
                const pathParts = key.split('/');
                const fileName = pathParts.pop()!;
                const folderPath = pathParts.join('/');

                const { data, error } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .list(folderPath, {
                        search: fileName,
                        limit: 1
                    });

                if (error) return false;
                return (data?.length ?? 0) > 0;
            } catch {
                return false;
            }
        } else {
            // Local Fallback
            try {
                await fs.access(this.getLocalPath(key));
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * Get file metadata
     */
    async getMetadata(key: string): Promise<FileMetadata> {
        if (this.enabled) {
            try {
                // Supabase Storage doesn't have a direct HEAD-like method,
                // so we list to get metadata
                const pathParts = key.split('/');
                const fileName = pathParts.pop()!;
                const folderPath = pathParts.join('/');

                const { data, error } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .list(folderPath, {
                        search: fileName,
                        limit: 1
                    });

                if (error || !data || data.length === 0) {
                    throw new Error('File not found');
                }

                const fileInfo = data[0];
                return {
                    key,
                    size: fileInfo.metadata?.size || 0,
                    contentType: fileInfo.metadata?.mimetype || 'application/octet-stream',
                    etag: fileInfo.id || '',
                    lastModified: new Date(fileInfo.updated_at || fileInfo.created_at),
                    url: this.getPublicUrl(key)
                };
            } catch (error) {
                logger.error('Failed to get file metadata', error as Error, { key });
                throw new Error('Could not retrieve file information');
            }
        } else {
            // Local Fallback
            try {
                const stats = await fs.stat(this.getLocalPath(key));
                return {
                    key,
                    size: stats.size,
                    contentType: 'application/octet-stream',
                    etag: 'local-etag',
                    lastModified: stats.mtime,
                    url: this.getPublicUrl(key)
                };
            } catch (error) {
                logger.error('Failed to get local metadata', error as Error, { key });
                throw new Error('Could not retrieve file information');
            }
        }
    }

    isEnabled(): boolean {
        return true; // Always enabled now
    }
}

export const storageService = new StorageService();