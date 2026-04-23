import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import postgres from 'postgres';

// 1. Establish a single, persistent, high-speed DB connection
const sql = postgres(env.DATABASE_URL || 'postgresql://postgres:postgres@100.98.202.69:54322/postgres');

export async function POST({ request }) {
    const { messages } = await request.json();
    const ollamaUrl = 'http://100.93.147.108:11434/api/chat';
    const OLLAMA_MODEL = 'qwen2.5-coder:14b';

    // 2. Define the native tool strictly for Ollama
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

    try {
        // STEP 1: The Private Tool Check (Non-Streaming)
        const toolCheckResponse = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are the Swarm Architect. You must use the execute_sql tool to search the public.company_knowledge table. DO NOT GUESS. Use ILIKE for text searches.' 
                    },
                    ...messages
                ],
                tools: tools,
                stream: false 
            })
        });

        if (!toolCheckResponse.ok) throw new Error('Ollama connection failed');
        const data = await toolCheckResponse.json();
        const aiMessage = data.message;

        // STEP 2: Execute Tool Natively if Requested
        if (aiMessage?.tool_calls && aiMessage.tool_calls.length > 0) {
            const toolCall = aiMessage.tool_calls[0];
            let toolResult;

            try {
                console.log('⚡ [DB] Executing Query:', toolCall.function.arguments.query);
                // Execute the raw query instantly
                const rows = await sql.unsafe(toolCall.function.arguments.query);
                toolResult = JSON.stringify(rows);
                console.log('✅ [DB] Query returned', rows.length, 'rows.');
            } catch (dbError: any) {
                console.error('❌ [DB] Error:', dbError);
                toolResult = JSON.stringify({ error: dbError.message });
            }

            // Prepare history loop for final summary
            const finalMessages = [
                { role: 'system', content: 'You are the Swarm Architect. Summarize the following database results clearly for the user. Do not output raw JSON.' },
                ...messages,
                aiMessage, // The exact tool_call object Ollama generated
                { role: 'tool', content: toolResult }
            ];

            // STEP 3: Stream the Final Human Answer
            const streamResponse = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages: finalMessages,
                    stream: true
                })
            });

            return new Response(streamResponse.body, {
                headers: { 'Content-Type': 'application/x-ndjson' }
            });
        }

        // STEP 4: Fallback (No Tool Needed) - Stream directly
        const directResponse = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: [
                    { role: 'system', content: 'You are the Swarm Architect. Provide a clear and helpful response.' },
                    ...messages
                ],
                stream: true
            })
        });

        return new Response(directResponse.body, {
            headers: { 'Content-Type': 'application/x-ndjson' }
        });

    } catch (err) {
        console.error('Orchestrator Error:', err);
        throw error(500, 'Agentic loop failed');
    }
}
