// src/routes/api/faq/[slug]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import type { FAQItem } from '$lib/faq/types';

/**
 * GET /api/faq/[slug] - Get a single FAQ item by slug
 * Also records a view for analytics
 */
export const GET: RequestHandler = async ({ params, url, getClientAddress }) => {
  const { slug } = params;
  const lang = url.searchParams.get('lang') || 'en';

  // Get FAQ item
  const result = await query(`
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
        JOIN faq_item_tags fit ON fit.tag_id = t.id
        WHERE fit.faq_item_id = fi.id
      ) as tags,
      (
        SELECT json_agg(json_build_object(
          'id', a.id,
          'fileName', a.file_name,
          'filePath', a.file_path,
          'fileType', a.file_type,
          'fileSize', a.file_size,
          'description', a.description,
          'orderIndex', a.order_index,
          'createdAt', a.created_at
        ) ORDER BY a.order_index)
        FROM faq_attachments a
        WHERE a.faq_item_id = fi.id
      ) as attachments
    FROM faq_items fi
    WHERE fi.slug = $1 AND fi.is_active = true
  `, [slug]);

  if (result.rows.length === 0) {
    throw error(404, 'FAQ item not found');
  }

  const row = result.rows[0];

  const item: FAQItem = {
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
    attachments: row.attachments || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  // Record view (fire and forget)
  const ipAddress = getClientAddress();
  const userAgent = url.searchParams.get('userAgent') || '';
  
  query(`
    INSERT INTO faq_views (faq_item_id, ip_address, user_agent)
    VALUES ($1, $2, $3)
  `, [row.id, ipAddress, userAgent]).catch(err => {
    console.error('Failed to record FAQ view:', err);
  });

  // Get related FAQs (same category or shared tags)
  const relatedResult = await query(`
    SELECT DISTINCT
      fi2.id, fi2.slug, fi2.question_en, fi2.question_ru, fi2.question_lv,
      fi2.view_count, fi2.is_featured
    FROM faq_items fi2
    LEFT JOIN faq_item_tags fit2 ON fit2.faq_item_id = fi2.id
    LEFT JOIN faq_item_tags fit1 ON fit1.tag_id = fit2.tag_id
    WHERE (
      fi2.category_id = $1 
      OR fit1.faq_item_id = $2
    )
    AND fi2.id != $2
    AND fi2.is_active = true
    ORDER BY fi2.is_featured DESC, fi2.view_count DESC
    LIMIT 5
  `, [row.category_id, row.id]);

  item.relatedFaqs = relatedResult.rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    questionEn: r.question_en,
    questionRu: r.question_ru,
    questionLv: r.question_lv,
    viewCount: r.view_count,
    isFeatured: r.is_featured
  })) as any;

  return json(item);
};
