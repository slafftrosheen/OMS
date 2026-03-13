-- =====================================================
-- ENHANCED ROW-LEVEL SECURITY (Simplified for existing schema)
-- =====================================================

-- Note: This migration has been simplified to work with the existing schema.
-- The original migration referenced tables that don't exist:
-- - orders (should be draft_orders)
-- - order_materials, order_stages (don't exist)
-- - user_profiles (doesn't exist, use profiles instead)
-- - saved_filters (doesn't exist)

-- Enable RLS on existing tables
ALTER TABLE draft_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Draft Orders Policies
-- Note: roles JSONB structure is {"Admin": "Viewer", "Production": "Operator", ...}
-- where the key is the section and the value is the role level
-- We check if roles->>'Admin' (the Admin section's role) is 'Admin' or 'Manager'
DROP POLICY IF EXISTS "Users can view orders they created" ON draft_orders;
CREATE POLICY "Users can view orders they created" ON draft_orders
    FOR SELECT
    USING (
        auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                roles->>'Admin' IN ('Admin', 'Manager')
                OR roles->>'Production' IN ('Admin', 'Manager')
            )
        )
    );

DROP POLICY IF EXISTS "Users can create orders" ON draft_orders;
CREATE POLICY "Users can create orders" ON draft_orders
    FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their orders" ON draft_orders;
CREATE POLICY "Users can update their orders" ON draft_orders
    FOR UPDATE
    USING (
        auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                roles->>'Admin' IN ('Admin', 'Manager')
                OR roles->>'Production' IN ('Admin', 'Manager')
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
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND roles->>'Admin' IN ('Admin', 'Manager')
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
    USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_draft_orders_created_by ON draft_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_draft_orders_status ON draft_orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
