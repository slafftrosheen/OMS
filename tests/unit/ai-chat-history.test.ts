import { describe, expect, it } from 'vitest';
import { chatHistoryMessages } from '../../src/lib/server/ai/chat-history';
import { _createMessageHandler } from '../../src/routes/api/ai/sessions/[id]/messages/+server';
import { openRouterChat, type OpenRouterChatOptions, type OpenRouterClientConfig } from '../../src/lib/server/ai/openrouter';

function database() {
  const state: any = { messages: [], runs: [], failRole: '', historyError: false };
  const db: any = { from: (table: string) => {
    let operation = 'select', value: any, limit = 30;
    const query: any = {
      select: () => query, eq: () => query, order: () => query,
      limit: (count: number) => { limit = count; return query; },
      insert: (row: any) => { operation = 'insert'; value = row; return query; },
      update: (row: any) => { operation = 'update'; value = row; return query; },
      single: async () => execute(), maybeSingle: async () => execute(),
      then: (resolve: any, reject: any) => execute().then(resolve, reject)
    };
    const execute = async () => {
      if (table === 'ai_chat_sessions') return { data: { id: 'session', model: null, persona: null }, error: null };
      if (table === 'user_preferences') return { data: { locale: 'en' }, error: null };
      if (table === 'ai_runs') {
        state.runs.push({ operation, ...value });
        return { data: { id: 'run' }, error: null };
      }
      if (table !== 'ai_chat_messages') throw new Error(`Unexpected table ${table}`);
      if (operation === 'select') return { data: state.messages.slice(-limit).reverse(),
        error: state.historyError ? { code: 'LOOKUP_FAILED' } : null };
      if (value.role === state.failRole) return { data: null, error: { code: 'INSERT_FAILED', message: 'private database detail' } };
      const row = { id: `message-${state.messages.length + 1}`, ...value };
      state.messages.push(row);
      return { data: row, error: null };
    };
    return query;
  } };
  return { db, state };
}

const tool = { slug: 'data.low_stock', label: 'Low stock', description: '', enabled: true,
  icon: '', category: 'data', roles: [], stations: [], endpoint: '',
  schema: { name: 'data_low_stock', parameters: { type: 'object' } } };
const toolReply = { content: '', tool_calls: [{ id: 'call-stock', type: 'function',
  function: { name: 'data_low_stock', arguments: {} } }] };
let users = 0;
function event(db: any, content = 'Check stock', signal?: AbortSignal): any {
  return { locals: { supabase: db, user: { id: `history-test-${++users}`, role: 'RD', stations: [] } },
    params: { id: 'session' }, getClientAddress: () => '127.0.0.1',
    request: new Request('https://oms.example/api/ai/sessions/session/messages', {
      method: 'POST', body: JSON.stringify({ content, language: 'en' }), signal
    }) };
}
function handler(replies: any[], requests: OpenRouterChatOptions[], allowed = [tool]) {
  return _createMessageHandler({
    openRouterChat: async options => {
      requests.push(structuredClone({ ...options, signal: undefined }));
      return { model: 'test/model', response: Response.json({ choices: [{ message: replies.shift() }] }) };
    },
    listTools: async () => allowed,
    executeTool: async () => ({ item: 'LED strip', quantity: 5 })
  });
}

describe('Persisted chat tools and confirmed replies', () => {
  it('replays a second turn with complete evidence and no orphan native tool messages', async () => {
    const { db, state } = database(); const requests: OpenRouterChatOptions[] = [];
    const post = handler([toolReply, { content: 'Five LED strips remain.' }, { content: 'Order more strips.' }], requests);
    const first = await (await post(event(db))).json();
    expect(first.userMessageId).toBe(state.messages[0].id);
    expect(first.assistantMessageId).toBe(state.messages[3].id);
    // The current run still follows the native call/result contract.
    const nativeResult = requests[1].messages.find(message => message.role === 'tool');
    expect(nativeResult?.tool_call_id).toBe('call-stock');
    expect(requests[1].messages.find(message => message.tool_calls)?.tool_calls?.[0].function.arguments).toBe('{}');
    await post(event(db, 'What should I order?'));
    const replay = requests[2].messages;
    expect(replay.some(message => message.role === 'tool' || !!message.tool_calls)).toBe(false);
    const evidence = replay.map(message => message.content).join('\n');
    for (const content of ['Check stock', 'data_low_stock', 'call-stock', 'LED strip', '"quantity":5', 'Five LED strips remain.', 'What should I order?']) {
      expect(evidence).toContain(content);
    }
  });

  it('retains results at a truncated history boundary and partial tool exchanges without inventing call IDs', () => {
    const stored = [
      { role: 'tool', content: '{"diameter":12}', tool_name: 'cnc.feeds_speeds' },
      { role: 'assistant', content: 'The result needs checking.' },
      { role: 'assistant', content: '', tool_calls: toolReply.tool_calls },
      { role: 'user', content: 'Continue without that tool.' }
    ];
    const result = chatHistoryMessages(stored);
    expect(result).toHaveLength(stored.length);
    expect(result.map(message => message.content).join('\n')).toContain('{"diameter":12}');
    expect(result[2].content).toContain('completion is recorded by subsequent results');
    expect(result.every(message => !message.tool_calls && !message.tool_call_id && message.role !== 'tool')).toBe(true);
    expect(stored[0].role).toBe('tool');
  });

  it('persists rejected tool results so the conversation retains why a request was not run', async () => {
    const { db, state } = database(); const requests: OpenRouterChatOptions[] = [];
    await handler([toolReply, { content: 'This tool is unavailable.' }], requests, [])(event(db));
    const result = state.messages.find((message: any) => message.role === 'tool');
    expect(result.content).toContain('Tool not available');
    expect(requests[1].messages.find(message => message.role === 'tool')?.tool_call_id).toBe('call-stock');
  });

  it('does not invoke the provider after failed history or prompt persistence', async () => {
    for (const failure of ['history', 'user']) {
      const { db, state } = database(); const requests: OpenRouterChatOptions[] = [];
      state.historyError = failure === 'history'; state.failRole = failure;
      await expect(handler([{ content: 'Should not run' }], requests)(event(db))).rejects.toMatchObject({ status: 503 });
      expect(requests).toEqual([]); expect(state.messages).toEqual([]);
    }
  });

  it('returns a persistence failure instead of a successful but unsaved assistant reply', async () => {
    const { db, state } = database(); const requests: OpenRouterChatOptions[] = [];
    state.failRole = 'assistant';
    await expect(handler([{ content: 'Useful reply' }], requests)(event(db))).rejects.toMatchObject({ status: 503 });
    expect(requests).toHaveLength(1); expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('user');
    expect(state.runs.at(-1)).toMatchObject({ status: 'error', error: 'Conversation persistence failed' });
  });

  it('stops the tool loop if a completed result cannot be persisted', async () => {
    const { db, state } = database(); const requests: OpenRouterChatOptions[] = [];
    state.failRole = 'tool';
    await expect(handler([toolReply, { content: 'Should not run' }], requests)(event(db))).rejects.toMatchObject({ status: 503 });
    expect(requests).toHaveLength(1);
    expect(state.messages.map((message: any) => message.role)).toEqual(['user', 'assistant']);
  });

  it('forwards cancellation to the provider and prevents further tools or a final reply', async () => {
    const { db, state } = database(); const controller = new AbortController(); let calls = 0, tools = 0;
    const post = _createMessageHandler({
      openRouterChat: async options => {
        calls++; controller.abort(); options.signal!.throwIfAborted();
        throw new Error('unreachable');
      },
      listTools: async () => [tool], executeTool: async () => { tools++; return {}; }
    });
    await expect(post(event(db, 'Check stock', controller.signal))).rejects.toMatchObject({ status: 499 });
    expect(calls).toBe(1); expect(tools).toBe(0);
    expect(state.messages.map((message: any) => message.role)).toEqual(['user']);
    expect(state.runs.at(-1)).toMatchObject({ status: 'error', error: 'Request cancelled' });
  });
});

describe('OpenRouter caller-owned cancellation', () => {
  const config: OpenRouterClientConfig = { apiKey: 'test-only', baseUrl: 'https://example.invalid',
    defaultModel: 'test/model', visionModel: 'test/model', timeoutMs: 5000 };
  it('does not start a request that was already cancelled', async () => {
    const controller = new AbortController(); controller.abort(); let calls = 0;
    await expect(openRouterChat({ messages: [{ role: 'user', content: 'hello' }], signal: controller.signal },
      config, async () => { calls++; return Response.json({}); })).rejects.toBe(controller.signal.reason);
    expect(calls).toBe(0);
  });
  it('keeps caller cancellation connected after provider headers arrive without sending a signal in JSON', async () => {
    const controller = new AbortController(); let providerSignal!: AbortSignal;
    await openRouterChat({ messages: [{ role: 'user', content: 'hello' }], signal: controller.signal, stream: true }, config,
      async (_input, init) => {
        providerSignal = init!.signal as AbortSignal;
        expect(JSON.parse(String(init!.body))).not.toHaveProperty('signal');
        return Response.json({});
      });
    expect(providerSignal.aborted).toBe(false);
    controller.abort(); expect(providerSignal.aborted).toBe(true);
    expect(providerSignal.reason.name).toBe('AbortError');
  });
});
