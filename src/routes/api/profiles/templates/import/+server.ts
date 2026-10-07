// src/routes/api/profiles/templates/import/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/api/helpers';

/**
 * POST /api/profiles/templates/import
 * Import template from JSON
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireAdmin(locals);

  try {
    const { template: importData, overwrite } = await request.json();

    if (!importData || !importData.code || !importData.name) {
      throw error(400, 'Invalid template data');
    }

    if (!Array.isArray(importData.sections)) {
      throw error(400, 'Template must have sections array');
    }

    // Check if code exists
    const { data: existing } = await locals.supabase
        .from('profile_templates')
        .select('id')
        .eq('code', importData.code)
        .single();

    if (existing && !overwrite) {
      throw error(409, `Template ${importData.code} already exists. Use overwrite=true to replace.`);
    }

    let templateId = existing?.id;

    if (templateId && overwrite) {
        // Delete sections (cascade deletes fields)
        await locals.supabase.from('profile_sections').delete().eq('template_id', templateId);
        
        // Update template
        const { error: updateError } = await locals.supabase
            .from('profile_templates')
            .update({
                name: importData.name,
                description: importData.description || '',
                metadata: importData.metadata || {},
                updated_by: user.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', templateId);

        if (updateError) throw updateError;
    } else {
        // Create new
        const { data: newTemplate, error: insertError } = await locals.supabase
            .from('profile_templates')
            .insert({
                code: importData.code,
                name: importData.name,
                description: importData.description || '',
                version: 1, // integer
                is_active: importData.is_active !== false,
                metadata: importData.metadata || {},
                created_by: user.id,
                updated_by: user.id
            })
            .select()
            .single();

        if (insertError) throw insertError;
        templateId = newTemplate.id;
    }

    // Import sections and fields
    for (const section of importData.sections) {
        const { data: newSection, error: sectionError } = await locals.supabase
            .from('profile_sections')
            .insert({
                template_id: templateId,
                name: section.name,
                display_name_en: section.display_name_en,
                display_name_ru: section.display_name_ru || section.display_name_en,
                display_name_lv: section.display_name_lv || section.display_name_en,
                order_index: section.order_index,
                is_required: section.is_required || false,
                metadata: section.metadata || {}
            })
            .select()
            .single();

        if (sectionError) throw sectionError;

        if (section.fields && Array.isArray(section.fields)) {
            const fieldsToInsert = section.fields.map((field: any) => ({
                section_id: newSection.id,
                field_key: field.field_key,
                field_type: field.field_type,
                label_en: field.label_en,
                label_ru: field.label_ru || field.label_en,
                label_lv: field.label_lv || field.label_en,
                order_index: field.order_index,
                is_required: field.is_required || false,
                options: field.options || [],
                config: field.config || {},
                validation_rules: field.validation_rules || [],
                conditional_logic: field.conditional_logic || [],
                metadata: field.metadata || {}
            }));

            const { error: fieldsError } = await locals.supabase
                .from('profile_fields')
                .insert(fieldsToInsert);

            if (fieldsError) throw fieldsError;
        }
    }

    // Create version snapshot
    const { data: fullTemplate } = await locals.supabase
        .from('profile_templates')
        .select(`
            *,
            sections:profile_sections(
                *,
                fields:profile_fields(*)
            )
        `)
        .eq('id', templateId)
        .single();

    await locals.supabase.from('template_versions').insert({
        template_id: templateId,
        version: 1,
        template_snapshot: fullTemplate,
        notes: 'Imported template',
        created_by: user.id
    });

    return json({
        success: true,
        templateId,
        message: `Template ${importData.code} imported successfully`
    }, { status: 201 });

  } catch (err: any) {
    console.error('Import error:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to import template');
  }
};
