-- Migration 025: Advanced Role-Based Access Control (RBAC)
-- Granular permissions system for fine-grained access control

-- Permission definitions
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('orders', 'stations', 'inventory', 'users', 'settings', 'reports')),
  created_at timestamptz DEFAULT now()
);

-- Role-Permission mapping (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE,
  granted boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(role, permission_id)
);

-- User-specific permission overrides
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL,
  reason text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, permission_id)
);

-- Resource-level permissions (e.g., specific order access)
CREATE TABLE IF NOT EXISTS resource_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('order', 'station', 'inventory_item')),
  resource_id uuid NOT NULL,
  permission_level text NOT NULL CHECK (permission_level IN ('read', 'write', 'admin')),
  granted_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, resource_type, resource_id)
);

CREATE INDEX idx_resource_perms_user ON resource_permissions(user_id, resource_type);
CREATE INDEX idx_resource_perms_resource ON resource_permissions(resource_type, resource_id);

-- Insert base permissions
INSERT INTO permissions (code, name, description, category) VALUES
  -- Orders
  ('orders.create', 'Create Orders', 'Create new orders', 'orders'),
  ('orders.read', 'View Orders', 'View order details', 'orders'),
  ('orders.update', 'Edit Orders', 'Modify existing orders', 'orders'),
  ('orders.delete', 'Delete Orders', 'Delete orders', 'orders'),
  ('orders.approve', 'Approve Changes', 'Approve change requests', 'orders'),
  ('orders.assign', 'Assign Orders', 'Assign orders to stations/users', 'orders'),
  
  -- Stations
  ('stations.read', 'View Stations', 'View station boards', 'stations'),
  ('stations.update_status', 'Update Station Status', 'Change order status at station', 'stations'),
  ('stations.request_change', 'Request Changes', 'Create change requests', 'stations'),
  ('stations.mark_rework', 'Mark Rework', 'Flag items for rework', 'stations'),
  
  -- Inventory
  ('inventory.read', 'View Inventory', 'View inventory levels', 'inventory'),
  ('inventory.update', 'Update Inventory', 'Adjust inventory quantities', 'inventory'),
  ('inventory.create', 'Add Inventory', 'Add new inventory items', 'inventory'),
  
  -- Users
  ('users.read', 'View Users', 'View user profiles', 'users'),
  ('users.create', 'Create Users', 'Add new users', 'users'),
  ('users.update', 'Edit Users', 'Modify user details', 'users'),
  ('users.delete', 'Delete Users', 'Remove users', 'users'),
  ('users.manage_roles', 'Manage Roles', 'Assign/change user roles', 'users'),
  
  -- Settings
  ('settings.view', 'View Settings', 'Access settings panel', 'settings'),
  ('settings.update', 'Update Settings', 'Modify system settings', 'settings'),
  
  -- Reports
  ('reports.view', 'View Reports', 'Access reports and analytics', 'reports'),
  ('reports.export', 'Export Data', 'Export reports to CSV/PDF', 'reports')
ON CONFLICT (code) DO NOTHING;

-- Assign default permissions to roles
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'admin', id, true FROM permissions
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'operator', id, true FROM permissions 
WHERE category IN ('orders', 'stations') AND code NOT IN ('orders.delete', 'orders.approve')
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'viewer', id, true FROM permissions 
WHERE code LIKE '%.read' OR code LIKE '%.view'
ON CONFLICT (role, permission_id) DO NOTHING;

-- Function: Check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role text;
  perm_id uuid;
  has_override boolean;
  override_granted boolean;
BEGIN
  -- Get user role
  SELECT role INTO user_role FROM profiles WHERE id = p_user_id;
  
  IF user_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- Admin has all permissions
  IF user_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Get permission ID
  SELECT id INTO perm_id FROM permissions WHERE code = p_permission_code;
  
  IF perm_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check for user-specific override
  SELECT EXISTS(
    SELECT 1 FROM user_permission_overrides 
    WHERE user_id = p_user_id 
      AND permission_id = perm_id
      AND (expires_at IS NULL OR expires_at > now())
  ) INTO has_override;
  
  IF has_override THEN
    SELECT granted INTO override_granted 
    FROM user_permission_overrides 
    WHERE user_id = p_user_id AND permission_id = perm_id;
    RETURN override_granted;
  END IF;
  
  -- Check role permission
  RETURN EXISTS(
    SELECT 1 FROM role_permissions 
    WHERE role = user_role 
      AND permission_id = perm_id 
      AND granted = true
  );
END;
$$;

-- Function: Check resource-level permission
CREATE OR REPLACE FUNCTION user_can_access_resource(
  p_user_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_required_level text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role text;
  resource_level text;
BEGIN
  -- Get user role
  SELECT role INTO user_role FROM profiles WHERE id = p_user_id;
  
  -- Admin has access to everything
  IF user_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Check resource-specific permission
  SELECT permission_level INTO resource_level
  FROM resource_permissions
  WHERE user_id = p_user_id
    AND resource_type = p_resource_type
    AND resource_id = p_resource_id
    AND (expires_at IS NULL OR expires_at > now());
  
  IF resource_level IS NULL THEN
    -- No explicit resource permission, check role-based permissions
    RETURN user_has_permission(p_user_id, p_resource_type || 's.' || p_required_level);
  END IF;
  
  -- Check if resource level meets requirement
  RETURN CASE 
    WHEN p_required_level = 'read' THEN resource_level IN ('read', 'write', 'admin')
    WHEN p_required_level = 'write' THEN resource_level IN ('write', 'admin')
    WHEN p_required_level = 'admin' THEN resource_level = 'admin'
    ELSE false
  END;
END;
$$;

-- RLS Policies
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view permissions"
  ON permissions FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage role permissions"
  ON role_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage permission overrides"
  ON user_permission_overrides FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view their own resource permissions"
  ON resource_permissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage resource permissions"
  ON resource_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE permissions IS 'Defines all available permissions in the system';
COMMENT ON TABLE role_permissions IS 'Maps permissions to roles';
COMMENT ON TABLE user_permission_overrides IS 'User-specific permission exceptions';
COMMENT ON TABLE resource_permissions IS 'Granular resource-level access control';
