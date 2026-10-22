import { describe, it, expect } from 'vitest';
import { ChatService } from './ChatService';

// Exercise the service against the established table contract. Unknown columns
// fail the same boundary as PostgREST; real RLS/persistence is checked separately.
function chatDatabase() {
  const fields = new Set(['id','room_id','order_id','user_id','text','content','attachments',
    'reply_to_id','is_edited','is_deleted','created_at','updated_at']);
  const rows: any[] = [];
  const db = {
    from(table: string) {
      let action = 'read', payload: any, columns = '*';
      const filters: Array<[string, unknown]> = [];
      const query: any = {
        select(value = '*') { columns = value; return query; },
        insert(value: any) { action = 'insert'; payload = value; return query; },
        update(value: any) { action = 'update'; payload = value; return query; },
        eq(key: string, value: unknown) { filters.push([key,value]); return query; },
        order() { return query; }, limit() { return query; }, lt() { return query; },
        async single() { const result = execute(); return { ...result, data: Array.isArray(result.data) ? result.data[0] : result.data }; },
        then(resolve: any, reject: any) { return Promise.resolve(execute()).then(resolve,reject); }
      };
      function execute(): any {
        if (table === 'profiles') return { data: { username:'Flow operator',role:'Operator' }, error:null };
        if (table === 'draft_orders') return { data: { created_by:'actor-1' }, error:null };
        if (table === 'order_assignees' || table === 'notifications') return { data: [], error:null };
        if (table !== 'chat_messages') return { data:null,error:{message:'Unexpected legacy relation'} };
        const keys = payload ? Object.keys(payload) : columns.replace(/profiles![^(]+\([^)]*\)/g,'').split(',').map(s=>s.trim()).filter(Boolean);
        const unknown = keys.find(k=>k!=='*'&&!fields.has(k));
        if (unknown) return { data:null,error:{message:'Unknown chat column: '+unknown} };
        if (action === 'insert') {
          const row = { id:'message-1',created_at:new Date().toISOString(),is_edited:false,is_deleted:false,...payload };
          rows.push(row);return {data:row,error:null};
        }
        const found = rows.filter(row=>filters.every(([key,value])=>row[key]===value));
        if (action === 'update') found.forEach(row=>Object.assign(row,payload));
        return { data:found.map(row=>({...row,profiles:{username:'Flow operator'}})),error:null };
      }
      return query;
    }
  };
  return {service:new ChatService(db as any),rows};
}

describe('chat canonical storage contract', () => {
  it('persists and reloads an order message with attachments and author', async () => {
    const {service,rows}=chatDatabase();
    const saved=await service.sendMessage('order-1','actor-1','  Sign is ready  ',['drawing.pdf']);
    expect(saved.message).toBe('Sign is ready');
    expect(rows[0].text).toBe('Sign is ready');
    expect(rows[0].content).toBe('Sign is ready');
    expect(rows[0].attachments).toEqual(['drawing.pdf']);
    const loaded=await service.getMessages('order-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].message).toBe('Sign is ready');
    expect(loaded[0].username).toBe('Flow operator');
  });

  it('edits canonical text and excludes soft-deleted messages', async () => {
    const {service,rows}=chatDatabase();
    await service.sendMessage('order-1','actor-1','Before');
    await service.editMessage('message-1','actor-1','After');
    expect(rows[0].content).toBe('After');
    expect(rows[0].text).toBe('After');
    expect(rows[0].is_edited).toBe(true);
    await service.deleteMessage('message-1','actor-1');
    expect(rows[0].is_deleted).toBe(true);
    expect(await service.getMessages('order-1')).toHaveLength(0);
  });

  it('rejects empty edits and edits by a different author', async () => {
    const {service}=chatDatabase();
    await service.sendMessage('order-1','actor-1','Before');
    await expect(service.editMessage('message-1','actor-1','  ')).rejects.toThrow();
    await expect(service.editMessage('message-1','actor-2','Changed')).rejects.toThrow('Unauthorized');
  });
});
