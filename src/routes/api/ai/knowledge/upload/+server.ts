// POST /api/ai/knowledge/upload  — multi-file knowledge upload.
//
// Accepts multipart/form-data with one or more `file` entries plus optional
// `tags` and `visibility`. Stores binaries in the `knowledge` bucket and
// inserts a row per file into `knowledge_sources` with status='queued'.
// The ingestor worker picks them up from there.

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    BUCKET,
    AILAB
} from '$lib/server/config';

const KIND_BY_MIME: Array<[RegExp, string]> = [
    [/^text\//, 'text'],
    [/^image\//, 'image'],
    [/^audio\//, 'audio'],
    [/^video\//, 'video'],
    [/^application\/pdf$/, 'pdf'],
    [/^application\/(zip|x-zip-compressed)$/, 'office'],
    [/^application\/(msword|vnd\.openxmlformats|vnd\.ms-)/, 'office'],
    [/^application\/dxf$|application\/octet-stream/, 'cad']
];

function kindFor(mime: string): string {
    for (const [re, k] of KIND_BY_MIME) if (re.test(mime)) return k;
    return 'text';
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!AILAB.knowledge) return json({ error: 'AI Lab knowledge disabled' }, { status: 404 });
    const form = await request.formData();
    const files = form.getAll('file').filter((v): v is File => v instanceof File);
    const tags = String(form.get('tags') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const visibility = (String(form.get('visibility') ?? 'team') as 'private' | 'team' | 'global');
    const textContent = form.get('text');

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const uploaderId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    const out: Array<Record<string, unknown>> = [];

    // Plain text submission (no file).
    if (typeof textContent === 'string' && textContent.trim()) {
        const title = String(form.get('title') ?? 'Pasted note');
        const ins = await db
            .from('knowledge_sources')
            .insert({
                title,
                kind: 'text',
                status: 'queued',
                visibility,
                mime_type: 'text/plain',
                tags,
                uploader_id: uploaderId,
                metadata: { text_content: textContent }
            })
            .select('id,title,status')
            .single();
        if (ins.error) return json({ error: ins.error.message }, { status: 500 });
        out.push(ins.data as Record<string, unknown>);
    }

    for (const file of files) {
        if (file.size > AILAB.knowledge_maxFileMb * 1024 * 1024) {
            out.push({ skipped: file.name, reason: 'file too large' });
            continue;
        }
        const buf = new Uint8Array(await file.arrayBuffer());
        const safe = file.name.replace(/[^\w.\-]+/g, '_');
        const key = `${crypto.randomUUID()}/${safe}`;

        const up = await db.storage.from(BUCKET.knowledge).upload(key, buf, {
            contentType: file.type || 'application/octet-stream',
            upsert: false
        });
        if (up.error) {
            out.push({ skipped: file.name, reason: up.error.message });
            continue;
        }

        const ins = await db
            .from('knowledge_sources')
            .insert({
                title: file.name,
                kind: kindFor(file.type || ''),
                status: 'queued',
                visibility,
                storage_key: key,
                mime_type: file.type || null,
                size_bytes: file.size,
                tags,
                uploader_id: uploaderId,
                metadata: {}
            })
            .select('id,title,status,kind')
            .single();
        if (ins.error) {
            out.push({ skipped: file.name, reason: ins.error.message });
            continue;
        }
        out.push(ins.data as Record<string, unknown>);
    }

    return json({ ok: true, items: out });
};
