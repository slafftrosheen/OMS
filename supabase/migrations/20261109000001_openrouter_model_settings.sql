-- R&D model choices share the existing service-role-only settings boundary.
-- NULL preserves the server environment/default until an administrator saves.
BEGIN;
ALTER TABLE public.openrouter_system_policy
  ADD COLUMN text_model text,
  ADD COLUMN vision_model text,
  ADD CONSTRAINT openrouter_text_model_id CHECK (text_model IS NULL OR text_model ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_./:+-]{1,130}$'),
  ADD CONSTRAINT openrouter_vision_model_id CHECK (vision_model IS NULL OR vision_model ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_./:+-]{1,130}$');
COMMIT;
