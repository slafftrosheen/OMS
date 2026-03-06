// src/lib/server/storage/StorageService.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { logger } from '../logging/logger';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface StorageConfig {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
}

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
    private client: S3Client | null = null;
    private config: StorageConfig;
    private enabled: boolean;
    private localDir: string;

    constructor() {
        this.enabled = this.validateConfig();
        this.localDir = path.resolve('storage');

        if (!this.enabled) {
            logger.info('S3 storage not configured - using local fallback', { dir: this.localDir });
            if (!existsSync(this.localDir)) {
                mkdirSync(this.localDir, { recursive: true });
            }
        } else {
            this.config = {
                endpoint: process.env.S3_ENDPOINT!,
                region: process.env.S3_REGION || 'us-east-1',
                bucket: process.env.S3_BUCKET!,
                accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
                publicUrl: process.env.S3_PUBLIC_URL
            };

            this.client = new S3Client({
                endpoint: this.config.endpoint,
                region: this.config.region,
                credentials: {
                    accessKeyId: this.config.accessKeyId!,
                    secretAccessKey: this.config.secretAccessKey!
                },
                forcePathStyle: true // Required for MinIO
            });

            logger.info('S3 Storage initialized', { 
                endpoint: this.config.endpoint, 
                bucket: this.config.bucket 
            });
        }
    }

    private validateConfig(): boolean {
        const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
        return required.every(key => !!process.env[key]);
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
        // Ensure path separators are forward slashes for S3/URL compatibility
        return `orders/${orderId}/${userId}/${hash}-${sanitized}`;
    }

    private getLocalPath(key: string): string {
        // Prevent directory traversal
        const safeKey = key.replace(/\.\./g, '');
        return path.join(this.localDir, safeKey);
    }

    /**
     * Upload file to S3 or Local
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

        if (this.enabled && this.client) {
            const command = new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                Metadata: {
                    'user-id': userId,
                    'order-id': orderId,
                    'uploaded-at': new Date().toISOString(),
                    ...options.metadata
                },
                ACL: options.acl || 'private'
            });

            try {
                const response = await this.client.send(command);
                
                logger.info('File uploaded to S3', { key, size: buffer.length });

                return {
                    key,
                    size: buffer.length,
                    contentType,
                    etag: response.ETag || '',
                    lastModified: new Date(),
                    url: this.getPublicUrl(key)
                };
            } catch (error) {
                logger.error('S3 upload failed', error as Error, { key, orderId });
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
        if (this.enabled && this.client) {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            try {
                const url = await getSignedUrl(this.client, command, { expiresIn });
                return url;
            } catch (error) {
                logger.error('Failed to generate signed URL', error as Error, { key });
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
            if (this.config.publicUrl) {
                return `${this.config.publicUrl}/${key}`;
            }
            return `${this.config.endpoint}/${this.config.bucket}/${key}`;
        }
        return `/api/files/download?key=${encodeURIComponent(key)}`;
    }

    /**
     * Download file
     */
    async download(key: string): Promise<{ buffer: Buffer; metadata: FileMetadata }> {
        if (this.enabled && this.client) {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            try {
                const response = await this.client.send(command);
                const stream = response.Body as any;
                const chunks: Uint8Array[] = [];

                for await (const chunk of stream) {
                    chunks.push(chunk);
                }

                const buffer = Buffer.concat(chunks);

                return {
                    buffer,
                    metadata: {
                        key,
                        size: response.ContentLength || 0,
                        contentType: response.ContentType || 'application/octet-stream',
                        etag: response.ETag || '',
                        lastModified: response.LastModified || new Date(),
                        url: this.getPublicUrl(key)
                    }
                };
            } catch (error) {
                logger.error('S3 download failed', error as Error, { key });
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
                        contentType: 'application/octet-stream', // Could infer from extension
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
        if (this.enabled && this.client) {
            const command = new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            try {
                await this.client.send(command);
                logger.info('File deleted from S3', { key });
            } catch (error) {
                logger.error('S3 delete failed', error as Error, { key });
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
        if (this.enabled && this.client) {
            const command = new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            try {
                await this.client.send(command);
                return true;
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
        if (this.enabled && this.client) {
            const command = new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            try {
                const response = await this.client.send(command);
                
                return {
                    key,
                    size: response.ContentLength || 0,
                    contentType: response.ContentType || 'application/octet-stream',
                    etag: response.ETag || '',
                    lastModified: response.LastModified || new Date(),
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