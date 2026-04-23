import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import postgres from 'postgres';

export async function POST({ request }) {
    const body = await request.json();
    
    // Support both { messages } and legacy { query, chatHistory } payloads
    let messages;
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
    const OLLAMA_MODEL = 'qwen2.5-coder:14b';

    const sql = postgres(env.DATABASE_URL || 'postgresql://postgres:postgres@100.98.202.69:54322/postgres', {
        max: 1,
        idle_timeout: 5
    });

    const tools = [{
        type: 'function',
        function: {
            name: 'query',
            description: 'Execute a read-only PostgreSQL query against the public.company_knowledge table. ONLY use this tool. Example: SELECT content FROM company_knowledge WHERE content ILIKE \'%keyword%\'',
            parameters: {
                type: 'object',
                properties: { sql: { type: 'string' } },
                required: ['sql']
            }
        }
    }];

    try {
        let currentMessages = [
            { 
                role: 'system', 
                content: 'You are the Swarm Architect for Réclame Fabriek (a signage production company). You MUST use the `query` tool to search `public.company_knowledge` for ANY information requested. If a query returns empty `[]`, you MUST simplify your SQL and try again. Never say "I don\'t know" without executing a tool first.' 
            },
            ...messages
        ];

        let finalStreamResponse = null;
        let loopCount = 0;
        const MAX_LOOPS = 3; // Prevent infinite loops

        // The Agentic Loop
        while (loopCount < MAX_LOOPS) {
            console.log(`🔄 [Agent Loop] Iteration ${loopCount + 1}`);
            
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

            if (!aiResponse.ok) throw new Error('Ollama connection failed');
            const data = await aiResponse.json();
            const aiMessage = data.message;

            // Did the AI decide to use a tool?
            if (aiMessage?.tool_calls?.length > 0) {
                const toolCall = aiMessage.tool_calls[0];
                
                // Enforce the tool name (preventing the "Run" hallucination)
                if (toolCall.function.name !== 'query') {
                     console.warn(`⚠️ AI tried to use non-existent tool: ${toolCall.function.name}. Forcing 'query'.`);
                     toolCall.function.name = 'query';
                }

                let toolResult;
                try {
                    console.log('⚡ [DB] Executing SQL:', toolCall.function.arguments.sql);
                    const rows = await sql.unsafe(toolCall.function.arguments.sql);
                    toolResult = JSON.stringify(rows);
                    console.log(`✅ [DB] Returned ${rows.length} rows.`);
                } catch (dbError: any) {
                    console.error('❌ [DB] Error:', dbError.message);
                    toolResult = JSON.stringify({ error: dbError.message });
                }

                // Add the interaction to the context and loop again
                currentMessages.push(aiMessage);
                currentMessages.push({ role: 'tool', content: toolResult });
                loopCount++;
                continue; 
            } else {
                // The AI did NOT use a tool, meaning it is ready to give the final text answer.
                console.log('🗣️ [Agent] Ready to stream response to user.');
                
                // Request the final stream
                finalStreamResponse = await fetch(ollamaUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: OLLAMA_MODEL,
                        messages: currentMessages,
                        stream: true
                    })
                });
                break; // Exit the loop
            }
        }

        // Failsafe if the loop maxed out
        if (!finalStreamResponse) {
             console.log('⚠️ [Agent] Max loops reached. Forcing final answer.');
             finalStreamResponse = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages: currentMessages,
                    stream: true
                })
            });
        }

        // Safely pipe the stream to the frontend
        const stream = new ReadableStream({
            async start(controller) {
                const reader = finalStreamResponse.body?.getReader();
                if (!reader) {
                    controller.close();
                    return;
                }
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        controller.enqueue(value);
                    }
                } finally {
                    reader.releaseLock();
                    controller.close();
                    await sql.end(); // Always clean up DB
                }
            }
        });

        return new Response(stream, {
            headers: { 'Content-Type': 'application/x-ndjson' }
        });

    } catch (err) {
        await sql.end();
        console.error('Orchestrator Error:', err);
        throw error(500, 'Agentic loop failed');
    }
}
