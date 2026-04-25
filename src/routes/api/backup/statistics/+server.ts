/**
 * GET /api/backup/statistics
 *
 * Aggregate dashboard counters over the backup_history and restore_operations
 * tables that ship with Phase 1.  Returns a single { data: {...} } object.
 */

import { type RequestHandler } from '@sveltejs/kit';
import { okOne, requireAuth } from '$lib/server/api/helpers';

export const GET: RequestHandler = async ({ locals }) => {
    requireAuth(locals);

    const [
        totalRes,
        successRes,
        failedRes,
        runningRes,
        latestSuccessRes,
        sizeRes,
        restoreRes
    ] = await Promise.all([
        locals.supabase.from('backup_history').select('id', { count: 'exact', head: true }),
        locals.supabase.from('backup_history').select('id', { count: 'exact', head: true }).eq('status', 'success'),
        locals.supabase.from('backup_history').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        locals.supabase.from('backup_history').select('id', { count: 'exact', head: true }).eq('status', 'running'),
        locals.supabase
            .from('backup_history')
            .select('id, started_at, completed_at, size_bytes, location')
            .eq('status', 'success')
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        locals.supabase
            .from('backup_history')
            .select('size_bytes')
            .eq('status', 'success'),
        locals.supabase.from('restore_operations').select('id', { count: 'exact', head: true })
    ]);

    const total_bytes = (sizeRes.data ?? []).reduce(
        (acc: number, row: { size_bytes: number | null }) => acc + (row.size_bytes ?? 0),
        0
    );

    return okOne({
        backups_total:    totalRes.count   ?? 0,
        backups_success:  successRes.count ?? 0,
        backups_failed:   failedRes.count  ?? 0,
        backups_running:  runningRes.count ?? 0,
        restores_total:   restoreRes.count ?? 0,
        latest_success:   latestSuccessRes.data ?? null,
        total_bytes,
        as_of: new Date().toISOString()
    });
};
