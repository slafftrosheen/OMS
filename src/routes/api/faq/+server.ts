// src/routes/api/faq/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import type { FAQListResponse, FAQItem, FAQCategory, FAQTag } from '$lib/faq/types';

/**
 * GET /api/faq - List FAQ items with filtering
 * Query params: ?categoryId=1&tag=plexiglas&featured=true&search=opal&lang=en
 */
export const GET: RequestHandler = async ({ url }) => {
  const categoryId = url.searchParams.get('categoryId');
  const tag = url.searchParams.get('tag');
  const featured = url.searchParams.get('featured') === 'true';
  const search = url.searchParams.get('search');
  const lang = (url.searchParams.get('lang') || 'en') as 'en' | 'ru' | 'lv';
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const questionCol = `question_${lang}`;
  const answerCol = `answer_${lang}`;

  let sql = `
    SELECT
      fi.id,
      fi.category_id,
      fi.question_en,
      fi.question_ru,
      fi.question_lv,
      fi.answer_en,
      fi.answer_ru,
      fi.answer_lv,
      fi.slug,
      fi.order_index,
      fi.view_count,
      fi.is_featured,
      fi.is_active,
      fi.metadata,
      fi.created_at,
      fi.updated_at,
      (
        SELECT json_agg(json_build_object(
          'id', t.id,
          'name', t.name,
          'slug', t.slug,
          'usageCount', t.usage_count
        ))
        FROM faq_tags t
        JOIN faq_item_tags fit_sub ON fit_sub.tag_id = t.id
        WHERE fit_sub.faq_item_id = fi.id
      ) as tags
    FROM faq_items fi
    LEFT JOIN faq_item_tags fit ON fit.faq_item_id = fi.id
    LEFT JOIN faq_tags ft ON ft.id = fit.tag_id
    WHERE fi.is_active = true
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (categoryId) {
    sql += ` AND fi.category_id = $${paramIndex++}`;
    params.push(parseInt(categoryId));
  }

  if (tag) {
    sql += ` AND ft.slug = $${paramIndex++}`;
    params.push(tag);
  }

  if (featured) {
    sql += ` AND fi.is_featured = true`;
  }

  if (search) {
    sql += ` AND (
      fi.question_en ILIKE $${paramIndex} OR 
      fi.question_ru ILIKE $${paramIndex} OR 
      fi.question_lv ILIKE $${paramIndex} OR
      fi.answer_en ILIKE $${paramIndex} OR
      fi.answer_ru ILIKE $${paramIndex} OR
      fi.answer_lv ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ` GROUP BY fi.id ORDER BY fi.order_index ASC, fi.created_at DESC`;
  sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const itemsResult = await query(sql, params);

  // Get total count
  let countSql = `SELECT COUNT(DISTINCT fi.id) as total FROM faq_items fi`;
  if (tag) {
    countSql += ` LEFT JOIN faq_item_tags fit ON fit.faq_item_id = fi.id
                  LEFT JOIN faq_tags ft ON ft.id = fit.tag_id`;
  }
  countSql += ` WHERE fi.is_active = true`;
  
  const countParams: any[] = [];
  let countParamIndex = 1;
  
  if (categoryId) {
    countSql += ` AND fi.category_id = $${countParamIndex++}`;
    countParams.push(parseInt(categoryId));
  }
  
  if (tag) {
    countSql += ` AND ft.slug = $${countParamIndex++}`;
    countParams.push(tag);
  }
  
  if (search) {
    countSql += ` AND (
      fi.question_en ILIKE $${countParamIndex} OR 
      fi.answer_en ILIKE $${countParamIndex}
    )`;
    countParams.push(`%${search}%`);
  }

  const countResult = await query(countSql, countParams);
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Get all categories
  const categoriesResult = await query(`
    SELECT 
      id, name_en, name_ru, name_lv, slug, 
      description_en, description_ru, description_lv,
      icon, order_index, is_active, created_at, updated_at
    FROM faq_categories
    WHERE is_active = true
    ORDER BY order_index ASC
  `);

  // Get popular tags
  const tagsResult = await query(`
    SELECT id, name, slug, usage_count, created_at
    FROM faq_tags
    ORDER BY usage_count DESC
    LIMIT 20
  `);

  const items: FAQItem[] = itemsResult.rows.map((row: any) => ({
    id: row.id,
    categoryId: row.category_id,
    questionEn: row.question_en,
    questionRu: row.question_ru,
    questionLv: row.question_lv,
    answerEn: row.answer_en,
    answerRu: row.answer_ru,
    answerLv: row.answer_lv,
    slug: row.slug,
    orderIndex: row.order_index,
    viewCount: row.view_count,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    metadata: row.metadata,
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const categories: FAQCategory[] = categoriesResult.rows.map((row: any) => ({
    id: row.id,
    nameEn: row.name_en,
    nameRu: row.name_ru,
    nameLv: row.name_lv,
    slug: row.slug,
    descriptionEn: row.description_en,
    descriptionRu: row.description_ru,
    descriptionLv: row.description_lv,
    icon: row.icon,
    orderIndex: row.order_index,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const tags: FAQTag[] = tagsResult.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    usageCount: row.usage_count,
    createdAt: row.created_at
  }));

  const response: FAQListResponse = {
    items,
    total,
    categories,
    tags
  };

  return json(response);
};
