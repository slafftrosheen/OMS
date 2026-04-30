// POST /api/ai/sessions/[id]/messages — append a user message and run the
// assistant reply pipeline:
//   1. Embed user message (bge-m3).
//   2. Dual RAG: text search (bge-m3) + vision search (ColQwen2) merged.
//   3. Load persona template → filter available tools + inject prompt addon.
//   4. Tool-call loop (up to 3 hops).
//   5. Embed + persist assistant reply, update ai_runs.

import type { RequestHandler } from '@sveltejs/kit';
import { error as kitError } from '@sveltejs/kit';
import {
    MODEL,
    AILAB
} from '$lib/server/config';
import { swarmChat, swarmEmbed } from '$lib/server/ai/swarm';
import {
    loadToolDefinitions,
    findToolBySchemaName,
    executeTool
} from '$lib/server/ai/tools-registry';
import { searchKnowledge, searchKnowledgeImage } from '$lib/server/ai/tools-registry/knowledge-search';
import { logger } from '$lib/server/logging/logger';

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    images?: string[];
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

interface PersonaTemplate {
    id: string;
    name: string;
    system_prompt_addon: string | null;
    tool_slugs: string[];
    model_override: string | null;
    voice: string;
}

const BASE_SYSTEM_PROMPT = `You are Reclame AI, the in-house assistant for Réclame Fabriek.
You can call tools to search the company knowledge base, find similar past
projects, suggest CNC feeds & speeds, match paint colours, and read live OMS
data. Always cite knowledge-base hits as [title, p.<page>] when you use them.
Speak concisely. Never invent feeds/speeds — call the tool and report results.
Default language is the user's last language unless asked otherwise.`;

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw kitError(401, 'Unauthorized');
    }

    const sid = params.id;
    if (!sid) throw kitError(400, 'id required');
    if (!AILAB.chat) throw kitError(404, 'chat disabled');

    const body = (await request.json().catch(() => null)) as {
        content?: string;
        images?: string[];
        persona?: string;
        persona_template_id?: string;
        cap?: 'reasoning' | 'vision' | 'coder';
    } | null;
    if (!body?.content) throw kitError(400, 'content required');

    const db = locals.supabase;
    const userId = locals.user.id;

    // Load session (persona slug + model override + template FK).
    // Using locals.supabase enforces RLS (auth.uid() = user_id)
    const { data: sessionRow, error: sErr } = await db
        .from('ai_chat_sessions')
        .select('id,model,persona,persona_template_id')
        .eq('id', sid)
        .single();
    
    if (sErr) {
        logger.error('Failed to load session', { sid, userId, error: sErr.message });
        throw kitError(404, 'Session not found or access denied');
    }

    // Resolve persona template (request body > session FK > null).
    const templateId: string | null =
        body.persona_template_id ??
        (sessionRow as { persona_template_id?: string }).persona_template_id ??
        null;

    let personaTemplate: PersonaTemplate | null = null;
    if (templateId) {
        // user_persona_templates also should have RLS
        const { data: tmpl } = await db
            .from('user_persona_templates')
            .select('id,name,system_prompt_addon,tool_slugs,model_override,voice')
            .eq('id', templateId)
            .single();
        personaTemplate = (tmpl as PersonaTemplate | null);
    }

    // Load history (last 30 messages).
    const { data: history } = await db
        .from('ai_chat_messages')
        .select('role,content,tool_calls,tool_name')
        .eq('session_id', sid)
        .order('created_at', { ascending: false })
        .limit(30);
    const recent = ((history ?? []) as OllamaMessage[]).reverse();

    // Embed + persist user message.
    const userEmbed = await swarmEmbed(body.content, MODEL.embed).catch(() => null);
    await db.from('ai_chat_messages').insert({
        session_id: sid,
        role: 'user',
        content: body.content,
        embedding: userEmbed?.vector
    });

    // ── Dual RAG: text + vision (ColQwen2) ─────────────────────────────────
    let citations: Array<{ source_id: string; title: string; page: number | null; score: number }> = [];
    let ragBlock = '';
    try {
        // Run both retrievers in parallel; image search fails gracefully.
        const [textResult, imageHits] = await Promise.all([
            searchKnowledge({ query: body.content, top_k: AILAB.knowledge_topk }),
            searchKnowledgeImage(body.content, Math.ceil(AILAB.knowledge_topk / 2))
        ]);

        // Merge + deduplicate by source_id:page. Text hits lead; vision fills gaps.
        const seen = new Set<string>();
        const allHits = [...textResult.hits, ...imageHits].filter((h) => {
            const key = `${h.source_id}:${h.page ?? 0}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => b.score - a.score).slice(0, AILAB.knowledge_topk);

        citations = allHits.map((h) => ({
            source_id: h.source_id,
            title: h.title,
            page: h.page,
            score: h.score
        }));

        if (allHits.length > 0) {
            ragBlock = '\n\n[Relevant knowledge]\n' + allHits
                .slice(0, AILAB.knowledge_rerankTopN)
                .map((h, i) => {
                    const origin = imageHits.some((ih) => ih.chunk_id === h.chunk_id)
                        ? ' [visual]' : '';
                    return `(${i + 1}) ${h.title}${h.page ? ` p.${h.page}` : ''}${origin}\n${h.content.slice(0, 1200)}`;
                })
                .join('\n\n');
        }
    } catch (err) {
        logger.warn('RAG prefetch failed', err as Error);
    }

    // ── Build system prompt ─────────────────────────────────────────────────
    const legacyPersona = body.persona ?? (sessionRow as { persona?: string }).persona ?? '';
    let sysPrompt = BASE_SYSTEM_PROMPT;
    if (personaTemplate?.system_prompt_addon) {
        sysPrompt += `\n\n${personaTemplate.system_prompt_addon}`;
    } else if (legacyPersona) {
        sysPrompt += `\n\nPersona: ${legacyPersona}`;
    }
    sysPrompt += ragBlock;

    const messages: OllamaMessage[] = [
        { role: 'system', content: sysPrompt },
        ...recent,
        { role: 'user', content: body.content, images: body.images }
    ];

    // ── Tool definitions — optionally filtered by persona template ──────────
    let allTools = await loadToolDefinitions().catch(() => []);
    if (personaTemplate && personaTemplate.tool_slugs.length > 0) {
        // Template specifies an explicit allow-list.
        const allowed = new Set(personaTemplate.tool_slugs);
        // loadToolDefinitions returns ToolDef[]; we need to re-fetch rows to
        // cross-reference by slug. Quick workaround: filter by schema.name via
        // the DB-backed list.
        const { listTools } = await import('$lib/server/ai/tools-registry');
        const rows = await listTools();
        const allowedSchemaNames = new Set(
            rows.filter((r) => allowed.has(r.slug)).map((r) => r.schema.name)
        );
        allTools = allTools.filter((t) => allowedSchemaNames.has(t.function.name));
    }

    // ── Model selection ─────────────────────────────────────────────────────
    const cap = body.cap ?? (body.images && body.images.length > 0 ? 'vision' : 'reasoning');
    const modelTag =
        body.images && body.images.length > 0
            ? MODEL.vision
            : personaTemplate?.model_override
                ? { primary: personaTemplate.model_override, fallback: MODEL.chat.fallback }
                : (sessionRow as { model?: string }).model
                    ? { primary: (sessionRow as { model: string }).model, fallback: MODEL.chat.fallback }
                    : MODEL.chat;

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

    // ── Tool-call loop (up to 3 hops) ───────────────────────────────────────
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
            tools: allTools,
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
            await db.from('ai_chat_messages').insert({
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
                await db.from('ai_chat_messages').insert({
                    session_id: sid,
                    role: 'tool',
                    tool_name: tool.slug,
                    content: JSON.stringify(result).slice(0, 64_000)
                });
                toolMessages.push({ role: 'tool', content: JSON.stringify(result) });
            }
            continue;
        }

        finalText = m.content ?? '';
        break;
    }

    if (!finalText) finalText = '(no response)';

    const finalEmbed = await swarmEmbed(finalText, MODEL.embed).catch(() => null);
    await db.from('ai_chat_messages').insert({
        session_id: sid,
        role: 'assistant',
        content: finalText,
        model: usedModel,
        node_label: nodeLabel,
        citations,
        embedding: finalEmbed?.vector,
        latency_ms: Date.now() - startedAt.getTime()
    });
    await db.from('ai_chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sid);
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

    return new Response(
        JSON.stringify({
            ok: true,
            content: finalText,
            citations,
            model: usedModel,
            node: nodeLabel,
            persona_template: personaTemplate ? { id: personaTemplate.id, name: personaTemplate.name } : null
        }),
        { headers: { 'Content-Type': 'application/json' } }
    );
};
