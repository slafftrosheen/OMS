import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { code } = params;
  const { newCode, newName } = await request.json();
  const user = locals.user;

  if (!user || (user.roles?.Admin !== 'Admin' && user.roles?.Admin !== 'SuperAdmin')) {
    throw error(403, 'Admin access required');
  }

  // Fetch original
  const { data: original, error: fetchErr } = await locals.supabase
    .from('profile_templates')
    .select('*, sections:profile_sections(*, fields:profile_fields(*))')
    .eq('code', code)
    .single();

  if (fetchErr || !original) throw error(404, 'Template not found');

  // Create clone
  const { data: newTemplate, error: createErr } = await locals.supabase
    .from('profile_templates')
    .insert({
      code: newCode,
      name: newName,
      description: `Clone of ${original.name}`,
      version: 1,
      is_active: true,
      metadata: original.metadata,
      created_by: user.id,
      updated_by: user.id
    })
    .select()
    .single();

  if (createErr) throw createErr;

  // Clone sections and fields
  if (original.sections) {
    for (const section of original.sections) {
      const { data: newSection } = await locals.supabase
        .from('profile_sections')
        .insert({
          template_id: newTemplate.id,
          name: section.name,
          display_name_en: section.display_name_en,
          order_index: section.order_index,
          is_required: section.is_required,
          metadata: section.metadata
        })
        .select()
        .single();

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

  return json(newTemplate);
};
