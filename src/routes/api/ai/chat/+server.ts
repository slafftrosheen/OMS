import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import postgres from 'postgres';

export async function POST({ request }) {
    const body = await request.json();

    // ── Payload adapter: support both { messages } and legacy { query, chatHistory } ──
    let messages: { role: string; content: string }[];
    if (body.messages && Array.isArray(body.messages)) {
        messages = body.messages;
    } else {
        const { query } = body;
        const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory : [];
        if (!query || typeof query !== 'string' || !query.trim()) {
            throw error(400, 'Missing or empty "query" field');
        }
        messages = [...chatHistory];
        const last = messages[messages.length - 1];
        if (!(last?.role === 'user' && last?.content === query)) {
            messages.push({ role: 'user', content: query });
        }
    }

    const ollamaUrl = 'http://100.93.147.108:11434/api/chat';

    // Switch to the Orchestrator model for conversational routing
    const OLLAMA_MODEL = 'command-r';

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
        // ── Build the conversation with a strict system prompt ──
        const currentMessages = [
            {
                role: 'system',
                content: [
                    'You are the Swarm Architect for Réclame Fabriek, a PHYSICAL SIGNAGE PRODUCTION company based in Daugavpils, Latvia.',
                    'They do NOT do digital marketing. They manufacture custom signage: lightboxes, 3D box letters, LED neon, pylons/totems, CNC services, and custom furniture.',
                    '',
                    'RULES:',
                    '1. If the user asks about the company, its products, services, capabilities, or projects — you MUST use search_knowledge_base or search_by_category.',
                    '2. Answer ONLY using the data returned by the tools. Do NOT invent capabilities.',
                    '3. If the tool returns no results, say "I could not find information about that in our database" — do NOT hallucinate.',
                    '4. For general conversation (greetings, math, etc.) respond directly without tools.',
                    '5. Always mention specific product names, materials, and technical details when available.',
                    '6. When listing products, include their illumination type and material.'
                ].join('\n')
            },
            ...messages
        ];

        // ═══════════════════════════════════════════════════════════════════════
        // Step 1: Ask Command-R what it wants to do (non-streaming, with tools)
        // ═══════════════════════════════════════════════════════════════════════
        const aiResponse = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: currentMessages,
                tools: tools,
                stream: false
            })
        });

        if (!aiResponse.ok) {
            const errBody = await aiResponse.text();
            console.error('❌ [Ollama] Non-streaming call failed:', errBody);
            throw new Error(`Ollama failed to respond (${aiResponse.status})`);
        }

        const data = await aiResponse.json();
        const aiMessage = data.message;

        // ═══════════════════════════════════════════════════════════════════════
        // Step 2: Execute tools SAFELY (SvelteKit writes ALL SQL)
        // ═══════════════════════════════════════════════════════════════════════
        if (aiMessage?.tool_calls?.length > 0) {
            const toolCall = aiMessage.tool_calls[0];
            const toolName = toolCall.function.name;
            const toolArgs = toolCall.function.arguments;
            let toolResult: string;

            try {
                if (toolName === 'search_by_category') {
                    // ── Category-filtered search ──
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
                        console.log(`✅ [DB] Found ${rows.length} results for category "${category}".`);
                    } else {
                        toolResult = JSON.stringify({
                            error: `No records found in category "${category}".`
                        });
                        console.log(`⚠️ [DB] No results for category "${category}".`);
                    }
                } else {
                    // ── Default: keyword search across all content ──
                    const searchKeyword = (toolArgs.keyword as string) || '';
                    console.log(`⚡ [DB] Command-R keyword search: "${searchKeyword}"`);

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
                        toolResult = JSON.stringify({
                            error: "No records found. The user might be asking about something we don't have in our database."
                        });
                        console.log(`⚠️ [DB] No results found for "${searchKeyword}".`);
                    }
                }
            } catch (dbError: any) {
                console.error('❌ [DB] Error:', dbError.message);
                toolResult = JSON.stringify({ error: 'Database query failed.' });
            }

            // ═══════════════════════════════════════════════════════════════════
            // Step 3: Stream the final, factual answer back to the UI
            // ═══════════════════════════════════════════════════════════════════
            const streamResponse = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages: [
                        ...currentMessages,
                        aiMessage,
                        { role: 'tool', content: toolResult }
                    ],
                    stream: true
                })
            });

            if (!streamResponse.ok) {
                const errBody = await streamResponse.text();
                console.error('❌ [Ollama] Streaming (tool) call failed:', errBody);
                throw new Error('Ollama streaming response failed');
            }

            return streamToSvelte(streamResponse.body, sql);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // NO TOOL CALLED — Stream directly (standard conversation)
        // ═══════════════════════════════════════════════════════════════════════
        console.log('🗣️ [Agent] Direct response (No tool needed)');
        const directResponse = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: currentMessages,
                stream: true
            })
        });

        if (!directResponse.ok) {
            const errBody = await directResponse.text();
            console.error('❌ [Ollama] Streaming (direct) call failed:', errBody);
            throw new Error('Ollama direct streaming failed');
        }

        return streamToSvelte(directResponse.body, sql);
    } catch (err) {
        await sql.end();
        console.error('❌ Orchestrator Error:', err);
        throw error(500, 'Agent loop failed');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Pipe Ollama NDJSON stream → parsed plain-text stream for the UI
// ─────────────────────────────────────────────────────────────────────────────
function streamToSvelte(body: ReadableStream | null, sql: any) {
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
                        // Flush remaining buffer
                        if (buffer.trim()) {
                            try {
                                const chunk = JSON.parse(buffer);
                                if (chunk.message?.content) {
                                    controller.enqueue(encoder.encode(chunk.message.content));
                                }
                            } catch {
                                /* partial JSON, skip */
                            }
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
                        } catch {
                            /* partial JSON, skip */
                        }
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
            'X-Content-Type-Options': 'nosniff'
        }
    });
}
