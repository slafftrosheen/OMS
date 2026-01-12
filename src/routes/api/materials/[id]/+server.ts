// src/routes/api/materials/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';

/**
 * GET /api/materials/[id] - Get single material
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    const result = await query(
      `SELECT * FROM materials WHERE id = $1`,
      [params.id]
    );

    if (result.rows.length === 0) {
      throw error(404, 'Material not found');
    }

    return json(result.rows[0]);
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to fetch material:', err);
    throw error(500, 'Failed to fetch material');
  }
};

/**
 * PUT /api/materials/[id] - Update material (admin only)
 */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  try {
    const result = await query(
      `UPDATE materials SET
        category = COALESCE($2, category),
        code = COALESCE($3, code),
        name_en = COALESCE($4, name_en),
        name_ru = COALESCE($5, name_ru),
        name_lv = COALESCE($6, name_lv),
        thickness_options = COALESCE($7, thickness_options),
        metadata = COALESCE($8, metadata)
      WHERE id = $1
      RETURNING *`,
      [
        params.id,
        data.category,
        data.code?.toUpperCase(),
        data.nameEn,
        data.nameRu,
        data.nameLv,
        data.thicknessOptions ? JSON.stringify(data.thicknessOptions) : null,
        data.metadata ? JSON.stringify(data.metadata) : null
      ]
    );

    if (result.rows.length === 0) {
      throw error(404, 'Material not found');
    }

    return json(result.rows[0]);
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to update material:', err);
    throw error(500, 'Failed to update material');
  }
};

/**
 * DELETE /api/materials/[id] - Delete material (admin only)
 */
export const DELETE: RequestHandler = async ({ params, cookies }) => {
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const result = await query(
      `DELETE FROM materials WHERE id = $1 RETURNING id`,
      [params.id]
    );

    if (result.rows.length === 0) {
      throw error(404, 'Material not found');
    }

    return json({ success: true });
  } catch (err: any) {
    if (err.status) throw err;
    if (err.code === '23503') {
      return json({ error: 'Cannot delete material that is in use' }, { status: 409 });
    }
    console.error('Failed to delete material:', err);
    throw error(500, 'Failed to delete material');
  }
};
