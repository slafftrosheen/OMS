// POST /api/ai/sessions/[id]/messages — append a user message and stream the
// assistant's reply. Persists both messages, embeds them, runs the tool loop,
// records an ai_runs row, and returns NDJSON streaming chunks compatible with
// the existing AI Lab chat UI.

import type { RequestHandler } from '@sveltejs/kit';
import { error as kitError } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    MODEL,
    AILAB
} from '$lib/server/config';
import { swarmChat, swarmEmbed } from '$lib/server/ai/swarm';
import {
    loadToolDefinitions,
    findToolBySchemaName,
    executeTool
} from '$lib/server/ai/tools-registry';
import { searchKnowledge } from '$lib/server/ai/tools-registry/knowledge-search';
import { logger } from '$lib/server/logging/logger';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    images?: string[];
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

const SYSTEM_PROMPT = `You are Reclame AI, the in-house assistant for Réclame Fabriek.
You can call tools to search the company knowledge base, find similar past
projects, suggest CNC feeds & speeds, match paint colours, and read live OMS
data. Always cite knowledge-base hits as [title, p.<page>] when you use them.
Speak concisely. Never invent feeds/speeds — call the tool and report results.
Default language is the user's last language unless asked otherwise.`;

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const sid = params.id;
    if (!sid) throw kitError(400, 'id required');
    if (!AILAB.chat) throw kitError(404, 'chat disabled');

    const body = (await request.json().catch(() => null)) as {
        content?: string;
        images?: string[];
        persona?: string;
        cap?: 'reasoning' | 'vision' | 'coder';
    } | null;
    if (!body?.content) throw kitError(400, 'content required');

    const db = admin();
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;

    // Load session for persona/model overrides.
    const { data: sessionRow, error: sErr } = await db
        .from('chat_sessions')
        .select('id,model,persona')
        .eq('id', sid)
        .single();
    if (sErr) throw kitError(404, sErr.message);

    // Load history (last 30 messages, ordered).
    const { data: history } = await db
        .from('chat_messages')
        .select('role,content,tool_calls,tool_name')
        .eq('session_id', sid)
        .order('created_at', { ascending: false })
        .limit(30);
    const recent = ((history ?? []) as OllamaMessage[]).reverse();

    // Embed and persist user message.
    const userEmbed = await swarmEmbed(body.content, MODEL.embed).catch(() => null);
    await db.from('chat_messages').insert({
        session_id: sid,
        role: 'user',
        content: body.content,
        embedding: userEmbed?.vector
    });

    // Light RAG bootstrap: prefetch top knowledge hits to inject as context.
    let citations: Array<{ source_id: string; title: string; page: number | null; score: number }> = [];
    let ragBlock = '';
    try {
        const kb = await searchKnowledge({ query: body.content, top_k: AILAB.knowledge_topk });
        citations = kb.hits.map((h) => ({
            source_id: h.source_id,
            title: h.title,
            page: h.page,
            score: h.score
        }));
        if (kb.hits.length > 0) {
            ragBlock = '\n\n[Relevant knowledge]\n' + kb.hits
                .slice(0, AILAB.knowledge_rerankTopN)
                .map((h, i) => `(${i + 1}) ${h.title}${h.page ? ` p.${h.page}` : ''}\n${h.content.slice(0, 1200)}`)
                .join('\n\n');
        }
    } catch (err) {
        logger.warn('RAG prefetch failed', err as Error);
    }

    const persona = body.persona ?? (sessionRow as { persona?: string }).persona ?? '';
    const sysPrompt = `${SYSTEM_PROMPT}${persona ? `\n\nPersona: ${persona}` : ''}${ragBlock}`;

    const messages: OllamaMessage[] = [
        { role: 'system', content: sysPrompt },
        ...recent,
        { role: 'user', content: body.content, images: body.images }
    ];

    const tools = await loadToolDefinitions().catch(() => []);
    const cap = body.cap ?? (body.images && body.images.length > 0 ? 'vision' : 'reasoning');
    const modelTag = body.images && body.images.length > 0
        ? MODEL.vision
        : ((sessionRow as { model?: string }).model
            ? { primary: (sessionRow as { model: string }).model, fallback: MODEL.chat.fallback }
            : MODEL.chat);

    const startedAt = new Date();
    const runIns = await db
        .from('ai_runs')
        .insert({
            kind: 'chat',
            status: 'running',
            user_id: userId,
            session_id: sid,
            model: modelTag.primary,
            input: { content: body.content, images: body.images?.length ?? 0 },
            started_at: startedAt.toISOString()
        })
        .select('id')
        .single();
    const runId = (runIns.data as { id: string } | null)?.id ?? null;

    // Tool-call loop (up to 3 hops).
    const toolMessages: OllamaMessage[] = [];
    let finalText = '';
    let nodeLabel: string | null = null;
    let usedModel = modelTag.primary;

    for (let hop = 0; hop < 3; hop++) {
        const r = await swarmChat({
            cap,
            model: modelTag,
            stream: false,
            messages: [...messages, ...toolMessages],
            tools,
            temperature: 0.5
        });
        nodeLabel = r.node.label;
        usedModel = r.model;
        const j = (await r.response.json()) as {
            message?: {
                role: string;
                content?: string;
                tool_calls?: Array<{
                    function: { name: string; arguments: Record<string, unknown> };
                }>;
            };
        };
        const m = j.message;
        if (!m) break;

        if (m.tool_calls && m.tool_calls.length > 0) {
            // Persist the assistant tool-call message and execute each call.
            await db.from('chat_messages').insert({
                session_id: sid,
                role: 'assistant',
                content: m.content ?? '',
                tool_calls: m.tool_calls,
                model: usedModel,
                node_label: nodeLabel
            });
            toolMessages.push({
                role: 'assistant',
                content: m.content ?? '',
                tool_calls: m.tool_calls
            });
            for (const call of m.tool_calls) {
                const tool = await findToolBySchemaName(call.function.name);
                if (!tool) {
                    toolMessages.push({
                        role: 'tool',
                        content: JSON.stringify({ error: `unknown tool ${call.function.name}` })
                    });
                    continue;
                }
                let result: unknown;
                try {
                    result = await executeTool(tool.slug, call.function.arguments, { userId: userId ?? undefined });
                } catch (err) {
                    result = { error: (err as Error).message };
                }
                await db.from('chat_messages').insert({
                    session_id: sid,
                    role: 'tool',
                    tool_name: tool.slug,
                    content: JSON.stringify(result).slice(0, 64_000)
                });
                toolMessages.push({
                    role: 'tool',
                    content: JSON.stringify(result)
                });
            }
            continue;
        }

        finalText = m.content ?? '';
        break;
    }

    if (!finalText) finalText = '(no response)';

    const finalEmbed = await swarmEmbed(finalText, MODEL.embed).catch(() => null);
    await db.from('chat_messages').insert({
        session_id: sid,
        role: 'assistant',
        content: finalText,
        model: usedModel,
        node_label: nodeLabel,
        citations,
        embedding: finalEmbed?.vector,
        latency_ms: Date.now() - startedAt.getTime()
    });
    await db.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sid);
    if (runId) {
        await db
            .from('ai_runs')
            .update({
                status: 'done',
                node_label: nodeLabel,
                model: usedModel,
                output: { citations },
                cost_seconds: (Date.now() - startedAt.getTime()) / 1000,
                finished_at: new Date().toISOString()
            })
            .eq('id', runId);
    }

    // Stream-style response (single chunk for simplicity; UI handles both).
    return new Response(
        JSON.stringify({
            ok: true,
            content: finalText,
            citations,
            model: usedModel,
            node: nodeLabel
        }),
        { headers: { 'Content-Type': 'application/json' } }
    );
};
