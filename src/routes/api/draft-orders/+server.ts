import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * GET /api/draft-orders - List all draft orders
 */
export const GET: RequestHandler = async () => {
  const sql = `
    SELECT 
      d.*,
      (
        SELECT json_agg(json_build_object(
          'id', op.id,
          'profile_template_id', op.profile_template_id,
          'quantity', op.quantity,
          'configuration', op.configuration,
          'notes', op.notes
        ))
        FROM order_profiles op
        WHERE op.draft_order_id = d.id
      ) as profiles
    FROM draft_orders d
    ORDER BY d.created_at DESC
  `;
  
  const result = await query(sql);
  
  // Map database fields to frontend model
  const orders = result.rows.map(row => ({
    id: row.id,
    poNumber: row.po_number,
    clientName: row.client,
    title: row.title,
    deadline: row.due_date,
    loadingDate: row.loading_date,
    status: row.status,
    priority: row.priority || 'NORMAL',
    deliveryAddress: row.delivery_address,
    deliveryContact: row.delivery_contact,
    deliveryPhone: row.delivery_phone,
    profiles: row.profiles || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  return json(orders);
};

/**
 * POST /api/draft-orders - Create a new draft order
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  
  // Validation
  if (!data.poNumber || !data.clientName) {
    return json({ message: 'PO Number and Client Name are required' }, { status: 400 });
  }

  try {
    const result = await transaction(async (client) => {
      // 1. Create Draft Order with all new fields
      const orderSql = `
        INSERT INTO draft_orders (
          po_number, client, title, due_date, loading_date, status, notes,
          priority, delivery_address, delivery_contact, delivery_phone, delivery_preset_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, po_number, client, due_date, loading_date, status, priority
      `;
      
      const orderValues = [
        data.poNumber,
        data.clientName,
        data.title || `Order ${data.poNumber}`,
        data.deadline || null,
        data.loadingDate || null,
        'draft',
        data.notes || '',
        data.priority || 'NORMAL',
        data.deliveryAddress || null,
        data.deliveryContact || null,
        data.deliveryPhone || null,
        data.deliveryPresetId || null
      ];
      
      const orderResult = await client.query(orderSql, orderValues);
      const orderId = orderResult.rows[0].id;

      // 2. Create Profiles
      if (data.profiles && Array.isArray(data.profiles)) {
        for (const profile of data.profiles) {
          const profileSql = `
            INSERT INTO order_profiles (
              draft_order_id, quantity, configuration, notes
            ) VALUES ($1, $2, $3, $4)
          `;
          
          await client.query(profileSql, [
            orderId,
            profile.quantity || 1,
            JSON.stringify(profile.configuration || {}),
            profile.notes || ''
          ]);
        }
      }

      // 3. Link uploaded files to order (if order_files table exists)
      if (data.fileIds && Array.isArray(data.fileIds) && data.fileIds.length > 0) {
        try {
          for (const fileId of data.fileIds) {
            const fileSql = `
              INSERT INTO order_files (draft_order_id, file_id, file_type, display_name)
              VALUES ($1, $2, $3, $4)
            `;
            await client.query(fileSql, [orderId, fileId, 'sketch', null]);
          }
        } catch (fileErr) {
          // Table might not exist yet - ignore silently
          console.warn('Could not link files to order:', fileErr);
        }
      }
      
      return orderResult.rows[0];
    });

    return json(result, { status: 201 });
    
  } catch (err: any) {
    console.error('Error creating draft order:', err);
    if (err.code === '23505') { // Unique violation
      return json({ message: 'PO Number already exists' }, { status: 409 });
    }
    // Handle missing columns gracefully
    if (err.code === '42703') {
      // Column doesn't exist - try simpler insert
      return createOrderSimple(data);
    }
    return json({ message: 'Failed to create order' }, { status: 500 });
  }
};

// Fallback for when new columns don't exist yet
async function createOrderSimple(data: any) {
  try {
    const result = await transaction(async (client) => {
      const orderSql = `
        INSERT INTO draft_orders (
          po_number, client, title, due_date, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, po_number, client, due_date, status
      `;
      
      const orderValues = [
        data.poNumber,
        data.clientName,
        data.title || `Order ${data.poNumber}`,
        data.deadline || null,
        'draft',
        data.notes || ''
      ];
      
      const orderResult = await client.query(orderSql, orderValues);
      const orderId = orderResult.rows[0].id;

      if (data.profiles && Array.isArray(data.profiles)) {
        for (const profile of data.profiles) {
          const profileSql = `
            INSERT INTO order_profiles (
              draft_order_id, quantity, configuration, notes
            ) VALUES ($1, $2, $3, $4)
          `;
          
          await client.query(profileSql, [
            orderId,
            profile.quantity || 1,
            JSON.stringify(profile.configuration || {}),
            profile.notes || ''
          ]);
        }
      }
      
      return orderResult.rows[0];
    });

    return json(result, { status: 201 });
  } catch (err) {
    console.error('Error in simple order creation:', err);
    return json({ message: 'Failed to create order' }, { status: 500 });
  }
}
