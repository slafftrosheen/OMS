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

/**
 * Creates a ReadableStream that pipes a streaming Ollama response
 * back to the client as plain text chunks.
 * NO tools array is attached — this forces a pure text summary.
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
		// 1. Initialize MCP Transport
		transport = new StdioClientTransport({
			command: 'npx',
			args: ['-y', '@supabase/mcp-server-supabase@latest'],
			env: {
				...process.env,
				SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://100.98.202.69:54321',
				PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://100.98.202.69:54321',
				SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
			}
		});

		mcpClient = new Client(
			{ name: 'oms-agent-orchestrator', version: '1.0.0' },
			{ capabilities: {} }
		);

		await mcpClient.connect(transport);

		// 2. Fetch Tools
		const mcpToolsResult = await mcpClient.listTools();
		const tools = mcpToolsResult.tools.map((t) => ({
			type: 'function',
			function: {
				name: t.name,
				description: t.description,
				parameters: t.inputSchema
			}
		}));

		// ── Build deduplicated message history ──
		// Guard: if chatHistory already ends with the same user query, don't double-append it
		const history: any[] = [...chatHistory];
		const lastMsg = history[history.length - 1];
		if (lastMsg?.role === 'user' && lastMsg?.content === query) {
			console.log('[dedup] chatHistory already contains the current user query — skipping duplicate append');
		} else {
			history.push({ role: 'user', content: query });
		}

		console.log('--- STEP 1: TOOL CHECK (stream: false) ---');
		console.log(`History length: ${history.length}, last role: ${history[history.length - 1]?.role}`);

		// ── Step 1: The Tool Check (Non-Streamed) ──
		const step1Res = await fetch(OLLAMA_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				messages: history,
				tools,
				stream: false
			})
		});

		const step1Data = await step1Res.json();
		const rawAssistant = step1Data.message;

		const hasToolCalls = rawAssistant?.tool_calls && rawAssistant.tool_calls.length > 0;

		if (!hasToolCalls) {
			// ── No tool used — close MCP immediately, stream a normal completion ──
			console.log('[agent] No tool used by AI — streaming direct response');

			if (transport) {
				try { await transport.close(); transport = null; } catch (_) { /* silent */ }
			}

			// If the non-streamed response already has content, seed it into history
			// then re-request with stream:true for a proper chunked response
			if (rawAssistant?.content) {
				history.push({ role: 'assistant', content: rawAssistant.content });
			}

			console.log('--- FINAL OLLAMA PAYLOAD (no-tool path) ---');
			console.log(JSON.stringify(history, null, 2));

			const stream = createOllamaStream(history);

			return new Response(stream, {
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Cache-Control': 'no-cache',
					'X-Content-Type-Options': 'nosniff'
				}
			});
		}

		// ── Step 2: Tool execution ──
		console.log(`[agent] AI requested ${rawAssistant.tool_calls.length} tool call(s)`);

		// 2a. Push a CLEAN assistant message with the tool_calls structure
		history.push({
			role: 'assistant',
			content: rawAssistant.content || '',
			tool_calls: rawAssistant.tool_calls
		});

		// 2b. Execute each tool and push results
		for (const tc of rawAssistant.tool_calls) {
			const toolName: string = tc.function.name;
			let toolArgs: Record<string, unknown> = tc.function.arguments || {};

			// Hardcoded project context for local swarm
			if (toolName === 'list_tables' && !toolArgs.project_id) {
				toolArgs.project_id = '1';
			}

			console.log(`[tool] Executing: ${toolName}`, JSON.stringify(toolArgs));

			try {
				const toolResult = await mcpClient.callTool({
					name: toolName,
					arguments: toolArgs
				});

				const resultContent = toolResult.content
					.map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
					.join('\n');

				console.log(`[tool] ${toolName} returned ${resultContent.length} chars`);

				history.push({
					role: 'tool',
					content: resultContent,
					tool_call_id: tc.id || `call_${toolName}`
				});
			} catch (toolErr) {
				logger.error(`Error executing MCP tool ${toolName}`, toolErr as Error);
				const errText = `Error executing tool ${toolName}: ${String(toolErr)}`;
				console.log(`[tool] ${toolName} FAILED: ${errText}`);

				history.push({
					role: 'tool',
					content: errText,
					tool_call_id: tc.id || `call_${toolName}`
				});
			}
		}

		// Close MCP transport now that all tools are done
		if (transport) {
			try { await transport.close(); transport = null; } catch (_) { /* silent */ }
		}

		// ── Step 3: Final streaming response with tool results in context ──
		console.log('--- FINAL OLLAMA PAYLOAD (tool path) ---');
		console.log(JSON.stringify(history, null, 2));

		const stream = createOllamaStream(history);

		logger.info('Agentic loop completed tool execution, streaming final response', { userId: user.id });

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (err) {
		logger.error('Agentic loop initialization error', err as Error);

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
		// Ensure cleanup if init fails or somehow skipped the close
		if (transport) {
			try {
				await transport.close();
			} catch (e) {
				// silent
			}
		}
	}
};
