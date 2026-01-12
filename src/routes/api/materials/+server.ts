// src/routes/api/materials/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';

/**
 * GET /api/materials - List all materials
 */
export const GET: RequestHandler = async ({ url }) => {
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');

  let sql = `
    SELECT 
      id, category, code, name_en, name_ru, name_lv,
      thickness_options, metadata, created_at
    FROM materials
    WHERE 1=1
  `;

  const params: any[] = [];
  let idx = 1;

  if (category) {
    sql += ` AND category = $${idx++}`;
    params.push(category);
  }

  if (search) {
    sql += ` AND (name_en ILIKE $${idx} OR code ILIKE $${idx} OR name_ru ILIKE $${idx} OR name_lv ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  sql += ` ORDER BY category, name_en`;

  try {
    const result = await query(sql, params);
    return json(result.rows);
  } catch (err) {
    console.error('Failed to fetch materials:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/materials - Create new material (admin only)
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (!data.code || !data.category) {
    return json({ error: 'Code and category are required' }, { status: 400 });
  }

  try {
    const sql = `
      INSERT INTO materials (
        category, code, name_en, name_ru, name_lv,
        thickness_options, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await query(sql, [
      data.category,
      data.code.toUpperCase(),
      data.nameEn || null,
      data.nameRu || null,
      data.nameLv || null,
      JSON.stringify(data.thicknessOptions || []),
      JSON.stringify(data.metadata || {})
    ]);

    return json(result.rows[0], { status: 201 });
  } catch (err: any) {
    console.error('Failed to create material:', err);
    if (err.code === '23505') {
      return json({ error: 'Material code already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create material' }, { status: 500 });
  }
};
