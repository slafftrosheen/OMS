// src/routes/api/orders/[id]/void-reissue/+server.ts
//
// POST: Boss-only "void & reissue". Retires the current PO, voids the
// existing order, and clones a new draft (status=PENDING_REVIEW) that
// references the original via reissued_from_id. Children (profiles,
// materials, files, custom fields) are copied over so the HoP can pick
// up where they left off.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await locals.supabase
    .from('profiles')
    .select('id, role')
    .eq('id', session.user.id)
    .single();
  if (!actor || actor.role !== 'Boss') {
    return json({ error: 'Boss role required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const reason: string = body.reason?.trim() || 'No reason provided';

  const { data: orig } = await locals.supabase
    .from('draft_orders')
    .select('*')
    .eq('id', params.id)
    .single();
  if (!orig) return json({ error: 'Order not found' }, { status: 404 });

  if (orig.status === 'VOIDED' || orig.status === 'ARCHIVED') {
    return json({ error: `Cannot reissue order in status ${orig.status}` }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  // 1. Mark the original VOIDED. PO is retired by clearing the unique
  //    column so the new draft is free to claim a new PO number.
  const retiredPo = orig.po_number;
  const { error: voidErr } = await locals.supabase
    .from('draft_orders')
    .update({
      status: 'VOIDED',
      voided_at: nowIso,
      voided_by: actor.id,
      voided_reason: reason,
      po_number: null,
      updated_by: actor.id,
    })
    .eq('id', orig.id);
  if (voidErr) {
    console.error('void update failed:', voidErr);
    return json({ error: 'Failed to void original' }, { status: 500 });
  }

  // 2. Clone into a new draft.
  const { data: clone, error: cloneErr } = await locals.supabase
    .from('draft_orders')
    .insert({
      po_number: null,
      title: orig.title ? `${orig.title} (reissue)` : 'Reissue',
      client: orig.client,
      due_date: orig.due_date,
      loading_date: orig.loading_date,
      status: 'PENDING_REVIEW',
      notes: orig.notes,
      priority: orig.priority,
      delivery_address: orig.delivery_address,
      delivery_contact: orig.delivery_contact,
      delivery_phone: orig.delivery_phone,
      delivery_preset_id: orig.delivery_preset_id,
      created_by: session.user.id,
      reissued_from_id: orig.id,
      metadata: { ...(orig.metadata ?? {}), reissued_from_po: retiredPo },
    })
    .select()
    .single();
  if (cloneErr || !clone) {
    console.error('clone insert failed:', cloneErr);
    return json({ error: 'Failed to create reissue' }, { status: 500 });
  }

  // 3. Copy child rows. Best-effort — log and continue on individual failures.
  const childTables: Array<{ table: string; payload: (rows: any[]) => any[] }> = [
    {
      table: 'order_profiles',
      payload: (rows) =>
        rows.map((r) => ({
          draft_order_id: clone.id,
          profile_template_id: r.profile_template_id,
          quantity1: r.quantity1,
          quantity2: r.quantity2,
          quantity3: r.quantity3,
          quantity4: r.quantity4,
          configuration: r.configuration,
          notes: r.notes,
          order_index: r.order_index,
        })),
    },
    {
      table: 'order_materials',
      payload: (rows) =>
        rows.map((r) => ({
          draft_order_id: clone.id,
          material_type: r.material_type,
          material_category: r.material_category,
          thickness: r.thickness,
          dimensions: r.dimensions,
          color: r.color,
          ral_code: r.ral_code,
          pantone_code: r.pantone_code,
          hex_code: r.hex_code,
          oracal_code: r.oracal_code,
          quantity: r.quantity,
          unit: r.unit,
          supplier: r.supplier,
          notes: r.notes,
          display_order: r.display_order,
        })),
    },
    {
      table: 'order_files',
      payload: (rows) =>
        rows.map((r) => ({
          draft_order_id: clone.id,
          file_id: r.file_id,
          file_type: r.file_type,
          display_name: r.display_name,
        })),
    },
    {
      table: 'order_fields',
      payload: (rows) =>
        rows.map((r) => ({
          draft_order_id: clone.id,
          key: r.key,
          label: r.label,
          value: r.value,
          field_type: r.field_type,
          display_order: r.display_order,
          is_required: r.is_required,
        })),
    },
  ];

  for (const { table, payload } of childTables) {
    const { data: rows } = await locals.supabase
      .from(table)
      .select('*')
      .eq('draft_order_id', orig.id);
    if (rows && rows.length > 0) {
      const { error: copyErr } = await locals.supabase.from(table).insert(payload(rows));
      if (copyErr) console.error(`copy ${table} failed:`, copyErr);
    }
  }

  // 4. Audit
  await locals.supabase.from('order_activity_log').insert([
    {
      order_id: orig.id,
      actor_id: actor.id,
      event_type: 'voided',
      payload: { reason, retired_po: retiredPo, reissued_as: clone.id },
    },
    {
      order_id: clone.id,
      actor_id: actor.id,
      event_type: 'reissued',
      payload: { reissued_from: orig.id, retired_po: retiredPo },
    },
  ]).then(({ error }) => { if (error) console.error('activity_log insert failed:', error); });

  return json({
    ok: true,
    voidedId: orig.id,
    retiredPoNumber: retiredPo,
    reissuedId: clone.id,
    reissuedInternalRef: clone.internal_ref,
    reissuedStatus: clone.status,
  });
};
