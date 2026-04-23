// src/routes/api/ai/chat/+server.ts
import { error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/server/logging/logger';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ChatRequestBody {
	query: string;
	chatHistory?: { role: string; content: string }[];
}

const OLLAMA_URL = 'http://100.93.147.108:11434/api/chat';
const OLLAMA_MODEL = 'qwen2.5-coder:14b';

// Maximum number of autonomous tool-call iterations before forcing a final answer
const MAX_AGENT_ITERATIONS = 8;

// ── The Sovereign Architect: Master Identity ──
const SYSTEM_PROMPT = `You are the Swarm Architect, the core intelligence of the Réclame Fabriek Sovereign OS.
You manage a multi-node Proxmox/Tailscale cluster. Your only tool is 'query' which executes SQL on the Postgres database.

### OPERATIONAL PROTOCOL:
1. DISCOVER: If you don't know the tables, run: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
2. INSPECT: Before querying a table, check its columns: SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '<table>';
3. RETRIEVE: Query the data. Use ILIKE with % for text searches. Example: SELECT * FROM company_knowledge WHERE content ILIKE '%signage%';
4. RETRY: If a query returns no results, broaden your search terms and try again before giving up.

### YOUR ONLY TOOL:
- 'query': Accepts { "sql": "<your SQL here>" }. Use this for ALL database operations.

### CONSTRAINTS:
- NEVER guess table or column names. Always DISCOVER then INSPECT first.
- Never tell the user you "don't have access" or "can't see the database." You ARE the database.
- Do not mention SQL, column names, or technical details to the user unless they ask.
- If a query fails with "relation does not exist", DISCOVER the correct table name first.`;

// ── Summarization prompt injected for the final streaming response ──
const SUMMARY_PROMPT = `You are the Swarm Architect, the core intelligence of the Réclame Fabriek Sovereign OS.
You have just completed a series of database operations to answer the user's question.

RULES FOR YOUR FINAL RESPONSE:
- Synthesize the tool results into a clear, natural-language answer.
- Do NOT output raw JSON, SQL, tool calls, or column names unless the user explicitly asked for technical details.
- Speak with authority — you ARE the system. Never say "I found in the database" — just state the facts.
- If multiple tool results contributed to the answer, weave them together coherently.`;

/**
 * Dual-path tool call extraction.
 * Path A: Native tool_calls from the Ollama response.
 * Path B: Fallback JSON parsing from text content when the model returns
 *         tool calls as raw JSON text instead of structured tool_calls.
 */
function extractToolCalls(message: any): any[] | null {
	// Path A — Native tool_calls
	if (message?.tool_calls && message.tool_calls.length > 0) {
		return message.tool_calls;
	}

	// Path B — Fallback: parse JSON from text content
	const content = message?.content;
	if (!content || typeof content !== 'string') return null;

	const trimmed = content.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

	try {
		const parsed = JSON.parse(trimmed);

		const normalize = (obj: any, index: number): any | null => {
			// { "name": "list_tables", "arguments": {} }
			if (obj.name && typeof obj.name === 'string') {
				return {
					id: obj.id || `fallback_call_${index}`,
					function: {
						name: obj.name,
						arguments: obj.arguments || obj.parameters || {}
					}
				};
			}
			// { "function": { "name": "list_tables", "arguments": {} } }
			if (obj.function?.name && typeof obj.function.name === 'string') {
				return {
					id: obj.id || `fallback_call_${index}`,
					function: {
						name: obj.function.name,
						arguments: obj.function.arguments || obj.function.parameters || {}
					}
				};
			}
			return null;
		};

		if (Array.isArray(parsed)) {
			const calls = parsed.map(normalize).filter(Boolean);
			return calls.length > 0 ? calls : null;
		}

		const single = normalize(parsed, 0);
		return single ? [single] : null;
	} catch (e) {
		console.error('[fallback-parse] Failed to parse tool call from text content:', e);
		return null;
	}
}

/**
 * Intercepts tool calls and redirects everything to the 'query' tool.
 * Converts hallucinated tool names (list_tables, describe_table, etc.)
 * into the correct SQL and executes them via 'query'.
 */
async function executeTool(
	mcpClient: Client,
	toolCall: any
): Promise<{ name: string; result: string; id: string }> {
	const rawName: string = toolCall.function.name;
	let toolArgs: Record<string, unknown> = toolCall.function.arguments || {};
	const toolId = toolCall.id || `call_${rawName}`;

	// ── Intercept non-existent tools and convert to SQL ──
	// The Postgres MCP only has 'query'. Everything else must become SQL.
	if (rawName === 'list_tables' || rawName === 'get_tables' || rawName === 'show_tables') {
		console.log(`[tool] Intercepted '${rawName}' → converting to SQL discovery query`);
		toolArgs = { sql: "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" };
	} else if (rawName === 'describe_table' || rawName === 'get_columns' || rawName === 'show_columns' || rawName === 'describe') {
		const tableName = toolArgs.table_name || toolArgs.table || toolArgs.name || 'unknown';
		console.log(`[tool] Intercepted '${rawName}' → converting to SQL column inspection for '${tableName}'`);
		toolArgs = { sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position;` };
	} else if (rawName !== 'query') {
		// Any other hallucinated tool name — assume the args contain SQL or a sql field
		console.log(`[tool] Unknown tool '${rawName}' — redirecting to 'query'`);
		if (!toolArgs.sql && toolArgs.query) {
			toolArgs = { sql: toolArgs.query as string };
		}
	}

	console.log(`[tool] Executing via 'query': ${JSON.stringify(toolArgs)}`);

	try {
		const toolResult = await mcpClient.callTool({
			name: 'query',
			arguments: toolArgs
		});

		const resultContent = toolResult.content
			.map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
			.join('\n');

		console.log(`[tool] query returned ${resultContent.length} chars`);
		return { name: rawName, result: resultContent, id: toolId };
	} catch (toolErr) {
		const errText = `Error executing tool query (from ${rawName}): ${String(toolErr)}`;
		console.error(`[tool] query FAILED: ${errText}`);
		return { name: rawName, result: errText, id: toolId };
	}
}

/**
 * Creates a ReadableStream that pipes a streaming Ollama response
 * back to the client as plain text chunks.
 * NO tools array is attached — forces pure text generation.
 */
function createOllamaStream(messages: any[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				const res = await fetch(OLLAMA_URL, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: OLLAMA_MODEL,
						messages,
						stream: true
						// NO tools array — forces text-only generation
					})
				});

				if (!res.body) throw new Error('Ollama returned empty body on final stream');

				const reader = res.body.getReader();
				const decoder = new TextDecoder();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const textChunk = decoder.decode(value, { stream: true });
					const lines = textChunk.split('\n').filter((l) => l.trim().length > 0);

					for (const line of lines) {
						try {
							const chunk = JSON.parse(line);
							if (chunk.message?.content) {
								controller.enqueue(encoder.encode(chunk.message.content));
							}
						} catch {
							// Ignore partial JSON chunks
						}
					}
				}
				controller.close();
			} catch (streamErr) {
				console.error('[stream] Final Ollama stream error:', streamErr);
				controller.error(streamErr);
			}
		}
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth gate
	const user = locals.user;
	if (!user) {
		throw svelteError(401, 'Unauthorized');
	}

	// Parse & validate body
	let body: ChatRequestBody;
	try {
		body = await request.json();
	} catch {
		throw svelteError(400, 'Invalid JSON body');
	}

	const { query, chatHistory = [] } = body;

	if (!query || typeof query !== 'string' || query.trim().length === 0) {
		throw svelteError(400, 'Missing or empty "query" field');
	}

	let transport: StdioClientTransport | null = null;
	let mcpClient: Client | null = null;

	try {
		// ── Phase 1: Boot MCP Transport ──
		transport = new StdioClientTransport({
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-postgres@latest', process.env.DATABASE_URL || ''],
			env: {
				...process.env
			}
		});

		mcpClient = new Client(
			{ name: 'oms-agent-orchestrator', version: '2.0.0' },
			{ capabilities: {} }
		);

		await mcpClient.connect(transport);

		// ── Phase 2: Discover Available Tools ──
		const mcpToolsResult = await mcpClient.listTools();
		const tools = mcpToolsResult.tools.map((t) => ({
			type: 'function',
			function: {
				name: t.name,
				description: t.description,
				parameters: t.inputSchema
			}
		}));

		console.log(`[init] MCP connected. ${tools.length} tools available: ${tools.map(t => t.function.name).join(', ')}`);

		// ── Phase 3: Build Message History ──
		const history: any[] = [
			{ role: 'system', content: SYSTEM_PROMPT },
			...chatHistory
		];

		// Dedup guard
		const lastMsg = history[history.length - 1];
		if (lastMsg?.role === 'user' && lastMsg?.content === query) {
			console.log('[dedup] chatHistory already contains the current user query — skipping duplicate append');
		} else {
			history.push({ role: 'user', content: query });
		}

		// ══════════════════════════════════════════════════════════════
		// ══  Phase 4: THE LOOPING BRAIN — Autonomous Agent Loop    ══
		// ══════════════════════════════════════════════════════════════
		//
		// The agent iterates: ask Ollama → detect tool calls → execute tools
		// → feed results back → ask Ollama again … until Ollama responds
		// with plain text (no tool calls) or we hit MAX_AGENT_ITERATIONS.
		//
		// ALL of this is HIDDEN from the user. They only see the final stream.

		let iteration = 0;
		let toolsUsed = 0;

		while (iteration < MAX_AGENT_ITERATIONS) {
			iteration++;
			console.log(`\n=== AGENT LOOP iteration ${iteration}/${MAX_AGENT_ITERATIONS} ===`);
			console.log(`History length: ${history.length}, last role: ${history[history.length - 1]?.role}`);

			// Ask Ollama with tools enabled, non-streaming
			const ollamaRes = await fetch(OLLAMA_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: OLLAMA_MODEL,
					messages: history,
					tools,
					stream: false
				})
			});

			const ollamaData = await ollamaRes.json();
			const assistantMsg = ollamaData.message;

			// Dual-path tool detection
			const detectedToolCalls = extractToolCalls(assistantMsg);

			if (!detectedToolCalls || detectedToolCalls.length === 0) {
				// ── No more tool calls — the AI is ready to speak ──
				console.log(`[agent] Iteration ${iteration}: No tool calls detected. Agent brain loop complete.`);
				console.log(`[agent] Total tools executed across all iterations: ${toolsUsed}`);
				break;
			}

			// ── Tool calls detected — execute and loop ──
			console.log(`[agent] Iteration ${iteration}: ${detectedToolCalls.length} tool call(s) detected`);

			// Push assistant message with tool_calls into history (content: null)
			history.push({
				role: 'assistant',
				content: null,
				tool_calls: detectedToolCalls
			});

			// Execute each tool and push results
			for (const tc of detectedToolCalls) {
				const { name, result, id } = await executeTool(mcpClient, tc);
				toolsUsed++;

				history.push({
					role: 'tool',
					content: result,
					tool_call_id: id
				});

				console.log(`[agent] Tool result for ${name} pushed to history (${result.length} chars)`);
			}

			// Loop continues — Ollama will see the tool results and decide:
			// either call another tool or produce a final text answer.
		}

		if (iteration >= MAX_AGENT_ITERATIONS) {
			console.warn(`[agent] Hit MAX_AGENT_ITERATIONS (${MAX_AGENT_ITERATIONS}). Forcing final response.`);
		}

		// ── Phase 5: Close MCP — all tool work is done ──
		if (transport) {
			try { await transport.close(); transport = null; } catch (_) { /* silent */ }
		}

		// ══════════════════════════════════════════════════════════════
		// ══  Phase 6: Final Streamed Response — User-Visible        ══
		// ══════════════════════════════════════════════════════════════

		// If tools were used, swap the system prompt to summarization mode
		// so the model produces a natural-language answer, not more tool calls.
		if (toolsUsed > 0) {
			history[0].content = SUMMARY_PROMPT;
			console.log(`[agent] Switched to SUMMARY_PROMPT for final stream (${toolsUsed} tools executed)`);
		}

		console.log('--- FINAL OLLAMA PAYLOAD ---');
		console.log(`History: ${history.length} messages, Tools used: ${toolsUsed}, Iterations: ${iteration}`);

		const stream = createOllamaStream(history);

		logger.info('Sovereign Architect loop completed', {
			userId: user.id,
			iterations: iteration,
			toolsUsed
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (err) {
		logger.error('Sovereign Architect initialization error', err as Error);

		if (err instanceof Response) {
			throw err;
		}

		// Fallback error stream
		const fallbackStream = new ReadableStream({
			start(controller) {
				const message = "⚠️ AI Node Unreachable. Please check Tailscale/LAN connection to the RTX 5080 server.";
				controller.enqueue(new TextEncoder().encode(message));
				controller.close();
			}
		});

		return new Response(fallbackStream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} finally {
		if (transport) {
			try {
				await transport.close();
			} catch (e) {
				// silent
			}
		}
	}
};
