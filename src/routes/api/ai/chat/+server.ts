// src/routes/api/ai/chat/+server.ts
// Streaming chat endpoint — pipes Ollama NDJSON through a TransformStream.

import { error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { askHivemind, type ChatMessage } from '$lib/server/ai/orchestrator';
import { logger } from '$lib/server/logging/logger';

/** Shape of the JSON body the client sends. */
interface ChatRequestBody {
	query: string;
	chatHistory?: ChatMessage[];
}

/** Each NDJSON line from Ollama's /api/chat stream. */
interface OllamaChatChunk {
	message?: { role: string; content: string };
	done?: boolean;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth gate — matches existing pattern in analyze-order/+server.ts
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

	try {
		// askHivemind returns the raw Ollama streaming Response.
		const ollamaRes = await askHivemind(query, chatHistory);

		if (!ollamaRes.body) {
			throw new Error('Ollama returned an empty body');
		}

		// Transform the Ollama NDJSON stream → plain-text content stream.
		// Each Ollama line is a JSON object with { message: { content: "..." }, done: bool }.
		// We extract the content tokens and forward them as raw text.
		const reader = ollamaRes.body.getReader();
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			async pull(controller) {
				const { done, value } = await reader.read();

				if (done) {
					controller.close();
					return;
				}

				const text = decoder.decode(value, { stream: true });

				// Ollama sends NDJSON — one JSON object per line.
				const lines = text.split('\n').filter((l) => l.trim().length > 0);

				for (const line of lines) {
					try {
						const chunk: OllamaChatChunk = JSON.parse(line);
						if (chunk.message?.content) {
							controller.enqueue(encoder.encode(chunk.message.content));
						}
						if (chunk.done) {
							controller.close();
							return;
						}
					} catch {
						// Partial JSON line — skip gracefully.
					}
				}
			},
			cancel() {
				reader.cancel();
			}
		});

		logger.info('Hivemind stream started', { userId: user.id, queryLength: query.length });

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (err) {
		logger.error('Hivemind chat endpoint error', err as Error, {
			userId: user.id
		});

		// If it's already a SvelteKit error response, rethrow.
		if (err instanceof Response) {
			throw err;
		}

		// Return a 200 response with a streaming payload as requested
		const stream = new ReadableStream({
			start(controller) {
				const message = "⚠️ AI Node Unreachable. Please check Tailscale/LAN connection to the RTX 5080 server.";
				controller.enqueue(new TextEncoder().encode(message));
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
};
