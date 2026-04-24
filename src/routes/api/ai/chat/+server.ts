import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import postgres from 'postgres';

export async function POST({ request }) {
    const body = await request.json();

    // ── Payload adapter: support both { messages } and legacy { query, chatHistory } ──
    let messages: { role: string; content: string; images?: string[] }[];
    if (body.messages && Array.isArray(body.messages)) {
        messages = body.messages;
    } else {
        const { query, locale } = body;
        const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory : [];
        if (!query || typeof query !== 'string' || !query.trim()) {
            throw error(400, 'Missing or empty "query" field');
        }
        messages = [...chatHistory];
        const last = messages[messages.length - 1];
        if (!(last?.role === 'user' && last?.content === query)) {
            const userMsg: any = { role: 'user', content: query };
            if (body.images && body.images.length > 0) {
                userMsg.images = body.images;
            }
            messages.push(userMsg);
        }
        // Save locale for later
        if (locale) {
            messages.push({ role: 'system', content: `[SYSTEM] The user interface is currently set to locale: '${locale}'. You MUST format your final response entirely in this language.` });
        }
    }

    const ollamaUrl = 'http://100.93.147.108:11434/api/chat';

    // ── Models ───────────────────────────────────────────────────────────────
    const ROUTER_MODEL = 'hf.co/mradermacher/c4ai-command-r7b-12-2024-abliterated-GGUF:Q4_K_M';
    const REASONING_MODEL = 'deepseek-r1:14b';
    const SYS_MODEL = 'hf.co/ertghiu256/qwen-3-14b-code-and-math-reasoning-gguf:Q4_K_M';
    const VISION_MODEL = 'llama3.2-vision';

    // ── LAZY DB CONNECTION: Intercept stale Tailscale IPs ──
    const fallbackDbUrl = 'postgresql://postgres:postgres@192.168.8.150:54322/postgres';
    const dbUrl = env.DATABASE_URL || fallbackDbUrl;
    const finalDbUrl = dbUrl.includes('100.98.202.69')
        ? dbUrl.replace('100.98.202.69', '192.168.8.150')
        : dbUrl;

    const sql = postgres(finalDbUrl, {
        max: 1,
        idle_timeout: 5
    });

    // ─────────────────────────────────────────────────────────────────────────
    // THE DUMB TOOLS: The AI only passes simple strings. It cannot break SQL.
    // ─────────────────────────────────────────────────────────────────────────
    const tools = [
        {
            type: 'function',
            function: {
                name: 'search_knowledge_base',
                description:
                    'Search the internal database for Réclame Fabriek capabilities, materials, products, and past projects. Use this when the user asks ANYTHING about the company.',
                parameters: {
                    type: 'object',
                    properties: {
                        keyword: {
                            type: 'string',
                            description:
                                'A single, simple search term (e.g., "lightbox", "projects", "capabilities", "profile", "neon")'
                        }
                    },
                    required: ['keyword']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'search_by_category',
                description:
                    'Search the knowledge base filtered by a specific content category. Valid categories: homepage, service, portfolio, product_profile, profile, contact, news, general. Use this when the user asks about a specific category like "show me your products" or "what projects have you done".',
                parameters: {
                    type: 'object',
                    properties: {
                        category: {
                            type: 'string',
                            description:
                                'The category to filter by. One of: homepage, service, portfolio, product_profile, profile, contact, news, general'
                        },
                        keyword: {
                            type: 'string',
                            description: 'Optional keyword to further filter results within the category'
                        }
                    },
                    required: ['category']
                }
            }
        }
    ];

    try {
        // ═══════════════════════════════════════════════════════════════════════
        // Step 1: Intelligent Router Classification
        // ═══════════════════════════════════════════════════════════════════════
        const queryStr = messages[messages.length - 1].content;
        const hasImages = messages.some(m => m.images && m.images.length > 0);

        console.log('⚡ [Router] Classifying intent...');
        const routerRes = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ROUTER_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'Classify the user intent into exactly ONE of these categories: "database" (queries about company knowledge, orders, workflow, or business info), "reasoning" (complex math, physics, CNC feeds & speeds, brainstorming, general logic), "system" (queries about code, UI improvements, refactoring, or system specs), or "vision" (analyzing uploaded images or PCB quality control). Reply with ONLY the category word, in lowercase.'
                    },
                    { role: 'user', content: queryStr + (hasImages ? '\n[User uploaded an image]' : '') }
                ],
                stream: false,
                keep_alive: -1 // CRITICAL: keep router loaded
            })
        });

        if (!routerRes.ok) throw new Error('Router classification failed');
        const routerData = await routerRes.json();
        const intentStr = (routerData.message?.content || '').toLowerCase();
        
        let activeAgentId = 'router';
        let targetModel = ROUTER_MODEL;
        let systemPrompt = '';
        let targetKeepAlive = -1;
        let useTools = false;

        if (hasImages || intentStr.includes('vision')) {
            activeAgentId = 'vision';
            targetModel = VISION_MODEL;
            targetKeepAlive = 0;
            systemPrompt = 'You are the Vision Module for the Réclame Fabriek Assistant. You analyze Dino-Lite microscope images, inspect PCBs, and perform visual Quality Control.';
            console.log(`🧭 [Router] Routed to QC Vision: ${VISION_MODEL}`);
        } else if (intentStr.includes('system') || intentStr.includes('code') || intentStr.includes('refactor')) {
            activeAgentId = 'engineer';
            targetModel = SYS_MODEL;
            targetKeepAlive = 0;
            systemPrompt = 'You are the Code Module for the Réclame Fabriek Assistant. You specialize in code generation, Svelte 5, and system health checks. Always provide accurate technical analysis.';
            console.log(`🧭 [Router] Routed to Engineer: ${SYS_MODEL}`);
        } else if (intentStr.includes('reasoning') || intentStr.includes('math') || intentStr.includes('cnc')) {
            activeAgentId = 'reasoning';
            targetModel = REASONING_MODEL;
            targetKeepAlive = 0;
            systemPrompt = 'You are the Reasoning Module for the Réclame Fabriek Assistant. You specialize in complex logic, CNC feeds and speeds, math, and brainstorming. ALWAYS output your internal thought process inside <think>...</think> tags before providing the final answer.';
            console.log(`🧭 [Router] Routed to Reasoning: ${REASONING_MODEL}`);
        } else {
            activeAgentId = 'router';
            targetModel = ROUTER_MODEL;
            targetKeepAlive = -1; // Keep router in VRAM
            useTools = true;
            systemPrompt = [
                'You are the Librarian Module for the Réclame Fabriek Assistant, a PHYSICAL SIGNAGE PRODUCTION company based in Daugavpils, Latvia.',
                'They do NOT do digital marketing. They manufacture custom signage: lightboxes, 3D box letters, LED neon, pylons/totems, CNC services, and custom furniture.',
                '',
                'RULES:',
                '1. If the user asks about the company, its products, services, capabilities, or projects — you MUST use search_knowledge_base or search_by_category.',
                '2. Answer ONLY using the data returned by the tools. Do NOT invent capabilities.',
                '3. If the tool returns no results, say "I could not find information about that in our database" — do NOT hallucinate.',
                '4. For general conversation (greetings, etc.) respond directly without tools.',
                '5. Always mention specific product names, materials, and technical details when available.'
            ].join('\n');
            console.log(`🧭 [Router] Kept on Router (Database): ${ROUTER_MODEL}`);
        }

        const currentMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        // ═══════════════════════════════════════════════════════════════════════
        // Step 2: Ask Selected Model
        // ═══════════════════════════════════════════════════════════════════════
        let modelParams: any = {
            model: targetModel,
            messages: currentMessages,
            keep_alive: targetKeepAlive,
            stream: false
        };

        if (useTools) {
            modelParams.tools = tools;
        }

        let aiMessage;
        
        // If it's the router/database agent, we do the tool execution loop
        if (useTools) {
            const aiResponse = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modelParams)
            });

            if (!aiResponse.ok) {
                const errBody = await aiResponse.text();
                throw new Error(`Ollama failed to respond (${aiResponse.status}): ${errBody}`);
            }

            const data = await aiResponse.json();
            aiMessage = data.message;

            // ═══════════════════════════════════════════════════════════════════════
            // Step 3: Execute tools SAFELY (if any tool calls exist)
            // ═══════════════════════════════════════════════════════════════════════
            if (aiMessage?.tool_calls?.length > 0) {
                const toolCall = aiMessage.tool_calls[0];
                const toolName = toolCall.function.name;
                const toolArgs = toolCall.function.arguments;
                let toolResult: string;

                try {
                    if (toolName === 'search_by_category') {
                        const category = (toolArgs.category as string) || 'general';
                        const keyword = (toolArgs.keyword as string) || '';
                        console.log(`⚡ [DB] Category search: "${category}" + keyword: "${keyword}"`);

                        let rows;
                        if (keyword) {
                            rows = await sql`
                                SELECT category, content
                                FROM public.company_knowledge
                                WHERE category ILIKE ${'%' + category + '%'}
                                AND content ILIKE ${'%' + keyword + '%'}
                                ORDER BY crawled_at DESC
                                LIMIT 8
                            `;
                        } else {
                            rows = await sql`
                                SELECT category, content
                                FROM public.company_knowledge
                                WHERE category ILIKE ${'%' + category + '%'}
                                ORDER BY crawled_at DESC
                                LIMIT 8
                            `;
                        }

                        if (rows.length > 0) {
                            toolResult = JSON.stringify(rows);
                            console.log(`✅ [DB] Found ${rows.length} results.`);
                        } else {
                            toolResult = JSON.stringify({ error: `No records found in category "${category}".` });
                            console.log(`⚠️ [DB] No results for category "${category}".`);
                        }
                    } else {
                        const searchKeyword = (toolArgs.keyword as string) || '';
                        console.log(`⚡ [DB] Keyword search: "${searchKeyword}"`);

                        const rows = await sql`
                            SELECT category, content
                            FROM public.company_knowledge
                            WHERE content ILIKE ${'%' + searchKeyword + '%'}
                            OR category ILIKE ${'%' + searchKeyword + '%'}
                            ORDER BY crawled_at DESC
                            LIMIT 8
                        `;

                        if (rows.length > 0) {
                            toolResult = JSON.stringify(rows);
                            console.log(`✅ [DB] Found ${rows.length} results.`);
                        } else {
                            toolResult = JSON.stringify({ error: "No records found." });
                            console.log(`⚠️ [DB] No results found for "${searchKeyword}".`);
                        }
                    }
                } catch (dbError: any) {
                    console.error('❌ [DB] Error:', dbError.message);
                    toolResult = JSON.stringify({ error: 'Database query failed.' });
                }

                // Stream final answer
                const streamResponse = await fetch(ollamaUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: targetModel,
                        messages: [
                            ...currentMessages,
                            aiMessage,
                            { role: 'tool', content: toolResult }
                        ],
                        stream: true,
                        keep_alive: targetKeepAlive
                    })
                });

                return streamToSvelte(streamResponse.body, sql, activeAgentId);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // NO TOOL CALLED / DIRECT RESPONSE (System/Vision/Reasoning or pure chat)
        // ═══════════════════════════════════════════════════════════════════════
        console.log(`🗣️ [${activeAgentId}] Direct streaming response`);
        modelParams.stream = true;
        
        const directResponse = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modelParams)
        });

        if (!directResponse.ok) {
            const errBody = await directResponse.text();
            throw new Error(`Ollama direct streaming failed: ${errBody}`);
        }

        return streamToSvelte(directResponse.body, sql, activeAgentId);
    } catch (err) {
        await sql.end();
        console.error('❌ Orchestrator Error:', err);
        throw error(500, 'Agent loop failed');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Pipe Ollama NDJSON stream → parsed plain-text stream for the UI
// ─────────────────────────────────────────────────────────────────────────────
function streamToSvelte(body: ReadableStream | null, sql: any, agentId: string) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const reader = body?.getReader();
            if (!reader) {
                controller.close();
                await sql.end();
                return;
            }

            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        if (buffer.trim()) {
                            try {
                                const chunk = JSON.parse(buffer);
                                if (chunk.message?.content) {
                                    controller.enqueue(encoder.encode(chunk.message.content));
                                }
                            } catch { /* partial JSON, skip */ }
                        }
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const chunk = JSON.parse(line);
                            if (chunk.message?.content) {
                                controller.enqueue(encoder.encode(chunk.message.content));
                            }
                        } catch { /* partial JSON, skip */ }
                    }
                }
            } finally {
                reader.releaseLock();
                controller.close();
                await sql.end(); // Guarantee the DB connection dies when the stream ends
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Agent-Routed': agentId // Send back the selected agent to update UI
        }
    });
}
