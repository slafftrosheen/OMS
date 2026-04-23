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

// ── Sovereign Agent System Prompt ──
const SYSTEM_PROMPT = `You are the Réclame Swarm Controller.

Zero Hallucination: Never say 'there are no entries' unless you have executed a query tool first.

Primary Source: All company data is in the public.company_knowledge table.

Search Strategy: Always use ILIKE for searches. Example: SELECT content FROM company_knowledge WHERE content ILIKE '%boxletter%';

Constraint: If the user asks for information, your FIRST action must be a tool call. Do not provide a conversational response until you have tool results.`;

/**
 * Attempts to extract a tool call from raw text content when the model
 * returns the tool call as JSON text instead of native tool_calls.
 * Returns an array of tool_call objects matching the native schema, or null.
 */
function extractToolCallsFromText(content: string): any[] | null {
	if (!content || typeof content !== 'string') return null;

	const trimmed = content.trim();

	// Quick-check: must look like a JSON object or array
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

	try {
		const parsed = JSON.parse(trimmed);

		// Handle single tool call object: { "name": "...", "arguments": { ... } }
		// Also handle: { "function": { "name": "...", "arguments": { ... } } }
		const normalize = (obj: any, index: number): any | null => {
			if (obj.name && typeof obj.name === 'string') {
				return {
					id: obj.id || `fallback_call_${index}`,
					function: {
						name: obj.name,
						arguments: obj.arguments || obj.parameters || {}
					}
				};
			}
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
			args: ['-y', '@modelcontextprotocol/server-postgres@latest', process.env.DATABASE_URL || ''],
			env: {
				...process.env
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

		// ── Build deduplicated message history with system prompt ──
		const history: any[] = [
			{ role: 'system', content: SYSTEM_PROMPT },
			...chatHistory
		];

		// Guard: if chatHistory already ends with the same user query, don't double-append it
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

		// ── Dual-Path Tool Detection ──
		// Path A (Native): Check for native tool_calls from the model
		let detectedToolCalls = rawAssistant?.tool_calls?.length > 0
			? rawAssistant.tool_calls
			: null;

		// Path B (Fallback): Check if the content contains JSON tool-call text
		if (!detectedToolCalls && rawAssistant?.content) {
			console.log('[agent] Path A (native tool_calls) empty — attempting Path B (text fallback)');
			const fallbackCalls = extractToolCallsFromText(rawAssistant.content);
			if (fallbackCalls) {
				console.log(`[agent] Path B succeeded: extracted ${fallbackCalls.length} tool call(s) from text`);
				detectedToolCalls = fallbackCalls;
			}
		}

		const hasToolCalls = detectedToolCalls && detectedToolCalls.length > 0;

		if (!hasToolCalls) {
			// ── No tool used — close MCP immediately, stream a normal completion ──
			console.log('[agent] No tool used by AI — streaming direct response');

			if (transport) {
				try { await transport.close(); transport = null; } catch (_) { /* silent */ }
			}

			// We already have the full text from Step 1. Just stream it directly!
			const textToStream = rawAssistant?.content || '';
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(textToStream));
					controller.close();
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

		// ── Step 2: Tool execution ──
		console.log(`[agent] AI requested ${detectedToolCalls!.length} tool call(s)`);

		// 2a. Push a CLEAN assistant message with null content and the tool_calls structure
		// This matches the expected Ollama history format exactly:
		// { role: 'assistant', content: null, tool_calls: [...] }
		history.push({
			role: 'assistant',
			content: null,
			tool_calls: detectedToolCalls
		});

		// 2b. Execute each tool and push results
		for (const tc of detectedToolCalls!) {
			let toolName: string = tc.function.name;
			let toolArgs: Record<string, unknown> = tc.function.arguments || {};

			// Fallback mapping for Postgres MCP
			if (toolName === 'execute_sql') {
				toolName = 'query';
				tc.function.name = 'query';
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

				// History format: { role: 'tool', content: '...', tool_call_id: '...' }
				history.push({
					role: 'tool',
					content: resultContent,
					tool_call_id: tc.id || `call_${toolName}`
				});
			} catch (toolErr) {
				logger.error(`Error executing MCP tool ${toolName}`, toolErr as Error);
				const errText = `Error executing tool ${toolName}: ${String(toolErr)}`;
				console.error(`[tool] ${toolName} FAILED: ${errText}`);

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
		// Strip the strict JSON tool-calling instruction from the system prompt so it summarizes naturally
		if (history[0]?.role === 'system') {
			history[0].content = `You are the Swarm Architect, an expert AI assistant for Réclame Fabriek.
You have just retrieved information from the database. 
CRITICAL DIRECTIVE: Summarize the tool results clearly, accurately, and naturally for the user. DO NOT output raw JSON tool calls.`;
		}

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
