/**
 * Audit Service
 * Handle audit logging and activity tracking
 */

import { supabase } from '$lib/server/supabase';

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  description: string;
  oldValues: any;
  newValues: any;
  metadata: any;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failure' | 'warning';
  errorMessage: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  activityType: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  description: string;
  metadata: any;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  eventType: string;
  userId: string;
  userEmail: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ipAddress: string;
  userAgent: string;
  metadata: any;
  resolved: boolean;
  resolvedBy: string;
  resolvedAt: string;
  resolutionNotes: string;
  createdAt: string;
}

export class AuditService {
  /**
   * Log an audit entry
   */
  static async logAudit(
    action: string,
    resourceType: string,
    resourceId?: string,
    description?: string,
    oldValues?: any,
    newValues?: any,
    metadata?: any,
    status: 'success' | 'failure' | 'warning' = 'success',
    errorMessage?: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('log_audit', {
          p_action: action,
          p_resource_type: resourceType,
          p_resource_id: resourceId || null,
          p_description: description || null,
          p_old_values: oldValues || null,
          p_new_values: newValues || null,
          p_metadata: metadata || null,
          p_status: status,
          p_error_message: errorMessage || null
        });

      if (error) {
        console.error('[Audit Service] Log error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[Audit Service] Error:', error);
      return null;
    }
  }

  /**
   * Log user activity
   */
  static async logActivity(
    activityType: string,
    targetType?: string,
    targetId?: string,
    targetTitle?: string,
    description?: string,
    metadata?: any
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('log_activity', {
          p_activity_type: activityType,
          p_target_type: targetType || null,
          p_target_id: targetId || null,
          p_target_title: targetTitle || null,
          p_description: description || null,
          p_metadata: metadata || null
        });

      if (error) {
        console.error('[Audit Service] Activity log error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[Audit Service] Activity error:', error);
      return null;
    }
  }

  /**
   * Log security event
   */
  static async logSecurityEvent(
    eventType: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    userId?: string,
    metadata?: any
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('log_security_event', {
          p_event_type: eventType,
          p_description: description,
          p_severity: severity,
          p_user_id: userId || null,
          p_metadata: metadata || null
        });

      if (error) {
        console.error('[Audit Service] Security event error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[Audit Service] Security event error:', error);
      return null;
    }
  }

  /**
   * Get audit logs with filters
   */
  static async getAuditLogs(filters: {
    userId?: string;
    resourceType?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: AuditLog[]; total: number }> {
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.resourceType) query = query.eq('resource_type', filters.resourceType);
      if (filters.action) query = query.eq('action', filters.action);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      if (filters.offset !== undefined && filters.limit !== undefined) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[Audit Service] Get logs error:', error);
        return { data: [], total: 0 };
      }

      return {
        data: data?.map(log => ({
          id: log.id,
          userId: log.user_id,
          userEmail: log.user_email,
          userRole: log.user_role,
          action: log.action,
          resourceType: log.resource_type,
          resourceId: log.resource_id,
          description: log.description,
          oldValues: log.old_values,
          newValues: log.new_values,
          metadata: log.metadata,
          ipAddress: log.ip_address,
          userAgent: log.user_agent,
          status: log.status,
          errorMessage: log.error_message,
          createdAt: log.created_at
        })) || [],
        total: count || 0
      };
    } catch (error) {
      console.error('[Audit Service] Error:', error);
      return { data: [], total: 0 };
    }
  }

  /**
   * Get activity logs
   */
  static async getActivityLogs(filters: {
    userId?: string;
    activityType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ActivityLog[]; total: number }> {
    try {
      let query = supabase
        .from('activity_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.activityType) query = query.eq('activity_type', filters.activityType);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      if (filters.offset !== undefined && filters.limit !== undefined) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[Audit Service] Get activity logs error:', error);
        return { data: [], total: 0 };
      }

      return {
        data: data?.map(log => ({
          id: log.id,
          userId: log.user_id,
          activityType: log.activity_type,
          targetType: log.target_type,
          targetId: log.target_id,
          targetTitle: log.target_title,
          description: log.description,
          metadata: log.metadata,
          ipAddress: log.ip_address,
          userAgent: log.user_agent,
          sessionId: log.session_id,
          createdAt: log.created_at
        })) || [],
        total: count || 0
      };
    } catch (error) {
      console.error('[Audit Service] Error:', error);
      return { data: [], total: 0 };
    }
  }

  /**
   * Get security events
   */
  static async getSecurityEvents(filters: {
    eventType?: string;
    severity?: string;
    resolved?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ data: SecurityEvent[]; total: number }> {
    try {
      let query = supabase
        .from('security_events')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filters.eventType) query = query.eq('event_type', filters.eventType);
      if (filters.severity) query = query.eq('severity', filters.severity);
      if (filters.resolved !== undefined) query = query.eq('resolved', filters.resolved);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      if (filters.offset !== undefined && filters.limit !== undefined) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[Audit Service] Get security events error:', error);
        return { data: [], total: 0 };
      }

      return {
        data: data?.map(event => ({
          id: event.id,
          eventType: event.event_type,
          userId: event.user_id,
          userEmail: event.user_email,
          description: event.description,
          severity: event.severity,
          ipAddress: event.ip_address,
          userAgent: event.user_agent,
          metadata: event.metadata,
          resolved: event.resolved,
          resolvedBy: event.resolved_by,
          resolvedAt: event.resolved_at,
          resolutionNotes: event.resolution_notes,
          createdAt: event.created_at
        })) || [],
        total: count || 0
      };
    } catch (error) {
      console.error('[Audit Service] Error:', error);
      return { data: [], total: 0 };
    }
  }

  /**
   * Resolve security event
   */
  static async resolveSecurityEvent(
    eventId: string,
    resolvedBy: string,
    resolutionNotes?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('security_events')
        .update({
          resolved: true,
          resolved_by: resolvedBy,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes || null
        })
        .eq('id', eventId);

      if (error) {
        console.error('[Audit Service] Resolve event error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Audit Service] Error:', error);
      return false;
    }
  }

  /**
   * Get audit summary for dashboard
   */
  static async getAuditSummary(): Promise<any> {
    try {
      // Get recent activity counts
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [activityCount, securityCount, recentLogs] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('*', { count: 'exact' })
          .gte('created_at', thirtyDaysAgo.toISOString()),
        
        supabase
          .from('security_events')
          .select('*', { count: 'exact' })
          .gte('created_at', thirtyDaysAgo.toISOString())
          .eq('resolved', false),
        
        supabase
          .from('audit_logs')
          .select(`
            action,
            resource_type,
            status,
            created_at,
            user:user_profiles!inner(email)
          `)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      return {
        activityCount: activityCount.count || 0,
        securityEvents: securityCount.count || 0,
        recentActivity: recentLogs.data?.map(log => ({
          action: log.action,
          resourceType: log.resource_type,
          status: log.status,
          createdAt: log.created_at,
          user: log.user?.email
        })) || [],
        summary: {
          byAction: this.groupBy(recentLogs.data || [], 'action'),
          byResource: this.groupBy(recentLogs.data || [], 'resource_type'),
          byStatus: this.groupBy(recentLogs.data || [], 'status')
        }
      };
    } catch (error) {
      console.error('[Audit Service] Summary error:', error);
      return {
        activityCount: 0,
        securityEvents: 0,
        recentActivity: [],
        summary: {}
      };
    }
  }

  private static groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((acc, item) => {
      const value = item[key];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }
}