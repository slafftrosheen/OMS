-- =================================================================
-- CREATE ORDERSUMMARY VIEW - COMPREHENSIVE ORDER DATA
-- =================================================================
-- Drop any existing views first
DROP VIEW IF EXISTS public.ordersummary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.ordersummary CASCADE;

-- Create comprehensive view with all order data
CREATE OR REPLACE VIEW public.ordersummary AS
SELECT 
    -- ==================== MAIN ORDER FIELDS ====================
    o.id,
    o.po_number,
    o.client,
    o.title,
    o.due_date,
    o.loading_date,
    o.cdr_file_id,
    o.pdf_file_id,
    o.status,
    o.notes,
    o.priority,
    o.delivery_address,
    o.delivery_contact,
    o.delivery_phone,
    o.delivery_preset_id,
    o.created_by,
    o.created_at,
    o.updated_at,
    o.metadata,
    
    -- ==================== CREATOR INFO ====================
    creator.username as created_by_username,
    creator.display_name as created_by_display_name,
    creator.email as created_by_email,
    creator.primary_section as created_by_section,
    
    -- ==================== CURRENT STATION ====================
    (
        SELECT s.station 
        FROM public.order_stages s 
        WHERE s.draft_order_id = o.id 
          AND s.state = 'IN_PROGRESS'
        ORDER BY s.updated_at DESC 
        LIMIT 1
    ) as current_station,
    
    -- ==================== COMPUTED STATUS ====================
    (
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM public.order_stages s 
                WHERE s.draft_order_id = o.id AND s.state = 'BLOCKED'
            ) THEN 'blocked'
            WHEN EXISTS (
                SELECT 1 FROM public.order_stages s 
                WHERE s.draft_order_id = o.id AND s.state = 'IN_PROGRESS'
            ) THEN 'in_progress'
            WHEN (
                SELECT COUNT(*) FROM public.order_stages s 
                WHERE s.draft_order_id = o.id AND s.state = 'COMPLETED'
            ) = (
                SELECT COUNT(*) FROM public.order_stages s 
                WHERE s.draft_order_id = o.id
            ) AND EXISTS (
                SELECT 1 FROM public.order_stages s WHERE s.draft_order_id = o.id
            ) THEN 'completed'
            ELSE o.status
        END
    ) as computed_status,
    
    -- ==================== PROGRESS PERCENTAGE ====================
    (
        SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND((COUNT(*) FILTER (WHERE s.state = 'COMPLETED')::NUMERIC / COUNT(*)::NUMERIC) * 100)
            END::INTEGER
        FROM public.order_stages s
        WHERE s.draft_order_id = o.id
    ) as progress_percentage,
    
    -- ==================== STAGES (JSON ARRAY) ====================
    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', s.id,
                'station', s.station,
                'state', s.state,
                'started_at', s.started_at,
                'completed_at', s.completed_at,
                'blocked_reason', s.blocked_reason,
                'estimated_hours', s.estimated_hours,
                'actual_hours', s.actual_hours,
                'notes', s.notes
            ) ORDER BY 
                CASE s.station
                    WHEN 'CAD' THEN 1
                    WHEN 'CNC' THEN 2
                    WHEN 'SANDING' THEN 3
                    WHEN 'BENDING' THEN 4
                    WHEN 'WELDING' THEN 5
                    WHEN 'PAINT' THEN 6
                    WHEN 'ASSEMBLY' THEN 7
                    WHEN 'QC' THEN 8
                    WHEN 'LOGISTICS' THEN 9
                    ELSE 99
                END
        ), '[]'::json)
        FROM public.order_stages s
        WHERE s.draft_order_id = o.id
    ) as stages,
    
    -- ==================== MATERIALS (JSON ARRAY) ====================
    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', m.id,
                'material_type', m.material_type,
                'material_category', m.material_category,
                'thickness', m.thickness,
                'dimensions', m.dimensions,
                'color', m.color,
                'ral_code', m.ral_code,
                'pantone_code', m.pantone_code,
                'hex_code', m.hex_code,
                'oracal_code', m.oracal_code,
                'quantity', m.quantity,
                'unit', m.unit,
                'supplier', m.supplier,
                'notes', m.notes
            ) ORDER BY m.display_order
        ), '[]'::json)
        FROM public.order_materials m
        WHERE m.draft_order_id = o.id
    ) as materials,
    
    (
        SELECT COUNT(*)::INTEGER
        FROM public.order_materials m
        WHERE m.draft_order_id = o.id
    ) as material_count,
    
    -- ==================== ASSIGNEES (JSON ARRAY) ====================
    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', a.id,
                'assignee_id', a.assignee_id,
                'username', p.username,
                'display_name', p.display_name,
                'email', p.email,
                'assigned_at', a.assigned_at
            )
        ), '[]'::json)
        FROM public.order_assignees a
        LEFT JOIN public.profiles p ON p.id = a.assignee_id
        WHERE a.draft_order_id = o.id
    ) as assignees,
    
    (
        SELECT COUNT(*)::INTEGER
        FROM public.order_assignees a
        WHERE a.draft_order_id = o.id
    ) as assignee_count,
    
    -- ==================== PROFILES (JSON ARRAY) ====================
    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', op.id,
                'profile_template_id', op.profile_template_id,
                'quantity1', op.quantity1,
                'quantity2', op.quantity2,
                'quantity3', op.quantity3,
                'quantity4', op.quantity4,
                'total_quantity', COALESCE(op.quantity1, 0) + COALESCE(op.quantity2, 0) + COALESCE(op.quantity3, 0) + COALESCE(op.quantity4, 0),
                'configuration', op.configuration,
                'notes', op.notes,
                'order_index', op.order_index
            ) ORDER BY op.order_index
        ), '[]'::json)
        FROM public.order_profiles op
        WHERE op.draft_order_id = o.id
    ) as profiles,
    
    (
        SELECT COUNT(*)::INTEGER
        FROM public.order_profiles op
        WHERE op.draft_order_id = o.id
    ) as profile_count,
    
    (
        SELECT COALESCE(
            SUM(COALESCE(op.quantity1, 0) + COALESCE(op.quantity2, 0) + 
                COALESCE(op.quantity3, 0) + COALESCE(op.quantity4, 0)),
            0
        )::INTEGER
        FROM public.order_profiles op
        WHERE op.draft_order_id = o.id
    ) as total_quantity,
    
    -- ==================== FILES (JSON ARRAY) ====================
    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', f.id,
                'filename', f.filename,
                'original_name', f.original_name,
                'filepath', f.filepath,
                'file_type', of.file_type,
                'display_name', of.display_name,
                'size', f.size,
                'mimetype', f.mimetype,
                'created_at', of.created_at
            )
        ), '[]'::json)
        FROM public.order_files of
        LEFT JOIN public.files f ON f.id = of.file_id
        WHERE of.draft_order_id = o.id
    ) as files,
    
    (
        SELECT COUNT(*)::INTEGER
        FROM public.order_files of
        WHERE of.draft_order_id = o.id
    ) as file_count,
    
    -- ==================== CUSTOM FIELDS (JSONB OBJECT) ====================
    (
        SELECT COALESCE(
            jsonb_object_agg(
                cf.key,
                json_build_object(
                    'value', cf.value,
                    'label', cf.label,
                    'field_type', cf.field_type,
                    'is_required', cf.is_required
                )
            ),
            '{}'::jsonb
        )
        FROM public.order_fields cf
        WHERE cf.draft_order_id = o.id
    ) as custom_fields,
    
    -- ==================== DELIVERY PRESET INFO ====================
    dp.name as delivery_preset_name,
    dp.address as delivery_preset_address,
    dp.contact as delivery_preset_contact,
    dp.phone as delivery_preset_phone

FROM public.draft_orders o
LEFT JOIN public.profiles creator ON creator.id = o.created_by
LEFT JOIN public.delivery_presets dp ON dp.id = o.delivery_preset_id;

-- =================================================================
-- GRANT PERMISSIONS
-- =================================================================

GRANT SELECT ON public.ordersummary TO authenticated;
GRANT SELECT ON public.ordersummary TO anon;

-- =================================================================
-- CREATE PERFORMANCE INDEXES
-- =================================================================

CREATE INDEX IF NOT EXISTS idx_draft_orders_id_status 
    ON public.draft_orders(id, status);

CREATE INDEX IF NOT EXISTS idx_draft_orders_priority_due 
    ON public.draft_orders(priority DESC, due_date ASC);

CREATE INDEX IF NOT EXISTS idx_draft_orders_loading_date_status 
    ON public.draft_orders(loading_date, status);

CREATE INDEX IF NOT EXISTS idx_draft_orders_client 
    ON public.draft_orders(client);

CREATE INDEX IF NOT EXISTS idx_draft_orders_po_number_search 
    ON public.draft_orders USING gin(to_tsvector('english', po_number));

CREATE INDEX IF NOT EXISTS idx_order_stages_draft_order_state 
    ON public.order_stages(draft_order_id, state);

CREATE INDEX IF NOT EXISTS idx_order_stages_station 
    ON public.order_stages(station, state);

CREATE INDEX IF NOT EXISTS idx_order_materials_draft_order 
    ON public.order_materials(draft_order_id, display_order);

CREATE INDEX IF NOT EXISTS idx_order_assignees_draft_order 
    ON public.order_assignees(draft_order_id);

CREATE INDEX IF NOT EXISTS idx_order_assignees_assignee 
    ON public.order_assignees(assignee_id);

CREATE INDEX IF NOT EXISTS idx_order_profiles_draft_order 
    ON public.order_profiles(draft_order_id, order_index);

CREATE INDEX IF NOT EXISTS idx_order_files_draft_order 
    ON public.order_files(draft_order_id);

CREATE INDEX IF NOT EXISTS idx_order_fields_draft_order 
    ON public.order_fields(draft_order_id);

-- =================================================================
-- COMMENTS
-- =================================================================

COMMENT ON VIEW public.ordersummary IS 
    'Comprehensive denormalized view with all order data for efficient listing. Aggregates from draft_orders, order_stages, order_materials, order_assignees, order_profiles, order_files, and order_fields.';

COMMENT ON COLUMN public.ordersummary.current_station IS 
    'Current station where order is actively in progress';

COMMENT ON COLUMN public.ordersummary.computed_status IS 
    'Smart status computed from stage states: blocked, in_progress, completed, or original draft_orders.status';

COMMENT ON COLUMN public.ordersummary.progress_percentage IS 
    'Completion percentage based on completed vs total stages (0-100)';

COMMENT ON COLUMN public.ordersummary.total_quantity IS 
    'Sum of all quantities (quantity1 + quantity2 + quantity3 + quantity4) across all profiles';
