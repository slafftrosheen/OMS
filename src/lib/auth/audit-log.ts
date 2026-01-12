// audit-log.ts
import { base } from '$app/paths';

export interface AuditLogEvent {
  id?: number;
  time: string;
  username: string;
  section: string;
  action: string;
  details: string;
}

const isBrowser = typeof window !== 'undefined';

export async function logAction(username: string, section: string, action: string, details = ''): Promise<void> {
  if (!isBrowser) return;
  
  try {
    await fetch(`${base}/api/audit-log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username,
        action,
        entityType: section,
        details
      })
    });
  } catch (e) {
    console.error('Failed to log action:', e);
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLogEvent[]> {
  if (!isBrowser) return [];
  
  try {
    const res = await fetch(`${base}/api/audit-log?limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      return data.map((row: any) => ({
        id: row.id,
        time: row.createdAt,
        username: row.username,
        section: row.entityType || '',
        action: row.action,
        details: row.details || ''
      }));
    }
  } catch (e) {
    console.error('Failed to get audit logs:', e);
  }
  return [];
}

export function clearAuditLogs(): void {
  // Audit logs should not be cleared in production
  // This is intentionally a no-op for database-backed storage
  console.warn('clearAuditLogs is disabled for database-backed audit logging');
}
