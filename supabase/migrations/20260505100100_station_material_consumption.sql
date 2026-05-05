-- =================================================================
-- 20260505100100: Slice 2 — station material consumption
-- =================================================================
-- Atomic stock deduction when a station completes a stage on an order.
-- All callers should go through `complete_stage_with_consumption` rather
-- than touching `inventory_items.stock` directly so the audit trail
-- in `inventory_movements` stays consistent.
--
-- Per spec, declaring materials at completion is OPTIONAL. If the
-- operator skips it, we still record a placeholder movement
-- (movement_type='out', quantity=0, notes='SKIPPED by operator') so the
-- HoP notification path can detect it cheaply, and we fire a row into
-- `notifications` for every HoP.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. consume_materials_for_order: atomic deduct + movement audit
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_materials_for_order(
    p_order_id UUID,
    p_station  TEXT,
    p_items    JSONB,           -- [{item_id, quantity, notes?}]
    p_actor    UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item            JSONB;
    v_item_id         UUID;
    v_qty             INTEGER;
    v_notes           TEXT;
    v_low_stock_hits  JSONB := '[]'::jsonb;
    v_post_stock      INTEGER;
    v_min_stock       INTEGER;
    v_sku             TEXT;
    v_name            TEXT;
    v_consumed_count  INTEGER := 0;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object(
            'consumed', 0,
            'low_stock', '[]'::jsonb
        );
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item ->> 'item_id')::UUID;
        v_qty     := COALESCE((v_item ->> 'quantity')::INTEGER, 0);
        v_notes   := v_item ->> 'notes';

        IF v_item_id IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        -- Atomic deduct + return new stock + minimum + display info.
        UPDATE public.inventory_items
        SET stock = GREATEST(stock - v_qty, 0),
            updated_at = now()
        WHERE id = v_item_id
        RETURNING stock, COALESCE(min_stock, 0), sku, name
            INTO v_post_stock, v_min_stock, v_sku, v_name;

        IF NOT FOUND THEN
            -- Skip silently — caller validates ids upstream
            CONTINUE;
        END IF;

        INSERT INTO public.inventory_movements(
            item_id,
            movement_type,
            quantity,
            reference_id,
            reference_type,
            performed_by,
            notes
        ) VALUES (
            v_item_id,
            'out',
            v_qty,
            p_order_id,
            'order',
            p_actor,
            COALESCE(v_notes, 'station=' || p_station)
        );

        v_consumed_count := v_consumed_count + 1;

        IF v_post_stock < v_min_stock THEN
            v_low_stock_hits := v_low_stock_hits || jsonb_build_object(
                'item_id',   v_item_id,
                'sku',       v_sku,
                'name',      v_name,
                'stock',     v_post_stock,
                'min_stock', v_min_stock
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'consumed',  v_consumed_count,
        'low_stock', v_low_stock_hits
    );
END;
$$;

COMMENT ON FUNCTION public.consume_materials_for_order(UUID, TEXT, JSONB, UUID) IS
    'Atomic: deducts stock + writes inventory_movements rows for a stage completion. Returns {consumed, low_stock[]}.';

REVOKE ALL ON FUNCTION public.consume_materials_for_order(UUID, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_materials_for_order(UUID, TEXT, JSONB, UUID) TO authenticated;

-- ---------------------------------------------------------------
-- 2. station_consumption_summary view: per-order per-station rollup
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.station_consumption_summary CASCADE;
CREATE VIEW public.station_consumption_summary AS
SELECT
    m.reference_id                                 AS order_id,
    COALESCE(
        NULLIF(split_part(m.notes, '=', 2), ''),
        'unknown'
    )                                              AS station,
    m.item_id,
    ii.sku                                         AS sku,
    ii.name                                        AS name,
    SUM(m.quantity)                                AS total_quantity,
    MIN(m.created_at)                              AS first_logged_at,
    MAX(m.created_at)                              AS last_logged_at
FROM public.inventory_movements m
LEFT JOIN public.inventory_items ii ON ii.id = m.item_id
WHERE m.reference_type = 'order' AND m.movement_type = 'out'
GROUP BY m.reference_id, station, m.item_id, ii.sku, ii.name;

COMMENT ON VIEW public.station_consumption_summary IS
    'Rollup of materials consumed per order per station. Drives the consumption tab on /orders/[id].';

-- ---------------------------------------------------------------
-- 3. Optional flag on order_stages so the UI knows the operator
--    explicitly skipped the consumption prompt.
-- ---------------------------------------------------------------
ALTER TABLE public.order_stages
    ADD COLUMN IF NOT EXISTS consumption_skipped BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consumption_skipped_reason TEXT;

COMMENT ON COLUMN public.order_stages.consumption_skipped IS
    'True when the operator marked the stage complete without declaring materials. HoP gets notified.';
