// User-scoped maker tools. Automatic AI sessions are read-only: saving a sketch
// requires the ordinary maker UI and user confirmation.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listSketches(db: SupabaseClient) {
    const { data, error } = await db.from('maker_sketches')
        .select('id,title,description,updated_at')
        .order('updated_at', { ascending: false }).limit(100);
    if (error) throw new Error('Sketches are unavailable or access is denied');
    return data ?? [];
}

export async function readSketch(db: SupabaseClient, id: string) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('A valid sketch UUID is required');
    const { data, error } = await db.from('maker_sketches')
        .select('id,title,description,code,updated_at').eq('id', id).maybeSingle();
    if (error) throw new Error('Sketch is unavailable or access is denied');
    if (!data) throw new Error('Sketch not found');
    return data;
}

export async function saveSketch(_db: SupabaseClient, _id: string | null, _title: string, _code: string, _description?: string): Promise<never> {
    throw new Error('AI cannot save a sketch autonomously; review and save it from the Maker UI.');
}
