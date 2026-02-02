-- =====================================================
-- NOTIFICATION TRIGGERS & FUNCTIONS
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
        title,
        message,
        type,
        action_url,
        metadata,
        read
    ) VALUES (
        p_user_id,
        p_title,
        p_message,
        p_type,
        p_action_url,
        p_metadata,
        FALSE
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-- Trigger: New order assigned
CREATE OR REPLACE FUNCTION notify_order_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assigned_user_id UUID;
    v_order_code TEXT;
BEGIN
    -- Get assigned user if exists
    v_assigned_user_id := NEW.assigned_to;
    v_order_code := NEW.order_code;

    IF v_assigned_user_id IS NOT NULL AND
       (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)) THEN

        PERFORM create_notification(
            v_assigned_user_id,
            'New Order Assignment',
            format('You have been assigned to order %s', v_order_code),
            'info',
            format('/orders/%s', NEW.id),
            jsonb_build_object(
                'order_id', NEW.id,
                'order_code', v_order_code,
                'event', 'order_assigned'
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_order_assigned
    AFTER INSERT OR UPDATE OF assigned_to ON orders
    FOR EACH ROW
    WHEN (NEW.assigned_to IS NOT NULL)
    EXECUTE FUNCTION notify_order_assigned();

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

        -- Collect users to notify: creator, assigned user, followers
        v_notify_users := ARRAY[]::UUID[];

        IF NEW.created_by IS NOT NULL THEN
            v_notify_users := array_append(v_notify_users, NEW.created_by);
        END IF;

        IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to != NEW.created_by THEN
            v_notify_users := array_append(v_notify_users, NEW.assigned_to);
        END IF;

        -- Notify all relevant users
        FOREACH v_user_id IN ARRAY v_notify_users
        LOOP
            PERFORM create_notification(
                v_user_id,
                'Order Status Updated',
                format('Order %s status changed from %s to %s',
                    NEW.order_code, OLD.status, NEW.status),
                'info',
                format('/orders/%s', NEW.id),
                jsonb_build_object(
                    'order_id', NEW.id,
                    'order_code', NEW.order_code,
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
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_status_change();

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
        SELECT id, order_code, customer, due_date, assigned_to, created_by
        FROM orders
        WHERE due_date IS NOT NULL
          AND due_date > NOW()
          AND due_date <= NOW() + INTERVAL '24 hours'
          AND status NOT IN ('completed', 'cancelled')
          AND NOT EXISTS (
              SELECT 1 FROM notifications
              WHERE metadata->>'order_id' = v_order.id::TEXT
                AND metadata->>'event' = 'deadline_approaching'
                AND created_at > NOW() - INTERVAL '24 hours'
          )
    LOOP
        -- Notify assigned user
        IF v_order.assigned_to IS NOT NULL THEN
            PERFORM create_notification(
                v_order.assigned_to,
                'Deadline Approaching',
                format('Order %s for %s is due soon!', v_order.order_code, v_order.customer),
                'warning',
                format('/orders/%s', v_order.id),
                jsonb_build_object(
                    'order_id', v_order.id,
                    'order_code', v_order.order_code,
                    'due_date', v_order.due_date,
                    'event', 'deadline_approaching'
                )
            );
        END IF;
    END LOOP;
END;
$$;

-- Trigger: New comment on order
CREATE OR REPLACE FUNCTION notify_order_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_notify_users UUID[];
    v_user_id UUID;
    v_commenter_name TEXT;
BEGIN
    -- Get order details
    SELECT o.*, u.full_name as commenter_name
    INTO v_order
    FROM orders o
    LEFT JOIN auth.users u ON u.id = NEW.user_id
    WHERE o.id = NEW.order_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Get commenter name
    SELECT COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_commenter_name
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Collect users to notify (exclude commenter)
    v_notify_users := ARRAY[]::UUID[];

    IF v_order.created_by IS NOT NULL AND v_order.created_by != NEW.user_id THEN
        v_notify_users := array_append(v_notify_users, v_order.created_by);
    END IF;

    IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != NEW.user_id
       AND v_order.assigned_to != v_order.created_by THEN
        v_notify_users := array_append(v_notify_users, v_order.assigned_to);
    END IF;

    -- Notify all relevant users
    FOREACH v_user_id IN ARRAY v_notify_users
    LOOP
        PERFORM create_notification(
            v_user_id,
            'New Comment',
            format('%s commented on order %s', v_commenter_name, v_order.order_code),
            'info',
            format('/orders/%s', v_order.id),
            jsonb_build_object(
                'order_id', v_order.id,
                'order_code', v_order.order_code,
                'comment_id', NEW.id,
                'event', 'new_comment'
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_order_comment
    AFTER INSERT ON order_comments
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_comment();

-- Trigger: Stage photos uploaded
CREATE OR REPLACE FUNCTION notify_stage_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Get order details
    SELECT o.*
    INTO v_order
    FROM orders o
    WHERE o.id = NEW.order_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Notify order creator if different from uploader
    IF v_order.created_by IS NOT NULL AND v_order.created_by != NEW.uploaded_by THEN
        PERFORM create_notification(
            v_order.created_by,
            'Production Photos Uploaded',
            format('New photos uploaded for order %s at %s', v_order.order_code, NEW.station),
            'success',
            format('/orders/%s', v_order.id),
            jsonb_build_object(
                'order_id', v_order.id,
                'order_code', v_order.order_code,
                'station', NEW.station,
                'event', 'photos_uploaded'
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_stage_photos
    AFTER INSERT ON stage_photos
    FOR EACH ROW
    EXECUTE FUNCTION notify_stage_photos();

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
BEGIN
    -- Get admin users (you need to define how admins are identified)
    SELECT array_agg(id)
    INTO v_admin_users
    FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin';

    -- Find low inventory items
    FOR v_item IN
        SELECT id, name, quantity, unit, reorder_point
        FROM inventory_items
        WHERE quantity <= reorder_point
          AND NOT EXISTS (
              SELECT 1 FROM notifications
              WHERE metadata->>'item_id' = v_item.id::TEXT
                AND metadata->>'event' = 'low_inventory'
                AND created_at > NOW() - INTERVAL '24 hours'
          )
    LOOP
        -- Notify admins
        FOREACH v_user_id IN ARRAY v_admin_users
        LOOP
            PERFORM create_notification(
                v_user_id,
                'Low Inventory Alert',
                format('Material "%s" is running low: %s %s remaining',
                    v_item.name, v_item.quantity, v_item.unit),
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
    WHERE read = TRUE
      AND created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- SELECT cron.schedule('cleanup-notifications', '0 3 * * *', 'SELECT cleanup_old_notifications()');
