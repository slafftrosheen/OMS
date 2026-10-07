/**
 * Permissions Service
 * Handle role-based access control and permission checks
 */

import { supabase } from '$lib/server/supabase';

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  category: string;
  resource: string;
  action: string;
  isSystem: boolean;
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string;
  level: number;
  isSystem: boolean;
}

export interface UserPermission {
  id: string;
  userId: string;
  permissionId: string;
  granted: boolean;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}

export class PermissionsService {
  /**
   * Check if user has a specific permission
   */
  static async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('user_has_permission', {
          p_user_id: userId,
          p_permission_name: permissionName
        });

      if (error) {
        console.error('[Permissions Service] Check error:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('[Permissions Service] Error:', error);
      return false;
    }
  }

  /**
   * Check multiple permissions for user
   */
  static async hasPermissions(userId: string, permissionNames: string[]): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.allSettled(
      permissionNames.map(async (permission) => {
        results[permission] = await this.hasPermission(userId, permission);
      })
    );

    return results;
  }

  /**
   * Get all permissions for a user
   */
  static async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      const { data, error } = await supabase
        .from('user_all_permissions')
        .select(`
          permission_id:id,
          name,
          display_name,
          category,
          resource,
          action,
          is_system
        `)
        .eq('user_id', userId)
        .eq('granted', true);

      if (error) {
        console.error('[Permissions Service] Get user permissions error:', error);
        return [];
      }

      return data?.map(p => ({
        id: p.permission_id,
        name: p.name,
        displayName: p.display_name,
        category: p.category,
        resource: p.resource,
        action: p.action,
        isSystem: p.is_system
      })) || [];
    } catch (error) {
      console.error('[Permissions Service] Error:', error);
      return [];
    }
  }

  /**
   * Get all available permissions
   */
  static async getAllPermissions(): Promise<Permission[]> {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category')
        .order('name');

      if (error) {
        console.error('[Permissions Service] Get all permissions error:', error);
        return [];
      }

      return data?.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.display_name,
        category: p.category,
        resource: p.resource,
        action: p.action,
        isSystem: p.is_system
      })) || [];
    } catch (error) {
      console.error('[Permissions Service] Error:', error);
      return [];
    }
  }

  /**
   * Get user's role
   */
  static async getUserRole(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Permissions Service] Get user role error:', error);
        return null;
      }

      return data?.role || null;
    } catch (error) {
      console.error('[Permissions Service] Error:', error);
      return null;
    }
  }

  /**
   * Grant permission to user
   */
  static async grantPermission(
    userId: string,
    permissionName: string,
    grantedBy: string,
    expiresAt?: string
  ): Promise<boolean> {
    try {
      // Get permission ID
      const { data: permission, error: permError } = await supabase
        .from('permissions')
        .select('id')
        .eq('name', permissionName)
        .single();

      if (permError || !permission) {
        throw new Error('Permission not found');
      }

      // Grant permission
      const { error } = await supabase
        .from('user_permissions')
        .upsert({
          user_id: userId,
          permission_id: permission.id,
          granted: true,
          granted_by: grantedBy,
          expires_at: expiresAt || null
        });

      if (error) throw error;

      // Log the permission change
      await supabase.rpc('log_audit', {
        p_action: 'grant_permission',
        p_resource_type: 'permission',
        p_resource_id: permission.id,
        p_description: `Granted permission ${permissionName} to user`,
        p_metadata: { userId, permissionName }
      });

      return true;
    } catch (error) {
      console.error('[Permissions Service] Grant error:', error);
      return false;
    }
  }

  /**
   * Revoke permission from user
   */
  static async revokePermission(
    userId: string,
    permissionName: string,
    revokedBy: string
  ): Promise<boolean> {
    try {
      // Get permission ID
      const { data: permission, error: permError } = await supabase
        .from('permissions')
        .select('id')
        .eq('name', permissionName)
        .single();

      if (permError || !permission) {
        throw new Error('Permission not found');
      }

      // Revoke permission
      const { error } = await supabase
        .from('user_permissions')
        .upsert({
          user_id: userId,
          permission_id: permission.id,
          granted: false,
          granted_by: revokedBy
        });

      if (error) throw error;

      // Log the permission change
      await supabase.rpc('log_audit', {
        p_action: 'revoke_permission',
        p_resource_type: 'permission',
        p_resource_id: permission.id,
        p_description: `Revoked permission ${permissionName} from user`,
        p_metadata: { userId, permissionName }
      });

      return true;
    } catch (error) {
      console.error('[Permissions Service] Revoke error:', error);
      return false;
    }
  }

  /**
   * Require permission (throws error if not granted)
   */
  static async requirePermission(userId: string, permissionName: string): Promise<void> {
    const hasPerm = await this.hasPermission(userId, permissionName);

    if (!hasPerm) {
      // Log security event
      await supabase.rpc('log_security_event', {
        p_event_type: 'permission_denied',
        p_description: `Permission denied: ${permissionName}`,
        p_severity: 'medium',
        p_user_id: userId,
        p_metadata: { permission: permissionName }
      });

      throw new Error(`Permission denied: ${permissionName}`);
    }
  }

  /**
   * Get user's role permissions
   */
  static async getRolePermissions(roleName: string): Promise<Permission[]> {
    try {
      const { data, error } = await supabase
        .from('role_permissions_view')
        .select(`
          permission_id:id,
          name,
          display_name,
          category,
          resource,
          action
        `)
        .eq('role_name', roleName);

      if (error) {
        console.error('[Permissions Service] Get role permissions error:', error);
        return [];
      }

      return data?.map(p => ({
        id: p.permission_id,
        name: p.name,
        displayName: p.display_name,
        category: p.category,
        resource: p.resource,
        action: p.action,
        isSystem: false
      })) || [];
    } catch (error) {
      console.error('[Permissions Service] Error:', error);
      return [];
    }
  }

  /**
   * Check if user has role
   */
  static async hasRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const userRole = await this.getUserRole(userId);
      return userRole === roleName;
    } catch (error) {
      console.error('[Permissions Service] Check role error:', error);
      return false;
    }
  }

  /**
   * Get hierarchy level of user's role
   */
  static async getRoleLevel(userId: string): Promise<number> {
    try {
      const userRole = await this.getUserRole(userId);
      
      if (!userRole) return 0;

      const { data, error } = await supabase
        .from('roles')
        .select('level')
        .eq('name', userRole)
        .single();

      if (error) {
        console.error('[Permissions Service] Get role level error:', error);
        return 0;
      }

      return data?.level || 0;
    } catch (error) {
      console.error('[Permissions Service] Error:', error);
      return 0;
    }
  }
}