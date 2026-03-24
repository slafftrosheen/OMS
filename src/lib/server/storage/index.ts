/**
 * Storage Service Module
 * 
 * Consolidated storage using Supabase Storage API.
 * Self-hosted on the Pi 5 NVMe drive (reclame-supabase.local).
 * Falls back to local filesystem if Supabase is unavailable.
 */

export { storageService } from './StorageService';
export type { FileMetadata, UploadOptions } from './StorageService';