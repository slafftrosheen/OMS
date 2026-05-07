-- =================================================================
-- 20260505090000: FIX RENAMES (REVERT order_id -> draft_order_id)
-- =================================================================
-- Standardizing back on draft_order_id as used by the newest code
-- and the upcoming overhaul migrations.
-- =================================================================

-- 1. Drop dependent views
DROP VIEW IF EXISTS public.orders_at_risk CASCADE;
DROP VIEW IF EXISTS public.order_summary CASCADE;
DROP VIEW IF EXISTS public.ordersummary CASCADE;
DROP VIEW IF EXISTS public.loading_capacity_overview CASCADE;
DROP VIEW IF EXISTS public.station_performance CASCADE;

-- 2. Rename columns back to draft_order_id
ALTER TABLE public.order_profiles      RENAME COLUMN order_id TO draft_order_id;
ALTER TABLE public.order_files         RENAME COLUMN order_id TO draft_order_id;
ALTER TABLE public.order_materials     RENAME COLUMN order_id TO draft_order_id;
ALTER TABLE public.order_fields        RENAME COLUMN order_id TO draft_order_id;
ALTER TABLE public.order_stages        RENAME COLUMN order_id TO draft_order_id;
ALTER TABLE public.order_assignees     RENAME COLUMN order_id TO draft_order_id;
ALTER TABLE public.loading_event_pos   RENAME COLUMN order_id TO draft_order_id;

-- 3. Recreate ordersummary using draft_order_id
CREATE OR REPLACE VIEW public.ordersummary AS
SELECT
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
    o.updated_by,
    o.is_rd,
    o.rd_notes,
    o.badges,
    o.created_at,
    o.updated_at,
    o.metadata,

    creator.username      AS created_by_username,
    creator.full_name     AS created_by_display_name,
    creator.email         AS created_by_email,
    creator.primary_section AS created_by_section,

    (
        SELECT s.station FROM public.order_stages s
         WHERE s.draft_order_id = o.id AND s.state = 'IN_PROGRESS'
         ORDER BY s.updated_at DESC LIMIT 1
    ) AS current_station,

    (
        CASE
            WHEN EXISTS (SELECT 1 FROM public.order_stages s WHERE s.draft_order_id = o.id AND s.state = 'BLOCKED') THEN 'blocked'
            WHEN EXISTS (SELECT 1 FROM public.order_stages s WHERE s.draft_order_id = o.id AND s.state = 'IN_PROGRESS') THEN 'in_progress'
            WHEN (SELECT COUNT(*) FROM public.order_stages s WHERE s.draft_order_id = o.id AND s.state = 'COMPLETED')
               = (SELECT COUNT(*) FROM public.order_stages s WHERE s.draft_order_id = o.id)
             AND EXISTS (SELECT 1 FROM public.order_stages s WHERE s.draft_order_id = o.id) THEN 'completed'
            ELSE o.status
        END
    ) AS computed_status,

    (
        SELECT CASE WHEN COUNT(*) = 0 THEN 0
                    ELSE ROUND((COUNT(*) FILTER (WHERE s.state = 'COMPLETED')::NUMERIC / COUNT(*)::NUMERIC) * 100)
               END::INTEGER
          FROM public.order_stages s WHERE s.draft_order_id = o.id
    ) AS progress_percentage,

    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', s.id, 'station', s.station, 'state', s.state,
                'started_at', s.started_at, 'completed_at', s.completed_at,
                'blocked_reason', s.blocked_reason, 'estimated_hours', s.estimated_hours,
                'actual_hours', s.actual_hours, 'notes', s.notes
            ) ORDER BY
                CASE s.station
                    WHEN 'CAD' THEN 1 WHEN 'CNC' THEN 2 WHEN 'SANDING' THEN 3
                    WHEN 'BENDING' THEN 4 WHEN 'WELDING' THEN 5 WHEN 'PAINT' THEN 6
                    WHEN 'ASSEMBLY' THEN 7 WHEN 'QC' THEN 8 WHEN 'LOGISTICS' THEN 9
                    ELSE 99
                END
        ), '[]'::json)
          FROM public.order_stages s WHERE s.draft_order_id = o.id
    ) AS stages,

    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', m.id, 'material_type', m.material_type, 'material_category', m.material_category,
            'thickness', m.thickness, 'dimensions', m.dimensions, 'color', m.color,
            'ral_code', m.ral_code, 'pantone_code', m.pantone_code, 'hex_code', m.hex_code,
            'oracal_code', m.oracal_code, 'quantity', m.quantity, 'unit', m.unit,
            'supplier', m.supplier, 'notes', m.notes
        ) ORDER BY m.display_order), '[]'::json)
          FROM public.order_materials m WHERE m.draft_order_id = o.id
    ) AS materials,

    (SELECT COUNT(*)::INTEGER FROM public.order_materials m WHERE m.draft_order_id = o.id) AS material_count,

    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', a.id, 'assignee_id', a.assignee_id,
            'username', p.username, 'display_name', p.full_name,
            'email', p.email, 'assigned_at', a.assigned_at
        )), '[]'::json)
          FROM public.order_assignees a
          LEFT JOIN public.profiles p ON p.id = a.assignee_id
         WHERE a.draft_order_id = o.id
    ) AS assignees,

    (SELECT COUNT(*)::INTEGER FROM public.order_assignees a WHERE a.draft_order_id = o.id) AS assignee_count,

    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', op.id, 'profile_template_id', op.profile_template_id,
            'quantity1', op.quantity1, 'quantity2', op.quantity2,
            'quantity3', op.quantity3, 'quantity4', op.quantity4,
            'total_quantity', COALESCE(op.quantity1,0)+COALESCE(op.quantity2,0)+COALESCE(op.quantity3,0)+COALESCE(op.quantity4,0),
            'configuration', op.configuration, 'notes', op.notes, 'order_index', op.order_index
        ) ORDER BY op.order_index), '[]'::json)
          FROM public.order_profiles op WHERE op.draft_order_id = o.id
    ) AS profiles,

    (SELECT COUNT(*)::INTEGER FROM public.order_profiles op WHERE op.draft_order_id = o.id) AS profile_count,

    (
        SELECT COALESCE(SUM(COALESCE(op.quantity1,0)+COALESCE(op.quantity2,0)+COALESCE(op.quantity3,0)+COALESCE(op.quantity4,0)), 0)::INTEGER
          FROM public.order_profiles op WHERE op.draft_order_id = o.id
    ) AS total_quantity,

    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', f.id, 'filename', f.filename, 'original_name', f.original_name,
            'filepath', f.filepath, 'file_type', of.file_type,
            'display_name', of.display_name, 'size', f.size, 'mimetype', f.mimetype,
            'created_at', of.created_at
        )), '[]'::json)
          FROM public.order_files of
          LEFT JOIN public.files f ON f.id = of.file_id
         WHERE of.draft_order_id = o.id
    ) AS files,

    (SELECT COUNT(*)::INTEGER FROM public.order_files of WHERE of.draft_order_id = o.id) AS file_count,

    (
        SELECT COALESCE(jsonb_object_agg(cf.key, json_build_object(
            'value', cf.value, 'label', cf.label, 'field_type', cf.field_type, 'is_required', cf.is_required
        )), '{}'::jsonb)
          FROM public.order_fields cf WHERE cf.draft_order_id = o.id
    ) AS custom_fields,

    dp.name    AS delivery_preset_name,
    dp.address AS delivery_preset_address,
    dp.contact AS delivery_preset_contact,
    dp.phone   AS delivery_preset_phone

FROM public.draft_orders o
LEFT JOIN public.profiles creator      ON creator.id = o.created_by
LEFT JOIN public.delivery_presets dp   ON dp.id      = o.delivery_preset_id;

GRANT SELECT ON public.ordersummary TO authenticated, anon;

-- 4. Recreate dependent views
CREATE OR REPLACE VIEW public.order_summary AS
SELECT * FROM public.ordersummary;
GRANT SELECT ON public.order_summary TO authenticated, anon;

CREATE OR REPLACE VIEW public.orders_at_risk AS
SELECT
    o.id,
    o.po_number,
    o.client,
    o.title,
    o.due_date,
    o.loading_date,
    o.priority,
    s.computed_status,
    s.progress_percentage,
    s.current_station,
    (o.due_date - CURRENT_DATE)::int AS days_to_due,
    CASE
        WHEN o.due_date < CURRENT_DATE THEN 'overdue'
        WHEN o.due_date <= CURRENT_DATE + interval '2 days' AND s.progress_percentage < 80 THEN 'critical'
        WHEN o.due_date <= CURRENT_DATE + interval '5 days' AND s.progress_percentage < 50 THEN 'warning'
        ELSE 'watch'
    END AS risk_level
  FROM public.draft_orders o
  JOIN public.ordersummary s ON s.id = o.id
 WHERE o.status NOT IN ('completed', 'cancelled', 'archived')
   AND o.due_date IS NOT NULL
   AND (
        o.due_date < CURRENT_DATE
     OR (o.due_date <= CURRENT_DATE + interval '5 days' AND s.progress_percentage < 80)
   );
GRANT SELECT ON public.orders_at_risk TO authenticated;

CREATE OR REPLACE VIEW public.loading_capacity_overview AS
SELECT
    ld.date,
    ld.max_capacity,
    ld.is_blocked,
    COALESCE(used.used_count, 0) AS used_count,
    GREATEST(ld.max_capacity - COALESCE(used.used_count, 0), 0) AS remaining_capacity,
    CASE
        WHEN ld.is_blocked THEN 'blocked'
        WHEN COALESCE(used.used_count, 0) >= ld.max_capacity THEN 'full'
        WHEN COALESCE(used.used_count, 0) >= ld.max_capacity * 0.8 THEN 'tight'
        ELSE 'open'
    END AS state
  FROM public.loading_days ld
  LEFT JOIN (
       SELECT le.date, COUNT(DISTINCT lep.draft_order_id)::int AS used_count
         FROM public.calendar_events le
         JOIN public.loading_event_pos lep ON lep.loading_event_id = le.id
        WHERE le.kind = 'loading'
        GROUP BY le.date
  ) used ON used.date = ld.date;
GRANT SELECT ON public.loading_capacity_overview TO authenticated;

CREATE OR REPLACE VIEW public.station_performance AS
SELECT
    s.station,
    COUNT(*) FILTER (WHERE s.state = 'COMPLETED' AND s.completed_at > now() - interval '30 days') AS completed_30d,
    COUNT(*) FILTER (WHERE s.state = 'IN_PROGRESS')                                                AS in_progress,
    COUNT(*) FILTER (WHERE s.state = 'BLOCKED')                                                    AS blocked,
    COUNT(*) FILTER (WHERE s.state = 'REWORK')                                                     AS rework,
    AVG(s.actual_hours) FILTER (WHERE s.state = 'COMPLETED' AND s.actual_hours IS NOT NULL)        AS avg_actual_hours,
    AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 3600.0)
        FILTER (WHERE s.completed_at IS NOT NULL AND s.started_at IS NOT NULL)                     AS avg_wall_hours
  FROM public.order_stages s
 GROUP BY s.station;
GRANT SELECT ON public.station_performance TO authenticated;
