// src/routes/api/profiles/templates/[code]/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/profiles/templates/:code
 * Get single template with full details
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };

  const { code } = params;
  const includeVersions = url.searchParams.get('versions') === 'true';
  const includeChanges = url.searchParams.get('changes') === 'true';

  try {
    // Get template with sections and fields
    const templateResult = await query(
      `SELECT 
        pt.*,
        pt.created_by as created_by_name,
        pt.updated_by as updated_by_name
       FROM profile_templates pt
       WHERE pt.code = $1`,
      [code]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const template = templateResult.rows[0];

    // Get sections
    const sectionsResult = await query(
      `SELECT * FROM profile_sections 
       WHERE template_id = $1 
       ORDER BY order_index`,
      [template.id]
    );
    
    template.sections = sectionsResult.rows;

    // Get fields for each section
    for (const section of template.sections) {
      const fieldsResult = await query(
        `SELECT * FROM profile_fields 
         WHERE section_id = $1 
         ORDER BY order_index`,
        [section.id]
      );
      section.fields = fieldsResult.rows;
    }

    // Include version history
    if (includeVersions) {
      const versionsResult = await query(
        `SELECT 
          tv.*,
          tv.created_by as created_by_name
         FROM template_versions tv
         WHERE tv.template_id = $1
         ORDER BY tv.created_at DESC`,
        [template.id]
      );
      template.versions = versionsResult.rows;
    }

    // Include change log
    if (includeChanges) {
      const changesResult = await query(
        `SELECT 
          tc.*,
          tc.created_by as created_by_name
         FROM template_changes tc
         WHERE tc.template_id = $1
         ORDER BY tc.created_at DESC
         LIMIT 100`,
        [template.id]
      );
      template.changes = changesResult.rows;
    }

    return json(template);

  } catch (err: any) {
    console.error('Error loading template:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to load template');
  }
};

/**
 * PUT /api/profiles/templates/:code
 * Update existing template
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };
  
  if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    throw error(403, 'Admin access required');
  }

  const { code } = params;

  try {
    const updates = await request.json();

    // Get existing template
    const existingResult = await query(
      'SELECT * FROM profile_templates WHERE code = $1',
      [code]
    );

    if (existingResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const existing = existingResult.rows[0];

    await query('BEGIN');

    try {
      // 1. Update template
      await query(
        `UPDATE profile_templates
         SET name = $1,
             description = $2,
             is_active = $3,
             metadata = $4,
             updated_by = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE code = $6`,
        [
          updates.name || existing.name,
          updates.description !== undefined ? updates.description : existing.description,
          updates.is_active !== undefined ? updates.is_active : existing.is_active,
          JSON.stringify(updates.metadata || existing.metadata),
          user.name || 'system',
          code
        ]
      );

      // 2. Update sections if provided
      if (updates.sections) {
        // Delete existing sections (cascade will delete fields)
        await query('DELETE FROM profile_sections WHERE template_id = $1', [existing.id]);

        // Insert new sections
        for (const section of updates.sections) {
          const sectionResult = await query(
            `INSERT INTO profile_sections (
              template_id, name, display_name_en, display_name_ru, display_name_lv,
              order_index, is_required, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
              existing.id,
              section.name,
              section.display_name_en,
              section.display_name_ru || section.display_name_en,
              section.display_name_lv || section.display_name_en,
              section.order_index,
              section.is_required || false,
              JSON.stringify(section.metadata || {})
            ]
          );

          const newSection = sectionResult.rows[0];

          // Insert fields
          for (const field of section.fields || []) {
            await query(
              `INSERT INTO profile_fields (
                section_id, field_key, field_type, label_en, label_ru, label_lv,
                order_index, is_required, options, config,
                validation_rules, conditional_logic, metadata
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                newSection.id,
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

      // 3. Increment version and create snapshot
      const [major, minor] = existing.version.split('.').map(Number);
      const newVersion = `${major}.${minor + 1}`;

      await query(
        'UPDATE profile_templates SET version = $1 WHERE id = $2',
        [newVersion, existing.id]
      );

      // Get updated template snapshot
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
        [existing.id]
      );

      const snapshot = snapshotResult.rows[0];

      await query(
        `INSERT INTO template_versions (
          template_id, version, template_snapshot, 
          notes, changes_count, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          existing.id,
          newVersion,
          JSON.stringify(snapshot),
          updates.version_notes || `Updated to v${newVersion}`,
          (updates.sections?.length || 0),
          user.name || 'system'
        ]
      );

      await query('COMMIT');

      return json({
        success: true,
        version: newVersion,
        message: `Template ${code} updated to v${newVersion}`
      });

    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

  } catch (err: any) {
    console.error('Error updating template:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to update template');
  }
};

/**
 * DELETE /api/profiles/templates/:code
 * Delete template (soft or hard delete)
 */
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'SuperAdmin', name: 'System' };
  
  if (user.role !== 'SuperAdmin') {
    throw error(403, 'SuperAdmin access required for deletion');
  }

  const { code } = params;
  const hardDelete = url.searchParams.get('hard') === 'true';

  try {
    // Get template
    const templateResult = await query(
      'SELECT * FROM profile_templates WHERE code = $1',
      [code]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const template = templateResult.rows[0];

    // Check usage
    const usageResult = await query(
      'SELECT COUNT(*) as count FROM order_profiles WHERE profile_template_id = $1',
      [template.id]
    );

    const usageCount = parseInt(usageResult.rows[0].count);

    if (usageCount > 0 && hardDelete) {
      throw error(400, `Cannot delete template ${code} - used in ${usageCount} orders`);
    }

    if (hardDelete) {
      // Hard delete (cascades to sections and fields)
      await query('DELETE FROM profile_templates WHERE code = $1', [code]);
      
      return json({
        success: true,
        message: `Template ${code} permanently deleted`
      });
    } else {
      // Soft delete (mark inactive)
      await query(
        'UPDATE profile_templates SET is_active = false, updated_by = $1 WHERE code = $2',
        [user.name || 'system', code]
      );
      
      return json({
        success: true,
        message: `Template ${code} deactivated`
      });
    }

  } catch (err: any) {
    console.error('Error deleting template:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to delete template');
  }
};
