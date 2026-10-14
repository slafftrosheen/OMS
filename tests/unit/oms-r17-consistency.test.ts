import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {splitVersionedOrderPayload} from '../../src/lib/server/order/edit-version';
const read=(p:string)=>readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261014000001_order_edit_concurrency_and_audit.sql');

describe('OMS-R17 consistency and audit boundaries',()=>{
  it('rejects invalid revisions and strips the revision control field',()=>{
    expect(splitVersionedOrderPayload(null)).toBeNull();
    expect(splitVersionedOrderPayload({clientName:'A'})).toBeNull();
    expect(splitVersionedOrderPayload({expectedUpdatedAt:'yesterday'})).toBeNull();
    expect(splitVersionedOrderPayload({
      expectedUpdatedAt:'2026-10-14T10:00:01.123456+00:00',clientName:'A'
    })).toEqual({expectedUpdatedAt:'2026-10-14T10:00:01.123456+00:00',form:{clientName:'A'}});
  });
  it('locks the order and checks revision before form/profile writes',()=>{
    const lock=sql.indexOf('WHERE id = p_order_id FOR UPDATE');
    const compare=sql.indexOf('v_current.updated_at IS DISTINCT FROM p_expected_updated_at');
    const save=sql.indexOf('RETURN public.oms_update_draft_form(p_order_id,p_fields,p_profiles)');
    expect(lock).toBeGreaterThan(0);
    expect(compare).toBeGreaterThan(lock);
    expect(save).toBeGreaterThan(compare);
  });
  it('requires revision on PUT/PATCH and checks confirmed metadata',()=>{
    const route=read('src/routes/api/draft-orders/[id]/+server.ts');
    expect(route.match(/splitVersionedOrderPayload\(raw\)/g)).toHaveLength(2);
    expect(route.match(/p_expected_updated_at: versioned.expectedUpdatedAt/g)).toHaveLength(2);
    expect(route).toContain(".eq('updated_at',versioned.expectedUpdatedAt)");
  });
  it('preserves editor and upload retry version tokens',()=>{
    expect(read('src/routes/orders/[id]/edit/+page.svelte')).toContain('expectedUpdatedAt: orderUpdatedAt');
    const fresh=read('src/routes/orders/new/+page.svelte');
    expect(fresh).toContain('savedOrderUpdatedAt = orderResult.order?.updated_at');
    expect(fresh).toContain('expectedUpdatedAt:savedOrderUpdatedAt');
  });
  it('labels all UI events and rejects audit fabrication',()=>{
    const route=read('src/routes/api/audit-log/+server.ts');
    expect(route).toContain("rpc('oms_log_client_event'");
    expect(route).not.toContain("rpc('create_audit_log'");
    expect(route).toContain('MANAGEMENT_ROLES.has(actor.role)');
    expect(sql).toContain("'ui:'||p_action");
    expect(sql).toContain('v_actor UUID := auth.uid()');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_audit_log');
  });
  it('localizes concurrency warnings',()=>{
    for(const lang of ['en','ru','lv'])
      expect(JSON.parse(read('src/locales/'+lang+'.json')).orderWorkspace.staleSave.length)
        .toBeGreaterThan(70);
  });
});
