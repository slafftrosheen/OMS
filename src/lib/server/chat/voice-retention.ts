export interface VoiceRetentionDatabase {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: { code?: string } | null }>;
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ error: { message: string; statusCode?: string | number; status?: number } | null }> } };
}

/** Uses Storage.remove, never SQL deletion of storage.objects metadata. */
export async function cleanupExpiredVoices(db: VoiceRetentionDatabase, signal?: AbortSignal): Promise<{ removed: number; failed: number }> {
  signal?.throwIfAborted();
  const { data, error } = await db.rpc('chat_voice_claim_cleanup', { p_limit: 20 });
  if (error) throw new Error(['PGRST202', '42883', '42P01'].includes(error.code || '') ? 'voice_migration_required' : 'voice_cleanup_unavailable');
  if (!Array.isArray(data)) throw new Error('voice_cleanup_invalid_response');
  const counts = { removed: 0, failed: 0 };
  for (const job of data.slice(0, 20)) {
    signal?.throwIfAborted();
    if (!['chat-voice', 'chat-attachments'].includes(job.bucket) || typeof job.path !== 'string' || !job.path
      || typeof job.jobId !== 'string' || typeof job.leaseToken !== 'string') throw new Error('voice_cleanup_invalid_response');
    try {
      const deletion = await db.storage.from(job.bucket).remove([job.path]);
      signal?.throwIfAborted();
      if (deletion.error && Number(deletion.error.statusCode ?? deletion.error.status) !== 404) throw new Error('storage_unavailable');
      const completed = await db.rpc('chat_voice_complete_cleanup', { p_job_id: job.jobId, p_lease_token: job.leaseToken });
      if (completed.error || completed.data !== true) throw new Error('voice_cleanup_unconfirmed');
      counts.removed++;
    } catch {
      signal?.throwIfAborted();
      // A missing binary is success on retry; a lost commit response cannot
      // delete text or a different recording. Lease tokens fence stale workers.
      await db.rpc('chat_voice_retry_cleanup', { p_job_id: job.jobId, p_lease_token: job.leaseToken }).then(() => {}, () => {});
      counts.failed++;
    }
  }
  return counts;
}
