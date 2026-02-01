/**
 * Storage Service Module
 * 
 * Consolidated storage using AWS SDK S3 client.
 * Supports S3-compatible storage (MinIO, AWS S3, etc.)
 * 
 * DEPRECATED: storage-service.ts and s3-storage.ts
 * USE: StorageService.ts (AWS SDK-based implementation)
 */

export { storageService } from './StorageService';
export type { FileMetadata, UploadOptions } from './StorageService';