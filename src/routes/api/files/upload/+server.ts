// src/routes/api/files/upload/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/**
 * POST /api/files/upload - Simple file upload endpoint
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string || 'general';

    if (!file || !(file instanceof File)) {
      throw error(400, 'No file provided');
    }

    // Create unique filename
    const ext = path.extname(file.name);
    const storedName = `${randomUUID()}${ext}`;
    const dateFolder = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const relativePath = path.join(category, dateFolder, storedName);
    const fullPath = path.join(UPLOAD_DIR, relativePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, buffer);

    // Get user from session (optional)
    let uploadedBy: string | null = null;
    const token = cookies.get('session');
    if (token) {
      try {
        const crypto = await import('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const userResult = await query(
          `SELECT u.username FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
          [tokenHash]
        );
        if (userResult.rowCount && userResult.rowCount > 0) {
          uploadedBy = userResult.rows[0].username;
        }
      } catch (e) {
        // Ignore auth errors
      }
    }

    // Try to save to database
    let fileId: number | null = null;
    try {
      const result = await query(`
        INSERT INTO files (filename, original_name, mime_type, size_bytes, storage_path, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        storedName,
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        relativePath,
        uploadedBy
      ]);
      fileId = result.rows[0]?.id;
    } catch (dbErr) {
      console.warn('Could not save file to database:', dbErr);
      // File is still saved to disk, just not tracked in DB
    }

    return json({
      id: fileId,
      originalName: file.name,
      storedName,
      mimeType: file.type,
      size: file.size,
      path: `/uploads/${relativePath}`,
      category,
      uploadedBy,
      uploadedAt: new Date().toISOString()
    }, { status: 201 });

  } catch (err: any) {
    console.error('File upload error:', err);
    if (err.status) throw err;
    throw error(500, err.message || 'Failed to upload file');
  }
};
