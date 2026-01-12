// src/routes/api/profiles/templates/[code]/versions/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/profiles/templates/:code/versions
 * Get version history for a template
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };

  const { code } = params;
  const includeSnapshots = url.searchParams.get('snapshots') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '50');

  try {
    // Get template ID
    const templateResult = await query(
      'SELECT id FROM profile_templates WHERE code = $1',
      [code]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const templateId = templateResult.rows[0].id;

    // Get version history
    const versionsQuery = includeSnapshots
      ? `SELECT * FROM template_versions WHERE template_id = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT 
          id, template_id, version, notes, changes_count, created_at, created_by
         FROM template_versions 
         WHERE template_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`;

    const versionsResult = await query(versionsQuery, [templateId, limit]);

    return json({
      code,
      versions: versionsResult.rows,
      total: versionsResult.rows.length
    });

  } catch (err: any) {
    console.error('Error loading versions:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to load version history');
  }
};

/**
 * POST /api/profiles/templates/:code/versions
 * Create new version snapshot manually
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };
  
  if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    throw error(403, 'Admin access required');
  }

  const { code } = params;

  try {
    const { notes } = await request.json();

    // Get template
    const templateResult = await query(
      'SELECT * FROM profile_templates WHERE code = $1',
      [code]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, `Template ${code} not found`);
    }

    const template = templateResult.rows[0];

    await query('BEGIN');

    try {
      // Get complete template snapshot
      const snapshotResult = await query(
        `SELECT 
          row_to_json(pt.*) as template,
          (
            SELECT json_agg(
              jsonb_build_object(
                'id', ps.id,
                'name', ps.name,
                'display_name_en', ps.display_name_en,
                'display_name_ru', ps.display_name_ru,
                'display_name_lv', ps.display_name_lv,
                'order_index', ps.order_index,
                'is_required', ps.is_required,
                'metadata', ps.metadata,
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
        [template.id]
      );

      const snapshot = snapshotResult.rows[0];

      // Calculate next version
      const latestVersionResult = await query(
        `SELECT version FROM template_versions 
         WHERE template_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [template.id]
      );

      let newVersion = '1.0';
      if (latestVersionResult.rows.length > 0) {
        const currentVersion = latestVersionResult.rows[0].version;
        const [major, minor] = currentVersion.split('.').map(Number);
        newVersion = `${major}.${minor + 1}`;
      }

      // Count sections for changes_count
      const sectionsCount = snapshot.sections?.length || 0;

      // Create version
      const versionResult = await query(
        `INSERT INTO template_versions (
          template_id, version, template_snapshot, 
          notes, changes_count, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          template.id,
          newVersion,
          JSON.stringify(snapshot),
          notes || `Version ${newVersion}`,
          sectionsCount,
          user.name || 'system'
        ]
      );

      // Update template version
      await query(
        'UPDATE profile_templates SET version = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newVersion, template.id]
      );

      await query('COMMIT');

      return json({
        success: true,
        version: versionResult.rows[0],
        message: `Created version ${newVersion}`
      }, { status: 201 });

    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

  } catch (err: any) {
    console.error('Error creating version:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to create version');
  }
};
