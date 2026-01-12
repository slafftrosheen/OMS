// src/routes/api/profiles/templates/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/profiles/templates
 * List all profile templates with optional filtering and details
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };

  const includeDetails = url.searchParams.get('include') === 'details';
  const includeStats = url.searchParams.get('includeStats') === 'true';
  const activeOnly = url.searchParams.get('active') !== 'false';
  const searchQuery = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  try {
    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (activeOnly && user.role !== 'Admin' && user.role !== 'SuperAdmin') {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(true);
    }

    if (searchQuery) {
      conditions.push(`(
        code ILIKE $${paramIndex} OR 
        name ILIKE $${paramIndex} OR 
        description ILIKE $${paramIndex}
      )`);
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM profile_templates ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get templates
    const templatesQuery = `
      SELECT 
        pt.*,
        pt.created_by as created_by_name,
        pt.updated_by as updated_by_name
      FROM profile_templates pt
      ${whereClause}
      ORDER BY pt.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const templatesResult = await query(
      templatesQuery,
      [...params, limit, offset]
    );

    let templates = templatesResult.rows;

    // Include details (sections and fields)
    if (includeDetails) {
      for (const template of templates) {
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
      }
    } else {
      // Just get counts
      for (const template of templates) {
        const countsResult = await query(
          `SELECT 
            COUNT(DISTINCT ps.id) as sections_count,
            COUNT(DISTINCT pf.id) as fields_count
           FROM profile_sections ps
           LEFT JOIN profile_fields pf ON pf.section_id = ps.id
           WHERE ps.template_id = $1`,
          [template.id]
        );
        
        const counts = countsResult.rows[0];
        template.sections_count = parseInt(counts.sections_count || '0');
        template.fields_count = parseInt(counts.fields_count || '0');
      }
    }

    // Include usage statistics
    if (includeStats) {
      for (const template of templates) {
        const usageResult = await query(
          `SELECT COUNT(*) as usage_count 
           FROM order_profiles op
           WHERE op.profile_template_id = $1`,
          [template.id]
        );
        template.usage_count = parseInt(usageResult.rows[0]?.usage_count || '0');
      }
    }

    return json({
      items: templates,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });

  } catch (err) {
    console.error('Error loading templates:', err);
    throw error(500, 'Failed to load templates');
  }
};

/**
 * POST /api/profiles/templates
 * Create new profile template with sections and fields
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  // Simple auth check - in production this would use proper auth middleware
  const user = locals.user || { id: 1, role: 'Admin', name: 'System' };
  
  if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    throw error(403, 'Admin access required');
  }

  try {
    const template = await request.json();

    // Validate required fields
    if (!template.code || !template.name) {
      throw error(400, 'Missing required fields: code, name');
    }

    // Validate code format
    if (!/^P[0-9A-Za-z\-_]+$/.test(template.code)) {
      throw error(400, 'Invalid code format. Must start with "P" followed by alphanumeric characters');
    }

    // Check if code already exists
    const existingResult = await query(
      'SELECT id FROM profile_templates WHERE code = $1',
      [template.code]
    );

    if (existingResult.rows.length > 0) {
      throw error(409, `Template with code ${template.code} already exists`);
    }

    // Begin transaction
    await query('BEGIN');

    try {
      // 1. Insert template
      const templateResult = await query(
        `INSERT INTO profile_templates (
          code, name, description, version, is_active, metadata, 
          created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          template.code,
          template.name,
          template.description || '',
          template.version || '1.0',
          template.is_active !== false,
          JSON.stringify(template.metadata || {}),
          user.name || 'system',
          user.name || 'system'
        ]
      );

      const newTemplate = templateResult.rows[0];

      // 2. Insert sections
      for (const section of template.sections || []) {
        const sectionResult = await query(
          `INSERT INTO profile_sections (
            template_id, name, display_name_en, display_name_ru, display_name_lv,
            order_index, is_required, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            newTemplate.id,
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

        // 3. Insert fields for this section
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

      // 4. Create initial version snapshot
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
        [newTemplate.id]
      );

      const snapshot = snapshotResult.rows[0];

      await query(
        `INSERT INTO template_versions (
          template_id, version, template_snapshot, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [
          newTemplate.id,
          newTemplate.version,
          JSON.stringify(snapshot),
          'Initial version',
          user.name || 'system'
        ]
      );

      // Commit transaction
      await query('COMMIT');

      return json({
        success: true,
        template: newTemplate,
        message: `Template ${template.code} created successfully`
      }, { status: 201 });

    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

  } catch (err: any) {
    console.error('Error creating template:', err);
    
    if (err.status) throw err; // Already an HTTP error
    
    throw error(500, err.message || 'Failed to create template');
  }
};
