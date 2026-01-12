import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/delivery-presets - List all delivery presets
 */
export const GET: RequestHandler = async ({ url }) => {
  const client = url.searchParams.get('client');
  
  try {
    let sql = `
      SELECT * FROM delivery_presets 
      WHERE is_active = true
    `;
    const params: string[] = [];
    
    if (client) {
      sql += ` AND LOWER(client_name) LIKE LOWER($1)`;
      params.push(`%${client}%`);
    }
    
    sql += ` ORDER BY client_name, is_default DESC, preset_name`;
    
    const result = await query(sql, params);
    
    return json(result.rows.map(row => ({
      id: row.id,
      clientName: row.client_name,
      presetName: row.preset_name,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      postalCode: row.postal_code,
      country: row.country,
      contactPerson: row.contact_person,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      deliveryNotes: row.delivery_notes,
      isDefault: row.is_default
    })));
  } catch (err) {
    console.error('Error fetching delivery presets:', err);
    // Return empty array if table doesn't exist yet
    return json([]);
  }
};

/**
 * POST /api/delivery-presets - Create a new delivery preset
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  
  if (!data.clientName || !data.addressLine1 || !data.city) {
    return json({ message: 'Client name, address, and city are required' }, { status: 400 });
  }

  try {
    const sql = `
      INSERT INTO delivery_presets (
        client_name, preset_name, address_line1, address_line2,
        city, postal_code, country, contact_person, contact_phone,
        contact_email, delivery_notes, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const result = await query(sql, [
      data.clientName,
      data.presetName || 'Default',
      data.addressLine1,
      data.addressLine2 || null,
      data.city,
      data.postalCode || null,
      data.country || 'Latvia',
      data.contactPerson || null,
      data.contactPhone || null,
      data.contactEmail || null,
      data.deliveryNotes || null,
      data.isDefault || false
    ]);

    return json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error('Error creating delivery preset:', err);
    return json({ message: 'Failed to create preset' }, { status: 500 });
  }
};
