import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import postgres from 'postgres';

// Persistent connection pool to Node 101 Postgres
const sql = postgres(env.DATABASE_URL || 'postgresql://postgres:postgres@100.98.202.69:54322/postgres');

const OLLAMA_URL = 'http://100.93.147.108:11434/api/chat';
const OLLAMA_MODEL = 'qwen2.5-coder:14b';

const tools = [{
    type: 'function',
    function: {
        name: 'execute_sql',
        description: 'Execute read-only SQL queries against the Postgres database to find information. Focus on public.company_knowledge table.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The exact PostgreSQL query to run.' }
            },
            required: ['query']
        }
    }
}];

export async function POST({ request }) {
    const body = await request.json();

    // Support both { messages } and legacy { query, chatHistory } payloads
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

    try {
        // STEP 1: Tool Check (non-streaming, hidden from user)
        const step1Res = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: [
                    { role: 'system', content: 'You are the Swarm Architect. You must use the execute_sql tool to search the public.company_knowledge table. DO NOT GUESS. Use ILIKE for text searches.' },
                    ...messages
                ],
                tools,
                stream: false
            })
        });

        if (!step1Res.ok) throw new Error('Ollama connection failed');
        const { message: aiMessage } = await step1Res.json();

        // STEP 2: Execute tool if requested
        let finalMessages: any[];

        if (aiMessage?.tool_calls?.length > 0) {
            const toolCall = aiMessage.tool_calls[0];
            let toolResult: string;

            try {
                const sqlQuery = toolCall.function.arguments.query;
                console.log('⚡ [DB] Executing:', sqlQuery);
                const rows = await sql.unsafe(sqlQuery);
                toolResult = JSON.stringify(rows);
                console.log('✅ [DB] Returned', rows.length, 'rows');
            } catch (dbErr: any) {
                console.error('❌ [DB] Error:', dbErr.message);
                toolResult = JSON.stringify({ error: dbErr.message });
            }

            finalMessages = [
                { role: 'system', content: 'You are the Swarm Architect. Summarize the following database results clearly for the user. Do not output raw JSON.' },
                ...messages,
                aiMessage,
                { role: 'tool', content: toolResult }
            ];
        } else {
            // No tool needed
            finalMessages = [
                { role: 'system', content: 'You are the Swarm Architect. Provide a clear and helpful response.' },
                ...messages
            ];
        }

        // STEP 3: Stream final answer — extract text content from NDJSON
        const streamRes = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: finalMessages,
                stream: true
            })
        });

        if (!streamRes.body) throw new Error('Ollama returned empty body');

        // Transform Ollama NDJSON into plain text chunks for the frontend
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async pull(controller) {
                const { done, value } = await reader.read();
                if (done) { controller.close(); return; }

                const text = decoder.decode(value, { stream: true });
                for (const line of text.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.message?.content) {
                            controller.enqueue(encoder.encode(chunk.message.content));
                        }
                    } catch { /* partial JSON, skip */ }
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
    } catch (err) {
        console.error('Orchestrator Error:', err);
        throw error(500, 'Agentic loop failed');
    }
}
