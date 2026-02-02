-- =====================================================
-- ENHANCED ROW-LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- Orders Policies
DROP POLICY IF EXISTS "Users can view orders they're involved in" ON orders;
CREATE POLICY "Users can view orders they're involved in" ON orders
    FOR SELECT
    USING (
        auth.uid() IN (created_by, assigned_to)
        OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Users can create orders" ON orders;
CREATE POLICY "Users can create orders" ON orders
    FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their orders" ON orders;
CREATE POLICY "Users can update their orders" ON orders
    FOR UPDATE
    USING (
        auth.uid() IN (created_by, assigned_to)
        OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Order Materials Policies
DROP POLICY IF EXISTS "Users can view order materials" ON order_materials;
CREATE POLICY "Users can view order materials" ON order_materials
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_materials.order_id
            AND (
                auth.uid() IN (orders.created_by, orders.assigned_to)
                OR EXISTS (
                    SELECT 1 FROM user_profiles
                    WHERE id = auth.uid() AND role IN ('admin', 'manager')
                )
            )
        )
    );

DROP POLICY IF EXISTS "Users can manage order materials" ON order_materials;
CREATE POLICY "Users can manage order materials" ON order_materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_materials.order_id
            AND (
                auth.uid() IN (orders.created_by, orders.assigned_to)
                OR EXISTS (
                    SELECT 1 FROM user_profiles
                    WHERE id = auth.uid() AND role IN ('admin', 'manager')
                )
            )
        )
    );

-- Inventory Policies (admin/manager only for write)
DROP POLICY IF EXISTS "Everyone can view inventory" ON inventory_items;
CREATE POLICY "Everyone can view inventory" ON inventory_items
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage inventory" ON inventory_items;
CREATE POLICY "Admins can manage inventory" ON inventory_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Saved Filters Policies
DROP POLICY IF EXISTS "Users can view filters" ON saved_filters;
CREATE POLICY "Users can view filters" ON saved_filters
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR is_public = true
    );

DROP POLICY IF EXISTS "Users can manage own filters" ON saved_filters;
CREATE POLICY "Users can manage own filters" ON saved_filters
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Audit logging function
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type TEXT,
    p_user_id UUID,
    p_resource_type TEXT,
    p_resource_id UUID,
    p_action TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO security_audit_log (
        event_type,
        user_id,
        resource_type,
        resource_id,
        action,
        metadata,
        ip_address,
        user_agent
    ) VALUES (
        p_event_type,
        p_user_id,
        p_resource_type,
        p_resource_id,
        p_action,
        p_metadata,
        current_setting('request.headers', true)::json->>'x-real-ip',
        current_setting('request.headers', true)::json->>'user-agent'
    );
END;
$$;

-- Security audit log table
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    resource_type TEXT,
    resource_id UUID,
    action TEXT NOT NULL,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON security_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON security_audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_event ON security_audit_log(event_type, created_at DESC);
