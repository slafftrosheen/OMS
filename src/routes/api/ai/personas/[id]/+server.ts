// PATCH  /api/ai/personas/[id]  — update a user-owned template
// DELETE /api/ai/personas/[id]  — delete a user-owned template

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as kitError } from '@sveltejs/kit';
import type { PersonaTemplate } from '../+server';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw kitError(401, 'Authentication required');
    }

    const userId = locals.user.id;
    const db = locals.supabase;
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

    // RLS handles ownership, but we use eq('user_id', userId) for extra safety
    const { data, error } = await db
        .from('user_persona_templates')
        .update(updates)
        .eq('id', params.id!)
        .eq('user_id', userId)
        .eq('is_global', false)
        .select()
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') throw kitError(404, 'Template not found or not owned by you');
        throw kitError(500, error.message);
    }

    return json({ template: data as PersonaTemplate });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw kitError(401, 'Authentication required');
    }

    const userId = locals.user.id;
    const db = locals.supabase;

    const { error } = await db
        .from('user_persona_templates')
        .delete()
        .eq('id', params.id!)
        .eq('user_id', userId)
        .eq('is_global', false);
    
    if (error) throw kitError(500, error.message);

    return new Response(null, { status: 204 });
};
