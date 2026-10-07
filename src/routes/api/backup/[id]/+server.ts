/**
 * Backup API — delete a single backup
 * DELETE /api/backup/[id]
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import { PermissionsService } from '$lib/server/permissions-service';

// DELETE /api/backup/[id] - Delete backup
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };

  await PermissionsService.requirePermission(user.id, 'system.backup');

  try {
    const { error: dbError } = await supabase
      .from('backup_history')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id); // Only allow deleting own backups

    if (dbError) {
      console.error('[Backup API] Delete error:', dbError);
      throw error(500, 'Failed to delete backup');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Backup API] Error:', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, 'Failed to delete backup');
  }
};
