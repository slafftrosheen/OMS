import { describe, it, expect } from 'vitest';
import { logAction, getAuditLogs, clearAuditLogs } from './audit-log.js';

describe('audit-log', () => {
  it('handles non-browser environment gracefully', async () => {
    // In Node.js environment (non-browser), functions should not throw errors
    // logAction and getAuditLogs return immediately in non-browser env
    await logAction('testuser', 'Admin', 'login', 'User logged in');
    const logs = await getAuditLogs();
    clearAuditLogs();
    
    // getAuditLogs should return empty array in non-browser environment
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(0);
  });
  
  it('logAction accepts correct parameters', async () => {
    // Test that function accepts the expected parameters without throwing
    await logAction('user', 'Admin', 'action', 'details');
    expect(true).toBe(true);
  });
  
  it('getAuditLogs returns an array in non-browser env', async () => {
    const logs = await getAuditLogs();
    expect(Array.isArray(logs)).toBe(true);
    // In non-browser env, returns empty array
    expect(logs.length).toBe(0);
  });
  
  it('clearAuditLogs does not throw', () => {
    // clearAuditLogs is now a no-op for database-backed storage
    clearAuditLogs();
    expect(true).toBe(true);
  });
});
