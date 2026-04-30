-- =================================================================
-- 11: FUNCTIONS AND TRIGGERS
-- =================================================================
-- Shared functions and automated triggers
-- =================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles; CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences; CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_files_updated_at ON public.files; CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_materials_updated_at ON public.materials; CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON public.inventory_items; CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_stock_updated_at ON public.inventory_stock; CREATE TRIGGER update_inventory_stock_updated_at BEFORE UPDATE ON public.inventory_stock
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profile_templates_updated_at ON public.profile_templates; CREATE TRIGGER update_profile_templates_updated_at BEFORE UPDATE ON public.profile_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_delivery_presets_updated_at ON public.delivery_presets; CREATE TRIGGER update_delivery_presets_updated_at BEFORE UPDATE ON public.delivery_presets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_draft_orders_updated_at ON public.draft_orders; CREATE TRIGGER update_draft_orders_updated_at BEFORE UPDATE ON public.draft_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_profiles_updated_at ON public.order_profiles; CREATE TRIGGER update_order_profiles_updated_at BEFORE UPDATE ON public.order_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_materials_updated_at ON public.order_materials; CREATE TRIGGER update_order_materials_updated_at BEFORE UPDATE ON public.order_materials
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_stages_updated_at ON public.order_stages; CREATE TRIGGER update_order_stages_updated_at BEFORE UPDATE ON public.order_stages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON public.calendar_events; CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_loading_days_updated_at ON public.loading_days; CREATE TRIGGER update_loading_days_updated_at BEFORE UPDATE ON public.loading_days
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON public.chat_messages; CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_rooms_updated_at ON public.chat_rooms; CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON public.chat_rooms
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_profile_presets_updated_at ON public.order_profile_presets; CREATE TRIGGER update_order_profile_presets_updated_at BEFORE UPDATE ON public.order_profile_presets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_export_templates_updated_at ON public.export_templates; CREATE TRIGGER update_export_templates_updated_at BEFORE UPDATE ON public.export_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_faqs_updated_at ON public.faqs; CREATE TRIGGER update_faqs_updated_at BEFORE UPDATE ON public.faqs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Search function (full text search across orders)
CREATE OR REPLACE FUNCTION public.search_orders(search_query TEXT)
RETURNS TABLE (
    id UUID,
    po_number TEXT,
    client TEXT,
    title TEXT,
    status TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.po_number,
        o.client,
        o.title,
        o.status,
        ts_rank(
            to_tsvector('english', 
                COALESCE(o.po_number, '') || ' ' ||
                COALESCE(o.client, '') || ' ' ||
                COALESCE(o.title, '') || ' ' ||
                COALESCE(o.notes, '')
            ),
            plainto_tsquery('english', search_query)
        ) as rank
    FROM public.draft_orders o
    WHERE to_tsvector('english',
        COALESCE(o.po_number, '') || ' ' ||
        COALESCE(o.client, '') || ' ' ||
        COALESCE(o.title, '') || ' ' ||
        COALESCE(o.notes, '')
    ) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION public.create_audit_log(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO public.audit_log (
        user_id,
        username,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    )
    VALUES (
        auth.uid(),
        (SELECT username FROM public.profiles WHERE id = auth.uid()),
        p_action,
        p_entity_type,
        p_entity_id,
        p_old_values,
        p_new_values
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check low stock items
CREATE OR REPLACE FUNCTION public.get_low_stock_items()
RETURNS TABLE (
    id UUID,
    sku TEXT,
    name TEXT,
    stock INTEGER,
    min_stock INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.sku,
        i.name,
        i.stock,
        i.min_stock
    FROM public.inventory_items i
    WHERE i.stock <= i.min_stock
    ORDER BY i.stock ASC;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Automatically updates updated_at timestamp';
COMMENT ON FUNCTION public.search_orders(TEXT) IS 'Full-text search across orders';
COMMENT ON FUNCTION public.create_audit_log IS 'Creates audit log entries';
COMMENT ON FUNCTION public.get_low_stock_items() IS 'Returns items with stock at or below minimum';
