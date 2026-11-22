import assert from 'node:assert/strict';

const origin = 'https://supabase.example.test';
const key = 'unit-test-service-role';
const previous = new Map(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  .map(name => [name, process.env[name]]));

// Import this before the handler so its immutable configuration uses a test
// destination. Restore the environment once the handler imports have completed.
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_SERVICE_ROLE_KEY = key;

export function restoreRoutingFixtureEnvironment() {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/** Exercise the real policy client against a bounded HTTP double, never a DB. */
export async function withAiRouting<T>(run: () => T | Promise<T>): Promise<T> {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.method, 'GET');
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, '/rest/v1/openrouter_system_policy');
    assert.equal(url.searchParams.get('singleton'), 'eq.true');
    assert.equal(request.headers.get('authorization'), `Bearer ${key}`);
    return Response.json({ enabled: true, active_provider: 'openrouter',
      openai_text_model: 'gpt-test-text', openai_vision_model: 'gpt-test-vision' });
  };
  try { return await run(); }
  finally { globalThis.fetch = fetchBefore; }
}
