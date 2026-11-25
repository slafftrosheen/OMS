import type { OpenRouterChatOptions, OpenRouterMessage } from './openrouter';
import { BILLING_ERROR_TYPES, readProviderFailure } from './provider-errors';

type Item = Record<string, unknown>;

function inputParts(parts: Item[]): Item[] {
  return parts.map(part => {
    if (part.type === 'text') return { type: 'input_text', text: part.text };
    if (part.type === 'image_url') {
      const image = part.image_url as { url: string; detail?: string };
      return { type: 'input_image', image_url: image.url, detail: image.detail ?? 'auto' };
    }
    if (part.type === 'file') {
      const file = part.file as Item;
      return { type: 'input_file', filename: file.filename, file_data: file.file_data, file_id: file.file_id };
    }
    throw new Error('Unsupported input type for the OpenAI API');
  });
}

export function openAiResponsesBody(options: OpenRouterChatOptions, messages: OpenRouterMessage[], model: string) {
  const input: Item[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.tool_call_id,
        output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) });
      continue;
    }
    if (typeof message.content !== 'string' || message.content || message.role !== 'assistant') {
      input.push({ role: message.role, content: typeof message.content === 'string' ? message.content : inputParts(message.content) });
    }
    for (const call of message.tool_calls ?? []) {
      input.push({ type: 'function_call', call_id: call.id, ...call.function });
    }
  }
  const tools = options.tools?.map(tool => {
    const entry = tool as { type?: string; function?: Item };
    if (entry.type !== 'function' || !entry.function) throw new Error('This provider tool requires OpenRouter');
    return { type: 'function', strict: false, ...entry.function };
  });
  return {
    model, input, store: false, stream: options.stream ?? false,
    ...(tools?.length ? { tools, tool_choice: options.toolChoice ?? 'auto' } : {}),
    ...(options.maxTokens !== undefined ? { max_output_tokens: Math.max(16, options.maxTokens) } : {}),
    ...(model.startsWith('gpt-6') ? { reasoning: { effort: 'none' } } : {}),
    ...(options.jsonSchema ? { text: { format: { type: 'json_schema', strict: true, ...options.jsonSchema } } }
      : options.jsonMode ? { text: { format: { type: 'json_object' } } } : {})
  };
}

function completion(payload: any, model: string) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const messages = output.filter((item: any) => item.type === 'message' && item.role === 'assistant');
  const parts = messages.flatMap((item: any) => Array.isArray(item.content) ? item.content : []);
  const text = parts.filter((part: any) => part.type === 'output_text');
  const calls = output.filter((item: any) => item.type === 'function_call').map((item: any) => ({
    id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments }
  }));
  const reason = payload?.incomplete_details?.reason;
  if (parts.some((part: any) => part.type === 'refusal') || reason === 'content_filter') {
    return { error: { code: 403, metadata: { error_type: 'refusal' } } };
  }
  if (payload?.status !== 'completed' && !(payload?.status === 'incomplete' && reason === 'max_output_tokens')) {
    return { error: { code: 502, metadata: { error_type: 'provider_unavailable' } } };
  }
  return {
    model: payload.model ?? model,
    usage: payload.usage ? {
      prompt_tokens: payload.usage.input_tokens,
      completion_tokens: payload.usage.output_tokens,
      total_tokens: payload.usage.total_tokens
    } : null,
    choices: [{
      finish_reason: reason === 'max_output_tokens' ? 'length' : calls.length ? 'tool_calls' : 'stop',
      message: { role: 'assistant', content: text.map((part: any) => part.text).join(''),
        annotations: text.flatMap((part: any) => part.annotations ?? []),
        ...(calls.length && reason !== 'max_output_tokens' ? { tool_calls: calls } : {}) }
    }]
  };
}

function responseStream(body: ReadableStream<Uint8Array>, model: string) {
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  let pending = '', finished = false, sawDelta = false;
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, choice: Item) => {
    controller.enqueue(encoder.encode('data: ' + JSON.stringify({ model, choices: [choice] }) + '\n\n'));
  };
  const handle = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (finished || !line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data);
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      sawDelta = true;
      emit(controller, { delta: { content: event.delta } });
    } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      const result = completion(event.response, model);
      if (result.error) throw new Error('OpenAI stream was refused or interrupted');
      const choice = result.choices![0];
      if (!sawDelta && choice.message.content) emit(controller, { delta: { content: choice.message.content } });
      emit(controller, { delta: {}, finish_reason: choice.finish_reason });
      finished = true;
    } else if (event.type === 'error' || event.type === 'response.failed') {
      throw new Error('OpenAI stream failed');
    }
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) handle(line, controller);
      if (pending.length > 1_048_576) throw new Error('OpenAI stream event exceeded its limit');
    },
    flush(controller) {
      handle(pending + decoder.decode(), controller);
      if (!finished) throw new Error('OpenAI stream ended before completion');
    }
  }));
}

/** Normalize Responses into the existing OMS chat transport and preserve safe failure metadata. */
export async function openAiChatResponse(response: Response, model: string, stream: boolean): Promise<Response> {
  if (!response.ok) {
    const payload = await readProviderFailure(response);
    const code = payload?.error?.code;
    const errorType = BILLING_ERROR_TYPES.some(type => type === code) ? code
      : payload?.error?.type === 'insufficient_quota' ? 'insufficient_quota' : null;
    const headers = new Headers();
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter && !errorType) headers.set('Retry-After', retryAfter);
    return errorType ? Response.json({ error: { code: response.status,
      metadata: { error_type: errorType }
    } }, { status: response.status, headers }) : new Response(null, { status: response.status, headers });
  }
  if (stream) {
    if (!response.body) throw new Error('OpenAI returned an empty stream');
    return new Response(responseStream(response.body, model), { headers: { 'Content-Type': 'text/event-stream' } });
  }
  const result = completion(await response.json(), model);
  return Response.json(result, { status: result.error?.code ?? 200 });
}
