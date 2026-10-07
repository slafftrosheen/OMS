// src/routes/api/delivery-presets/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface DeliveryPreset {
  id: string;
  name: string;
  address: string;
  contact: string;
  phone: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  // Additional fields for compatibility
  clientName?: string;
  presetName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  contactPerson?: string;
  contactEmail?: string;
  deliveryNotes?: string;
}

/**
 * Transform database snake_case fields to camelCase for frontend consumption
 */
function transformPreset(dbPreset: any): DeliveryPreset {
  return {
    id: dbPreset.id,
    name: dbPreset.name || dbPreset.presetName || '',
    address: dbPreset.address || 
             [dbPreset.addressLine1, dbPreset.addressLine2, dbPreset.city, dbPreset.postalCode, dbPreset.country]
               .filter(Boolean).join(', ') || '',
    contact: dbPreset.contact || dbPreset.contactPerson || '',
    phone: dbPreset.phone || dbPreset.contactPhone || '',
    isDefault: dbPreset.is_default ?? dbPreset.isDefault ?? false,
    createdAt: dbPreset.created_at ?? dbPreset.createdAt ?? new Date().toISOString(),
    updatedAt: dbPreset.updated_at ?? dbPreset.updatedAt ?? new Date().toISOString(),
    // Pass through additional fields
    clientName: dbPreset.clientName,
    presetName: dbPreset.presetName,
    addressLine1: dbPreset.addressLine1,
    addressLine2: dbPreset.addressLine2,
    city: dbPreset.city,
    postalCode: dbPreset.postalCode,
    country: dbPreset.country,
    contactPerson: dbPreset.contactPerson,
    contactEmail: dbPreset.contactEmail,
    deliveryNotes: dbPreset.deliveryNotes
  };
}

/**
 * GET /api/delivery-presets - List all delivery presets (public, no auth required)
 * Returns camelCase field names for frontend consumption
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const { data: presets, error: fetchError } = await locals.supabase
      .from('delivery_presets')
      .select('*')
      .order('name', { ascending: true, nullsFirst: false });

    if (fetchError) {
      console.error('Failed to fetch delivery presets:', fetchError);
      return json({ error: 'Failed to fetch delivery presets' }, { status: 500 });
    }

    // Transform to camelCase for frontend
    const transformed = (presets || []).map(transformPreset);

    return json(transformed);
  } catch (err: any) {
    console.error('Error in GET /api/delivery-presets:', err);
    return json({ error: 'Server error' }, { status: 500 });
  }
};

/**
 * POST /api/delivery-presets - Create a new delivery preset (requires authentication)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Map camelCase to snake_case for database
    const dbData = {
      name: body.name || body.presetName,
      address: body.address || [body.addressLine1, body.addressLine2, body.city, body.postalCode, body.country]
                  .filter(Boolean).join(', '),
      contact: body.contact || body.contactPerson,
      phone: body.phone || body.contactPhone,
      is_default: body.isDefault ?? body.is_default ?? false,
      // Store additional fields if provided
      client_name: body.clientName,
      preset_name: body.presetName,
      address_line1: body.addressLine1,
      address_line2: body.addressLine2,
      city: body.city,
      postal_code: body.postalCode,
      country: body.country,
      contact_email: body.contactEmail,
      delivery_notes: body.deliveryNotes
    };

    const { data: preset, error: insertError } = await locals.supabase
      .from('delivery_presets')
      .insert(dbData)
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create delivery preset:', insertError);
      return json({ error: insertError.message || 'Failed to create delivery preset' }, { status: 500 });
    }

    return json(transformPreset(preset), { status: 201 });
  } catch (err: any) {
    console.error('Error in POST /api/delivery-presets:', err);
    return json({ error: err.message || 'Server error' }, { status: 500 });
  }
};