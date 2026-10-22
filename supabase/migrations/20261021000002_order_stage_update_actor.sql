-- Station start/block/resume updates record the authenticated actor. Older
-- order_stages schemas lacked this column, so the first Start request failed.
BEGIN;
ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS updated_by UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.order_stages.updated_by IS
  'Actor supplied by the authenticated station workflow; historical rows may be NULL.';
NOTIFY pgrst, 'reload schema';
COMMIT;
