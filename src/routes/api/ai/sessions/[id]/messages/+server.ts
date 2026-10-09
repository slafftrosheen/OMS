// POST /api/ai/sessions/[id]/messages — append a user message and run the
// assistant reply pipeline:
//   1. Load persona template → filter available tools + inject prompt addon.
//   2. Tool-call loop (up to 3 hops) via OpenRouter.
//   3. Persist assistant reply, update ai_runs.

import type { RequestHandler } from '@sveltejs/kit';
import { error as kitError } from '@sveltejs/kit';
import { aiRateLimit, rateLimitIdentifier } from '$lib/server/api/helpers';
import { AILAB, OPENROUTER_MODEL, OPENROUTER_VISION_MODEL } from '$lib/server/config';
import { openRouterChat, parseToolArguments, type OpenRouterMessage } from '$lib/server/ai/openrouter';
import {
    listTools,
    executeTool
} from '$lib/server/ai/tools-registry';
import { logger } from '$lib/server/logging/logger';


interface PersonaTemplate {
    id: string;
    name: string;
    system_prompt_addon: string | null;
    tool_slugs: string[];
    model_override: string | null;
    voice: string;
}

const BASE_SYSTEM_PROMPT = `You are Reclame AI, the in-house assistant for Réclame Fabriek
— a creative-engineering signage shop that builds box letters, light boxes,
backlit displays, custom electronics (in-house LumiGrid PWM controllers,
addressable LED strips, Hub75 LED matrix displays) and traditional CNC-cut
acrylic / aluminium / dibond signage.

You can call tools to:
  • Knowledge base search and past-project RAG are unavailable in this deployment.
  • compute LumiGrid PWM channel plans, LED strip / matrix /
    box-letter electrical and luminance budgets                 (signage.lumigrid, signage.led_strip,
                                                                  signage.led_matrix, signage.boxletter)
  • CNC feeds & speeds for the materials we run                 (cnc.feeds_speeds)
  • match Pantone / RAL colours to in-stock paint               (paint.match)
  • search the Tailnet web + crawl single URLs for vendor specs (web.search, web.crawl)
  • read live OMS data (orders, inventory)                      (data.pending_orders, data.low_stock)


Operating principles:
  • For any electrical / illumination question, call the matching
    signage.* tool — never invent peak amps, PSU sizing, voltage
    drop, refresh feasibility or luminance numbers.
  • For vendor data not in the KB, call web.search → pick the
    most relevant hit → web.crawl that URL before quoting it.
  • Cite web hits
    as [domain](url).
  • Default to SI units. Quote currents in A, lumens in lm,
    luminance in cd/m², lengths in mm.
  • When the user is at a station and asks for a check, prefer
    a numbered, bulleted, action-oriented reply they can read
    while their hands are busy.
  • Default to the user's last-used language unless asked.
  • If multiple tools could apply, run them in parallel by
    emitting multiple tool calls in one assistant turn.`;

export const POST: RequestHandler = async (event) => {
    const { params, request, locals } = event;
    if (!locals.supabase || !locals.user) {
        throw kitError(401, 'Unauthorized');
    }

    aiRateLimit(rateLimitIdentifier(event));
    const sid = params.id;
    if (!sid) throw kitError(400, 'id required');
    if (!AILAB.chat) throw kitError(404, 'chat disabled');

    const body = (await request.json().catch(() => null)) as {
        content?: string;
        persona?: string;
        persona_template_id?: string;
    } | null;
    if (typeof body?.content !== 'string' || !body.content.trim() || body.content.length > 12_000) {
        throw kitError(400, 'Message must be 1–12,000 characters');
    }
    if (body.persona !== undefined && (typeof body.persona !== 'string' || body.persona.length > 300)) {
        throw kitError(400, 'Invalid persona');
    }

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
    const recent = ((history ?? []) as OpenRouterMessage[]).reverse();

    // Persist message text only. Vector search/RAG is disabled in the OpenRouter-only mode.
    await db.from('ai_chat_messages').insert({
        session_id: sid,
        role: 'user',
        content: body.content
    });

    // Knowledge/RAG and ColQwen2 visual retrieval were local-sidecar features
    // and are intentionally disabled. Do not imply citations are available.
    const citations: Array<{ source_id: string; title: string; page: number | null; score: number }> = [];

    // ── Build system prompt ─────────────────────────────────────────────────
    const legacyPersona = body.persona ?? (sessionRow as { persona?: string }).persona ?? '';
    let sysPrompt = BASE_SYSTEM_PROMPT;
    if (personaTemplate?.system_prompt_addon) {
        sysPrompt += `\n\n${personaTemplate.system_prompt_addon}`;
    } else if (legacyPersona) {
        sysPrompt += `\n\nPersona: ${legacyPersona}`;
    }
    sysPrompt += '\n\nKnowledge-base retrieval is disabled. Do not claim company documents were searched or cite unverified sources.';

    const messages: OpenRouterMessage[] = [
        { role: 'system', content: sysPrompt },
        ...recent,
        { role: 'user', content: body.content }
    ];

    // ── Tool definitions — allow-list is reused for execution ───────────────
    // This is a security boundary, not just a model hint. The model cannot
    // request a hidden management tool using an invented function name.
    const rows = await listTools({ role: locals.user.role }).catch(() => []);
    const personaAllowed = personaTemplate?.tool_slugs?.length
        ? new Set(personaTemplate.tool_slugs)
        : null;
    const allowedRows = rows.filter(tool => !personaAllowed || personaAllowed.has(tool.slug));
    const allowedTools = new Map(allowedRows.map(tool => [tool.schema.name, tool]));
    const allTools = allowedRows.map(tool => ({
        type: 'function' as const,
        function: {
            name: tool.schema.name,
            description: tool.schema.description ?? tool.description ?? tool.label,
            parameters: tool.schema.parameters
        }
    }));
    const stations = (locals.user.stations ?? []).map(s => s.stationId);

    // ── Model selection ─────────────────────────────────────────────────────
    // Ignore client model selection; routing stays server-side (OpenRouter).
    const providerModel = OPENROUTER_MODEL;

    const startedAt = new Date();
    const runIns = await db
        .from('ai_runs')
        .insert({
            kind: 'chat',
            status: 'running',
            user_id: userId,
            session_id: sid,
            model: providerModel,
            input: { content: body.content },
            started_at: startedAt.toISOString()
        })
        .select('id')
        .single();
    const runId = (runIns.data as { id: string } | null)?.id ?? null;

    // ── Tool-call loop (up to 3 hops) ───────────────────────────────────────
    const toolMessages: OpenRouterMessage[] = [];
    let finalText = '';
    let nodeLabel: string | null = 'openrouter';
    let usedModel = providerModel;

    let toolCallsUsed = 0;
    try {
    for (let hop = 0; hop < 3; hop++) {
        const r = await openRouterChat({
            model: providerModel,
            stream: false,
            messages: [...messages, ...toolMessages],
            tools: allTools,
            temperature: 0.5
        });
        usedModel = r.model;
        if (!r.response.ok) {
            // Never return raw upstream provider text (which may echo prompts).
            throw new Error(`OpenRouter HTTP ${r.response.status}`);
        }
        const j = await r.response.json();
        const choice = j?.choices?.[0];
        const rawMessage = choice?.message;
        const m = rawMessage ? {
            role: 'assistant',
            content: typeof rawMessage.content === 'string' ? rawMessage.content : '',
            tool_calls: Array.isArray(rawMessage.tool_calls) ? rawMessage.tool_calls.map((call: any, index: number) => ({
                id: typeof call.id === 'string' ? call.id : `call_${index}`,
                type: 'function' as const,
                function: { name: String(call.function?.name ?? ''), arguments: call.function?.arguments ?? '{}' }
            })) : []
        } : null;
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
            toolMessages.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls });
            for (const call of m.tool_calls) {
                toolCallsUsed++;
                const tool = allowedTools.get(call.function.name);
                const callId = call.id;
                if (!tool || toolCallsUsed > 8) {
                    toolMessages.push({
                        role: 'tool',
                        tool_call_id: callId,
                        content: JSON.stringify({ error: 'Tool not available for this user or request' })
                    });
                    continue;
                }
                let result: unknown;
                try {
                    const serialized = typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments ?? {});
                    if (serialized.length > 8_000) throw new Error('Tool arguments exceed the size limit');
                    const toolArgs = parseToolArguments(serialized);
                    result = await executeTool(tool.slug, toolArgs, {
                        userId, role: locals.user.role, stations, supabase: db
                    });
                } catch (err) {
                    result = { error: (err as Error).message };
                }
                await db.from('ai_chat_messages').insert({
                    session_id: sid,
                    role: 'tool',
                    tool_name: tool.slug,
                    content: JSON.stringify(result).slice(0, 12_000)
                });
                toolMessages.push({ role: 'tool', tool_call_id: callId, name: tool.slug, content: JSON.stringify(result).slice(0, 12_000) });
            }
            continue;
        }

        finalText = m.content ?? '';
        break;
    }

    } catch (err) {
        if (runId) {
            await db.from('ai_runs').update({
                status: 'error', error: 'Provider or tool execution failed',
                finished_at: new Date().toISOString()
            }).eq('id', runId);
        }
        logger.error('[AI chat] inference run failed', { sessionId: sid, userId, kind: 'provider_or_tool' });
        throw kitError(502, 'AI provider or tool execution failed');
    }

    if (!finalText) finalText = '(no response)';

    await db.from('ai_chat_messages').insert({
        session_id: sid,
        role: 'assistant',
        content: finalText,
        model: usedModel,
        node_label: nodeLabel,
        citations: [],
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
