// src/lib/server/ai/orchestrator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hivemind Orchestrator — Réclame Fabriek Assistant
//
// RAG pipeline with native Tool Calling:
//   1. Embed user query via Ollama (nomic-embed-text)
//   2. Triple vector retrieval (parallel):
//      a. match_code_chunks       — internal codebase context
//      b. match_framework_docs    — external documentation (Svelte, MDN, etc.)
//      c. match_company_knowledge — corporate identity (reclamefabriek.eu)
//   3. Send enriched prompt to Ollama (deepseek-r1:14b) with tools array
//   4. If LLM requests tool calls → execute → feed results back → stream final
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '$lib/server/logging/logger';
import { TOOL_DEFINITIONS, TOOL_EXECUTORS } from './tools';
import {
    OLLAMA_URL as OLLAMA_BASE,
    SUPABASE_URL as SUPABASE_BASE,
    SUPABASE_SERVICE_ROLE_KEY,
    REASONING_MODEL,
    OLLAMA_DEFAULT_MODEL,
    EMBED_MODEL
} from '$lib/server/config';

// ─── Network endpoints (resolved from $lib/server/config) ──────────────────
// Defaults are the Tailnet topology documented in CLAUDE.md but every value
// can be overridden via .env (see .env.example).
const OLLAMA_URL   = `${OLLAMA_BASE}/api`;
const SUPABASE_URL = SUPABASE_BASE;

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single message in the chat history (extended for tool roles). */
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	/** Present when role === 'assistant' and the LLM wants to call tools. */
	tool_calls?: OllamaToolCall[];
}

/** A code chunk returned by the Supabase `match_code_chunks` RPC. */
export interface CodeChunk {
	id: string;
	file_path: string;
	content: string;
	similarity: number;
}

/** A framework doc chunk returned by the Supabase `match_framework_docs` RPC. */
export interface FrameworkDoc {
	id: string;
	url: string;
	title: string;
	content: string;
	similarity: number;
}

/** A company knowledge chunk from the `match_company_knowledge` RPC. */
export interface CompanyKnowledge {
	id: string;
	url: string;
	category: string;
	content: string;
	similarity: number;
}

/** Ollama tool call shape returned inside an assistant message. */
interface OllamaToolCall {
	function: {
		name: string;
		arguments: Record<string, unknown>;
	};
}

/** Full Ollama non-streaming response (used in the tool-call loop). */
interface OllamaChatResponse {
	message: {
		role: string;
		content: string;
		tool_calls?: OllamaToolCall[];
	};
	done: boolean;
}

/** Embedding response from Ollama /api/embeddings. */
interface OllamaEmbeddingResponse {
	embedding: number[];
}

/** Parameters sent to both Supabase match RPCs. */
interface MatchParams {
	query_embedding: number[];
	match_threshold: number;
	match_count: number;
}

/** Configuration knobs exposed to callers. */
export interface HivemindOptions {
	matchThreshold?: number;
	matchCount?: number;
	numCtx?: number;
	model?: string;
	embeddingModel?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the vector embedding for `text` from Ollama's nomic-embed-text model.
 */
async function getEmbedding(
	text: string,
	model = EMBED_MODEL
): Promise<number[]> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 30000);

	try {
		const res = await fetch(`${OLLAMA_URL}/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt: text }),
			signal: controller.signal
		});

		if (!res.ok) {
			const body = await res.text();
			logger.error('Ollama embedding request failed', new Error(body), {
				status: res.status,
				model
			});
			throw new Error(`Embedding request failed (${res.status}): ${body}`);
		}

		const data: OllamaEmbeddingResponse = await res.json();
		return data.embedding;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Generic Supabase RPC caller for vector similarity search.
 */
async function callMatchRpc<T>(
	rpcName: string,
	params: MatchParams
): Promise<T[]> {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
			apikey: SUPABASE_SERVICE_ROLE_KEY
		},
		body: JSON.stringify(params)
	});

	if (!res.ok) {
		const body = await res.text();
		logger.error(`Supabase RPC ${rpcName} failed`, new Error(body), {
			status: res.status
		});
		throw new Error(`RPC ${rpcName} failed (${res.status}): ${body}`);
	}

	return res.json();
}

async function retrieveCodeChunks(
	embedding: number[],
	threshold: number,
	count: number
): Promise<CodeChunk[]> {
	return callMatchRpc<CodeChunk>('match_code_chunks', {
		query_embedding: embedding,
		match_threshold: threshold,
		match_count: count
	});
}

async function retrieveFrameworkDocs(
	embedding: number[],
	threshold: number,
	count: number
): Promise<FrameworkDoc[]> {
	return callMatchRpc<FrameworkDoc>('match_framework_docs', {
		query_embedding: embedding,
		match_threshold: threshold,
		match_count: count
	});
}

async function retrieveCompanyKnowledge(
	embedding: number[],
	threshold: number,
	count: number
): Promise<CompanyKnowledge[]> {
	return callMatchRpc<CompanyKnowledge>('match_company_knowledge', {
		query_embedding: embedding,
		match_threshold: threshold,
		match_count: count
	});
}

// ─── Tool-Call Execution ─────────────────────────────────────────────────────

/**
 * Execute a single tool call requested by the LLM.
 * Returns a JSON string of the result for feeding back as a `tool` message.
 */
async function executeTool(call: OllamaToolCall): Promise<string> {
	const name = call.function.name;
	const executor = TOOL_EXECUTORS[name];

	if (!executor) {
		logger.warn(`LLM requested unknown tool: ${name}`);
		return JSON.stringify({ error: `Unknown tool: ${name}` });
	}

	logger.info(`Executing AI tool: ${name}`);

	try {
		const result = await executor();
		return JSON.stringify(result);
	} catch (err) {
		logger.error(`AI tool execution failed: ${name}`, err as Error);
		return JSON.stringify({ error: `Tool ${name} failed: ${(err as Error).message}` });
	}
}

// ─── Ollama Chat Helpers ─────────────────────────────────────────────────────

/**
 * Send a non-streaming chat request to Ollama (used in the tool-call loop).
 */
async function ollamaChatSync(
	model: string,
	messages: ChatMessage[],
	numCtx: number,
	includeTools: boolean
): Promise<OllamaChatResponse> {
	const payload: Record<string, unknown> = {
		model,
		messages,
		stream: false,
		options: { num_ctx: numCtx }
	};

	if (includeTools) {
		payload.tools = TOOL_DEFINITIONS;
	}

	const res = await fetch(`${OLLAMA_URL}/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Ollama sync chat failed (${res.status}): ${body}`);
	}

	return res.json();
}

/**
 * Send a streaming chat request to Ollama (final response to client).
 */
async function ollamaChatStream(
	model: string,
	messages: ChatMessage[],
	numCtx: number
): Promise<Response> {
	const res = await fetch(`${OLLAMA_URL}/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages,
			stream: true,
			options: { num_ctx: numCtx }
		})
	});

	if (!res.ok) {
		const body = await res.text();
		logger.error('Ollama streaming chat failed', new Error(body), {
			status: res.status,
			model
		});
		throw new Error(`Chat stream failed (${res.status}): ${body}`);
	}

	return res;
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * Ask the Hivemind.
 *
 * 1. Embeds the user query via Ollama (nomic-embed-text).
 * 2. Triple vector retrieval in parallel:
 *    - Internal code chunks (match_code_chunks)
 *    - External framework docs (match_framework_docs)
 *    - Corporate identity (match_company_knowledge)
 * 3. First Ollama call with tools (non-streaming) — checks for tool_calls.
 * 4. If tool calls: execute each, append results, call Ollama again.
 * 5. Final call is always streaming for the client.
 */
export async function askHivemind(
	query: string,
	chatHistory: ChatMessage[] = [],
	options: HivemindOptions = {}
): Promise<Response> {
	const {
		matchThreshold = 0.4,
		matchCount = 3,
		numCtx = 8192,
		model = OLLAMA_DEFAULT_MODEL, // 🚀 The Execution model (loves tools!)
		embeddingModel = EMBED_MODEL
	} = options;

	logger.info('Hivemind query received', { queryLength: query.length, model });

	// ── 1. Embed ──────────────────────────────────────────────────────────────
	const embedding = await getEmbedding(query, embeddingModel);

	// ── 2. Triple RAG retrieval (parallel) ────────────────────────────────────
	const [codeResult, docsResult, companyResult] = await Promise.all([
		retrieveCodeChunks(embedding, matchThreshold, matchCount).catch((err) => {
			logger.warn('Code chunk retrieval failed', { error: (err as Error).message });
			return [] as CodeChunk[];
		}),
		retrieveFrameworkDocs(embedding, matchThreshold, matchCount).catch((err) => {
			logger.warn('Framework docs retrieval failed', { error: (err as Error).message });
			return [] as FrameworkDoc[];
		}),
		retrieveCompanyKnowledge(embedding, matchThreshold, matchCount).catch((err) => {
			logger.warn('Company knowledge retrieval failed', { error: (err as Error).message });
			return [] as CompanyKnowledge[];
		})
	]);

	logger.info('Context retrieved from vault', {
		codeChunks: codeResult.length,
		frameworkDocs: docsResult.length,
		companyKnowledge: companyResult.length
	});

	// ── 3. Build system prompt ────────────────────────────────────────────────
	const contextSections: string[] = [];

	// Corporate identity goes FIRST — highest priority for tone/identity
	if (companyResult.length > 0) {
		const companyCtx = companyResult
			.map((c) => `--- [${c.category}] ${c.url} ---\n${c.content}`)
			.join('\n');
		contextSections.push(
			`## RÉCLAME FABRIEK CORPORATE IDENTITY & HISTORY\nUse the following corporate knowledge to inform your tone, reference past projects, and understand our capabilities:\n${companyCtx}`
		);
	}

	if (codeResult.length > 0) {
		const codeCtx = codeResult
			.map((c) => `--- ${c.file_path} ---\n${c.content}`)
			.join('\n');
		contextSections.push(
			`## Internal Codebase Context\nUse these code snippets from our repository to ground your answers:\n${codeCtx}`
		);
	}
	if (docsResult.length > 0) {
		const docsCtx = docsResult
			.map((d) => `--- ${d.title} (${d.url}) ---\n${d.content}`)
			.join('\n');
		contextSections.push(
			`## Framework Documentation Context\nUse these official documentation excerpts as authoritative reference:\n${docsCtx}`
		);
	}

	const systemPrompt = [
		'You are the AI representative of Réclame Fabriek, operating as the official Assistant.',
		'You are an expert in SvelteKit 2, Svelte 5, TypeScript, Supabase, and signage manufacturing workflows.',
		'Use the Corporate Identity context to inform your tone, reference past projects, and understand our capabilities.',
		'You have access to live database tools. When the user asks about orders, inventory, or system status, USE your tools to fetch real-time data instead of guessing.',
		'Always present data clearly with relevant numbers, dates, and statuses.',
		contextSections.length > 0
			? contextSections.join('\n\n')
			: ''
	].filter(Boolean).join('\n\n');

	const messages: ChatMessage[] = [
		{ role: 'system', content: systemPrompt },
		...chatHistory,
		{ role: 'user', content: query }
	];

	// ── 4. Tool-call loop (non-streaming) ─────────────────────────────────────
	// We send with tools enabled. If the LLM responds with tool_calls,
	// we execute them, append results, and re-send. Max 3 iterations.
	const MAX_TOOL_ROUNDS = 3;
	let toolRound = 0;

	while (toolRound < MAX_TOOL_ROUNDS) {
		const response = await ollamaChatSync(model, messages, numCtx, true);

		if (!response.message.tool_calls || response.message.tool_calls.length === 0) {
			// No tool calls — LLM gave a final answer in the sync response.
			// But we want to stream the final answer to the client, so we
			// append the assistant's content and break to the streaming call.
			break;
		}

		// Append the assistant's tool-call message
		messages.push({
			role: 'assistant',
			content: response.message.content || '',
			tool_calls: response.message.tool_calls
		});

		// Execute each requested tool and append results
		for (const call of response.message.tool_calls) {
			const result = await executeTool(call);
			messages.push({
				role: 'tool',
				content: result
			});
			logger.info(`Tool result appended: ${call.function.name}`, {
				resultLength: result.length
			});
		}

		toolRound++;
	}

	// ── 5. Final streaming response (no tools — just generate) ────────────────
	return ollamaChatStream(model, messages, numCtx);
}
