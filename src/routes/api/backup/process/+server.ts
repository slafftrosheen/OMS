/**
 * Backup Processing API
 * Handle scheduled backup processing and cleanup (for cron jobs)
 * Updated to use Supabase-compatible BackupService
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BackupService } from '$lib/server/backup/BackupService';

// POST /api/backup/process - Process scheduled backups and cleanup
export const POST: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const secret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    throw error(403, 'Forbidden');
  }

  try {
    // Process scheduled backups (static method)
    const backupsCreated = await BackupService.processScheduledBackups();
    
    // Clean up expired backups (static method)
    const backupsDeleted = await BackupService.cleanupExpiredBackups();

    return json({
      success: true,
      processed: {
        backups_created: backupsCreated,
        backups_deleted: backupsDeleted
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Backup Processing API] Error:', err);
    throw error(500, 'Failed to process backups');
  }
};