import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/profiles/validate - Validate profile data against template
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const { templateCode, profileData } = await request.json();

  // Fetch template
  const { data: template, error } = await locals.supabase
    .from('profile_templates')
    .select(`
        *,
        sections:profile_sections(
            *,
            fields:profile_fields(*)
        )
    `)
    .eq('code', templateCode)
    .single();

  if (error || !template) {
    return json({ valid: false, errors: ['Template not found'] });
  }

  const errors: string[] = [];

  // Validate
  if (template.sections) {
    for (const section of template.sections) {
      if (section.fields) {
        for (const field of section.fields) {
          const value = profileData[field.field_key];

          // Required check
          if (field.is_required && (value === undefined || value === null || value === '')) {
             errors.push(`Field ${field.label_en || field.field_key} is required`);
          }

          // Basic type validation could go here...
        }
      }
    }
  }

  return json({
    valid: errors.length === 0,
    errors
  });
};
