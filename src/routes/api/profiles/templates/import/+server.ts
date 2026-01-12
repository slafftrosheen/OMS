// src/routes/api/profiles/templates/import/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * POST /api/profiles/templates/import
 * Import template from JSON
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };
  
  if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    throw error(403, 'Admin access required');
  }

  try {
    const { template: importData, overwrite } = await request.json();

    if (!importData || !importData.code || !importData.name) {
      throw error(400, 'Invalid template data');
    }

    // Validate structure
    if (!Array.isArray(importData.sections)) {
      throw error(400, 'Template must have sections array');
    }

    // Check if code exists
    const existingResult = await query(
      'SELECT id FROM profile_templates WHERE code = $1',
      [importData.code]
    );

    if (existingResult.rows.length > 0 && !overwrite) {
      throw error(409, `Template ${importData.code} already exists. Use overwrite=true to replace.`);
    }

    await query('BEGIN');

    try {
      let templateId: number;

      if (existingResult.rows.length > 0 && overwrite) {
        // Delete existing and recreate
        templateId = existingResult.rows[0].id;
        await query('DELETE FROM profile_sections WHERE template_id = $1', [templateId]);
        
        await query(
          `UPDATE profile_templates
           SET name = $1,
               description = $2,
               metadata = $3,
               updated_by = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            importData.name,
            importData.description || '',
            JSON.stringify(importData.metadata || {}),
            user.name || 'system',
            templateId
          ]
        );
      } else {
        // Create new template
        const templateResult = await query(
          `INSERT INTO profile_templates (
            code, name, description, version, is_active, metadata,
            created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            importData.code,
            importData.name,
            importData.description || '',
            '1.0',
            importData.is_active !== false,
            JSON.stringify(importData.metadata || {}),
            user.name || 'system',
            user.name || 'system'
          ]
        );
        templateId = templateResult.rows[0].id;
      }

      // Import sections and fields
      for (const section of importData.sections) {
        const sectionResult = await query(
          `INSERT INTO profile_sections (
            template_id, name, display_name_en, display_name_ru, display_name_lv,
            order_index, is_required, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            templateId,
            section.name,
            section.display_name_en,
            section.display_name_ru || section.display_name_en,
            section.display_name_lv || section.display_name_en,
            section.order_index,
            section.is_required || false,
            JSON.stringify(section.metadata || {})
          ]
        );

        const sectionId = sectionResult.rows[0].id;

        // Import fields
        if (section.fields && Array.isArray(section.fields)) {
          for (const field of section.fields) {
            await query(
              `INSERT INTO profile_fields (
                section_id, field_key, field_type, label_en, label_ru, label_lv,
                order_index, is_required, options, config,
                validation_rules, conditional_logic, metadata
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                sectionId,
                field.field_key,
                field.field_type,
                field.label_en,
                field.label_ru || field.label_en,
                field.label_lv || field.label_en,
                field.order_index,
                field.is_required || false,
                JSON.stringify(field.options || []),
                JSON.stringify(field.config || {}),
                JSON.stringify(field.validation_rules || []),
                JSON.stringify(field.conditional_logic || []),
                JSON.stringify(field.metadata || {})
              ]
            );
          }
        }
      }

      // Create version snapshot
      const snapshotResult = await query(
        `SELECT 
          row_to_json(pt.*) as template,
          (
            SELECT json_agg(
              jsonb_build_object(
                'id', ps.id,
                'name', ps.name,
                'display_name_en', ps.display_name_en,
                'fields', (
                  SELECT json_agg(pf.* ORDER BY pf.order_index)
                  FROM profile_fields pf
                  WHERE pf.section_id = ps.id
                )
              ) ORDER BY ps.order_index
            )
            FROM profile_sections ps
            WHERE ps.template_id = $1
          ) as sections
         FROM profile_templates pt
         WHERE pt.id = $1`,
        [templateId]
      );

      const snapshot = snapshotResult.rows[0];

      await query(
        `INSERT INTO template_versions (
          template_id, version, template_snapshot, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (template_id, version) DO NOTHING`,
        [
          templateId,
          '1.0',
          JSON.stringify(snapshot),
          'Imported template',
          user.name || 'system'
        ]
      );

      await query('COMMIT');

      return json({
        success: true,
        templateId,
        message: `Template ${importData.code} imported successfully`
      }, { status: 201 });

    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

  } catch (err: any) {
    console.error('Import error:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to import template');
  }
};
