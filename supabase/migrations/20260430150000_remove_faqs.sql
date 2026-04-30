-- Remove FAQ table and related objects
DROP TABLE IF EXISTS public.faqs CASCADE;

-- Also remove the help_article entity_type from the check constraint if it exists
-- Looking at the migration 026_multi_language_content.sql from the backup, there was a check constraint.
-- However, that was in a backup. Let's see if it exists in the current migrations.
