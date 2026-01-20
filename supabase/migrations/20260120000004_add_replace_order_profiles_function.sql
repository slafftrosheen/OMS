-- Add the replace_order_profiles function to atomically replace order profiles
-- This addresses the race condition issue where deleting then inserting could cause data loss

CREATE OR REPLACE FUNCTION replace_order_profiles(
    target_order_id UUID,
    new_profiles JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Start transaction (implicit in functions)
    
    -- Delete existing profiles for the order
    DELETE FROM order_profiles 
    WHERE draft_order_id = target_order_id;
    
    -- Insert new profiles
    INSERT INTO order_profiles (
        draft_order_id,
        profile_template_id,
        quantity,
        configuration,
        notes
    )
    SELECT 
        target_order_id,
        (profile->>'profile_template_id')::UUID,
        COALESCE((profile->>'quantity')::INTEGER, 1),
        COALESCE(profile->'configuration', '{}'),
        COALESCE(profile->>'notes', '')
    FROM jsonb_array_elements(new_profiles) AS profile;

    -- Log the change in audit log
    INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, created_at)
    VALUES (
        auth.uid(),
        auth.email(),
        'ORDER_PROFILES_UPDATED',
        'order_profiles',
        target_order_id,
        NOW()
    );
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION replace_order_profiles(UUID, JSONB) TO service_role;