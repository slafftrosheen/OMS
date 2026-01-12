import { base } from '$app/paths';

const isBrowser = typeof window !== 'undefined';

/**
 * Log station activity to database
 */
export async function logStage(po: string, station: string, notes = '', redo?: string): Promise<boolean> {
  if (!isBrowser) return false;
  
  try {
    const res = await fetch(`${base}/api/station-log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ po, station, notes, redo })
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to log station activity:', err);
    return false;
  }
}

/**
 * Get station logs from database
 */
export async function getStationLogs(po?: string, station?: string, limit = 100): Promise<any[]> {
  if (!isBrowser) return [];
  
  try {
    const params = new URLSearchParams();
    if (po) params.set('po', po);
    if (station) params.set('station', station);
    params.set('limit', String(limit));
    
    const res = await fetch(`${base}/api/station-log?${params}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error('Failed to get station logs:', err);
  }
  return [];
}
