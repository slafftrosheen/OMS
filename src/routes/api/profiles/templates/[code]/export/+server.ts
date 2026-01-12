// src/routes/api/profiles/templates/[code]/export/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/profiles/templates/:code/export
 * Export template as JSON
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };
  
  if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    throw error(403, 'Admin access required');
  }

  const { code } = params;
  const includeVersions = url.searchParams.get('versions') === 'true';

  try {
    // Get complete template
    const templateResult = await query(
      `SELECT 
        pt.*,
        json_agg(
          json_build_object(
            'name', ps.name,
            'display_name_en', ps.display_name_en,
            'display_name_ru', ps.display_name_ru,
            'display_name_lv', ps.display_name_lv,
            'order_index', ps.order_index,
            'is_required', ps.is_required,
            'metadata', ps.metadata,
            'fields', (
              SELECT json_agg(
                json_build_object(
                  'field_key', pf.field_key,
                  'field_type', pf.field_type,
                  'label_en', pf.label_en,
                  'label_ru', pf.label_ru,
                  'label_lv', pf.label_lv,
                  'order_index', pf.order_index,
                  'is_required', pf.is_required,
                  'options', pf.options,
                  'config', pf.config,
                  'validation_rules', pf.validation_rules,
                  'conditional_logic', pf.conditional_logic,
                  'metadata', pf.metadata
                ) ORDER BY pf.order_index
              )
              FROM profile_fields pf
              WHERE pf.section_id = ps.id
            )
          ) ORDER BY ps.order_index
        ) FILTER (WHERE ps.id IS NOT NULL) as sections
       FROM profile_templates pt
       LEFT JOIN profile_sections ps ON ps.template_id = pt.id
       WHERE pt.code = $1
       GROUP BY pt.id`,
      [code]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const template = templateResult.rows[0];

    // Remove internal database fields
    const exportData: any = {
      code: template.code,
      name: template.name,
      description: template.description,
      version: template.version,
      is_active: template.is_active,
      metadata: template.metadata,
      sections: template.sections,
      exported_at: new Date().toISOString(),
      exported_by: user.name || 'system'
    };

    // Include version history if requested
    if (includeVersions) {
      const versionsResult = await query(
        `SELECT version, notes, created_at 
         FROM template_versions 
         WHERE template_id = $1 
         ORDER BY created_at DESC`,
        [template.id]
      );
      exportData.version_history = versionsResult.rows;
    }

    // Return as downloadable JSON
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
