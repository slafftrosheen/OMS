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
 * endpoint (which honours RLS), then sent to Ollama with a strict JSON-only
 * system prompt.  Caller is responsible for applying the patch to the Svelte
 * orderState.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ollamaComplete } from '$lib/server/ai/ollama-client';
import { swarmChat } from '$lib/server/ai/swarm';
import { MODEL } from '$lib/server/config';

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

    // Look up storage_key for the uploaded file
    const { data: file, error: fileError } = await locals.supabase
        .from('order_files')
        .select('storage_key, mime_type, file_name')
        .eq('id', body.fileId)
        .single();

    if (fileError || !file) {
        return json({ error: 'File not found' }, { status: 404 });
    }

    if (file.mime_type !== 'application/pdf') {
        return json({ error: `Unsupported MIME type: ${file.mime_type}` }, { status: 415 });
    }

    let pdfText: string;
    try {
        pdfText = await fetchPdfText(locals.supabase, file.storage_key);
    } catch (err: any) {
        console.error('[extract-pdf] PDF fetch error:', err);
        return json({ error: err.message ?? 'Failed to read PDF' }, { status: 500 });
    }

    if (!pdfText.trim()) {
        return json({ error: 'PDF appears to contain no extractable text' }, { status: 422 });
    }

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Order PO file: ${file.file_name}\n\nExtracted text:\n${pdfText.slice(0, 12000)}` },
    ];

    try {
        let raw: string;
        try {
            const result = await swarmChat({
                model: MODEL.chat,
                messages,
                stream: false,
                cap: 'reasoning',
            });
            if (result.response.ok) {
                const data = await result.response.json();
                raw = data?.message?.content ?? '';
            } else {
                throw new Error(`Swarm response ${result.response.status}`);
            }
        } catch {
            raw = await ollamaComplete(messages as any);
        }

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
