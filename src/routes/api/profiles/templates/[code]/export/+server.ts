// src/routes/api/profiles/templates/[code]/export/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/profiles/templates/:code/export
 * Export template as JSON
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  const user = locals.user;
  
  if (!user || (user.roles?.Admin !== 'Admin' && user.roles?.Admin !== 'SuperAdmin')) {
    throw error(403, 'Admin access required');
  }

  const { code } = params;
  const includeVersions = url.searchParams.get('versions') === 'true';

  try {
    // Get complete template with nested sections and fields
    const { data: template, error: fetchError } = await locals.supabase
        .from('profile_templates')
        .select(`
            *,
            sections:profile_sections(
                name, display_name_en, display_name_ru, display_name_lv,
                order_index, is_required, metadata,
                fields:profile_fields(
                    field_key, field_type, label_en, label_ru, label_lv,
                    order_index, is_required, options, config,
                    validation_rules, conditional_logic, metadata
                )
            )
        `)
        .eq('code', code)
        .single();

    if (fetchError || !template) {
        throw error(404, `Template ${code} not found`);
    }

    // Sort sections and fields (Supabase join sorting is tricky, easier in JS here)
    if (template.sections) {
        template.sections.sort((a: any, b: any) => a.order_index - b.order_index);
        for (const section of template.sections) {
            if (section.fields) {
                section.fields.sort((a: any, b: any) => a.order_index - b.order_index);
            }
        }
    }

    const exportData: any = {
      code: template.code,
      name: template.name,
      description: template.description,
      version: template.version,
      is_active: template.is_active,
      metadata: template.metadata,
      sections: template.sections,
      exported_at: new Date().toISOString(),
      exported_by: user.username
    };

    if (includeVersions) {
        const { data: versions } = await locals.supabase
            .from('template_versions')
            .select('version, notes, created_at')
            .eq('template_id', template.id)
            .order('created_at', { ascending: false });

        exportData.version_history = versions || [];
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${code}-template-export.json"`
      }
    });

  } catch (err: any) {
    console.error('Export error:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to export template');
  }
};
