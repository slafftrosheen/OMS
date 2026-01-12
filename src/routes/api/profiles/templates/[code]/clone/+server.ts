// src/routes/api/profiles/templates/[code]/clone/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * POST /api/profiles/templates/:code/clone
 * Clone an existing template to a new template
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };
  
  if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    throw error(403, 'Admin access required');
  }

  const { code } = params;

  try {
    const { newCode, notes } = await request.json();

    if (!newCode) {
      throw error(400, 'New code is required');
    }

    // Validate new code format
    if (!/^P[0-9A-Za-z\-_]+$/.test(newCode)) {
      throw error(400, 'Invalid code format. Must start with "P" followed by alphanumeric characters');
    }

    // Check if new code already exists
    const existingResult = await query(
      'SELECT id FROM profile_templates WHERE code = $1',
      [newCode]
    );

    if (existingResult.rows.length > 0) {
      throw error(409, `Template with code ${newCode} already exists`);
    }

    // Get source template with all details
    const templateResult = await query(
      'SELECT * FROM profile_templates WHERE code = $1',
      [code]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const sourceTemplate = templateResult.rows[0];

    // Load complete template with sections and fields
    const fullTemplateResult = await query(
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

    const fullTemplate = fullTemplateResult.rows[0];

    await query('BEGIN');

    try {
      // 1. Clone template
      const clonedResult = await query(
        `INSERT INTO profile_templates (
          code, name, description, version, is_active, metadata,
          created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          newCode,
          `${sourceTemplate.name} (Copy)`,
          sourceTemplate.description,
          '1.0', // Reset to version 1.0
          false, // Clones start as inactive
          JSON.stringify({
            ...(sourceTemplate.metadata || {}),
            clonedFrom: code,
            clonedAt: new Date().toISOString(),
            clonedBy: user.name || 'system'
          }),
          user.name || 'system',
          user.name || 'system'
        ]
      );

      const clonedTemplate = clonedResult.rows[0];

      // 2. Clone sections and fields
      if (fullTemplate.sections && Array.isArray(fullTemplate.sections)) {
        for (const section of fullTemplate.sections) {
          if (!section.name) continue; // Skip null sections
          const sectionResult = await query(
            `INSERT INTO profile_sections (
              template_id, name, display_name_en, display_name_ru, display_name_lv,
              order_index, is_required, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id`,
            [
              clonedTemplate.id,
              section.name,
              section.display_name_en,
              section.display_name_ru,
              section.display_name_lv,
              section.order_index,
              section.is_required,
              JSON.stringify(section.metadata)
            ]
          );

          const newSectionId = sectionResult.rows[0].id;

          // 3. Clone fields
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
                  newSectionId,
                  field.field_key,
                  field.field_type,
                  field.label_en,
                  field.label_ru,
                  field.label_lv,
                  field.order_index,
                  field.is_required,
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
      }

      // 4. Create initial version snapshot for cloned template
      const snapshotResult = await query(
        `SELECT 
          row_to_json(pt.*) as template,
          (
            SELECT json_agg(
              jsonb_build_object(
                'section', row_to_json(ps.*),
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
        [clonedTemplate.id]
      );

      const snapshot = snapshotResult.rows[0];

      await query(
        `INSERT INTO template_versions (
          template_id, version, template_snapshot, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [
          clonedTemplate.id,
          '1.0',
          JSON.stringify(snapshot),
          notes || `Cloned from ${code}`,
          user.name || 'system'
        ]
      );

      // 5. Log the cloning action
      await query(
        `INSERT INTO template_changes (
          template_id, change_type, entity_type, new_value, description, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          clonedTemplate.id,
          'CLONED',
          'TEMPLATE',
          JSON.stringify({ clonedFrom: code }),
          `Cloned from template ${code}`,
          user.name || 'system'
        ]
      );

      await query('COMMIT');

      return json({
        success: true,
        message: `Template ${code} cloned to ${newCode}`,
        newTemplate: clonedTemplate
      }, { status: 201 });

    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

  } catch (err: any) {
    console.error('Error cloning template:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to clone template');
  }
};
