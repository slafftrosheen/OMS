
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';
import fs from 'fs';
import path from 'path';

function db() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

const SKETCH_DIR = '/opt/reclame-oms/ai-lab/sketches';

export const GET: RequestHandler = async () => {
    const { data, error } = await db()
        .from('maker_sketches')
        .select('id,title,description,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ items: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const body = (await request.json().catch(() => ({}))) as { title?: string; code?: string; params?: unknown };
    const userId = (locals.user)?.id ?? null;
    const { data, error } = await db()
        .from('maker_sketches')
        .insert({
            title: body.title ?? 'Untitled sketch',
            code: body.code ?? 'var makerjs = require("makerjs");\n\nmodule.exports = {\n  paths: {\n    line: new makerjs.paths.Line([0, 0], [100, 100])\n  }\n};',
            params: body.params ?? {},
            user_id: userId
        })
        .select('*')
        .single();
    
    if (error) return json({ error: error.message }, { status: 500 });

    // Sync to disk for agent access
    if (data && data.code) {
        try {
            if (!fs.existsSync(SKETCH_DIR)) fs.mkdirSync(SKETCH_DIR, { recursive: true });
            const fileName = `${data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${data.id.slice(0, 8)}.js`;
            const filePath = path.join(SKETCH_DIR, fileName);
            fs.writeFileSync(filePath, data.code);
            fs.writeFileSync(`${filePath}.json`, JSON.stringify({
                id: data.id,
                title: data.title,
                description: data.description,
                updated_at: data.updated_at
            }, null, 2));
        } catch (e) {
            console.error('Failed to sync sketch to disk:', e);
        }
    }

    return json({ sketch: data });
};

export const DELETE: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id required' }, { status: 400 });

    // Optional: delete from disk too?
    // For now keep disk as a "log" or "archive" of ideas.

    const { error } = await db().from('maker_sketches').delete().eq('id', id);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
};
