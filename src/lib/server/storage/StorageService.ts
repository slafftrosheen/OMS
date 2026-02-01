// src/lib/server/storage/StorageService.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { logger } from '../logging/logger';

export interface StorageConfig {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
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
    private client: S3Client;
    private config: StorageConfig;
    private enabled: boolean;

    constructor() {
        this.enabled = this.validateConfig();
        
        if (!this.enabled) {
            logger.warn('S3 storage not configured - using local fallback');
            return;
        }

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
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey
            },
            forcePathStyle: true // Required for MinIO
        });

        logger.info('S3 Storage initialized', { 
            endpoint: this.config.endpoint, 
            bucket: this.config.bucket 
        });
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
        return `orders/${orderId}/${userId}/${hash}-${sanitized}`;
    }

    /**
     * Upload file to S3
     */
    async upload(
        file: File | Buffer,
        orderId: string,
        userId: string,
        options: UploadOptions = {}
    ): Promise<FileMetadata> {
        if (!this.enabled) {
            throw new Error('S3 storage not configured');
        }

        const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
        const filename = file instanceof File ? file.name : 'file';
        const key = this.generateKey(orderId, filename, userId);

        const command = new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: buffer,
            ContentType: options.contentType || (file instanceof File ? file.type : 'application/octet-stream'),
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
            
            logger.info('File uploaded to S3', { 
                key, 
                size: buffer.length,
                etag: response.ETag 
            });

            return {
                key,
                size: buffer.length,
                contentType: options.contentType || 'application/octet-stream',
                etag: response.ETag || '',
                lastModified: new Date(),
                url: this.getPublicUrl(key)
            };
        } catch (error) {
            logger.error('S3 upload failed', error as Error, { key, orderId });
            throw new Error('File upload failed');
        }
    }

    /**
     * Get signed URL for private file access
     */
    async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        if (!this.enabled) {
            throw new Error('S3 storage not configured');
        }

        const command = new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key
        });

        try {
            const url = await getSignedUrl(this.client, command, { expiresIn });
            logger.debug('Generated signed URL', { key, expiresIn });
            return url;
        } catch (error) {
            logger.error('Failed to generate signed URL', error as Error, { key });
            throw new Error('Could not generate download link');
        }
    }

    /**
     * Get public URL for file (if public CDN configured)
     */
    private getPublicUrl(key: string): string {
        if (this.config.publicUrl) {
            return `${this.config.publicUrl}/${key}`;
        }
        return `${this.config.endpoint}/${this.config.bucket}/${key}`;
    }

    /**
     * Download file from S3
     */
    async download(key: string): Promise<{ buffer: Buffer; metadata: FileMetadata }> {
        if (!this.enabled) {
            throw new Error('S3 storage not configured');
        }

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
    }

    /**
     * Delete file from S3
     */
    async delete(key: string): Promise<void> {
        if (!this.enabled) {
            throw new Error('S3 storage not configured');
        }

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
    }

    /**
     * Check if file exists
     */
    async exists(key: string): Promise<boolean> {
        if (!this.enabled) {
            return false;
        }

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
    }

    /**
     * Get file metadata without downloading
     */
    async getMetadata(key: string): Promise<FileMetadata> {
        if (!this.enabled) {
            throw new Error('S3 storage not configured');
        }

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
    }

    isEnabled(): boolean {
        return this.enabled;
    }
}

export const storageService = new StorageService();