-- =====================================================
-- NOTIFICATION TRIGGERS & FUNCTIONS (Simplified for draft_orders)
-- =====================================================

-- Function to create notifications
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id,
        notification_type,
        title,
        message,
        link,
        created_at
    ) VALUES (
        p_user_id,
        p_type,
        p_title,
        p_message,
        p_action_url,
        NOW()
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-- Note: The following triggers are commented out because they reference
-- tables or columns that don't exist in the current schema:
-- - draft_orders doesn't have assigned_to, order_code, or customer columns
-- - Tables like order_comments, stage_photos, order_stages, order_materials don't exist
-- 
-- To enable these triggers, you would need to:
-- 1. Add missing columns to draft_orders (assigned_to, order_code)
-- 2. Create the missing tables (order_comments, stage_photos, etc.)
-- 3. Uncomment and adapt the trigger functions below

/*
-- Trigger: Order status changed
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notify_users UUID[];
    v_user_id UUID;
BEGIN
    -- Only notify on status change
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN

        -- Collect users to notify: creator only (assigned_to doesn't exist)
        v_notify_users := ARRAY[]::UUID[];

        IF NEW.created_by IS NOT NULL THEN
            v_notify_users := array_append(v_notify_users, NEW.created_by);
        END IF;

        -- Notify all relevant users
        FOREACH v_user_id IN ARRAY v_notify_users
        LOOP
            PERFORM create_notification(
                v_user_id,
                'Order Status Updated',
                format('Order %s status changed from %s to %s',
                    NEW.po_number, OLD.status, NEW.status),
                'info',
                format('/orders/%s', NEW.id),
                jsonb_build_object(
                    'order_id', NEW.id,
                    'po_number', NEW.po_number,
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'event', 'status_change'
                )
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_order_status_change
    AFTER UPDATE OF status ON draft_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_status_change();
*/

-- Trigger: Order due date approaching
CREATE OR REPLACE FUNCTION check_approaching_deadlines()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Find orders due within 24 hours
    FOR v_order IN
        SELECT id, po_number, client, due_date, created_by
        FROM draft_orders
        WHERE due_date IS NOT NULL
          AND due_date > NOW()::DATE
          AND due_date <= (NOW() + INTERVAL '24 hours')::DATE
          AND status NOT IN ('completed', 'cancelled')
          AND NOT EXISTS (
              SELECT 1 FROM notifications
              WHERE link LIKE '%' || v_order.id::TEXT || '%'
                AND title = 'Deadline Approaching'
                AND created_at > NOW() - INTERVAL '24 hours'
          )
    LOOP
        -- Notify order creator
        IF v_order.created_by IS NOT NULL THEN
            PERFORM create_notification(
                v_order.created_by,
                'Deadline Approaching',
                format('Order %s for %s is due soon!', v_order.po_number, COALESCE(v_order.client, 'client')),
                'warning',
                format('/orders/%s', v_order.id),
                jsonb_build_object(
                    'order_id', v_order.id,
                    'po_number', v_order.po_number,
                    'due_date', v_order.due_date,
                    'event', 'deadline_approaching'
                )
            );
        END IF;
    END LOOP;
END;
$$;

-- Trigger: Low inventory alert
CREATE OR REPLACE FUNCTION check_low_inventory()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_admin_users UUID[];
    v_user_id UUID;
    v_current_quantity NUMERIC;
BEGIN
    -- Get admin users
    SELECT array_agg(id)
    INTO v_admin_users
    FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin';

    -- Find low inventory items
    FOR v_item IN
        SELECT 
            ii.id, 
            ii.name, 
            COALESCE(ist.quantity, 0) as quantity, 
            ii.unit, 
            ii.min_quantity as reorder_point
        FROM inventory_items ii
        LEFT JOIN inventory_stock ist ON ist.item_id = ii.id
        WHERE COALESCE(ist.quantity, 0) <= ii.min_quantity
          AND ii.min_quantity > 0
          AND NOT EXISTS (
              SELECT 1 FROM notifications
              WHERE title = 'Low Inventory Alert'
                AND message LIKE '%' || ii.name || '%'
                AND created_at > NOW() - INTERVAL '24 hours'
          )
    LOOP
        -- Notify admins
        IF v_admin_users IS NOT NULL THEN
            FOREACH v_user_id IN ARRAY v_admin_users
            LOOP
                PERFORM create_notification(
                    v_user_id,
                    'Low Inventory Alert',
                    format('Material "%s" is running low: %s %s remaining',
                        v_item.name, v_item.quantity, COALESCE(v_item.unit, 'units')),
                    'warning',
                    '/inventory',
                    jsonb_build_object(
                        'item_id', v_item.id,
                        'quantity', v_item.quantity,
                        'reorder_point', v_item.reorder_point,
                        'event', 'low_inventory'
                    )
                );
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

-- Schedule periodic checks (requires pg_cron extension)
-- Run deadline check every hour
-- SELECT cron.schedule('check-deadlines', '0 * * * *', 'SELECT check_approaching_deadlines()');

-- Run inventory check twice daily
-- SELECT cron.schedule('check-inventory', '0 8,18 * * *', 'SELECT check_low_inventory()');

-- Function to send bulk notifications
CREATE OR REPLACE FUNCTION send_bulk_notification(
    p_user_ids UUID[],
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
        PERFORM create_notification(
            v_user_id,
            p_title,
            p_message,
            p_type,
            p_action_url
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- Clean up old read notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM notifications
    WHERE is_read = TRUE
      AND created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- SELECT cron.schedule('cleanup-notifications', '0 3 * * *', 'SELECT cleanup_old_notifications()');
