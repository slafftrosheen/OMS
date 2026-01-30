/**
 * Advanced Permissions and Audit System
 * RBAC, permissions, audit logs, and activity tracking
 */

-- Roles table (extend existing user_profiles)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Role details
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Hierarchy
  level INTEGER NOT NULL DEFAULT 0,
  
  -- Status
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Permission details
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Category
  category TEXT NOT NULL CHECK (
    category IN ('orders', 'stations', 'loading', 'users', 'analytics', 'settings', 'system')
  ),
  
  -- Permission scope
  resource TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('create', 'read', 'update', 'delete', 'approve', 'export', 'manage')
  ),
  
  -- Status
  is_system BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  -- Grant info
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(role_id, permission_id)
);

-- User permissions (overrides)
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  -- Grant/Revoke
  granted BOOLEAN NOT NULL DEFAULT true,
  
  -- Grant info
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  UNIQUE(user_id, permission_id)
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  
  -- Action
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  
  -- Details
  description TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  
  -- Request info
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'success' CHECK (
    status IN ('success', 'failure', 'warning')
  ),
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity logs (user actions)
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Activity
  activity_type TEXT NOT NULL CHECK (
    activity_type IN (
      'login', 'logout', 'view', 'create', 'update', 'delete',
      'export', 'upload', 'download', 'share', 'comment', 'mention'
    )
  ),
  
  -- Target
  target_type TEXT,
  target_id TEXT,
  target_title TEXT,
  
  -- Details
  description TEXT,
  metadata JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event details
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'failed_login', 'suspicious_activity', 'permission_denied',
      'rate_limit_exceeded', 'invalid_token', 'account_locked',
      'password_changed', 'mfa_enabled', 'mfa_disabled'
    )
  ),
  
  -- Actor
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  
  -- Details
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  
  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_level ON roles(level);
CREATE INDEX idx_permissions_category ON permissions(category);
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission ON user_permissions(permission_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_type ON activity_logs(activity_type);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_user ON security_events(user_id);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_resolved ON security_events(resolved) WHERE resolved = false;

-- RLS Policies
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Roles policies
CREATE POLICY "Anyone can view roles"
  ON roles FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage roles"
  ON roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Permissions policies
CREATE POLICY "Anyone can view permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (true);

-- Audit logs policies
CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Activity logs policies
CREATE POLICY "Users can view own activity"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all activity"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "System can insert activity logs"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Security events policies
CREATE POLICY "Admins can view security events"
  ON security_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "System can insert security events"
  ON security_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_permission_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_permission BOOLEAN := false;
BEGIN
  -- Check user-specific permission override
  SELECT granted INTO v_has_permission
  FROM user_permissions up
  JOIN permissions p ON p.id = up.permission_id
  WHERE up.user_id = p_user_id
    AND p.name = p_permission_name
    AND (up.expires_at IS NULL OR up.expires_at > NOW());
  
  IF FOUND THEN
    RETURN v_has_permission;
  END IF;
  
  -- Check role permissions
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles prof
    JOIN roles r ON r.name = prof.role
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE prof.user_id = p_user_id
      AND p.name = p_permission_name
      AND r.is_active = true
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$$;

-- Function to log audit entry
CREATE OR REPLACE FUNCTION log_audit(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_status TEXT DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
  v_user_email TEXT;
  v_user_role TEXT;
BEGIN
  -- Get user details
  SELECT u.email, up.role
  INTO v_user_email, v_user_role
  FROM auth.users u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id = auth.uid();
  
  -- Insert audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    user_role,
    action,
    resource_type,
    resource_id,
    description,
    old_values,
    new_values,
    metadata,
    status,
    error_message
  )
  VALUES (
    auth.uid(),
    v_user_email,
    v_user_role,
    p_action,
    p_resource_type,
    p_resource_id,
    p_description,
    p_old_values,
    p_new_values,
    p_metadata,
    p_status,
    p_error_message
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to log activity
CREATE OR REPLACE FUNCTION log_activity(
  p_activity_type TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_target_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO activity_logs (
    user_id,
    activity_type,
    target_type,
    target_id,
    target_title,
    description,
    metadata
  )
  VALUES (
    auth.uid(),
    p_activity_type,
    p_target_type,
    p_target_id,
    p_target_title,
    p_description,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to log security event
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_description TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_user_email TEXT;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = p_user_id;
  END IF;
  
  INSERT INTO security_events (
    event_type,
    user_id,
    user_email,
    description,
    severity,
    metadata
  )
  VALUES (
    p_event_type,
    p_user_id,
    v_user_email,
    p_description,
    p_severity,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Trigger function for audit logging on draft_orders
CREATE OR REPLACE FUNCTION audit_draft_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'create',
      'order',
      NEW.id::text,
      'Order created: ' || NEW.po_number,
      NULL,
      to_jsonb(NEW),
      NULL,
      'success'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'update',
      'order',
      NEW.id::text,
      'Order updated: ' || NEW.po_number,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NULL,
      'success'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'delete',
      'order',
      OLD.id::text,
      'Order deleted: ' || OLD.po_number,
      to_jsonb(OLD),
      NULL,
      NULL,
      'success'
    );
    RETURN OLD;
  END IF;
END;
$$;

-- Create triggers for audit logging
CREATE TRIGGER trigger_audit_draft_orders
  AFTER INSERT OR UPDATE OR DELETE ON draft_orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_draft_orders();

-- Insert default roles
INSERT INTO roles (name, display_name, description, level, is_system) VALUES
  ('admin', 'Administrator', 'Full system access', 100, true),
  ('manager', 'Manager', 'Manage orders and users', 80, true),
  ('supervisor', 'Supervisor', 'Oversee production and quality', 60, true),
  ('operator', 'Operator', 'Create and update orders', 40, true),
  ('viewer', 'Viewer', 'View-only access', 20, true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (name, display_name, category, resource, action, is_system) VALUES
  -- Orders
  ('orders.create', 'Create Orders', 'orders', 'orders', 'create', true),
  ('orders.read', 'View Orders', 'orders', 'orders', 'read', true),
  ('orders.update', 'Update Orders', 'orders', 'orders', 'update', true),
  ('orders.delete', 'Delete Orders', 'orders', 'orders', 'delete', true),
  ('orders.approve', 'Approve Orders', 'orders', 'orders', 'approve', true),
  ('orders.export', 'Export Orders', 'orders', 'orders', 'export', true),
  
  -- Stations
  ('stations.create', 'Create Station Logs', 'stations', 'stations', 'create', true),
  ('stations.read', 'View Station Logs', 'stations', 'stations', 'read', true),
  ('stations.update', 'Update Station Logs', 'stations', 'stations', 'update', true),
  ('stations.delete', 'Delete Station Logs', 'stations', 'stations', 'delete', true),
  
  -- Loading
  ('loading.create', 'Create Loading Days', 'loading', 'loading', 'create', true),
  ('loading.read', 'View Loading Schedule', 'loading', 'loading', 'read', true),
  ('loading.update', 'Update Loading Days', 'loading', 'loading', 'update', true),
  ('loading.delete', 'Delete Loading Days', 'loading', 'loading', 'delete', true),
  
  -- Users
  ('users.create', 'Create Users', 'users', 'users', 'create', true),
  ('users.read', 'View Users', 'users', 'users', 'read', true),
  ('users.update', 'Update Users', 'users', 'users', 'update', true),
  ('users.delete', 'Delete Users', 'users', 'users', 'delete', true),
  ('users.manage', 'Manage User Roles', 'users', 'users', 'manage', true),
  
  -- Analytics
  ('analytics.read', 'View Analytics', 'analytics', 'analytics', 'read', true),
  ('analytics.export', 'Export Analytics', 'analytics', 'analytics', 'export', true),
  
  -- Settings
  ('settings.read', 'View Settings', 'settings', 'settings', 'read', true),
  ('settings.update', 'Update Settings', 'settings', 'settings', 'update', true),
  
  -- System
  ('system.manage', 'Manage System', 'system', 'system', 'manage', true),
  ('system.audit', 'View Audit Logs', 'system', 'system', 'read', true)
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
DO $$
DECLARE
  v_admin_role_id UUID;
  v_manager_role_id UUID;
  v_supervisor_role_id UUID;
  v_operator_role_id UUID;
  v_viewer_role_id UUID;
BEGIN
  -- Get role IDs
  SELECT id INTO v_admin_role_id FROM roles WHERE name = 'admin';
  SELECT id INTO v_manager_role_id FROM roles WHERE name = 'manager';
  SELECT id INTO v_supervisor_role_id FROM roles WHERE name = 'supervisor';
  SELECT id INTO v_operator_role_id FROM roles WHERE name = 'operator';
  SELECT id INTO v_viewer_role_id FROM roles WHERE name = 'viewer';
  
  -- Admin: All permissions
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_admin_role_id, id FROM permissions
  ON CONFLICT (role_id, permission_id) DO NOTHING;
  
  -- Manager: Most permissions except system
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_manager_role_id, id FROM permissions
  WHERE category != 'system'
  ON CONFLICT (role_id, permission_id) DO NOTHING;
  
  -- Supervisor: Orders, stations, loading (no delete, no user management)
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_supervisor_role_id, id FROM permissions
  WHERE category IN ('orders', 'stations', 'loading', 'analytics')
    AND action IN ('create', 'read', 'update', 'export')
  ON CONFLICT (role_id, permission_id) DO NOTHING;
  
  -- Operator: Create and update orders and stations
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_operator_role_id, id FROM permissions
  WHERE (category IN ('orders', 'stations') AND action IN ('create', 'read', 'update'))
     OR (category = 'loading' AND action = 'read')
     OR (category = 'analytics' AND action = 'read')
  ON CONFLICT (role_id, permission_id) DO NOTHING;
  
  -- Viewer: Read-only
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_viewer_role_id, id FROM permissions
  WHERE action = 'read'
  ON CONFLICT (role_id, permission_id) DO NOTHING;
END $$;

-- View for user permissions
CREATE OR REPLACE VIEW user_all_permissions AS
SELECT DISTINCT
  up.user_id,
  p.name as permission_name,
  p.display_name,
  p.category,
  p.resource,
  p.action,
  CASE
    WHEN upr.granted IS NOT NULL THEN upr.granted
    ELSE true
  END as granted
FROM user_profiles up
JOIN roles r ON r.name = up.role
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
LEFT JOIN user_permissions upr ON upr.user_id = up.user_id AND upr.permission_id = p.id
WHERE r.is_active = true
  AND (upr.expires_at IS NULL OR upr.expires_at > NOW());

-- View for audit log summary
CREATE OR REPLACE VIEW audit_log_summary AS
SELECT
  DATE(created_at) as date,
  user_email,
  resource_type,
  action,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'success') as success_count,
  COUNT(*) FILTER (WHERE status = 'failure') as failure_count
FROM audit_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), user_email, resource_type, action
ORDER BY date DESC, count DESC;

COMMENT ON TABLE roles IS 'System roles for RBAC';
COMMENT ON TABLE permissions IS 'Fine-grained permissions';
COMMENT ON TABLE role_permissions IS 'Permissions assigned to roles';
COMMENT ON TABLE user_permissions IS 'User-specific permission overrides';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail';
COMMENT ON TABLE activity_logs IS 'User activity tracking';
COMMENT ON TABLE security_events IS 'Security event monitoring';
COMMENT ON FUNCTION user_has_permission IS 'Check if user has specific permission';
COMMENT ON FUNCTION log_audit IS 'Log audit entry';
COMMENT ON FUNCTION log_activity IS 'Log user activity';
COMMENT ON FUNCTION log_security_event IS 'Log security event';