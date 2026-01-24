/**
 * Restore API
 * Handle database restore operations
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import { BackupService } from '$lib/server/backup-service';
import { PermissionsService } from '$lib/server/permissions-service';

// POST /api/backup/restore - Initiate restore operation
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  await PermissionsService.requirePermission(user.id, 'system.restore');

  const body = await request.json();
  const { 
    backupId, 
    tables = null, 
    overwriteExisting = false,
    preserveCurrent = true,
    restoreIndexes = true,
    restoreConstraints = true
  } = body;

  if (!backupId) {
    throw error(400, 'Missing required field: backupId');
  }

  try {
    // Verify backup exists and is completed
    const { data: backup, error: backupError } = await supabase
      .from('backup_history')
      .select('*')
      .eq('id', backupId)
      .eq('status', 'completed')
      .single();

    if (backupError || !backup) {
      throw error(404, 'Backup not found or not completed');
    }

    // Start restore operation
    const success = await BackupService.restoreBackup(backupId, {
      tables,
      overwriteExisting,
      preserveCurrent,
      restoreIndexes,
      restoreConstraints
    });

    if (!success) {
      throw new Error('Restore operation failed');
    }

    // Fetch restore operation details
    const { data: restoreOp, error: restoreError } = await supabase
      .from('restore_operations')
      .select('*')
      .eq('backup_history_id', backupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (restoreError) throw restoreError;

    return json({ data: restoreOp }, { status: 201 });

  } catch (err) {
    console.error('[Restore API] Error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to initiate restore');
  }
};

// GET /api/backup/restore - Get restore operations
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  await PermissionsService.requirePermission(user.id, 'system.restore');

  const backupId = url.searchParams.get('backupId');
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('restore_operations')
    .select(`
      *,
      backup:backup_history(backup_name, backup_type),
      initiated_by_user:auth.users(email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (backupId) query = query.eq('backup_history_id', backupId);
  if (status) query = query.eq('status', status);

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[Restore API] List error:', dbError);
    throw error(500, 'Failed to fetch restore operations');
  }

  return json({
    data: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    }
  });
};