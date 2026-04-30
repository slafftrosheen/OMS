
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

export const GET: RequestHandler = async ({ params }) => {
    const { data, error } = await db()
        .from('maker_sketches')
        .select('*')
        .eq('id', params.id)
        .single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ sketch: data });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    const body = await request.json();
    const { data, error } = await db()
        .from('maker_sketches')
        .update({
            title: body.title,
            description: body.description,
            code: body.code,
            params: body.params,
            updated_at: new Date().toISOString()
        })
        .eq('id', params.id)
        .select()
        .single();
    
    if (error) return json({ error: error.message }, { status: 500 });

    // Sync to disk for agent access
    if (data && data.code) {
        try {
            if (!fs.existsSync(SKETCH_DIR)) fs.mkdirSync(SKETCH_DIR, { recursive: true });
            const fileName = `${data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${params.id.slice(0, 8)}.js`;
            const filePath = path.join(SKETCH_DIR, fileName);
            fs.writeFileSync(filePath, data.code);
            
            // Also write a metadata file
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
