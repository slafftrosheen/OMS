/**
 * Lightweight OpenRouter chat endpoint for the canvas AI panel.
 * Supports server-sent event streaming and OpenAI-compatible image inputs.
 */
import { json, error as kitError } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { openRouterChat, openRouterError, type OpenRouterMessage } from '$lib/server/ai/openrouter';
import { OPENROUTER_MODEL } from '$lib/server/config';

function sseHeaders() {
  return { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' };
}

function normalizeMessages(input: unknown): OpenRouterMessage[] {
  if (!Array.isArray(input) || input.length === 0) throw kitError(400, 'messages array required');
  if (input.length > 40) throw kitError(400, 'Too many messages');
  return input.map((value: any) => {
    if (!value || typeof value !== 'object' || !['system', 'user', 'assistant'].includes(value.role) || typeof value.content !== 'string') {
      throw kitError(400, 'Each message must have a supported role and text content');
    }
    return { role: value.role, content: value.content.slice(0, 24000) };
  });
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) throw kitError(401, 'Unauthorized');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw kitError(400, 'Invalid request body');
  const messages = normalizeMessages(body.messages);
  const wantStream = url.searchParams.get('stream') === '1' || body.stream === true;
  const model = OPENROUTER_MODEL;

  let result;
  try {
    result = await openRouterChat({ model, messages, stream: wantStream, temperature: typeof body.temperature === 'number' ? body.temperature : 0.5, maxTokens: 2048 });
  } catch (err) {
    console.error('[api/ai/chat] OpenRouter request failed:', err instanceof Error ? err.message : 'unknown error');
    return json({ error: err instanceof Error ? err.message : 'OpenRouter unavailable' }, { status: 503 });
  }
  if (!result.response.ok) {
    const err = openRouterError(result.response, await result.response.text().catch(() => ''));
    return json({ error: err.message }, { status: result.response.status === 429 ? 429 : 502 });
  }

  if (!wantStream) {
    const data = await result.response.json();
    const reply = String(data?.choices?.[0]?.message?.content ?? '');
    return json({ message: { role: 'assistant', content: reply }, reply, model: data?.model ?? result.model, usage: data?.usage ?? null });
  }

  if (!result.response.body) return json({ error: 'OpenRouter returned an empty stream' }, { status: 502 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = result.response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assembled = '';
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            if (payload === '[DONE]') {
              send({ done: true, content: assembled, model: result.model });
              controller.close();
              return;
            }
            try {
              const chunk = JSON.parse(payload);
              const delta = chunk?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) {
                assembled += delta;
                send({ delta });
              }
              if (chunk?.choices?.[0]?.finish_reason) {
                send({ done: true, content: assembled, model: chunk?.model ?? result.model });
                controller.close();
                return;
              }
            } catch { /* ignore non-JSON provider event lines */ }
          }
        }
        send({ done: true, content: assembled, model: result.model });
        controller.close();
      } catch (err) {
        send({ error: err instanceof Error ? err.message : 'OpenRouter stream failed' });
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: sseHeaders() });
};
