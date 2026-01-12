// src/lib/files/storage.ts
import { writeFile, readFile, unlink, mkdir, stat } from 'fs/promises';
import { join, dirname, extname } from 'path';
import crypto from 'crypto';

export type FileMetadata = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: string;
  uploadedBy?: string;
  category?: 'cdr' | 'pdf' | 'image' | 'other';
  orderId?: string;
};

// Base upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Allowed file types and their categories
const FILE_CATEGORIES: Record<string, FileMetadata['category']> = {
  '.cdr': 'cdr',
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image'
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Generate a unique file ID
 */
function generateFileId(): string {
  return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get file category from extension
 */
function getCategory(filename: string): FileMetadata['category'] {
  const ext = extname(filename).toLowerCase();
  return FILE_CATEGORIES[ext] || 'other';
}

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await stat(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Save uploaded file to storage
 */
export async function saveFile(
  buffer: Buffer,
  originalName: string,
  options: {
    mimeType?: string;
    uploadedBy?: string;
    orderId?: string;
  } = {}
): Promise<FileMetadata> {
  // Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const category = getCategory(originalName);
  const fileId = generateFileId();
  const ext = extname(originalName).toLowerCase();
  const storedName = `${fileId}${ext}`;
  
  // Organize by category and date
  const dateDir = new Date().toISOString().slice(0, 7); // YYYY-MM
  const categoryDir = category || 'other';
  const relativePath = join(categoryDir, dateDir, storedName);
  const fullPath = join(UPLOAD_DIR, relativePath);

  // Ensure directory exists
  await ensureDir(dirname(fullPath));

  // Write file
  await writeFile(fullPath, buffer);

  const metadata: FileMetadata = {
    id: fileId,
    originalName,
    storedName,
    mimeType: options.mimeType || 'application/octet-stream',
    size: buffer.length,
    path: relativePath,
    uploadedAt: new Date().toISOString(),
    uploadedBy: options.uploadedBy,
    category,
    orderId: options.orderId
  };

  return metadata;
}

/**
 * Get file from storage
 */
export async function getFile(relativePath: string): Promise<Buffer> {
  const fullPath = join(UPLOAD_DIR, relativePath);
  return readFile(fullPath);
}

/**
 * Delete file from storage
 */
export async function deleteFile(relativePath: string): Promise<void> {
  const fullPath = join(UPLOAD_DIR, relativePath);
  await unlink(fullPath);
}

/**
 * Check if file exists
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    const fullPath = join(UPLOAD_DIR, relativePath);
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get MIME type from extension
 */
export function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.cdr': 'application/x-cdr',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}
