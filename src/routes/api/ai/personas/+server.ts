// GET  /api/ai/personas   — list global + caller's own templates
// POST /api/ai/personas   — create a new user-owned template

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as kitError } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

export interface PersonaTemplate {
    id: string;
    user_id: string | null;
    name: string;
    description: string | null;
    icon: string;
    color: string;
    system_prompt_addon: string | null;
    tool_slugs: string[];
    model_override: string | null;
    voice: string;
    is_global: boolean;
    created_at: string;
    updated_at: string;
}

export const GET: RequestHandler = async ({ locals }) => {
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    const db = admin();

    // Return global templates + user's own, ordered global-first then by name.
    let q = db
        .from('user_persona_templates')
        .select('*')
        .order('is_global', { ascending: false })
        .order('name');

    if (userId) {
        q = q.or(`is_global.eq.true,user_id.eq.${userId}`);
    } else {
        q = q.eq('is_global', true);
    }

    const { data, error } = await q;
    if (error) throw kitError(500, error.message);

    return json({ templates: (data ?? []) as PersonaTemplate[] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    if (!userId) throw kitError(401, 'Authentication required');

    const body = (await request.json().catch(() => null)) as Partial<PersonaTemplate> | null;
    if (!body?.name?.trim()) throw kitError(400, 'name required');

    const db = admin();
    const { data, error } = await db
        .from('user_persona_templates')
        .insert({
            user_id: userId,
            name: body.name.trim(),
            description: body.description ?? null,
            icon: body.icon ?? 'user',
            color: body.color ?? 'var(--brand)',
            system_prompt_addon: body.system_prompt_addon ?? null,
            tool_slugs: Array.isArray(body.tool_slugs) ? body.tool_slugs : [],
            model_override: body.model_override ?? null,
            voice: body.voice ?? 'af',
            is_global: false  // users cannot create global templates
        })
        .select()
        .single();
    if (error) throw kitError(500, error.message);

    return json({ template: data as PersonaTemplate }, { status: 201 });
};
