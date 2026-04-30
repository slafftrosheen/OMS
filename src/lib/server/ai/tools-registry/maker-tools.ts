
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../../config';

function db() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

/**
 * List all technical sketches
 */
export async function listSketches() {
    const { data, error } = await db()
        .from('maker_sketches')
        .select('id, title, description, updated_at')
        .order('updated_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Read a technical sketch by ID
 */
export async function readSketch(id: string) {
    const { data, error } = await db()
        .from('maker_sketches')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Create or update a technical sketch
 */
export async function saveSketch(id: string | null, title: string, code: string, description?: string) {
    const payload = {
        title,
        code,
        description,
        updated_at: new Date().toISOString()
    };

    if (id) {
        const { data, error } = await db()
            .from('maker_sketches')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    } else {
        const { data, error } = await db()
            .from('maker_sketches')
            .insert(payload)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }
}
