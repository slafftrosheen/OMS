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
				// Map PUBLIC_SUPABASE_URL to SUPABASE_URL as expected by the MCP server
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

		// Initial message state
		const messages: any[] = [...chatHistory, { role: 'user', content: query }];

		// 3. The Agent Loop (Running inside a ReadableStream)
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				try {
					while (true) {
						const ollamaRes = await fetch('http://100.93.147.108:11434/api/chat', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								model: 'qwen2.5-coder:14b',
								messages,
								tools,
								stream: true
							})
						});

						if (!ollamaRes.body) {
							throw new Error('Ollama returned empty body');
						}

						const reader = ollamaRes.body.getReader();
						const decoder = new TextDecoder();

						let isToolCall = false;
						const currentAssistantMessage: any = { role: 'assistant', content: '', tool_calls: [] };

						// Stream Reader Loop
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							const textChunk = decoder.decode(value, { stream: true });
							const lines = textChunk.split('\n').filter((l) => l.trim().length > 0);

							for (const line of lines) {
								try {
									const chunk = JSON.parse(line);
									if (chunk.message) {
										// Check for tool calls
										if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
											isToolCall = true;
											currentAssistantMessage.tool_calls = chunk.message.tool_calls;
										}

										// 4. Streaming content back to SvelteKit if it's NOT a tool call
										if (chunk.message.content) {
											currentAssistantMessage.content += chunk.message.content;
											if (!isToolCall) {
												controller.enqueue(encoder.encode(chunk.message.content));
											}
										}
									}
								} catch (e) {
									// Ignore partial JSON chunks
								}
							}
						}

						// Post-Stream logic
						if (isToolCall) {
							// Append the assistant's tool call decision
							messages.push(currentAssistantMessage);

							// Execute each tool against the MCP Server
							for (const tc of currentAssistantMessage.tool_calls) {
								const toolName = tc.function.name;
								const toolArgs = tc.function.arguments;

								try {
									const toolResult = await mcpClient!.callTool({
										name: toolName,
										arguments: toolArgs as Record<string, unknown>
									});

									const resultText = toolResult.content
										.map((c: any) => c.text)
										.join('\n');

									messages.push({
										role: 'tool',
										content: resultText
									});
								} catch (toolErr) {
									logger.error(`Error executing MCP tool ${toolName}`, toolErr as Error);
									messages.push({
										role: 'tool',
										content: `Error executing tool: ${String(toolErr)}`
									});
								}
							}

							// Loop continues to feed the tool results back to Ollama
						} else {
							// It was a normal response, stream is complete.
							controller.close();
							break;
						}
					}
				} catch (streamErr) {
					logger.error('Agent Loop Stream Error', streamErr as Error);
					controller.error(streamErr);
				} finally {
					// 5. Cleanup MCP Child Process
					if (transport) {
						try {
							await transport.close();
						} catch (closeErr) {
							logger.error('Error closing MCP transport', closeErr as Error);
						}
					}
				}
			}
		});

		logger.info('Agentic loop started', { userId: user.id });

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (err) {
		logger.error('Agentic loop initialization error', err as Error);

		// Ensure cleanup if init fails
		if (transport) {
			try {
				await transport.close();
			} catch (e) {
				// silent
			}
		}

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
	}
};
