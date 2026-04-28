// PATCH  /api/ai/personas/[id]  — update a user-owned template
// DELETE /api/ai/personas/[id]  — delete a user-owned template

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as kitError } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';
import type { PersonaTemplate } from '../+server';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

async function loadOwned(id: string, userId: string): Promise<PersonaTemplate | null> {
    const db = admin();
    const { data } = await db
        .from('user_persona_templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .eq('is_global', false)
        .single();
    return (data as PersonaTemplate | null);
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    if (!userId) throw kitError(401, 'Authentication required');

    const existing = await loadOwned(params.id!, userId);
    if (!existing) throw kitError(404, 'Template not found or not owned by you');

    const body = (await request.json().catch(() => null)) as Partial<PersonaTemplate> | null;
    if (!body) throw kitError(400, 'body required');

    const updates: Partial<PersonaTemplate> = {};
    if (body.name !== undefined)               updates.name = body.name.trim();
    if (body.description !== undefined)        updates.description = body.description;
    if (body.icon !== undefined)               updates.icon = body.icon;
    if (body.color !== undefined)              updates.color = body.color;
    if (body.system_prompt_addon !== undefined) updates.system_prompt_addon = body.system_prompt_addon;
    if (body.tool_slugs !== undefined)         updates.tool_slugs = Array.isArray(body.tool_slugs) ? body.tool_slugs : [];
    if (body.model_override !== undefined)     updates.model_override = body.model_override;
    if (body.voice !== undefined)              updates.voice = body.voice;

    const db = admin();
    const { data, error } = await db
        .from('user_persona_templates')
        .update(updates)
        .eq('id', params.id!)
        .select()
        .single();
    if (error) throw kitError(500, error.message);

    return json({ template: data as PersonaTemplate });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    if (!userId) throw kitError(401, 'Authentication required');

    const existing = await loadOwned(params.id!, userId);
    if (!existing) throw kitError(404, 'Template not found or not owned by you');

    const db = admin();
    const { error } = await db
        .from('user_persona_templates')
        .delete()
        .eq('id', params.id!);
    if (error) throw kitError(500, error.message);

    return new Response(null, { status: 204 });
};
