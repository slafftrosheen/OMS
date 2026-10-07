import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/api/helpers';

/**
 * GET /api/profiles/templates/[code]
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { code } = params;

  const { data: template, error: err } = await locals.supabase
    .from('profile_templates')
    .select(`
        *,
        sections:profile_sections(
            *,
            fields:profile_fields(*)
        )
    `)
    .eq('code', code)
    .single();

  if (err || !template) throw error(404, 'Template not found');

  // Sort sections and fields
  if (template.sections) {
      template.sections.sort((a: any, b: any) => a.order_index - b.order_index);
      for (const section of template.sections) {
          if (section.fields) {
              section.fields.sort((a: any, b: any) => a.order_index - b.order_index);
          }
      }
  }

  return json(template);
};

/**
 * PUT /api/profiles/templates/[code] - Update template
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { code } = params;
  const data = await request.json();
  const user = requireAdmin(locals);

  // Check if exists
  const { data: template } = await locals.supabase.from('profile_templates').select('id').eq('code', code).single();
  if (!template) throw error(404, 'Template not found');

  // Update base
  await locals.supabase.from('profile_templates').update({
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      metadata: data.metadata,
      updated_by: user.id,
      updated_at: new Date().toISOString()
  }).eq('id', template.id);

  // Full update of sections/fields is complex via REST.
  // Usually we expect specific endpoints or full replace.
  // Assuming full replace for simplicity as per `import` logic.

  if (data.sections) {
      // Delete old sections
      await locals.supabase.from('profile_sections').delete().eq('template_id', template.id);

      // Insert new
      for (const section of data.sections) {
         const { data: newSection } = await locals.supabase.from('profile_sections').insert({
             template_id: template.id,
             name: section.name,
             display_name_en: section.display_name_en,
             order_index: section.order_index,
             is_required: section.is_required,
             metadata: section.metadata
         }).select().single();

         if (newSection && section.fields) {
             const fields = section.fields.map((f: any) => ({
                 section_id: newSection.id,
                 field_key: f.field_key,
                 field_type: f.field_type,
                 label_en: f.label_en,
                 order_index: f.order_index,
                 is_required: f.is_required,
                 options: f.options,
                 config: f.config,
                 validation_rules: f.validation_rules,
                 conditional_logic: f.conditional_logic,
                 metadata: f.metadata
             }));
             await locals.supabase.from('profile_fields').insert(fields);
         }
      }
  }

  return json({ success: true });
};

/**
 * DELETE /api/profiles/templates/[code]
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { code } = params;
  requireAdmin(locals);

  const { error: err } = await locals.supabase.from('profile_templates').delete().eq('code', code);
  if (err) throw error(500, 'Failed to delete template');

  return json({ success: true });
};
