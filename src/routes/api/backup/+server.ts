/**
 * Backup API
 * Manage database backups and restore operations
 * Updated to use Supabase-compatible BackupService
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import { BackupService } from '$lib/server/backup/BackupService';
import { PermissionsService } from '$lib/server/permissions-service';

// GET /api/backup - List backups
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  await PermissionsService.requirePermission(user.id, 'system.backup');

  const configId = url.searchParams.get('configId');
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('backup_history')
    .select(`
      *,
      config:backup_configs(name, backup_type),
      created_by_user:auth.users(email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (configId) query = query.eq('backup_config_id', configId);
  if (status) query = query.eq('status', status);

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[Backup API] List error:', dbError);
    throw error(500, 'Failed to fetch backups');
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

// POST /api/backup - Create backup
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  await PermissionsService.requirePermission(user.id, 'system.backup');

  const body = await request.json();
  const { 
    configId, 
    backupType = 'full', 
    tables = null, 
    excludeTables = null 
  } = body;

  if (!configId) {
    throw error(400, 'Missing required field: configId');
  }

  try {
    // Create BackupService instance with supabase client
    const backupService = new BackupService(supabase);
    
    const backupId = await backupService.createBackup({
      configId,
      backupType,
      tables,
      excludeTables
    });

    if (!backupId) {
      throw new Error('Backup creation failed');
    }

    // Fetch created backup
    const { data: backup, error: fetchError } = await supabase
      .from('backup_history')
      .select(`
        *,
        config:backup_configs(name, backup_type)
      `)
      .eq('id', backupId)
      .single();

    if (fetchError) throw fetchError;

    return json({ data: backup }, { status: 201 });

  } catch (err) {
    console.error('[Backup API] Create error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to create backup');
  }
};

// DELETE /api/backup/[id] - Delete backup
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  await PermissionsService.requirePermission(user.id, 'system.backup');

  try {
    const { error: dbError } = await supabase
      .from('backup_history')
      .delete()
      .eq('id', ((params as Record<string, string|undefined>).id ?? ''))
      .eq('created_by', user.id); // Only allow deleting own backups

    if (dbError) {
      console.error('[Backup API] Delete error:', dbError);
      throw error(500, 'Failed to delete backup');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Backup API] Error:', err);
    throw error(500, 'Failed to delete backup');
  }
};