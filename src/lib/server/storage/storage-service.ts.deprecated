// src/lib/server/storage/storage-service.ts
// Unified storage service that handles both local and S3 storage

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import S3Storage, { initializeS3Storage } from './s3-storage.js';

interface StorageFile {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  path: string;
  category: string;
  uploadedBy: string | null;
  uploadedAt: string;
}

class StorageService {
  private s3Storage: S3Storage | null = null;
  private uploadDir: string;

  constructor() {
    this.s3Storage = initializeS3Storage();
    
    // Set up local upload directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.uploadDir = path.resolve(__dirname, '../../../../static/uploads');
  }

  async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directory:', error);
      throw error;
    }
  }

  async storeFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    userId: string | null = null
  ): Promise<StorageFile> {
    const fileId = crypto.randomUUID();
    const fileExtension = path.extname(originalName);
    const storedName = `${fileId}${fileExtension}`;
    
    let filePath: string;
    let fileUrl: string;

    if (this.s3Storage) {
      // Store on S3
      const s3Key = `uploads/${storedName}`;
      const result = await this.s3Storage.uploadFile(s3Key, fileBuffer, mimeType);
      fileUrl = result.url;
      filePath = s3Key;
    } else {
      // Store locally
      await this.ensureUploadDir();
      filePath = path.join(this.uploadDir, storedName);
      await fs.writeFile(filePath, fileBuffer);
      fileUrl = `/uploads/${storedName}`;
    }

    const fileRecord: StorageFile = {
      id: fileId,
      originalName,
      storedName,
      mimeType,
      size: fileBuffer.length,
      path: filePath,
      category: 'general',
      uploadedBy: userId,
      uploadedAt: new Date().toISOString()
    };

    return fileRecord;
  }

  async retrieveFile(fileId: string, storedName: string): Promise<Buffer> {
    if (this.s3Storage) {
      // Retrieve from S3
      return await this.s3Storage.getFile(`uploads/${storedName}`);
    } else {
      // Retrieve from local storage
      const filePath = path.join(this.uploadDir, storedName);
      return await fs.readFile(filePath);
    }
  }

  async deleteFile(storedName: string): Promise<void> {
    if (this.s3Storage) {
      // Delete from S3
      await this.s3Storage.deleteFile(`uploads/${storedName}`);
    } else {
      // Delete from local storage
      const filePath = path.join(this.uploadDir, storedName);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore error
        console.warn(`File not found for deletion: ${filePath}`, error);
      }
    }
  }

  async generateDownloadUrl(storedName: string): Promise<string> {
    if (this.s3Storage) {
      // Generate signed URL for S3
      return await this.s3Storage.getFileUrl(`uploads/${storedName}`);
    } else {
      // Return local path for local storage
      return `/uploads/${storedName}`;
    }
  }

  isUsingS3(): boolean {
    return this.s3Storage !== null;
  }
}

// Create singleton instance
const storageService = new StorageService();

export { storageService, StorageService, type StorageFile };