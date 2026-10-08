/**
 * POST /api/ai/canvas/extract-pdf
 * Phase 8: parse a previously-uploaded PDF (referenced by file id from
 * order_files) and extract candidate Order/Address/Profile fields.
 *
 * Body: { fileId: string, orderId: string }
 *
 * Response: {
 *   details?: { title?, clientName?, deadline?, notes?, priority? },
 *   address?: { deliveryAddress?, deliveryContact?, deliveryPhone?, deliveryEmail? },
 *   profile?: any
 * }
 *
 * The PDF text is fetched from the existing /api/files/[fileId]/download
 * endpoint (which honours RLS), then sent to OpenRouter with a strict JSON-only
 * system prompt.  Caller is responsible for applying the patch to the Svelte
 * orderState.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { openRouterComplete } from '$lib/server/ai/openrouter';

const SYSTEM_PROMPT = `You extract structured order data from a purchase-order PDF's text.

Return ONLY valid JSON (no fences, no prose) with this shape — omit any field
whose value is unknown rather than guessing:

{
  "details": {
    "title": string?,
    "clientName": string?,
    "poNumber": string?,
    "deadline": "YYYY-MM-DD"?,
    "loadingDate": "YYYY-MM-DD"?,
    "priority": "LOW" | "NORMAL" | "HIGH" | "URGENT"?,
    "notes": string?
  },
  "address": {
    "deliveryAddress": string?,
    "deliveryContact": string?,
    "deliveryPhone": string?,
    "deliveryEmail": string?,
    "shippingMethod": string?
  },
  "profile": {
    "profileName": string?,
    "quantity": number?
  }
}`;

async function fetchPdfText(supabase: any, storagePath: string): Promise<string> {
    // Try Supabase Storage first
    const { data, error } = await supabase.storage.from('files').download(storagePath);
    if (error || !data) {
        throw new Error(`Could not download PDF: ${error?.message ?? 'not found'}`);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    // Use pdf-parse if available, otherwise return a base-64 fallback marker
    try {
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(buf);
        return result.text ?? '';
    } catch (err) {
        console.warn('pdf-parse not available, returning truncated raw text', err);
        // Best-effort: extract printable ASCII chunks from the binary
        return buf.toString('latin1').replace(/[^\x20-\x7E\n]+/g, ' ').slice(0, 8000);
    }
}

function tryParseJson(text: string): any {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = (fenced ? fenced[1] : text).trim();
    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.fileId !== 'string') {
        return json({ error: 'fileId required' }, { status: 400 });
    }

    // File reference: the FE passes file IDs via fileId (files.id), not the junction row id.
    // Look up the actual file metadata (storage_key, mimetype, filename) through the files table,
    // using the junction (order_files) only to verify linkage and resolve display details.
    const { data: link, error: linkError } = await locals.supabase
        .from('order_files')
        .select('draft_order_id, file_type, display_name, file_id')
        .eq('file_id', body.fileId)
        .eq('draft_order_id', body.orderId || null)
        .single();
    if (linkError || !link) {
        return json({ error: 'File link not found for fileId=' + body.fileId }, { status: 404 });
    }

    const { data: fileRow, error: fileErr } = await locals.supabase
        .from('files')
        .select('id, filename, original_name, filepath, mimetype, storage_key, metadata, created_at')
        .eq('id', link.file_id)
        .single();
    if (fileErr || !fileRow) {
        return json({ error: 'File metadata not found for file_id=' + link.file_id }, { status: 404 });
    }

    // The file's display info is from the files table; junction display_name is a fallback.
    const displayFileName = link.display_name || fileRow.filename || fileRow.original_name || 'unnamed';

    // Storage key for download: prefer files.filepath; fall back to files.metadata.storage_key.
    const fileStorageKey = fileRow.filepath || (fileRow.metadata && typeof fileRow.metadata === 'object' ? fileRow.metadata.storage_key : null);

    // Use the storage_key directly (not mimetype from junction) to fetch PDF text.
    if (fileRow.mimetype !== 'application/pdf') {
        return json({ error: `Unsupported MIME type: ${fileRow.mimetype}` }, { status: 415 });
    }

    let pdfText: string;
    try {
        if (!fileStorageKey) {
            return json({ error: 'File has no storage path; file may not have been fully uploaded' }, { status: 422 });
        }
        pdfText = await fetchPdfText(locals.supabase, fileStorageKey);
    } catch (err: any) {
        console.error('[extract-pdf] PDF fetch error:', err);
        return json({ error: err.message ?? 'Failed to read PDF' }, { status: 500 });
    }

    if (!pdfText.trim()) {
        return json({ error: 'PDF appears to contain no extractable text' }, { status: 422 });
    }

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Order PO file: ${displayFileName}\n\nExtracted text:\n${pdfText.slice(0, 12000)}` },
    ];

    try {
        const raw = await openRouterComplete(messages as any, { jsonMode: true, maxTokens: 1600 });

        const parsed = tryParseJson(raw);
        if (!parsed || typeof parsed !== 'object') {
            return json({ error: 'AI did not return valid JSON', raw }, { status: 502 });
        }

        return json(parsed);
    } catch (err: any) {
        console.error('[/api/ai/canvas/extract-pdf] error:', err);
        return json({ error: err.message ?? 'AI unavailable' }, { status: 503 });
    }
};
