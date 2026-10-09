-- OMS-R01: legacy SECURITY DEFINER toggle_loading_day_lock(p_date) checks only
-- auth.role() = 'authenticated'; the new API sets is_blocked through table RLS.
-- Prevent direct PostgREST invocation by arbitrary signed-in users.
-- THIS FILE IS COMMITTED BUT NOT APPLIED BY THE APP BUILD.
REVOKE EXECUTE ON FUNCTION public.toggle_loading_day_lock(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_loading_day_lock(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_loading_day_lock(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_loading_day_lock(date) TO service_role;
