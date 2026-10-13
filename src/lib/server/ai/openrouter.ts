import {
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  OPENROUTER_VISION_MODEL,
  OPENROUTER_TIMEOUT_MS
} from '$lib/server/config';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface OpenRouterMessage {
  role: ChatRole;
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  images?: string[];
}
export interface OpenRouterChatOptions {
  model?: string;
  messages: OpenRouterMessage[];
  tools?: unknown[];
  /** OpenRouter request-scoped plugins, e.g. explicit PDF parser engine. */
  plugins?: unknown[];
  stream?: boolean;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  /** OpenRouter server-tool budget; bounded to avoid accidental multi-search charges. */
  maxToolCalls?: number;
  jsonMode?: boolean;
  /** Strict JSON Schema mode: route only through providers supporting response_format. */
  jsonSchema?: {name:string;schema:Record<string,unknown>};
}
export interface OpenRouterChatResult { model: string; response: Response }
export interface OpenRouterClientConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  visionModel: string;
  timeoutMs: number;
}

// Safe public config only. The API key is resolved from Supabase Vault for
// each request and is never placed in a module-level object or client bundle.
export const OPENROUTER_CONFIG: OpenRouterClientConfig = {
  apiKey: '',
  baseUrl: OPENROUTER_BASE_URL,
  defaultModel: OPENROUTER_MODEL,
  visionModel: OPENROUTER_VISION_MODEL,
  timeoutMs: OPENROUTER_TIMEOUT_MS
};

async function configuredClientConfig(): Promise<OpenRouterClientConfig> {
  const { resolveOpenRouterApiKey } = await import('$lib/server/ai/provider-key');
  return { ...OPENROUTER_CONFIG, apiKey: await resolveOpenRouterApiKey() };
}

export function normalizeImageDataUrl(image: string): string {
  const value = image.trim();
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return value;
  return `data:image/jpeg;base64,${value.replace(/^base64,/i, '')}`;
}

export function openRouterMessages(messages: OpenRouterMessage[]): OpenRouterMessage[] {
  return messages.map((message) => {
    const { images, ...clean } = message;
    if (message.role !== 'user' || !images?.length || typeof message.content !== 'string') return clean;
    return {
      ...clean,
      content: [
        { type: 'text', text: message.content },
        ...images.map((image) => ({ type: 'image_url', image_url: { url: normalizeImageDataUrl(image) } }))
      ]
    };
  });
}

export function openRouterRequestBody(options: OpenRouterChatOptions, config = OPENROUTER_CONFIG) {
  const vision = options.messages.some((message) => !!message.images?.length || Array.isArray(message.content));
  return {
    model: options.model || (vision ? config.visionModel : config.defaultModel),
    messages: openRouterMessages(options.messages),
    ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
    ...(options.plugins?.length ? { plugins: options.plugins } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    ...(options.maxToolCalls !== undefined && options.tools?.length
      ? { max_tool_calls: Math.max(1, Math.min(5, Math.floor(options.maxToolCalls))) } : {}),
    ...(options.jsonSchema ? {
      response_format: { type: 'json_schema', json_schema: {
        name: options.jsonSchema.name, strict: true, schema: options.jsonSchema.schema
      }},
      provider: { require_parameters: true }
    } : options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    stream: options.stream ?? false
  };
}

/** Inject fetch/config for tests; production callers resolve Vault-backed key. */
export async function openRouterChat(
  options: OpenRouterChatOptions,
  config?: OpenRouterClientConfig,
  fetcher: typeof fetch = fetch
): Promise<OpenRouterChatResult> {
  const resolvedConfig = config ?? await configuredClientConfig();
  if (!resolvedConfig.apiKey.trim()) throw new Error('OpenRouter is not configured: add the system key in Settings or set OPENROUTER_API_KEY');
  if (!/^https:\/\//i.test(resolvedConfig.baseUrl)) throw new Error('OPENROUTER_BASE_URL must use HTTPS');
  const body = openRouterRequestBody(options, resolvedConfig);
  // A stream remains abortable *after headers arrive*. Clearing a timer in
  // fetch().finally() left SSE streams unbounded indefinitely.
  const requestedTimeout = options.timeoutMs ?? resolvedConfig.timeoutMs;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.max(5_000, Math.min(requestedTimeout, 180_000)) : 120_000;
  const response = await fetcher(`${resolvedConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolvedConfig.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://reclamefabriek.eu',
      'X-Title': 'Reclame Fabriek OMS'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  return { model: String(body.model), response };
}

export function openRouterError(response: Response, text: string, credential = ''): Error {
  let safeText = text.replace(/[\r\n\t]+/g, ' ').trim();
  if (credential) safeText = safeText.replaceAll(credential, '[redacted]');
  safeText = safeText.slice(0, 240);
  return new Error(`OpenRouter returned ${response.status}${safeText ? `: ${safeText}` : ''}`);
}

export function openRouterTextContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const value = part as Record<string, unknown>;
      return typeof value.text === 'string' ? value.text
        : typeof value.content === 'string' ? value.content : '';
    }).filter(Boolean).join('\n').trim();
  }
  return '';
}

export interface OpenRouterCompletionMetadata {
  text: string;
  model: string;
  annotations: unknown[];
  /** Number of provider web-search calls when reported; null if absent. */
  webSearchRequests: number | null;
}

export async function openRouterCompleteWithMetadata(
  messages: OpenRouterMessage[],
  options: Omit<OpenRouterChatOptions, 'messages'> = {},
  config?: OpenRouterClientConfig,
  fetcher: typeof fetch = fetch
): Promise<OpenRouterCompletionMetadata> {
  const { response, model } = await openRouterChat({ ...options, messages, stream: false }, config, fetcher);
  if (!response.ok) {
    // Never surface upstream error bodies that may echo prompts or credentials.
    throw new Error(`OpenRouter completion failed (HTTP ${response.status})`);
  }
  const data = await response.json();
  const choice = data?.choices?.[0];
  const reported = data?.usage?.server_tool_use?.web_search_requests;
  return {
    text: openRouterTextContent(choice?.message?.content),
    model: typeof data?.model === 'string' && data.model ? data.model : model,
    annotations: Array.isArray(choice?.message?.annotations) ? choice.message.annotations : [],
    webSearchRequests: Number.isSafeInteger(reported) && reported >= 0 ? reported : null
  };
}

export async function openRouterComplete(
  messages: OpenRouterMessage[],
  options: Omit<OpenRouterChatOptions, 'messages'> = {},
  config?: OpenRouterClientConfig,
  fetcher: typeof fetch = fetch
): Promise<string> {
  return (await openRouterCompleteWithMetadata(messages, options, config, fetcher)).text;
}

export function extractAssistantMessage(payload: any): OpenRouterMessage {
  const message = payload?.choices?.[0]?.message;
  if (!message) throw new Error('OpenRouter response did not contain an assistant message');
  return {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content : '',
    ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls.map((call: any, index: number) => ({
      id: typeof call.id === 'string' ? call.id : `call_${index}`,
      type: 'function' as const,
      function: { name: String(call.function?.name ?? ''), arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}) }
    })) } : {})
  };
}

export function parseToolArguments(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tool arguments must be a JSON object');
  return parsed as Record<string, unknown>;
}
export function parseSseDataLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const data = trimmed.slice(5).trim();
  return !data || data === '[DONE]' ? null : data;
}
export function extractStreamDelta(payload: any): { delta: string; done: boolean } {
  const choice = payload?.choices?.[0];
  return { delta: typeof choice?.delta?.content === 'string' ? choice.delta.content : '', done: choice?.finish_reason != null };
}
export async function isOpenRouterConfigured(): Promise<boolean> {
  const { resolveOpenRouterApiKey } = await import('$lib/server/ai/provider-key');
  return Boolean((await resolveOpenRouterApiKey()).trim());
}
export async function openRouterStatus() {
  return { provider: 'openrouter', configured: await isOpenRouterConfigured(), model: OPENROUTER_MODEL, visionModel: OPENROUTER_VISION_MODEL };
}
export { OPENROUTER_MODEL, OPENROUTER_VISION_MODEL };
